# Feed 무한스크롤 / 이미지 구조 개편 / 편집 모드 사진 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 피드 무한스크롤, thumb+url 이미지 구조, 편집 모드 사진 편집, 서비스워커 이미지 캐싱, 폰트 픽스, 재이관 스크립트를 구현한다.

**Architecture:** 이미지를 thumb(300×400 소형 base64, Firestore)과 url(원본 비율 Storage) 두 필드로 분리 저장. 피드는 thumb으로 빠르게 로딩, 상세보기는 url로 원본 비율 표시. 피드는 Intersection Observer 기반 무한스크롤(8개씩). 서비스워커는 Storage 이미지를 cache-first로 캐싱.

**Tech Stack:** Firebase Firestore/Storage compat SDK, Cropper.js, vanilla JS, Service Worker Cache API

---

## File Map

| 파일 | 역할 |
|------|------|
| `js/image.js` | openCropModal → {thumb} 반환, quality 0.7 고정 |
| `js/pages/write.js` | {thumb, originalBase64} 구성, originalBase64를 Storage에 업로드 |
| `js/db.js` | getSharedDiariesPage(paginated) 추가 |
| `js/pages/feed.js` | 무한스크롤, thumb 우선 썸네일 |
| `js/pages/my.js` | thumb 우선 썸네일 |
| `js/pages/detail.js` | 편집 모드 사진 슬롯, 상세보기 url 사용 |
| `sw.js` | Storage cache-first, CACHE_NAME diary-v8 |
| `index.html` | 버전 v15로 bump |
| `css/style.css` | .detail-back font-family 추가 |
| `scripts/remigrate-add-thumbs.js` | 기존 {url} 데이터에 thumb 추가 |

---

### Task 1: image.js — openCropModal {thumb} 반환 + quality 0.7 고정

**Files:**
- Modify: `js/image.js`

현재 `openCropModal`은 cropped base64 문자열을 반환한다. 변경 후 `{thumb}` 객체를 반환하고, 취소 시 `null` 반환.

- [ ] **Step 1: compressToTarget quality 하한을 0.5 → 0.7로 변경**

`js/image.js` 의 while 조건:
```js
while (result.length > targetBytes && quality > 0.7) {
```

- [ ] **Step 2: crop-confirm 핸들러를 {thumb} 반환으로 교체**

`js/image.js`의 `modal.querySelector('.crop-confirm').onclick` 전체를 교체:

```js
modal.querySelector('.crop-confirm').onclick = () => {
  const thumbCanvas = cropper.getCroppedCanvas({ width: 300, height: 400 });
  const thumb = thumbCanvas.toDataURL('image/jpeg', 0.35);
  cleanup();
  resolve({ thumb });
};
```

- [ ] **Step 3: 커밋**

```bash
git add js/image.js
git commit -m "feat: openCropModal returns {thumb} object, fix quality floor at 0.7"
```

---

### Task 2: write.js — {thumb, originalBase64} 구성 및 Storage 업로드

**Files:**
- Modify: `js/pages/write.js`

`openCropModal`이 이제 `{thumb}` 객체를 반환하므로 write.js를 맞게 수정. `originalBase64`(원본 비율)를 Storage에 업로드.

- [ ] **Step 1: fileInput.onchange 핸들러 수정**

`js/pages/write.js`의 `fileInput.onchange` 내 try 블록을 교체:

```js
try {
  const original = await App.Image.fileToBase64(file);
  const result = await App.Image.openCropModal(original);
  if (!result) return;
  images.push({ thumb: result.thumb, originalBase64: original });
  renderSlots();
  updateFeedPreviewFromImages();
} catch (err) {
  console.error('Image crop failed:', err);
  App.Toast.show('이미지 처리에 실패했습니다');
}
```

- [ ] **Step 2: renderSlots에서 img.base64 → img.thumb으로 변경**

`renderSlots` 함수 내 `imgEl.src = img.base64;` 를:
```js
imgEl.src = img.thumb;
```

