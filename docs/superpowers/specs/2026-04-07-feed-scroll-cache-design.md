# Feed 무한스크롤 / 이미지 캐싱 / 폰트 / 압축 설계

## 요청 사항 4가지

1. **피드 무한스크롤** — 8개씩 로드, 하단 도달 시 다음 8개
2. **이미지 캐싱** — Storage 이미지를 서비스워커로 캐시
3. **편집 모드 폰트** — 취소/저장 버튼에 Nanum Myeongjo 적용
4. **압축 0.7 고정** — quality를 0.7 이하로 내리지 않음

---

## 1. 피드 무한스크롤

**현재:** `onSharedDiariesChange` 실시간 리스너로 전체 로드  
**변경:** 일회성 paginated fetch + Intersection Observer

### db.js
`getSharedDiariesPage(coupleId, limit, startAfterDoc?)` 추가:
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

### feed.js
- 실시간 리스너 제거 (`onSharedDiariesChange` → `getSharedDiariesPage`)
- 첫 로드: 8개 fetch, 그리드 렌더링
- 그리드 하단에 `<div id="feed-sentinel">` 추가
- `IntersectionObserver`가 sentinel 감지 시 다음 8개 fetch → 기존 그리드에 append
- 더 이상 데이터 없으면 observer disconnect
- 로딩 중 중복 요청 방지 (`isLoading` 플래그)

---

## 2. 이미지 캐싱 (sw.js)

**현재:** `googleapis` 전체 스킵 → Storage 이미지도 캐싱 안 됨  
**변경:** Firestore API만 스킵, Storage 이미지는 cache-first

```js
// 변경 전
if (e.request.url.includes('firestore') || e.request.url.includes('googleapis')) return;

// 변경 후
if (e.request.url.includes('firestore.googleapis.com')) return;
if (e.request.url.includes('firebasestorage.googleapis.com')) {
  // cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, res.clone()));
        return res;
      });
    })
  );
  return;
}
```

CACHE_NAME을 `diary-v8`로 bump → 구 서비스워커 교체.

---

## 3. 편집 모드 폰트 (style.css)

`.detail-back`에 `font-family` 없음 → 브라우저 기본 폰트 사용 중.

```css
.detail-back {
  font-family: var(--font-main);  /* 추가 */
  ...
}
```

---

## 4. 압축 0.7 고정 (image.js)

`compressToTarget`의 while 조건 변경:
```js
// 변경 전
while (result.length > targetBytes && quality > 0.5)
// 변경 후
while (result.length > targetBytes && quality > 0.7)
```
quality가 0.7에서 시작하고 `> 0.7` 조건을 만족하지 못하므로 루프 미실행 → 항상 0.7 고정.

---

## 변경 파일 요약

| 파일 | 변경 |
|------|------|
| `js/db.js` | `getSharedDiariesPage` 추가 |
| `js/pages/feed.js` | 실시간 리스너 → 무한스크롤 |
| `sw.js` | Storage cache-first, CACHE_NAME diary-v8 |
| `css/style.css` | `.detail-back` font-family 추가 |
| `js/image.js` | quality > 0.5 → quality > 0.7 |
