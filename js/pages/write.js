window.App = window.App || {};

App.Router.register('#/write', async () => {
  const app = document.getElementById('app');
  const today = new Date().toISOString().split('T')[0];

  app.innerHTML = `
    <div class="write-page">
      <h2>하루 기록</h2>

      <div class="write-photo-upload" id="photo-upload">
        <input type="file" accept="image/*" id="photo-input" style="display:none">
        <div class="write-photo-placeholder" id="photo-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
          <span>사진을 선택해주세요</span>
        </div>
      </div>

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

  let croppedImage = null;
  let originalImage = null;

  const photoUpload = document.getElementById('photo-upload');
  const photoInput = document.getElementById('photo-input');
  const placeholder = document.getElementById('photo-placeholder');
  const previewSection = document.getElementById('feed-preview-section');
  const previewImg = document.getElementById('feed-preview-img');
  const previewTitle = document.getElementById('feed-preview-title');
  const titleInput = document.getElementById('write-title');

  // Auto-resize title textarea
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
    if (croppedImage) {
      previewTitle.innerHTML = App.escapeHtml(title).replace(/\n/g, '<br>') || '&nbsp;';
    }
  }

  // Photo upload
  photoUpload.onclick = () => photoInput.click();

  photoInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const original = await App.Image.fileToBase64(file);
      const cropped = await App.Image.openCropModal(original);
      if (!cropped) return;

      croppedImage = cropped;
      originalImage = original;

      photoUpload.classList.add('has-image');
      let img = photoUpload.querySelector('img');
      if (!img) {
        img = document.createElement('img');
        photoUpload.appendChild(img);
      }
      img.src = croppedImage;
      placeholder.style.display = 'none';

      // Show feed preview
      previewSection.classList.remove('hidden');
      previewImg.src = croppedImage;
      updateFeedPreview();
    } catch (err) {
      console.error('Image crop failed:', err);
      App.Toast.show('이미지 처리에 실패했습니다');
    }
  };

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

    if (!isSecret && !croppedImage) {
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
        imageBase64: croppedImage || '',
        imageOriginalBase64: originalImage || '',
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
