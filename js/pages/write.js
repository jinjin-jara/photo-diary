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
        images.splice(idx, 1);
        renderSlots();
        updateFeedPreviewFromImages();
      };
      slot.appendChild(removeBtn);

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
          const result = await App.Image.openCropModal(original);
          if (!result) return;
          images.push({ thumb: result.thumb, originalBase64: original });
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
      previewImg.src = images[0].thumb;
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
  };
});
