import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js";

const firebaseConfig = {
    apiKey: "AIzaSyC3tZAWCkmrNccGhLgWUPciDbPvgWj2gdY",
    authDomain: "breakbrock-young.firebaseapp.com",
    projectId: "breakbrock-young",
    storageBucket: "breakbrock-young.firebasestorage.app",
    messagingSenderId: "193113416471",
    appId: "1:193113416471:web:4591f360f69f8e5b5f4d52",
    measurementId: "G-XMSKEQGP0S"
};

const app = initializeApp(firebaseConfig);
const firestoreDb = getFirestore(app);
const GAME_DOC_REF = doc(firestoreDb, 'game', 'data');

window.firestoreGetDoc = () => getDoc(GAME_DOC_REF);
window.firestoreSetDoc = (data, options) => setDoc(GAME_DOC_REF, data, options);
let analytics = null;
try {
    analytics = getAnalytics(app);
} catch (e) {
    console.warn('Analytics 초기화 실패:', e);
}

window.firebaseApp = app;
window.firestoreDb = firestoreDb;
window.firebaseAnalytics = analytics;

// Firebase 초기화 후 game.js 로드 (모듈은 지연 실행되므로 game.js가 먼저 실행되는 것 방지)
const script = document.createElement('script');
script.src = 'game.js';
script.async = false;
document.body.appendChild(script);
