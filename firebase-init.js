// firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.5.2/firebase-firestore.js";

// 🔹 Usa los datos que Firebase te dio
export const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROJECT_ID.firebaseapp.com",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_PROJECT_ID.appspot.com",
  messagingSenderId: "123456",
  appId: "1:123456:web:abcdef",
};

// 🔹 Inicializar la app
export const app = initializeApp(firebaseConfig);

// 🔹 Servicios que vas a usar
export const auth = getAuth(app);
export const db = getFirestore(app);