- [ ] **Step 3: updateFeedPreviewFromImages에서 images[0].base64 → images[0].thumb**

```js
function updateFeedPreviewFromImages() {
  if (images.length > 0) {
    previewSection.classList.remove('hidden');
    previewImg.src = images[0].thumb;
    updateFeedPreview();
  } else {
    previewSection.classList.add('hidden');
  }
}
```

- [ ] **Step 4: submit 핸들러 — originalBase64를 Storage에 업로드 후 {thumb, url} 저장**

submit 핸들러의 `const btn = document.getElementById('write-submit');` 부터 try-catch 끝까지 교체:

```js
const btn = document.getElementById('write-submit');
btn.disabled = true;
btn.textContent = '저장 중...';

try {
  const diaryRef = App.db.collection('diaries').doc();

  const uploadedImages = await Promise.all(
    images.map((img, idx) =>
      App.Image.uploadToStorage(
        img.originalBase64,
        `diaries/${coupleId}/${diaryRef.id}/${idx}.jpg`
      ).then(url => ({ thumb: img.thumb, url }))
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

- [ ] **Step 5: 커밋**

```bash
git add js/pages/write.js
git commit -m "feat: write page uses thumb+originalBase64, uploads original to Storage"
```

---

### Task 3: db.js — getSharedDiariesPage 추가

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: getSharedDiariesPage 메서드 추가**

`js/db.js`의 `getSharedDiaries` 메서드 바로 다음에 추가:

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
},
```

- [ ] **Step 2: 커밋**

```bash
git add js/db.js
git commit -m "feat: add getSharedDiariesPage for paginated feed loading"
```

---

### Task 4: feed.js — 무한스크롤 + thumb 썸네일

**Files:**
- Modify: `js/pages/feed.js`

실시간 리스너(`onSharedDiariesChange`) 제거 → `getSharedDiariesPage` + Intersection Observer.

- [ ] **Step 1: feed.js 전체를 아래로 교체**

```js
window.App = window.App || {};

App.Router.register('#/feed', async () => {
  const app = document.getElementById('app');
  const coupleId = App.Couple.currentCouple.id;
  const PAGE_SIZE = 8;

  app.innerHTML = `
    <div class="feed-page">
      <div class="feed-grid" id="feed-grid">
        <div class="loading">불러오는 중...</div>
      </div>
      <div id="feed-sentinel" style="height:1px;"></div>
    </div>
  `;

  let lastDoc = null;
  let hasMore = true;
  let isLoading = false;

  function getThumb(diary) {
    if (diary.images && diary.images.length > 0) {
      return diary.images[0].thumb || diary.images[0].url || diary.images[0].base64;
    }
    if (diary.imageBase64) return diary.imageBase64;
    return null;
  }

  function appendDiaries(diaries) {
    const grid = document.getElementById('feed-grid');
    if (!grid) return;

    if (diaries.length === 0 && !lastDoc) {
      grid.innerHTML = `
        <div class="feed-empty">
          아직 기록된 하루가 없어요.<br>첫 번째 하루를 기록해보세요.
        </div>
      `;
      return;
    }

    diaries.forEach(diary => {
      const thumb = getThumb(diary);
      const cell = document.createElement('div');
      cell.className = 'feed-cell';
      cell.dataset.id = diary.id;
      cell.innerHTML = `
        ${thumb
          ? `<img class="feed-cell-img" src="${App.escapeHtml(thumb)}" alt="">`
          : `<div class="feed-cell-img" style="background:#d4c5b0;"></div>`
        }
        <div class="feed-cell-overlay"></div>
        <div class="feed-cell-memo">
          <div class="feed-memo">
            <div class="feed-memo-text">${App.escapeHtml(diary.title)}</div>
          </div>
        </div>
      `;
      cell.onclick = () => { location.hash = `#/detail/${diary.id}`; };
      grid.appendChild(cell);
    });
  }

  async function loadNextPage() {
    if (isLoading || !hasMore) return;
    isLoading = true;
    try {
      const result = await App.DB.getSharedDiariesPage(coupleId, PAGE_SIZE, lastDoc);
      const grid = document.getElementById('feed-grid');
      if (grid) {
        const loading = grid.querySelector('.loading');
        if (loading) loading.remove();
      }
      appendDiaries(result.diaries);
      lastDoc = result.lastDoc;
      hasMore = result.hasMore;
      if (!hasMore && observer) observer.disconnect();
    } catch (err) {
      console.error('Feed load failed:', err);
    }
    isLoading = false;
  }

  let observer = null;
  const sentinel = document.getElementById('feed-sentinel');
  if (sentinel) {
    observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadNextPage();
    }, { threshold: 0.1 });
    observer.observe(sentinel);
  }

  loadNextPage();
});
```

- [ ] **Step 2: 커밋**

```bash
git add js/pages/feed.js
git commit -m "feat: feed infinite scroll with Intersection Observer, thumb thumbnail"
```

---

### Task 5: my.js — thumb 우선 썸네일

**Files:**
- Modify: `js/pages/my.js`

- [ ] **Step 1: 비밀일기 썸네일 src 변경**

`js/pages/my.js`의 `renderSecretList` 내 src 결정 부분:

```js
const src = (diary.images && diary.images.length > 0)
  ? (diary.images[0].thumb || diary.images[0].url || diary.images[0].base64)
  : diary.imageBase64 || null;
