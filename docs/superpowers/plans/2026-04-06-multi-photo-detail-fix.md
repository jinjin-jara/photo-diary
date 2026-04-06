# Multi-Photo Upload & Detail Image Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix detail view images being cropped to 4/3 ratio, and allow up to 3 photos per diary entry with a swipe carousel in detail view.

**Architecture:** CSS fix removes forced aspect-ratio from `.detail-image`. Multi-photo stores `images: [{base64, originalBase64}]` array in Firestore; a normalization helper bridges old flat-field diaries. Write page gets a multi-slot photo UI; detail page gets a native scroll-snap carousel with dot indicators; feed page reads first image from either format.

**Tech Stack:** Vanilla JS, CSS scroll-snap (no new libraries), Firebase Firestore, existing `App.Image.openCropModal()`

---

## File Map

| File | What changes |
|------|-------------|
| `css/style.css` | Remove forced aspect-ratio/cover from `.detail-image`; add carousel styles; replace write photo upload styles with multi-slot styles |
| `js/pages/write.js` | Replace single-slot photo upload with multi-slot (max 3); save `images` array |
| `js/pages/detail.js` | Add `normalizeDiaryImages` helper; render carousel for multi-photo; fix single-photo display |
| `js/pages/feed.js` | Use `normalizeDiaryImages` helper for thumbnail source |

---

## Task 1: Fix detail image CSS (no forced crop)

**Files:**
- Modify: `css/style.css` lines 303–309

- [ ] **Step 1: Edit `.detail-image` CSS**

In `css/style.css`, replace:
```css
.detail-image {
  width: 100%;
  aspect-ratio: 4/3;
  object-fit: cover;
  border-radius: 6px;
  display: block;
}
```
With:
```css
.detail-image {
  width: 100%;
  border-radius: 6px;
  display: block;
}
```

- [ ] **Step 2: Verify in browser**

Open any diary detail page. Image should now display at its natural aspect ratio without cropping. Tall photos appear tall; wide photos appear wide.

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "fix: show detail image at natural aspect ratio"
```

---

## Task 2: Add CSS for carousel and multi-slot photo upload

**Files:**
- Modify: `css/style.css`

- [ ] **Step 1: Add carousel styles**

Append to `css/style.css`:
```css
/* ===== Photo Carousel (detail) ===== */
.detail-carousel-wrap {
  padding: 0 24px;
  margin-bottom: 0;
}

.detail-carousel {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  border-radius: 6px;
  gap: 0;
}

.detail-carousel::-webkit-scrollbar {
  display: none;
}

.detail-carousel-slide {
  flex: 0 0 100%;
  scroll-snap-align: start;
}

.detail-carousel-slide img {
  width: 100%;
  display: block;
  border-radius: 6px;
}

.detail-carousel-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 10px 0 4px;
}

.detail-carousel-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-border);
  transition: background 0.2s;
}

.detail-carousel-dot.active {
  background: var(--color-accent);
}
```

- [ ] **Step 2: Replace write photo upload CSS with multi-slot styles**

In `css/style.css`, replace the existing `.write-photo-upload` block and related rules (lines 511–554):

```css
/* ===== Write Photo Slots ===== */
.write-photo-slots {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  align-items: flex-start;
}

