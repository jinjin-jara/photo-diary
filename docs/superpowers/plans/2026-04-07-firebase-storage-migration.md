# Firebase Storage Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일기 이미지를 Firestore base64 저장에서 Firebase Storage URL 저장으로 전환하고, 기존 데이터 이관 콘솔 스크립트를 작성한다.

**Architecture:** 신규 일기 작성 시 Storage에 업로드 후 다운로드 URL만 Firestore에 저장. 기존 base64/imageBase64 포맷은 표시 레이어에서 폴백 처리. 삭제 시 Storage 파일도 함께 제거. 기존 데이터는 브라우저 콘솔 스크립트로 일괄 이관.

**Tech Stack:** Firebase Storage compat SDK (10.12.0), vanilla JS

---

## File Map

| 파일 | 변경 내용 |
|------|-----------|
| `index.html` | Storage SDK 추가, 버전 v14로 일괄 bump |
| `js/firebase-config.js` | `App.storage = firebase.storage()` 초기화 |
| `js/image.js` | `App.Image.uploadToStorage(base64, path)` 추가 |
| `js/pages/write.js` | diaryId 사전 생성 → Storage 업로드 → URL 저장 |
| `js/db.js` | `deleteDiary(diaryId, imageUrls)` - Storage 파일 함께 삭제 |
| `js/pages/detail.js` | normalizeDiaryImages url 폴백, 삭제 시 imageUrls 전달 |
| `js/pages/feed.js` | getThumb에서 url 우선 처리 |
| `js/pages/my.js` | 비밀일기 썸네일 url 우선 처리 |

---

### Task 1: Firebase Storage SDK 추가 및 초기화

**Files:**
- Modify: `index.html`
- Modify: `js/firebase-config.js`

- [ ] **Step 1: index.html에 Storage SDK 추가 및 버전 v14로 bump**

`firebase-firestore-compat.js` 다음 줄에 추가:
```html
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-storage-compat.js"></script>
```

모든 `?v=13`을 `?v=14`로 변경:
```html
<link rel="stylesheet" href="css/style.css?v=14">
...
<script src="js/firebase-config.js?v=14"></script>
<script src="js/auth.js?v=14"></script>
<script src="js/db.js?v=14"></script>
<script src="js/couple.js?v=14"></script>
<script src="js/image.js?v=14"></script>
<script src="js/router.js?v=14"></script>
<script src="js/pages/login.js?v=14"></script>
<script src="js/pages/couple-link.js?v=14"></script>
<script src="js/pages/feed.js?v=14"></script>
<script src="js/pages/detail.js?v=14"></script>
<script src="js/pages/write.js?v=14"></script>
<script src="js/pages/my.js?v=14"></script>
```

- [ ] **Step 2: firebase-config.js에 Storage 초기화 추가**

`App.db = firebase.firestore();` 다음 줄에 추가:
```js
App.storage = firebase.storage();
```

- [ ] **Step 3: 브라우저에서 `App.storage` 가 undefined가 아닌지 콘솔 확인 후 커밋**

```bash
git add index.html js/firebase-config.js
git commit -m "feat: add Firebase Storage SDK and initialization"
```

---

### Task 2: image.js에 uploadToStorage 함수 추가

**Files:**
- Modify: `js/image.js`

- [ ] **Step 1: `App.Image` 객체에 `uploadToStorage` 메서드 추가**

`compressToTarget` 메서드 바로 다음에 추가:
```js
async uploadToStorage(base64, path) {
  const ref = App.storage.ref(path);
  await ref.putString(base64, 'data_url');
  return await ref.getDownloadURL();
},
```

- [ ] **Step 2: 커밋**

```bash
git add js/image.js
git commit -m "feat: add uploadToStorage helper to App.Image"
```

---

### Task 3: write.js - Storage 업로드 후 URL 저장

**Files:**
- Modify: `js/pages/write.js`

현재 submit 핸들러는 `images` 배열(base64 포함)을 그대로 Firestore에 저장한다.
변경 후: Firestore doc ID를 사전 생성 → Storage 업로드 → URL만 저장.

- [ ] **Step 1: submit 핸들러에서 diaryId 사전 생성 및 Storage 업로드 로직으로 교체**

`write.js`의 submit 핸들러에서 `const btn = document.getElementById('write-submit');` 줄부터 try-catch 블록 끝까지 전체를 아래로 교체:

