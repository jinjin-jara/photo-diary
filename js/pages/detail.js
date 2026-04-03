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
          <img class="detail-image" src="${diary.imageOriginalBase64 || diary.imageBase64}" alt="">
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

  // Back button
  document.getElementById('detail-back').onclick = () => {
    location.hash = diary.isSecret ? '#/my' : '#/feed';
  };

  // Delete button
  if (isAuthor) {
    document.getElementById('delete-btn').onclick = async () => {
      if (confirm('정말 삭제할까요?')) {
        await App.DB.deleteDiary(params.id);
        App.Toast.show('삭제되었습니다');
        location.hash = diary.isSecret ? '#/my' : '#/feed';
      }
    };
  }

  // Comments
  const commentList = document.getElementById('comment-list');
  const commentInput = document.getElementById('comment-input');
  const uid = App.Auth.getUid();

  function renderComments(comments) {
    if (!commentList) return;
    if (comments.length === 0) {
      commentList.innerHTML = '<div class="comment-empty">아직 댓글이 없어요</div>';
      return;
    }
    commentList.innerHTML = comments.map(c => {
      const initial = (c.authorName || '?')[0];
      const time = c.createdAt ? formatCommentTime(c.createdAt.toDate()) : '';
      const isMyComment = c.authorId === uid;
      return `
        <div class="comment-item">
          <div class="comment-avatar">${App.escapeHtml(initial)}</div>
          <div class="comment-content">
            <div class="comment-author">${App.escapeHtml(c.authorName)}</div>
            <div class="comment-text">${App.escapeHtml(c.text).replace(/\n/g, '<br>')}</div>
            <span class="comment-time">${time}${isMyComment ? `<button class="comment-delete" data-id="${c.id}">삭제</button>` : ''}</span>
          </div>
        </div>
      `;
    }).join('');

    commentList.querySelectorAll('.comment-delete').forEach(btn => {
      btn.onclick = async () => {
        await App.DB.deleteComment(btn.dataset.id);
      };
    });
  }

  // Real-time comments listener
  const unsub = App.DB.onCommentsChange(params.id, renderComments);
  App.Router.addUnsubscriber(unsub);

  // Auto-resize comment input
  commentInput.addEventListener('input', () => {
    commentInput.style.height = 'auto';
    commentInput.style.height = Math.min(commentInput.scrollHeight, 80) + 'px';
  });

  // Send comment
  document.getElementById('comment-send').onclick = async () => {
    const text = commentInput.value.trim();
    if (!text) return;

    commentInput.value = '';
    commentInput.style.height = 'auto';

    await App.DB.createComment({
      diaryId: params.id,
      authorId: uid,
      authorName: App.Auth.getDisplayName(),
      text: text
    });
  };
});

function formatCommentTime(date) {
  const now = new Date();
  const diff = now - date;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return min + '분 전';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + '시간 전';
  const day = Math.floor(hr / 24);
  if (day < 7) return day + '일 전';
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}.${d}`;
}

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
