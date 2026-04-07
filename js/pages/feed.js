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
    } catch (err) {
      console.error('Feed load failed:', err);
    }
    isLoading = false;
  }

  function onScroll() {
    if (isLoading || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    if (scrollTop + clientHeight >= scrollHeight - 200) {
      loadNextPage();
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  App.Router.addUnsubscriber(() => window.removeEventListener('scroll', onScroll));

  loadNextPage();
});