.write-photo-slot {
  flex: 1;
  aspect-ratio: 3/4;
  background: var(--color-bg);
  border: 2px dashed var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.write-photo-slot.has-image {
  border-style: solid;
  border-color: transparent;
}

.write-photo-slot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.write-photo-slot-add {
  color: var(--color-text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.write-photo-slot-add svg {
  width: 28px;
  height: 28px;
}

.write-photo-slot-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(0,0,0,0.5);
  color: #fff;
  border: none;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}
```

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "style: add carousel and multi-slot photo upload styles"
```

---

## Task 3: Update write page for multi-photo upload

**Files:**
- Modify: `js/pages/write.js`

- [ ] **Step 1: Replace write.js entirely**

Replace the full contents of `js/pages/write.js` with:

```js
window.App = window.App || {};

App.Router.register('#/write', async () => {
  const app = document.getElementById('app');
  const today = new Date().toISOString().split('T')[0];

  app.innerHTML = `
    <div class="write-page">
      <h2>하루 기록</h2>

      <div class="write-photo-slots" id="photo-slots"></div>

      <div class="write-preview-section hidden" id="feed-preview-section">
        <div class="write-preview-label">피드 미리보기</div>
        <div class="write-preview-cell" id="feed-preview-cell">
          <img id="feed-preview-img" src="" alt="">
          <div class="preview-overlay"></div>
          <div class="preview-memo">
            <div class="preview-memo-inner">
              <div class="preview-memo-text" id="feed-preview-title"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="write-field">
        <label>날짜</label>
        <input type="date" id="write-date" value="${today}">
      </div>

      <div class="write-field">
        <label>제목</label>
        <textarea class="write-title-input" id="write-title" placeholder="제목" rows="1"></textarea>
      </div>

      <div class="write-field">
        <label>본문</label>
        <textarea id="write-body" placeholder="오늘 하루는 어땠나요?"></textarea>
      </div>

      <div class="write-toggle">
        <div>
          <div class="write-toggle-label">비밀 일기</div>
          <div class="write-toggle-hint">나만 볼 수 있는 일기</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="write-secret">
          <span class="toggle-slider"></span>
        </label>
      </div>

      <button class="write-submit" id="write-submit">기록하기</button>
    </div>
  `;

  // images: [{base64, originalBase64}, ...]
  const images = [];
  const MAX_PHOTOS = 3;

  const slotsContainer = document.getElementById('photo-slots');
  const previewSection = document.getElementById('feed-preview-section');
  const previewImg = document.getElementById('feed-preview-img');
  const previewTitle = document.getElementById('feed-preview-title');
  const titleInput = document.getElementById('write-title');

  function autoResizeTitle() {
    titleInput.style.height = 'auto';
    titleInput.style.height = titleInput.scrollHeight + 'px';
  }

  titleInput.addEventListener('input', () => {
    autoResizeTitle();
    updateFeedPreview();
  });

  function updateFeedPreview() {
    const title = titleInput.value.trim();
    if (images.length > 0) {
      previewTitle.innerHTML = App.escapeHtml(title).replace(/\n/g, '<br>') || '&nbsp;';
    }
  }

  function renderSlots() {
    slotsContainer.innerHTML = '';

    // Render filled slots
    images.forEach((img, idx) => {
      const slot = document.createElement('div');
      slot.className = 'write-photo-slot has-image';
      slot.innerHTML = `
        <img src="${img.base64}" alt="">
        <button class="write-photo-slot-remove" data-idx="${idx}" title="삭제">×</button>
      `;
      slot.querySelector('.write-photo-slot-remove').onclick = (e) => {
        e.stopPropagation();
        images.splice(idx, 1);
        renderSlots();
        updateFeedPreviewFromImages();
      };
      slotsContainer.appendChild(slot);
    });

    // Render add slot if under limit
    if (images.length < MAX_PHOTOS) {
      const addSlot = document.createElement('div');
      addSlot.className = 'write-photo-slot';
      addSlot.innerHTML = `
        <div class="write-photo-slot-add">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
          <span>${images.length === 0 ? '사진 선택' : '추가'}</span>
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
          const cropped = await App.Image.openCropModal(original);
          if (!cropped) return;
          images.push({ base64: cropped, originalBase64: original });
          renderSlots();
          updateFeedPreviewFromImages();
        } catch (err) {
          console.error('Image crop failed:', err);
          App.Toast.show('이미지 처리에 실패했습니다');
        }
      };

      slotsContainer.appendChild(addSlot);
    }
  }

  function updateFeedPreviewFromImages() {
    if (images.length > 0) {
      previewSection.classList.remove('hidden');
      previewImg.src = images[0].base64;
      updateFeedPreview();
    } else {
      previewSection.classList.add('hidden');
    }
  }

  renderSlots();

  // Submit
  document.getElementById('write-submit').onclick = async () => {
    const date = document.getElementById('write-date').value;
    const title = titleInput.value.trim();
    const body = document.getElementById('write-body').value.trim();
    const isSecret = document.getElementById('write-secret').checked;

    if (!title) {
      App.Toast.show('제목을 입력해주세요');
      return;
    }

    if (!isSecret && images.length === 0) {
      App.Toast.show('사진을 선택해주세요');
      return;
    }

    const coupleId = App.Couple.currentCouple.id;

    if (!isSecret) {
      const exists = await App.DB.checkDateExists(coupleId, date, App.Auth.getUid());
      if (exists) {
        App.Toast.show('이미 해당 날짜에 내 기록이 있습니다');
        return;
      }
    }

    const btn = document.getElementById('write-submit');
    btn.disabled = true;
    btn.textContent = '저장 중...';

    try {
      await App.DB.createDiary({
        coupleId: coupleId,
        authorId: App.Auth.getUid(),
        authorName: App.Auth.getDisplayName(),
        date: date,
        title: title,
        body: body,
        images: images,
        isSecret: isSecret
      });

      App.Toast.show('기록 완료!');
      location.hash = isSecret ? '#/my' : '#/feed';
    } catch (err) {
      console.error('Save failed:', err);
      App.Toast.show('저장에 실패했습니다');
      btn.disabled = false;
      btn.textContent = '기록하기';
    }
  };
});
```

- [ ] **Step 2: Verify write page in browser**

Open write page (`#/write`). Check:
- One add-photo slot visible initially
- After selecting and cropping a photo, thumbnail appears with × button, second slot appears
- After 3 photos, no more add slots
- Removing a photo brings back the add slot
- Feed preview updates with first photo
- Submit saves correctly

