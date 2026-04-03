window.App = window.App || {};

App.DB = {
  // ===== Couple Operations =====
  async getCoupleByUser(uid) {
    const snap1 = await App.db.collection('couples')
      .where('user1', '==', uid).limit(1).get();
    if (!snap1.empty) return { id: snap1.docs[0].id, ...snap1.docs[0].data() };

    const snap2 = await App.db.collection('couples')
      .where('user2', '==', uid).limit(1).get();
    if (!snap2.empty) return { id: snap2.docs[0].id, ...snap2.docs[0].data() };

    return null;
  },

  async getCoupleByInviteCode(code) {
    const snap = await App.db.collection('couples')
      .where('inviteCode', '==', code).limit(1).get();
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
    return null;
  },

  async createCouple(uid, inviteCode) {
    const doc = await App.db.collection('couples').add({
      user1: uid,
      user2: null,
      inviteCode: inviteCode,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return doc.id;
  },

  async joinCouple(coupleId, uid) {
    await App.db.collection('couples').doc(coupleId).update({
      user2: uid
    });
  },

  // ===== Profile Operations =====
  async getProfile(uid) {
    const doc = await App.db.collection('profiles').doc(uid).get();
    if (!doc.exists) return null;
    return doc.data();
  },

  async setProfile(uid, data) {
    await App.db.collection('profiles').doc(uid).set(data, { merge: true });
  },

  async getProfiles(uids) {
    const profiles = {};
    for (const uid of uids) {
      const p = await App.DB.getProfile(uid);
      if (p) profiles[uid] = p;
    }
    return profiles;
  },

  // ===== Diary Operations =====
  async getSharedDiaries(coupleId) {
    const snap = await App.db.collection('diaries')
      .where('coupleId', '==', coupleId)
      .where('isSecret', '==', false)
      .orderBy('date', 'desc')
      .get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async getSecretDiaries(coupleId, uid) {
    const snap = await App.db.collection('diaries')
      .where('coupleId', '==', coupleId)
      .where('authorId', '==', uid)
      .where('isSecret', '==', true)
      .orderBy('date', 'desc')
      .get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async getDiary(diaryId) {
    const doc = await App.db.collection('diaries').doc(diaryId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  },

  async checkDateExists(coupleId, date, authorId) {
    const snap = await App.db.collection('diaries')
      .where('coupleId', '==', coupleId)
      .where('date', '==', date)
      .where('authorId', '==', authorId)
      .where('isSecret', '==', false)
      .limit(1)
      .get();
    return !snap.empty;
  },

  async createDiary(data) {
    const doc = await App.db.collection('diaries').add({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return doc.id;
  },

  async updateDiary(diaryId, data) {
    await App.db.collection('diaries').doc(diaryId).update(data);
  },

  async deleteDiary(diaryId) {
    await App.db.collection('diaries').doc(diaryId).delete();
  },

  // ===== Comment Operations =====
  async getComments(diaryId) {
    const snap = await App.db.collection('comments')
      .where('diaryId', '==', diaryId)
      .orderBy('createdAt', 'asc')
      .get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async createComment(data) {
    const doc = await App.db.collection('comments').add({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return doc.id;
  },

  async deleteComment(commentId) {
    await App.db.collection('comments').doc(commentId).delete();
  },

  onCommentsChange(diaryId, callback) {
    return App.db.collection('comments')
      .where('diaryId', '==', diaryId)
      .orderBy('createdAt', 'asc')
      .onSnapshot((snap) => {
        const comments = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(comments);
      });
  },

  onSharedDiariesChange(coupleId, callback) {
    return App.db.collection('diaries')
      .where('coupleId', '==', coupleId)
      .where('isSecret', '==', false)
      .orderBy('date', 'desc')
      .onSnapshot((snap) => {
        const diaries = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(diaries);
      });
  }
};
