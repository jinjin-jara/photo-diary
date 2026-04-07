# Feed 무한스크롤 / 이미지 구조 개편 / 편집 모드 사진 / 캐싱 설계

## 요청 사항

1. **피드 무한스크롤** — 8개씩 로드, 하단 도달 시 다음 8개
2. **이미지 구조 개편** — thumb(Firestore) + url(Storage) 분리
3. **편집 모드 사진 편집** — 추가/삭제 가능
4. **이미지 캐싱** — Storage 이미지를 서비스워커로 캐시
5. **편집 모드 폰트** — 취소/저장 버튼에 Nanum Myeongjo 적용
6. **압축 0.7 고정** — quality를 0.7 이하로 내리지 않음
7. **재이관 스크립트** — 기존 `{url}` 데이터에 thumb 추가

---

## 이미지 구조 (확정)

```js
// Firestore images 배열
images: [{
  thumb: "data:image/jpeg;base64,...",  // 300×400, quality 0.35 — 피드 썸네일용
  url: "https://firebasestorage..."     // 원본 비율, quality 0.7 — 상세보기용
}]
```

| 위치 | 사용 필드 | 이유 |
|------|-----------|------|
| 피드 썸네일 | `thumb` (Firestore 직접) | 빠른 로딩, Storage 요청 없음 |
| 상세보기 | `url` (Storage) | 원본 비율 표시 |
| 편집 미리보기 | `thumb` | 기존 사진 빠르게 표시 |

**하위 호환 폴백:**
- `images[0].thumb || images[0].url || images[0].base64`
- 플랫 `imageBase64` 필드도 유지

---

## 1. image.js 변경

### openCropModal 반환값 변경
기존: 크롭된 base64 문자열 반환  
변경: `{thumb}` 객체 반환 (취소 시 `null`)

```js
// crop confirm 핸들러
const thumbCanvas = cropper.getCroppedCanvas({ width: 300, height: 400 });
const thumb = thumbCanvas.toDataURL('image/jpeg', 0.35);
cleanup();
resolve({ thumb });
```

### compressToTarget quality 하한 변경
```js
// 변경 전
while (result.length > targetBytes && quality > 0.5)
// 변경 후
while (result.length > targetBytes && quality > 0.7)
```
quality가 0.7에서 시작 → 조건 불충족 → 항상 0.7 고정.

---

## 2. write.js 변경

### images 배열 구성
```js
// fileInput.onchange
const original = await App.Image.fileToBase64(file);   // 원본 비율, 0.7 quality
const result = await App.Image.openCropModal(original);
if (!result) return;
images.push({ thumb: result.thumb, originalBase64: original });
```

### renderSlots 미리보기
```js
imgEl.src = img.thumb;  // 기존 img.base64 → img.thumb
```

### 피드 미리보기
```js
previewImg.src = images[0].thumb;  // 기존 images[0].base64 → images[0].thumb
```

### submit — Storage 업로드
```js
const diaryRef = App.db.collection('diaries').doc();
const uploadedImages = await Promise.all(
  images.map((img, idx) =>
    App.Image.uploadToStorage(
      img.originalBase64,
      `diaries/${coupleId}/${diaryRef.id}/${idx}.jpg`
    ).then(url => ({ thumb: img.thumb, url }))
  )
);
await diaryRef.set({ ..., images: uploadedImages, ... });
```

---

## 3. detail.js 변경

### renderDetail — 상세보기 이미지 src
```js
// 단일 사진
src="${img.url || img.originalBase64 || img.base64}"
// 캐러셀
src="${img.url || img.originalBase64 || img.base64}"
```

### renderEditMode — 사진 편집 슬롯 추가
편집 진입 시 `editImages` 배열 초기화:
```js
// 기존 사진: {thumb, url} 형태 — 수정 없이 유지
// 새 사진: {thumb, originalBase64} 형태 — 저장 시 Storage 업로드
const editImages = normalizeDiaryImages(diary).map(img => ({
  thumb: img.thumb || img.url || img.base64,  // 미리보기용
  url: img.url || null,                        // 기존 Storage URL
  originalBase64: null                          // 새 사진만 있음
}));
```

편집 저장 시:
```js
// 기존 사진(url 있음) → 그대로 유지
// 새 사진(originalBase64 있음) → Storage 업로드 → url 획득
// 삭제된 사진 → 기존 url에서 Storage 파일 삭제
const newImages = await Promise.all(
  editImages.map((img, idx) => {
    if (img.url) return { thumb: img.thumb, url: img.url };
    return App.Image.uploadToStorage(
      img.originalBase64,
      `diaries/${coupleId}/${diaryId}/${Date.now()}_${idx}.jpg`
    ).then(url => ({ thumb: img.thumb, url }));
  })
);
// 삭제된 url Storage에서 제거
const removedUrls = originalUrls.filter(u => !newImages.some(i => i.url === u));
for (const url of removedUrls) {
  try { await App.storage.refFromURL(url).delete(); } catch(e) {}
}
await App.DB.updateDiary(diaryId, { images: newImages });
```

