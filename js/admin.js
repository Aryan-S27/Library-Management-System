// ============================================================
// admin.js  —  All admin-side Firestore operations
// Covers: Add Book (with duration), Inventory, Borrower Tracking
// ============================================================

import { db } from "./firebase-config.js";
import { guardPage } from "./auth.js";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


// Guard: only admins can view this page
guardPage("admin");


// ============================================================
// SECTION 1 — ADD BOOK
// Admin sets: title, author, genre, description, borrowDuration
// borrowDuration options: 7 / 14 / 28 days
// ============================================================

export async function addBook(formData) {
  // formData = { title, author, genre, description, borrowDuration }

  if (!formData.title || !formData.author || !formData.genre || !formData.borrowDuration) {
    return { success: false, error: "Please fill in all required fields." };
  }

  try {
    await addDoc(collection(db, "books"), {
      title:          formData.title.trim(),
      author:         formData.author.trim(),
      genre:          formData.genre.trim(),
      description:    formData.description?.trim() || "",

      // ← KEY FEATURE: Admin-defined borrow duration stored with each book
      borrowDuration: Number(formData.borrowDuration), // days: 7, 14, or 28

      status:         "Available",
      borrowedBy:     null,       // studentId when borrowed
      borrowerName:   null,       // student name (denormalized for fast display)
      borrowDate:     null,
      dueDate:        null,
      createdAt:      Timestamp.now()
    });

    return { success: true };

  } catch (error) {
    return { success: false, error: error.message };
  }
}


// ============================================================
// SECTION 2 — UPDATE BOOK DURATION
// Admin can change borrow duration on an existing book
// Only allowed if book is currently Available
// ============================================================

export async function updateBookDuration(bookId, newDuration) {
  try {
    await updateDoc(doc(db, "books", bookId), {
      borrowDuration: Number(newDuration)
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}


// ============================================================
// SECTION 3 — DELETE BOOK
// Only allowed if book is Available (not currently borrowed)
// ============================================================

export async function deleteBook(bookId, currentStatus) {
  if (currentStatus === "Borrowed") {
    return { success: false, error: "Cannot delete a book that is currently borrowed." };
  }

  try {
    await deleteDoc(doc(db, "books", bookId));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}


// ============================================================
// SECTION 4 — REAL-TIME INVENTORY TABLE
// Streams all books live. Includes borrower name + due date.
// Call this once on page load — it auto-updates on any change.
// ============================================================

export function streamInventory(renderCallback) {
  const q = query(collection(db, "books"), orderBy("createdAt", "desc"));

  // onSnapshot = real-time listener (fires on every Firestore change)
  return onSnapshot(q, (snapshot) => {
    const books = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    renderCallback(books);
  });
}


// ============================================================
// SECTION 5 — REAL-TIME BORROWER TRACKING
// Shows all currently borrowed books with overdue status
// ============================================================

export function streamActiveBorrows(renderCallback) {
  const q = query(
    collection(db, "transactions"),
    where("returned", "==", false),
    orderBy("dueDate", "asc")  // soonest due first
  );

  return onSnapshot(q, (snapshot) => {
    const borrows = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id:           docSnap.id,
        bookTitle:    data.bookTitle,
        studentName:  data.studentName,
        borrowDate:   data.borrowDate?.toDate(),
        dueDate:      data.dueDate?.toDate(),
        durationDays: data.durationDays,
        ...getOverdueStatus(data.dueDate?.toDate())
      };
    });
    renderCallback(borrows);
  });
}


// ============================================================
// SECTION 6 — OVERDUE STATUS CALCULATOR
// Used by both admin borrower tracking and student dashboard
// Returns a label and colour class for UI rendering
// ============================================================

export function getOverdueStatus(dueDate) {
  if (!dueDate) return { label: "—", colorClass: "status-grey" };

  const today    = new Date();
  const due      = new Date(dueDate);
  const diffMs   = due - today;
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return {
      label:      `Overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? "s" : ""}`,
      colorClass: "status-overdue",   // red
      isOverdue:  true,
      daysLeft
    };
  }
  if (daysLeft === 0) {
    return { label: "Due Today!",       colorClass: "status-warning", isOverdue: false, daysLeft };
  }
  if (daysLeft <= 3) {
    return { label: `Due in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`, colorClass: "status-warning", isOverdue: false, daysLeft };
  }
  return {
    label:      `${daysLeft} days left`,
    colorClass: "status-ok",          // green
    isOverdue:  false,
    daysLeft
  };
}


// ============================================================
// SECTION 7 — OVERDUE SUMMARY STATS (for Admin dashboard cards)
// ============================================================

export async function getOverdueStats() {
  const q = query(
    collection(db, "transactions"),
    where("returned", "==", false)
  );

  const snapshot = await getDocs(q);
  const today    = new Date();
  let overdue    = 0;
  let dueSoon    = 0;
  let onTime     = 0;

  snapshot.forEach(docSnap => {
    const dueDate  = docSnap.data().dueDate?.toDate();
    if (!dueDate) return;
    const daysLeft = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0)     overdue++;
    else if (daysLeft <= 3) dueSoon++;
    else                    onTime++;
  });

  return { overdue, dueSoon, onTime, total: snapshot.size };
}

// ==========================================
// 📊 ADMIN ANALYTICS: GENRE TRENDS
// ==========================================
let genreChartInstance = null; // Keep track so we can update it later

export async function renderAnalyticsChart() {
  const transSnap = await getDocs(collection(db, "transactions"));
  const genreCounts = {};

  // Aggregate the data
  transSnap.forEach(doc => {
    const genre = doc.data().bookGenre;
    if (genre) {
      genreCounts[genre] = (genreCounts[genre] || 0) + 1;
    }
  });

  const labels = Object.keys(genreCounts);
  const data = Object.values(genreCounts);

  const ctx = document.getElementById('genreChart').getContext('2d');

  // Destroy the old chart if it exists (prevents overlapping visual glitches)
  if (genreChartInstance) {
    genreChartInstance.destroy();
  }

  // Draw the new chart
  genreChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        label: 'Books Borrowed',
        data: data,
        backgroundColor: [
          '#C84B31', // Brand Orange
          '#2D4263', // Deep Blue
          '#ECDBBA', // Cream
          '#4E9F3D', // Green
          '#8D3DAF'  // Purple
        ],
        borderWidth: 2,
        hoverOffset: 4,
        
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#dde1ee', font: { family: 'monospace' } }
        }
      }
    }
  });
}

// Call this function when the admin page loads (e.g., inside your init() function)
renderAnalyticsChart();
