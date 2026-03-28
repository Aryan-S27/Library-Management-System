// ============================================================
// firebase-config.js
// Initializes Firebase app, Auth, and Firestore
// Used by: auth.js, admin.js, student.js
// ============================================================

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyB6yjdmxp4zFRujnHlnr-WB9sZnfmzcpks",
  authDomain:        "library-mangement-62f15.firebaseapp.com",
  projectId:         "library-mangement-62f15",
  storageBucket:     "library-mangement-62f15.firebasestorage.app",
  messagingSenderId: "991853579454",
  appId:             "1:991853579454:web:d6ca243a33ef86fbe622ef"
};

// Initialize
const app = initializeApp(firebaseConfig);

// Export these — every other JS file imports from here
export const auth = getAuth(app);
export const db   = getFirestore(app);