- [ ] **Step 3: Commit**

```bash
git add js/pages/write.js
git commit -m "feat: multi-photo upload (max 3) on write page"
```

---

## Task 4: Update detail page for carousel and image normalization

**Files:**
- Modify: `js/pages/detail.js`

- [ ] **Step 1: Add normalizeDiaryImages helper and update renderDetail**

At the top of the `App.Router.register('#/detail', ...)` callback (after `renderDetail` is defined but before it's called), add the helper. Then update `renderDetail` to use it.

Replace the `renderDetail` function (lines 35–82 in `detail.js`) with:

```js
function normalizeDiaryImages(diary) {
  if (diary.images && diary.images.length > 0) return diary.images;
  if (diary.imageBase64) return [{ base64: diary.imageBase64, originalBase64: diary.imageOriginalBase64 || diary.imageBase64 }];
  return [];
}

function renderPhotoSection(images) {
  if (images.length === 0) return '';

  if (images.length === 1) {
    return `
      <div class="detail-image-wrap">
        <img class="detail-image" src="${images[0].originalBase64 || images[0].base64}" alt="">
      </div>
    `;
  }

  const slides = images.map(img => `
    <div class="detail-carousel-slide">
      <img src="${img.originalBase64 || img.base64}" alt="">
    </div>
  `).join('');

  const dots = images.map((_, i) => `
    <div class="detail-carousel-dot${i === 0 ? ' active' : ''}" data-idx="${i}"></div>
  `).join('');

  return `
    <div class="detail-carousel-wrap">
      <div class="detail-carousel" id="detail-carousel">${slides}</div>
      <div class="detail-carousel-dots" id="detail-carousel-dots">${dots}</div>
    </div>
  `;
}

function renderDetail() {
  const dateStr = App.formatDate(diary.date);
  const images = normalizeDiaryImages(diary);

  app.innerHTML = `
    <div class="detail-page">
      <div class="detail-header">
        <button class="detail-back" id="detail-back">&larr;</button>
        <span class="detail-date">${dateStr}</span>
        ${diary.isSecret ? '<span style="font-size:12px;color:var(--color-text-muted);">비밀</span>' : ''}
      </div>
      ${renderPhotoSection(images)}
      ${isAuthor ? `
        <div class="detail-actions">
          <button class="detail-action-btn" id="edit-btn">편집</button>
          <button class="detail-action-btn delete" id="delete-btn">삭제</button>
        </div>
      ` : ''}
      <div class="detail-body">
        <div class="detail-title">${App.escapeHtml(diary.title).replace(/\n/g, '<br>')}</div>
        <div class="detail-text">${App.escapeHtml(diary.body).replace(/\n/g, '<br>')}</div>
        <div class="detail-meta">
          <span>by ${App.escapeHtml(getDisplayName(diary.authorId, diary.authorName))}</span>
          <span>${dateStr}</span>
        </div>
      </div>
      <div class="comments-section">
        <div class="comments-title">댓글</div>
        <div class="comment-list" id="comment-list">
          <div class="comment-empty">불러오는 중...</div>
        </div>
        <div class="comment-input-wrap">
          <textarea id="comment-input" placeholder="댓글을 남겨보세요" rows="1"></textarea>
          <button class="comment-send-btn" id="comment-send">
            <svg viewBox="0 0 24 24" stroke-width="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;

  // Bind carousel dots if multiple photos
  if (images.length > 1) {
    const carousel = document.getElementById('detail-carousel');
    const dotsEl = document.getElementById('detail-carousel-dots');
    const dotEls = dotsEl ? dotsEl.querySelectorAll('.detail-carousel-dot') : [];

    carousel.addEventListener('scroll', () => {
      const idx = Math.round(carousel.scrollLeft / carousel.offsetWidth);
      dotEls.forEach((d, i) => d.classList.toggle('active', i === idx));
    }, { passive: true });
  }

  bindEvents();
  bindComments();
}
```

Also update `renderEditMode` to use `normalizeDiaryImages` for the photo section (read-only):

Replace the photo block inside `renderEditMode` (the `diary.imageBase64 ? ...` block at line 93–97) with:

```js
${renderPhotoSection(normalizeDiaryImages(diary))}
```

Note: `renderPhotoSection` and `normalizeDiaryImages` must be defined before `renderEditMode` is called. Place them right after the `getPhotoURL` function definition.

- [ ] **Step 2: Verify in browser**

Open a diary with 1 photo → shows full natural height, no crop.  
Open a diary with 2–3 photos → shows carousel, swipe works, dots update.  
Open an old diary (legacy `imageBase64` field) → still shows photo correctly.

- [ ] **Step 3: Commit**

```bash
git add js/pages/detail.js
git commit -m "feat: photo carousel in detail view, normalize legacy image format"
```

---

## Task 5: Update feed page to normalize image source

**Files:**
- Modify: `js/pages/feed.js`

- [ ] **Step 1: Add normalization to renderGrid**

In `js/pages/feed.js`, replace the `renderGrid` function with:

```js
function renderGrid(diaries) {
  const grid = document.getElementById('feed-grid');
  if (!grid) return;

  if (diaries.length === 0) {
    grid.innerHTML = `
      <div class="feed-empty">
        아직 기록된 하루가 없어요.<br>첫 번째 하루를 기록해보세요.
      </div>
    `;
    return;
  }

  function getThumb(diary) {
    if (diary.images && diary.images.length > 0) return diary.images[0].base64;
    if (diary.imageBase64) return diary.imageBase64;
    return null;
  }

  grid.innerHTML = diaries.map(diary => {
    const thumb = getThumb(diary);
    return `
      <div class="feed-cell" data-id="${diary.id}">
        ${thumb
          ? `<img class="feed-cell-img" src="${thumb}" alt="">`
          : `<div class="feed-cell-img" style="background:#d4c5b0;"></div>`
        }
        <div class="feed-cell-overlay"></div>
        <div class="feed-cell-memo">
          <div class="feed-memo">
            <div class="feed-memo-text">${App.escapeHtml(diary.title)}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.feed-cell').forEach(cell => {
    cell.onclick = () => {
      location.hash = `#/detail/${cell.dataset.id}`;
    };
  });
}
```

- [ ] **Step 2: Verify in browser**

Feed grid shows thumbnails for both old diaries (legacy `imageBase64`) and new diaries (`images` array). Grid layout unchanged.

- [ ] **Step 3: Commit**

```bash
git add js/pages/feed.js
git commit -m "feat: normalize image source in feed for multi-photo diaries"
```

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - Detail image fix (CSS) → Task 1
  - Multi-photo write UI → Task 3
  - `images` array data structure → Task 3
  - Backward-compat normalization → Tasks 4 & 5
  - Carousel with dots in detail → Task 4
  - Feed first-photo thumbnail → Task 5
  - Edit mode shows photos read-only → Task 4 (`renderEditMode` uses `renderPhotoSection`)
- [x] **No placeholders** — all steps include full code
- [x] **Type consistency** — `normalizeDiaryImages` returns `[{base64, originalBase64}]` consistently; `renderPhotoSection` used in both `renderDetail` and `renderEditMode`
