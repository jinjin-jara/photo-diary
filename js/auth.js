window.App = window.App || {};

App.Auth = {
  currentUser: null,

  init() {
    return new Promise((resolve) => {
      App.auth.onAuthStateChanged((user) => {
        App.Auth.currentUser = user;
        resolve(user);
      });
    });
  },

  async signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      const result = await App.auth.signInWithPopup(provider);
      App.Auth.currentUser = result.user;
      return result.user;
    } catch (error) {
      console.error('Login failed:', error);
      App.Toast.show('로그인에 실패했습니다');
      return null;
    }
  },

  async signOut() {
    await App.auth.signOut();
    App.Auth.currentUser = null;
    location.hash = '#/login';
  },

  getUid() {
    return App.Auth.currentUser ? App.Auth.currentUser.uid : null;
  },

  getDisplayName() {
    return App.Auth.currentUser ? App.Auth.currentUser.displayName : '';
  }
};
