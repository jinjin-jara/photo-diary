window.App = window.App || {};

App.Router.register('#/detail', async (params) => {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading">불러오는 중...</div>';

  const diary = await App.DB.getDiary(params.id);
  if (!diary) {
    App.Toast.show('일기를 찾을 수 없습니다');
    location.hash = '#/feed';
    return;
  }

  // Check access: secret diary only visible to author
  if (diary.isSecret && diary.authorId !== App.Auth.getUid()) {
    App.Toast.show('접근 권한이 없습니다');
    location.hash = '#/feed';
    return;
  }

  const dateStr = App.formatDate(diary.date);
  const isAuthor = diary.authorId === App.Auth.getUid();

  app.innerHTML = `
    <div class="detail-page">
      <div class="detail-header">
        <button class="detail-back" id="detail-back">&larr;</button>
        <span class="detail-date">${dateStr}</span>
        ${diary.isSecret ? '<span style="font-size:12px;color:var(--color-text-muted);">비밀</span>' : ''}
      </div>
      ${diary.imageBase64 ? `
        <div class="detail-image-wrap">
          <img class="detail-image" src="${diary.imageBase64}" alt="">
        </div>
      ` : ''}
      ${isAuthor ? `
        <div class="detail-actions">
          <button class="detail-action-btn delete" id="delete-btn">삭제</button>
        </div>
      ` : ''}
      <div class="detail-body">
        <div class="detail-title">${App.escapeHtml(diary.title)}</div>
        <div class="detail-text">${App.escapeHtml(diary.body).replace(/\n/g, '<br>')}</div>
        <div class="detail-meta">
          <span>by ${App.escapeHtml(diary.authorName)}</span>
          <span>${dateStr}</span>
        </div>
      </div>
    </div>
  `;

  document.getElementById('detail-back').onclick = () => {
    if (diary.isSecret) {
      location.hash = '#/my';
    } else {
      location.hash = '#/feed';
    }
  };

  if (isAuthor) {
    document.getElementById('delete-btn').onclick = async () => {
      if (confirm('정말 삭제할까요?')) {
        await App.DB.deleteDiary(params.id);
        App.Toast.show('삭제되었습니다');
        if (diary.isSecret) {
          location.hash = '#/my';
        } else {
          location.hash = '#/feed';
        }
      }
    };
  }
});

App.formatDate = function(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dow = days[d.getDay()];
  return `${y}.${m}.${day} ${dow}`;
};