```js
const btn = document.getElementById('write-submit');
btn.disabled = true;
btn.textContent = '저장 중...';

try {
  const diaryRef = App.db.collection('diaries').doc();

  const uploadedImages = await Promise.all(
    images.map((img, idx) =>
      App.Image.uploadToStorage(
        img.base64,
        `diaries/${coupleId}/${diaryRef.id}/${idx}.jpg`
      ).then(url => ({ url }))
    )
  );

  await diaryRef.set({
    coupleId: coupleId,
    authorId: App.Auth.getUid(),
    authorName: App.Auth.getDisplayName(),
    date: date,
    title: title,
    body: body,
    images: uploadedImages,
    isSecret: isSecret,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  App.Toast.show('기록 완료!');
  location.hash = isSecret ? '#/my' : '#/feed';
} catch (err) {
  console.error('Save failed:', err);
  App.Toast.show('저장에 실패했습니다');
  btn.disabled = false;
  btn.textContent = '기록하기';
}
```

기존 코드에서 `images: images.map(img => ({ base64: img.base64 }))` 줄이 있었다면 이 교체로 제거됨.

- [ ] **Step 2: 일기 작성 테스트 - 사진 1~3장 업로드 후 Storage 콘솔에서 파일 생성 확인**

- [ ] **Step 3: 커밋**

```bash
git add js/pages/write.js
git commit -m "feat: upload diary images to Firebase Storage on write"
```

---

### Task 4: db.js - deleteDiary에서 Storage 파일 함께 삭제

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: `deleteDiary` 시그니처와 구현 변경**

기존:
```js
async deleteDiary(diaryId) {
  await App.db.collection('diaries').doc(diaryId).delete();
},
```

변경 후:
```js
async deleteDiary(diaryId, imageUrls = []) {
  await App.db.collection('diaries').doc(diaryId).delete();
  for (const url of imageUrls) {
    try {
      await App.storage.refFromURL(url).delete();
    } catch (e) {
      console.warn('Storage file delete failed:', url, e);
    }
  }
},
```

- [ ] **Step 2: 커밋**

```bash
git add js/db.js
git commit -m "feat: delete Storage images when diary is deleted"
```

---

### Task 5: detail.js - url 폴백 및 삭제 시 imageUrls 전달

**Files:**
- Modify: `js/pages/detail.js`

- [ ] **Step 1: `normalizeDiaryImages`에서 `url` 포맷 지원**

기존:
```js
function normalizeDiaryImages(diary) {
  if (diary.images && diary.images.length > 0) return diary.images;
  if (diary.imageBase64) return [{ base64: diary.imageBase64, originalBase64: diary.imageOriginalBase64 || diary.imageBase64 }];
  return [];
}
```

변경 없음 — `diary.images`가 `[{url}]`이면 그대로 반환되므로 OK.

- [ ] **Step 2: `renderPhotoSection`에서 이미지 src를 url → originalBase64 → base64 순서로 폴백**

`renderPhotoSection` 내 `img` 태그 src를 모두 교체:

단일 사진 (line ~47):
```js
<img class="detail-image" src="${images[0].url || images[0].originalBase64 || images[0].base64}" alt="">
```

캐러셀 슬라이드 (line ~54):
```js
const slides = images.map(img => `
  <div class="detail-carousel-slide">
    <img src="${img.url || img.originalBase64 || img.base64}" alt="">
  </div>
`).join('');
```

- [ ] **Step 3: 삭제 핸들러에서 imageUrls 전달**

`delete-btn` onclick 핸들러를 아래로 교체:
```js
document.getElementById('delete-btn').onclick = async () => {
  if (confirm('정말 삭제할까요?')) {
    const imageUrls = normalizeDiaryImages(diary)
      .map(img => img.url)
      .filter(Boolean);
    await App.DB.deleteDiary(params.id, imageUrls);
    App.Toast.show('삭제되었습니다');
    location.hash = diary.isSecret ? '#/my' : '#/feed';
  }
};
```

- [ ] **Step 4: 커밋**

```bash
git add js/pages/detail.js
git commit -m "feat: support url format in detail view, clean up Storage on delete"
```

---

### Task 6: feed.js + my.js - 썸네일 url 우선 처리

**Files:**
- Modify: `js/pages/feed.js`
- Modify: `js/pages/my.js`

- [ ] **Step 1: feed.js의 `getThumb` 함수에서 url 우선 반환**

기존:
```js
function getThumb(diary) {
  if (diary.images && diary.images.length > 0) return diary.images[0].base64;
  if (diary.imageBase64) return diary.imageBase64;
  return null;
}
```

변경 후:
```js
function getThumb(diary) {
  if (diary.images && diary.images.length > 0) {
    return diary.images[0].url || diary.images[0].base64;
  }
  if (diary.imageBase64) return diary.imageBase64;
  return null;
}
```

- [ ] **Step 2: my.js의 비밀일기 썸네일 src에서 url 우선 처리**

