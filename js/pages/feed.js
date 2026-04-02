window.App = window.App || {};

App.Router.register('#/feed', async () => {
  const app = document.getElementById('app');
  const coupleId = App.Couple.currentCouple.id;

  app.innerHTML = `
    <div class="feed-page">
      <div class="feed-header">
        <h1>우리의 하루</h1>
      </div>
      <div class="feed-grid" id="feed-grid">
        <div class="loading">불러오는 중...</div>
      </div>
    </div>
  `;

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

    grid.innerHTML = diaries.map(diary => `
      <div class="feed-cell" data-id="${diary.id}">
        ${diary.imageBase64
          ? `<img class="feed-cell-img" src="${diary.imageBase64}" alt="">`
          : `<div class="feed-cell-img" style="background:#d4c5b0;"></div>`
        }
        <div class="feed-cell-overlay"></div>
        <div class="feed-cell-memo">
          <div class="feed-memo">
            <div class="feed-memo-text">${App.escapeHtml(diary.title)}</div>
          </div>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.feed-cell').forEach(cell => {
      cell.onclick = () => {
        location.hash = `#/detail/${cell.dataset.id}`;
      };
    });
  }

  // Real-time listener
  const unsub = App.DB.onSharedDiariesChange(coupleId, renderGrid);
  App.Router.addUnsubscriber(unsub);
});