```

- [ ] **Step 2: 커밋**

```bash
git add js/pages/my.js
git commit -m "feat: my page uses thumb for secret diary thumbnails"
```

---

### Task 6: detail.js — 편집 모드 사진 슬롯 + 상세보기 url

**Files:**
- Modify: `js/pages/detail.js`

가장 복잡한 태스크. `renderEditMode`를 완전히 교체하여 사진 추가/삭제 슬롯 UI를 추가한다.

- [ ] **Step 1: renderEditMode 함수 전체 교체**

`js/pages/detail.js`에서 `function renderEditMode()` 전체(207번째 줄 닫힌 `}` 포함)를 아래로 교체:

```js
function renderEditMode() {
  const MAX_PHOTOS = 3;

  let editImages = normalizeDiaryImages(diary).map(img => ({
    thumb: img.thumb || img.url || img.base64,
    url: img.url || null,
    originalBase64: null
  }));

  function renderEditPhotoSlots(container) {
    container.innerHTML = '';

    editImages.forEach((img, idx) => {
      const slot = document.createElement('div');
      slot.className = 'write-photo-slot has-image';
      const imgEl = document.createElement('img');
      imgEl.src = img.thumb;
      imgEl.alt = '';
      slot.appendChild(imgEl);
      const removeBtn = document.createElement('button');
      removeBtn.className = 'write-photo-slot-remove';
      removeBtn.title = '삭제';
      removeBtn.textContent = '×';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        editImages.splice(idx, 1);
        renderEditPhotoSlots(container);
      };
      slot.appendChild(removeBtn);
      container.appendChild(slot);
    });

    if (editImages.length < MAX_PHOTOS) {
      const addSlot = document.createElement('div');
      addSlot.className = 'write-photo-slot';
      addSlot.innerHTML = `
        <div class="write-photo-slot-add">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
          <span>${editImages.length === 0 ? '사진 선택' : '추가'}</span>
        </div>
      `;
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';
      addSlot.appendChild(fileInput);
      addSlot.onclick = () => fileInput.click();
      fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        fileInput.value = '';
        try {
          const original = await App.Image.fileToBase64(file);
          const result = await App.Image.openCropModal(original);
          if (!result) return;
          editImages.push({ thumb: result.thumb, url: null, originalBase64: original });
          renderEditPhotoSlots(container);
        } catch (err) {
          App.Toast.show('이미지 처리에 실패했습니다');
        }
      };
      container.appendChild(addSlot);
    }
  }

  app.innerHTML = `
    <div class="detail-page">
      <div class="detail-header">
        <button class="detail-back" id="edit-cancel">취소</button>
        <span class="detail-date">편집</span>
        <button class="detail-back" id="edit-save" style="color:var(--color-accent);font-weight:700;font-size:15px;">저장</button>
      </div>
      <div class="write-photo-slots" id="edit-photo-slots"></div>
      <div class="detail-body">
        <div class="write-field">
          <label>날짜</label>
          <input type="date" id="edit-date" value="${diary.date}">
        </div>
        <div class="write-field">
          <label>제목</label>
          <textarea class="write-title-input" id="edit-title" rows="1">${App.escapeHtml(diary.title)}</textarea>
        </div>
        <div class="write-field">
          <label>본문</label>
          <textarea id="edit-body">${App.escapeHtml(diary.body)}</textarea>
        </div>
      </div>
    </div>
  `;

  renderEditPhotoSlots(document.getElementById('edit-photo-slots'));

  const editTitle = document.getElementById('edit-title');
  editTitle.style.height = 'auto';
  editTitle.style.height = editTitle.scrollHeight + 'px';
  editTitle.addEventListener('input', () => {
    editTitle.style.height = 'auto';
    editTitle.style.height = editTitle.scrollHeight + 'px';
  });

  document.getElementById('edit-cancel').onclick = () => renderDetail();

  document.getElementById('edit-save').onclick = async () => {
    const newDate = document.getElementById('edit-date').value;
    const newTitle = document.getElementById('edit-title').value.trim();
    const newBody = document.getElementById('edit-body').value.trim();

    if (!newTitle) {
      App.Toast.show('제목을 입력해주세요');
      return;
    }

    try {
      const originalUrls = normalizeDiaryImages(diary).map(img => img.url).filter(Boolean);

      const newImages = await Promise.all(
        editImages.map((img, idx) => {
          if (img.url) return Promise.resolve({ thumb: img.thumb, url: img.url });
          return App.Image.uploadToStorage(
            img.originalBase64,
            `diaries/${diary.coupleId}/${params.id}/${Date.now()}_${idx}.jpg`
          ).then(url => ({ thumb: img.thumb, url }));
        })
      );

      const newUrls = newImages.map(i => i.url).filter(Boolean);
      const removedUrls = originalUrls.filter(u => !newUrls.includes(u));
      for (const url of removedUrls) {
        try { await App.storage.refFromURL(url).delete(); } catch (e) { console.warn('Storage delete failed:', e); }
      }

      await App.DB.updateDiary(params.id, {
        date: newDate,
        title: newTitle,
        body: newBody,
        images: newImages
      });

      diary.date = newDate;
      diary.title = newTitle;
      diary.body = newBody;
      diary.images = newImages;
      App.Toast.show('수정 완료!');
      renderDetail();
    } catch (err) {
      console.error('Update failed:', err);
      App.Toast.show('수정에 실패했습니다');
    }
  };
}
```

- [ ] **Step 2: 커밋**

```bash
git add js/pages/detail.js
git commit -m "feat: edit mode photo slots — add/remove photos, upload to Storage on save"
```

---

### Task 7: sw.js + index.html 버전 bump

**Files:**
- Modify: `sw.js`
- Modify: `index.html`

- [ ] **Step 1: sw.js — CACHE_NAME diary-v8, Storage cache-first**

`sw.js` 전체를 교체:

```js
const CACHE_NAME = 'diary-v8';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/firebase-config.js',
  './js/auth.js',
  './js/db.js',
  './js/couple.js',
  './js/image.js',
  './js/router.js',
  './js/pages/login.js',
  './js/pages/couple-link.js',
  './js/pages/feed.js',
  './js/pages/detail.js',
  './js/pages/write.js',
  './js/pages/my.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Firestore API — network only
  if (e.request.url.includes('firestore.googleapis.com')) return;

  // Firebase Storage images — cache first
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

  // App assets — network first, cache fallback
  e.respondWith(
    fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
```

- [ ] **Step 2: index.html 버전 v15로 bump**

`index.html`의 모든 `?v=14`를 `?v=15`로 변경.

- [ ] **Step 3: 커밋**

```bash
git add sw.js index.html
git commit -m "feat: service worker caches Storage images, bump to diary-v8/v15"
```

---

### Task 8: style.css — .detail-back 폰트

**Files:**
- Modify: `css/style.css`

- [ ] **Step 1: .detail-back에 font-family 추가**

`css/style.css`의 `.detail-back` 규칙:

```css
.detail-back {
  font-family: var(--font-main);
  background: none;
  border: none;
  font-size: 20px;
  color: var(--color-accent);
  cursor: pointer;
  padding: 4px;
```

(`font-family: var(--font-main);` 줄을 첫 번째 속성으로 추가)

- [ ] **Step 2: 커밋**

```bash
git add css/style.css
git commit -m "fix: apply Nanum Myeongjo font to detail-back buttons"
```

---

### Task 9: 재이관 스크립트 작성

**Files:**
- Create: `scripts/remigrate-add-thumbs.js`

기존 `{url}` 데이터에 thumb을 추가하는 브라우저 콘솔 스크립트.

- [ ] **Step 1: 스크립트 파일 작성**

```js
// =============================================================
// 기존 {url} 일기 데이터에 thumb 추가 재이관 스크립트
// 사용법: 앱 로그인 후 브라우저 콘솔에 전체 내용 붙여넣기
// =============================================================

async function generateThumbFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
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

(async function remigrateAddThumbs() {
  const coupleId = App.Couple.currentCouple.id;
  console.log(`[remigrate] coupleId: ${coupleId}`);

  const snap = await App.db.collection('diaries')
    .where('coupleId', '==', coupleId)
    .get();

  console.log(`[remigrate] 총 일기 수: ${snap.docs.length}`);

  let done = 0, skipped = 0, failed = 0;

  for (const doc of snap.docs) {
    const diary = { id: doc.id, ...doc.data() };

    // thumb 이미 있으면 스킵
    if (diary.images && diary.images.length > 0 && diary.images[0].thumb) {
      skipped++;
      continue;
    }

    // url 없으면 스킵 (이미지 없는 일기 또는 base64만 있는 경우)
    if (!diary.images || !diary.images[0] || !diary.images[0].url) {
      skipped++;
      continue;
    }

    try {
      const updatedImages = await Promise.all(
        diary.images.map(async (img) => {
          if (!img.url) return img;
          const thumb = await generateThumbFromUrl(img.url);
          return { thumb, url: img.url };
        })
      );

      await App.db.collection('diaries').doc(diary.id).update({ images: updatedImages });
      done++;
      console.log(`[remigrate] ✓ ${diary.id} (${updatedImages.length}장)`);
    } catch (err) {
      failed++;
      console.error(`[remigrate] ✗ ${diary.id}:`, err);
    }
  }

  console.log(`\n[remigrate] 완료 — 처리: ${done}, 스킵: ${skipped}, 실패: ${failed}`);
})();
```

- [ ] **Step 2: 커밋**

```bash
git add scripts/remigrate-add-thumbs.js
git commit -m "feat: add remigrate script to add thumbs to existing {url} diaries"
```

- [ ] **Step 3: 실행 및 확인**

앱 로그인 후 브라우저 콘솔에 스크립트 붙여넣기 실행.
`완료 — 처리: N, 실패: 0` 확인.

---

### Task 10: 최종 푸시

- [ ] **Step 1: 전체 동작 확인**

  - 새 일기 작성 → Storage에 원본 파일, Firestore에 thumb 확인
  - 피드: thumb으로 빠른 로딩, 8개씩 무한스크롤 동작
  - 상세보기: url(원본 비율) 표시
  - 편집 모드: 사진 추가/삭제 동작, 저장 후 반영
  - 편집 모드 취소/저장 버튼 폰트 Nanum Myeongjo 확인
  - 재이관 완료 후 기존 일기 피드 썸네일 표시 확인

- [ ] **Step 2: 푸시**

```bash
git push
```
