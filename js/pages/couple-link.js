window.App = window.App || {};

App.Router.register('#/couple-link', async (params) => {
  const app = document.getElementById('app');
  const couple = App.Couple.currentCouple;

  // Already linked
  if (App.Couple.isLinked()) {
    location.hash = '#/feed';
    return;
  }

  // Has pending invite (user1 waiting for user2)
  if (couple && !couple.user2) {
    const link = App.Couple.getInviteLink(couple.inviteCode);
    app.innerHTML = `
      <div class="couple-page">
        <h2>커플 연결 대기중</h2>
        <p>아래 링크를 상대방에게 공유해주세요</p>
        <button class="couple-btn" id="copy-link-btn">링크 복사하기</button>
        <div class="couple-link-display">${link}</div>
        <div class="couple-waiting">상대방이 링크를 열면 자동으로 연결됩니다</div>
      </div>
    `;

    document.getElementById('copy-link-btn').onclick = async () => {
      try {
        await navigator.clipboard.writeText(link);
        App.Toast.show('링크가 복사되었습니다');
      } catch {
        // Fallback for mobile
        const ta = document.createElement('textarea');
        ta.value = link;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        App.Toast.show('링크가 복사되었습니다');
      }
    };

    // Listen for couple connection
    const unsub = App.db.collection('couples').doc(couple.id)
      .onSnapshot((doc) => {
        const data = doc.data();
        if (data && data.user2) {
          App.Couple.currentCouple = { id: doc.id, ...data };
          App.Toast.show('커플 연결 완료!');
          location.hash = '#/feed';
        }
      });
    App.Router.addUnsubscriber(unsub);
    return;
  }

  // No couple yet - show create invite
  app.innerHTML = `
    <div class="couple-page">
      <h2>커플 연결</h2>
      <p>커플 연결을 시작해보세요.<br>초대 링크를 만들어 상대방에게 공유하면 됩니다.</p>
      <button class="couple-btn" id="create-invite-btn">초대 링크 만들기</button>
    </div>
  `;

  document.getElementById('create-invite-btn').onclick = async () => {
    const btn = document.getElementById('create-invite-btn');
    btn.disabled = true;
    btn.textContent = '생성 중...';
    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('시간 초과')), 10000)
      );
      await Promise.race([App.Couple.createInvite(), timeout]);
      await Promise.race([App.Couple.loadCouple(), timeout]);
      App.Router.handleRoute();
    } catch (err) {
      console.error('Invite create failed:', err);
      App.Toast.show('초대 링크 생성 실패: ' + err.message);
      btn.disabled = false;
      btn.textContent = '초대 링크 만들기';
    }
  };
});
