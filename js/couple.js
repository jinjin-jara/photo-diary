window.App = window.App || {};

App.Couple = {
  currentCouple: null,

  generateInviteCode() {
    return Math.random().toString(36).substring(2, 10);
  },

  getInviteCodeFromURL() {
    const hash = location.hash;
    const match = hash.match(/[?&]invite=([^&]+)/);
    return match ? match[1] : null;
  },

  getInviteLink(code) {
    const base = location.href.split('#')[0];
    return `${base}#/couple-link?invite=${code}`;
  },

  async loadCouple() {
    const uid = App.Auth.getUid();
    if (!uid) return null;
    App.Couple.currentCouple = await App.DB.getCoupleByUser(uid);
    return App.Couple.currentCouple;
  },

  async createInvite() {
    const uid = App.Auth.getUid();
    const code = App.Couple.generateInviteCode();
    await App.DB.createCouple(uid, code);
    return code;
  },

  async acceptInvite(inviteCode) {
    const uid = App.Auth.getUid();
    const couple = await App.DB.getCoupleByInviteCode(inviteCode);
    if (!couple) {
      App.Toast.show('유효하지 않은 초대 링크입니다');
      return false;
    }
    if (couple.user2) {
      App.Toast.show('이미 연결된 초대입니다');
      return false;
    }
    if (couple.user1 === uid) {
      App.Toast.show('자신의 초대 링크입니다');
      return false;
    }
    await App.DB.joinCouple(couple.id, uid);
    App.Couple.currentCouple = { ...couple, user2: uid };
    return true;
  },

  isLinked() {
    const c = App.Couple.currentCouple;
    return c && c.user1 && c.user2;
  }
};