슬롯 UI: write.js와 동일 구조 (MAX 3장, 추가/삭제 버튼).

---

## 4. feed.js 변경 — 무한스크롤

실시간 리스너 제거 → 일회성 paginated fetch + Intersection Observer

```js
// 첫 8개 로드
const { diaries, lastDoc, hasMore } = await App.DB.getSharedDiariesPage(coupleId, 8);
renderGrid(diaries);
// 하단 sentinel 감지 → 다음 8개 append
```

`getThumb`:
```js
function getThumb(diary) {
  if (diary.images?.[0]) return diary.images[0].thumb || diary.images[0].url || diary.images[0].base64;
  return diary.imageBase64 || null;
}
```

---

## 5. db.js 변경

`getSharedDiariesPage(coupleId, limitCount, startAfterDoc = null)` 추가:
```js
async getSharedDiariesPage(coupleId, limitCount, startAfterDoc = null) {
  let query = App.db.collection('diaries')
    .where('coupleId', '==', coupleId)
    .where('isSecret', '==', false)
    .orderBy('date', 'desc')
    .limit(limitCount);
  if (startAfterDoc) query = query.startAfter(startAfterDoc);
  const snap = await query.get();
  return {
    diaries: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
    lastDoc: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.docs.length === limitCount
  };
}
```

---

## 6. my.js 변경

비밀일기 썸네일:
```js
const src = diary.images?.[0]
  ? (diary.images[0].thumb || diary.images[0].url || diary.images[0].base64)
  : diary.imageBase64 || null;
```

---

## 7. sw.js 변경

CACHE_NAME `diary-v8`로 bump.

Storage 이미지 cache-first:
```js
if (e.request.url.includes('firestore.googleapis.com')) return;  // Firestore API 스킵
if (e.request.url.includes('firebasestorage.googleapis.com')) {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
        return res;
      });
    })
  );
  return;
}
```

---

## 8. style.css 변경

`.detail-back`에 폰트 추가:
```css
.detail-back {
  font-family: var(--font-main);
  ...
}
```

---

## 9. 재이관 스크립트 (scripts/remigrate-add-thumbs.js)

기존 `{url}` 데이터에 `thumb` 추가.

```js
(async function remigrateAddThumbs() {
  const coupleId = App.Couple.currentCouple.id;
  const snap = await App.db.collection('diaries')
    .where('coupleId', '==', coupleId).get();

  for (const doc of snap.docs) {
    const diary = { id: doc.id, ...doc.data() };
    if (!diary.images?.length) continue;
    if (diary.images[0].thumb) { console.log(`[skip] ${diary.id}`); continue; }

    try {
      const updatedImages = await Promise.all(
        diary.images.map(async (img) => {
          if (!img.url) return img;
          // Storage URL에서 이미지 로드 → 300×400 canvas → thumb 생성
          const thumb = await generateThumbFromUrl(img.url);
          return { thumb, url: img.url };
        })
      );
      await App.db.collection('diaries').doc(diary.id).update({ images: updatedImages });
      console.log(`[done] ${diary.id}`);
    } catch (err) {
      console.error(`[fail] ${diary.id}:`, err);
    }
  }
  console.log('완료');
})();

async function generateThumbFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      // center crop to 3:4
      const srcRatio = img.width / img.height;
      const targetRatio = 3 / 4;
      let sx, sy, sw, sh;
      if (srcRatio > targetRatio) {
        sh = img.height; sw = sh * targetRatio;
        sx = (img.width - sw) / 2; sy = 0;
      } else {
        sw = img.width; sh = sw / targetRatio;
        sx = 0; sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 300, 400);
      resolve(canvas.toDataURL('image/jpeg', 0.35));
    };
    img.onerror = reject;
    img.src = url;
  });
}
```

---

## 변경 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `js/image.js` | openCropModal → {thumb} 반환, quality > 0.7 |
| `js/pages/write.js` | {thumb, originalBase64} 구성, Storage 업로드 |
| `js/pages/detail.js` | 편집 모드 사진 슬롯, 상세보기 url 사용 |
| `js/pages/feed.js` | 무한스크롤, thumb 우선 썸네일 |
| `js/pages/my.js` | thumb 우선 썸네일 |
| `js/db.js` | getSharedDiariesPage 추가 |
| `sw.js` | Storage cache-first, diary-v8 |
| `css/style.css` | .detail-back 폰트 |
| `scripts/remigrate-add-thumbs.js` | 기존 데이터 thumb 추가 |
