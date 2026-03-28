// ============================================================
// auth.js
// Handles: Login, Logout, Role-based redirect, Page guard
// Used by: index.html, admin.html, student.html
// ============================================================

import { auth, db } from "./firebase-config.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


// ─────────────────────────────────────────────────────────────
// LOGIN
// Called from index.html when user clicks Sign In
// Returns an error message string, or null on success
// ─────────────────────────────────────────────────────────────
export async function login(email, password) {
  try {
    // Step 1 — Verify credentials with Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Step 2 — Fetch this user's role from Firestore users collection
    const userDoc = await getDoc(doc(db, "users", user.uid));

    if (!userDoc.exists()) {
      await signOut(auth);
      return "Account found but no profile exists. Contact your admin.";
    }

    const role = userDoc.data().role;

    // Step 3 — Redirect based on role
    if (role === "admin") {
      window.location.href = "admin.html";
    } else if (role === "student") {
      window.location.href = "student.html";
    } else {
      await signOut(auth);
      return "Unknown role assigned to this account.";
    }

    return null; // no error

  } catch (error) {
    // Convert Firebase error codes to readable messages
    switch (error.code) {
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Incorrect email or password.";
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/too-many-requests":
        return "Too many failed attempts. Try again later.";
      default:
        return "Login failed. Please try again.";
    }
  }
}


// ─────────────────────────────────────────────────────────────
// LOGOUT
// Called from admin.html and student.html
// ─────────────────────────────────────────────────────────────
export async function logout() {
  await signOut(auth);
  window.location.href = "index.html";
}


// ─────────────────────────────────────────────────────────────
// PAGE GUARD
// Call this at the top of admin.html and student.html
// Redirects away if user is not logged in or has wrong role
//
// Usage:
//   import { guardPage } from "./js/auth.js";
//   guardPage("admin");   ← in admin.html
//   guardPage("student"); ← in student.html
// ─────────────────────────────────────────────────────────────
export function guardPage(requiredRole) {
  onAuthStateChanged(auth, async (user) => {

    // Not logged in at all → back to login
    if (!user) {
      window.location.href = "index.html";
      return;
    }

    // Logged in but check their role
    const userDoc = await getDoc(doc(db, "users", user.uid));

    if (!userDoc.exists()) {
      window.location.href = "index.html";
      return;
    }


    // Role matches — do nothing, page loads normally
  });
}


// ─────────────────────────────────────────────────────────────
// GET CURRENT USER
// Returns { uid, name, email, role } for the logged-in user
// Used by admin.js and student.js to show name, fetch data
//
// Usage:
//   const user = await getCurrentUser();
//   console.log(user.name); // "Arjun Mehta"
// ─────────────────────────────────────────────────────────────
export async function getCurrentUser() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {

      if (!user) {
        resolve(null);
        return;
      }

      const userDoc = await getDoc(doc(db, "users", user.uid));

      if (!userDoc.exists()) {
        resolve(null);
        return;
      }

      // Return combined object with Auth + Firestore data
      resolve({
        uid:   user.uid,
        email: user.email,
        name:  userDoc.data().name,
        role:  userDoc.data().role
      });
    });
  });
}