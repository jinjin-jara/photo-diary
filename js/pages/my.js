window.App = window.App || {};

App.Router.register('#/my', async () => {
  const app = document.getElementById('app');
  const coupleId = App.Couple.currentCouple.id;
  const uid = App.Auth.getUid();

  app.innerHTML = `
    <div class="my-page">
      <h2>마이</h2>

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
            <span class="my-settings-value">${App.Auth.getDisplayName()}</span>
          </button>
          <button class="my-settings-item" id="settings-logout">
            <span>로그아웃</span>
            <span class="my-settings-value">&rarr;</span>
          </button>
        </div>
      </div>
    </div>
  `;

  // Load secret diaries
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
        ${diary.imageBase64
          ? `<img class="my-diary-thumb" src="${diary.imageBase64}" alt="">`
          : `<div class="my-diary-thumb-empty">&#128221;</div>`
        }
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
