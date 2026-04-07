window.App = window.App || {};

App.Router.register('#/my', async () => {
  const app = document.getElementById('app');
  const coupleId = App.Couple.currentCouple.id;
  const uid = App.Auth.getUid();

  // Load profile
  const profile = await App.DB.getProfile(uid) || {};
  const nickname = profile.nickname || App.Auth.getDisplayName();
  const photoURL = profile.photoURL || '';

  app.innerHTML = `
    <div class="my-page">
      <div class="my-profile">
        <div class="my-profile-photo-wrap" id="profile-photo-wrap">
          <input type="file" accept="image/*" id="profile-photo-input" style="display:none">
          ${photoURL
            ? `<img class="my-profile-photo" id="profile-photo" src="${photoURL}" alt="">`
            : `<div class="my-profile-photo" id="profile-photo" style="display:flex;align-items:center;justify-content:center;font-size:28px;color:var(--color-text-muted);">${App.escapeHtml(nickname[0])}</div>`
          }
          <div class="my-profile-photo-edit">
            <svg viewBox="0 0 24 24" stroke-width="2">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
        </div>
        <input class="my-profile-nickname" id="profile-nickname" value="${App.escapeHtml(nickname)}" placeholder="닉네임">
        <div class="my-profile-hint">탭하여 닉네임 변경</div>
      </div>

      <div class="my-section">
        <h3>비밀 일기</h3>
        <div class="my-diary-list" id="secret-list">
          <div class="loading">불러오는 중...</div>
        </div>
      </div>

      <div class="my-section">
        <h3>설정</h3>
        <div class="my-settings">
          <button class="my-settings-item" id="settings-couple">
            <span>커플 정보</span>
            <span class="my-settings-value">${App.escapeHtml(nickname)}</span>
          </button>
          <button class="my-settings-item" id="settings-logout">
            <span>로그아웃</span>
            <span class="my-settings-value">&rarr;</span>
          </button>
        </div>
      </div>
    </div>
  `;

  // Profile photo upload
  const photoInput = document.getElementById('profile-photo-input');
  document.getElementById('profile-photo-wrap').onclick = () => photoInput.click();

  photoInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const base64 = await resizeProfilePhoto(file);
      await App.DB.setProfile(uid, { photoURL: base64 });

      const photoEl = document.getElementById('profile-photo');
      if (photoEl.tagName === 'IMG') {
        photoEl.src = base64;
      } else {
        const img = document.createElement('img');
        img.className = 'my-profile-photo';
        img.id = 'profile-photo';
        img.src = base64;
        photoEl.replaceWith(img);
      }
      App.Toast.show('프로필 사진 변경 완료');
    } catch (err) {
      console.error('Profile photo failed:', err);
      App.Toast.show('사진 변경에 실패했습니다');
    }
  };

  // Nickname save on blur
  const nicknameInput = document.getElementById('profile-nickname');
  nicknameInput.addEventListener('blur', async () => {
    const newNickname = nicknameInput.value.trim();
    if (!newNickname) {
      nicknameInput.value = nickname;
      return;
    }
    if (newNickname !== nickname) {
      await App.DB.setProfile(uid, { nickname: newNickname });
      App.Toast.show('닉네임 변경 완료');
    }
  });

  nicknameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nicknameInput.blur();
    }
  });

  // Secret diaries
  try {
    const diaries = await App.DB.getSecretDiaries(coupleId, uid);
    renderSecretList(diaries);
  } catch (err) {
    console.error('Failed to load secret diaries:', err);
  }

  function renderSecretList(diaries) {
    const list = document.getElementById('secret-list');
    if (!list) return;

    if (diaries.length === 0) {
      list.innerHTML = `
        <div class="my-empty">
          비밀 일기가 없어요.<br>나만의 기록을 남겨보세요.
        </div>
      `;
      return;
    }

    list.innerHTML = diaries.map(diary => `
      <div class="my-diary-item" data-id="${diary.id}">
        ${(function() {
          const src = (diary.images && diary.images.length > 0)
            ? (diary.images[0].thumb || diary.images[0].url || diary.images[0].base64)
            : diary.imageBase64 || null;
          return src
            ? `<img class="my-diary-thumb" src="${App.escapeHtml(src)}" alt="">`
            : `<div class="my-diary-thumb-empty">&#128221;</div>`;
        })()}
        <div class="my-diary-info">
          <div class="my-diary-title">${App.escapeHtml(diary.title)}</div>
          <div class="my-diary-date">${diary.date}</div>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.my-diary-item').forEach(item => {
      item.onclick = () => {
        location.hash = `#/detail/${item.dataset.id}`;
      };
    });
  }

  // Settings
  document.getElementById('settings-logout').onclick = () => {
    App.Auth.signOut();
  };

  document.getElementById('settings-couple').onclick = () => {
    App.Toast.show(`커플 ID: ${coupleId.substring(0, 8)}...`);
  };
});

function resizeProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 200, 200);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
