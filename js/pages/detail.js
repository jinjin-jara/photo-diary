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

  const isAuthor = diary.authorId === App.Auth.getUid();

  // Load profiles for couple members
  const couple = App.Couple.currentCouple;
  const memberUids = [couple.user1, couple.user2].filter(Boolean);
  const profiles = await App.DB.getProfiles(memberUids);

  function getDisplayName(uid, fallback) {
    return (profiles[uid] && profiles[uid].nickname) || fallback || '?';
  }

  function getPhotoURL(uid) {
    return profiles[uid] && profiles[uid].photoURL;
  }

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

  function renderEditMode() {
    const dateStr = App.formatDate(diary.date);
    app.innerHTML = `
      <div class="detail-page">
        <div class="detail-header">
          <button class="detail-back" id="edit-cancel">취소</button>
          <span class="detail-date">편집</span>
          <button class="detail-back" id="edit-save" style="color:var(--color-accent);font-weight:700;font-size:15px;">저장</button>
        </div>
        ${renderPhotoSection(normalizeDiaryImages(diary))}
      ${normalizeDiaryImages(diary).length > 0 ? '<div style="text-align:center;font-size:12px;color:var(--color-text-muted);padding:6px 0 2px;">사진은 수정할 수 없습니다</div>' : ''}
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

    // Bind carousel scroll → dot indicators
    const images = normalizeDiaryImages(diary);
    if (images.length > 1) {
      const carousel = document.getElementById('detail-carousel');
      const dotsEl = document.getElementById('detail-carousel-dots');
      const dotEls = dotsEl ? dotsEl.querySelectorAll('.detail-carousel-dot') : [];
      if (carousel) {
        carousel.addEventListener('scroll', () => {
          const idx = Math.round(carousel.scrollLeft / carousel.offsetWidth);
          dotEls.forEach((d, i) => d.classList.toggle('active', i === idx));
        }, { passive: true });
      }
    }

    // Auto-resize title
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
        await App.DB.updateDiary(params.id, {
          date: newDate,
          title: newTitle,
          body: newBody
        });
        diary.date = newDate;
        diary.title = newTitle;
        diary.body = newBody;
        App.Toast.show('수정 완료!');
        renderDetail();
      } catch (err) {
        console.error('Update failed:', err);
        App.Toast.show('수정에 실패했습니다');
      }
    };
  }

  function bindEvents() {
    document.getElementById('detail-back').onclick = () => {
      location.hash = diary.isSecret ? '#/my' : '#/feed';
    };

    if (isAuthor) {
      document.getElementById('edit-btn').onclick = () => renderEditMode();

      document.getElementById('delete-btn').onclick = async () => {
        if (confirm('정말 삭제할까요?')) {
          await App.DB.deleteDiary(params.id);
          App.Toast.show('삭제되었습니다');
          location.hash = diary.isSecret ? '#/my' : '#/feed';
        }
      };
    }
  }

  function bindComments() {
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
        const name = getDisplayName(c.authorId, c.authorName);
        const photo = getPhotoURL(c.authorId);
        const time = c.createdAt ? formatCommentTime(c.createdAt.toDate()) : '';
        const isMyComment = c.authorId === uid;
        return `
          <div class="comment-item">
            <div class="comment-avatar">${photo ? `<img src="${photo}" alt="">` : App.escapeHtml(name[0])}</div>
            <div class="comment-content">
              <div class="comment-author">${App.escapeHtml(name)}</div>
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

    const unsub = App.DB.onCommentsChange(params.id, renderComments);
    App.Router.addUnsubscriber(unsub);

    commentInput.addEventListener('input', () => {
      commentInput.style.height = 'auto';
      commentInput.style.height = Math.min(commentInput.scrollHeight, 80) + 'px';
    });

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
  }

  renderDetail();
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
