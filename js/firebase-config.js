window.App = window.App || {};

App.firebaseConfig = {
  apiKey: "AIzaSyBA7iFila2oMb3JsrcfJL6poHegjZWjVzY",
  authDomain: "photo-diary-5c8e8.firebaseapp.com",
  projectId: "photo-diary-5c8e8",
  storageBucket: "photo-diary-5c8e8.firebasestorage.app",
  messagingSenderId: "51692990862",
  appId: "1:51692990862:web:48229e1a7033431996f4df",
  measurementId: "G-WB2RLLBBR6"
};

firebase.initializeApp(App.firebaseConfig);
App.auth = firebase.auth();
App.db = firebase.firestore();
App.storage = firebase.storage();