기존 (my.js ~line 130):
```js
const src = (diary.images && diary.images.length > 0)
  ? diary.images[0].base64
  : diary.imageBase64 || null;
```

변경 후:
```js
const src = (diary.images && diary.images.length > 0)
  ? (diary.images[0].url || diary.images[0].base64)
  : diary.imageBase64 || null;
```

- [ ] **Step 3: 커밋**

```bash
git add js/pages/feed.js js/pages/my.js
git commit -m "feat: support Storage url in feed and my page thumbnails"
```

---

### Task 7: 기존 데이터 이관 콘솔 스크립트

**Files:**
- Create: `scripts/migrate-images-to-storage.js`

이 파일은 브라우저 콘솔에 전체 내용을 붙여넣어 실행한다.
전제 조건: 앱에 로그인된 상태, `App.Couple.currentCouple` 존재.

- [ ] **Step 1: 스크립트 파일 작성**

```js
// =============================================================
// 일기 이미지 Firebase Storage 이관 스크립트
// 사용법: 앱 로그인 후 브라우저 콘솔에 전체 내용 붙여넣기
// =============================================================

(async function migrateImagesToStorage() {
  const coupleId = App.Couple.currentCouple.id;
  console.log(`[migrate] coupleId: ${coupleId}`);

  const snap = await App.db.collection('diaries')
    .where('coupleId', '==', coupleId)
    .get();

  console.log(`[migrate] 총 일기 수: ${snap.docs.length}`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of snap.docs) {
    const diary = { id: doc.id, ...doc.data() };

    // 이미 이관된 경우 (images[0].url 존재) 스킵
    if (diary.images && diary.images.length > 0 && diary.images[0].url) {
      skipped++;
      continue;
    }

    // 이미지 없는 일기 스킵
    const hasImages = (diary.images && diary.images.length > 0) || diary.imageBase64;
    if (!hasImages) {
      skipped++;
      continue;
    }

    try {
      // 이관할 base64 목록 정규화
      let base64List = [];
      if (diary.images && diary.images.length > 0) {
        base64List = diary.images.map(img => img.base64 || img.originalBase64).filter(Boolean);
      } else if (diary.imageBase64) {
        base64List = [diary.imageBase64];
      }

      // Storage 업로드
      const uploadedImages = await Promise.all(
        base64List.map(async (base64, idx) => {
          const path = `diaries/${coupleId}/${diary.id}/${idx}.jpg`;
          const ref = App.storage.ref(path);
          await ref.putString(base64, 'data_url');
          const url = await ref.getDownloadURL();
          return { url };
        })
      );

      // Firestore 업데이트 - url로 교체, 구버전 필드 제거
      const updateData = { images: uploadedImages };
      if (diary.imageBase64) {
        updateData.imageBase64 = firebase.firestore.FieldValue.delete();
      }
      if (diary.imageOriginalBase64) {
        updateData.imageOriginalBase64 = firebase.firestore.FieldValue.delete();
      }

      await App.db.collection('diaries').doc(diary.id).update(updateData);

      migrated++;
      console.log(`[migrate] ✓ ${diary.id} (${uploadedImages.length}장)`);
    } catch (err) {
      failed++;
      console.error(`[migrate] ✗ ${diary.id}:`, err);
    }
  }

  console.log(`\n[migrate] 완료 — 이관: ${migrated}, 스킵: ${skipped}, 실패: ${failed}`);
})();
```

- [ ] **Step 2: 커밋**

```bash
git add scripts/migrate-images-to-storage.js
git commit -m "feat: add console migration script for base64 → Storage"
```

- [ ] **Step 3: 실제 이관 실행**

앱을 브라우저에서 열고 로그인된 상태에서 콘솔에 스크립트 전체를 붙여넣고 실행.
콘솔 출력에서 `완료 — 이관: N, 스킵: M, 실패: 0` 확인.
실패가 있으면 해당 diaryId를 콘솔 에러에서 확인 후 재시도.

- [ ] **Step 4: Firebase Storage 콘솔에서 `diaries/` 폴더 파일 생성 확인**

---

### Task 8: 최종 푸시

- [ ] **Step 1: 전체 동작 확인**

  - 새 일기 작성 → Storage에 파일 생성, Firestore에 url 저장 확인
  - 피드/마이페이지 썸네일 정상 표시 확인
  - 상세보기 사진 정상 표시 확인
  - 일기 삭제 → Storage 파일도 삭제 확인 (Storage 콘솔)
  - 이관된 구버전 일기 표시 정상 확인

- [ ] **Step 2: 푸시**

```bash
git push
```
