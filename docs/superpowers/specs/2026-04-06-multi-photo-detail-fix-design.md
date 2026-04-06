# Design: Multi-Photo Upload & Detail Image Fix

**Date:** 2026-04-06  
**Scope:** Two features — (1) fix cropped image display in detail view, (2) allow up to 3 photos per diary entry

---

## 1. Detail Image Fix (Bug)

### Problem
`css/style.css` `.detail-image` has `aspect-ratio: 4/3; object-fit: cover` which forces all images into a fixed crop ratio, hiding parts of the original photo.

### Fix
Remove `aspect-ratio` and change `object-fit` to `contain` (or simply remove it), so images render at their natural aspect ratio. The image should fill the available width and scale height proportionally.

**CSS change:**
```css
/* Before */
.detail-image {
  width: 100%;
  aspect-ratio: 4/3;
  object-fit: cover;
}

/* After */
.detail-image {
  width: 100%;
  display: block;
}
```

---

## 2. Multi-Photo Upload (Max 3)

### Data Structure

New diaries store photos as an array:
```js
images: [
  { base64: "...", originalBase64: "..." },
  { base64: "...", originalBase64: "..." },
  // up to 3
]
```

Old diaries used flat fields `imageBase64` / `imageOriginalBase64`. Read compatibility is maintained by a helper that normalizes either format into the `images` array shape.

**Normalization helper (in `db.js` or inline):**
```js
function normalizeDiaryImages(diary) {
  if (diary.images && diary.images.length > 0) return diary.images;
  if (diary.imageBase64) return [{ base64: diary.imageBase64, originalBase64: diary.imageOriginalBase64 || diary.imageBase64 }];
  return [];
}
```

### Write Page (`write.js`)

- Replace single photo upload slot with a multi-slot UI supporting up to 3 photos.
- Initially shows one "add photo" slot. After a photo is selected and cropped, a second slot appears (if count < 3).
- Each slot shows a thumbnail of the cropped image with a remove (×) button.
- Each photo goes through the existing `App.Image.openCropModal()` flow.
- Feed preview uses the first photo only.
- Validation: public diaries require at least 1 photo.
- On submit, saves `images: [...]` array (not legacy flat fields).

### Detail Page (`detail.js`)

**Single photo:** Renders as before but without forced crop — natural aspect ratio.

**Multiple photos (2–3):** Renders a CSS scroll-snap carousel:
- Horizontal scroll with `scroll-snap-type: x mandatory` on the container and `scroll-snap-align: start` on each slide.
- No JS swipe library needed — native scroll handles touch.
- Dot indicators below the carousel update via `scroll` event listener.
- Uses `originalBase64` for display (full resolution).

Edit mode: photos are displayed read-only in the same carousel. Photo editing is out of scope.

### Feed Page (`feed.js`)

No change to layout. Use first image from `images` array (or legacy `imageBase64`) as thumbnail. Add normalization so old and new diaries both work.

---

## Files Changed

| File | Change |
|------|--------|
| `css/style.css` | Fix `.detail-image` — remove forced aspect-ratio/cover |
| `js/pages/write.js` | Multi-slot photo UI, save `images` array |
| `js/pages/detail.js` | Carousel for multiple photos, natural aspect ratio |
| `js/pages/feed.js` | Normalize image source (first of `images` array) |
| `js/db.js` | No schema change needed; normalization helper added inline |

---

## Out of Scope

- Photo editing in edit mode
- Reordering photos after selection
- Video support
