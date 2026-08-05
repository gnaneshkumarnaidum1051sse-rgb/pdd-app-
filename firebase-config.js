import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAK3c5Jdn0kRHmMyYH0YSk5vHL3ieh8HEw",
  authDomain: "pddd-app.firebaseapp.com",
  projectId: "pddd-app",
  storageBucket: "pddd-app.firebasestorage.app",
  messagingSenderId: "99411504287",
  appId: "1:99411504287:web:e8a37c6b941c78a658c6aa",
  measurementId: "G-53DRDX2S3B"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const isFirebaseConfigured = true;

// Analytics is unavailable in some browsers and local/private contexts, so it is optional.
isSupported().then((supported) => { if (supported) getAnalytics(app); }).catch(() => {});
