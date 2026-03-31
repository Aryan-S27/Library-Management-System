// ============================================================
// student.js  —  All student-side Firestore operations
// Covers: Browse Catalog, Borrow (with auto-duration), Return, Recommendations
// ============================================================

import { db }            from "./firebase-config.js";
import { guardPage, getCurrentUser } from "./auth.js";
import { getOverdueStatus }          from "./admin.js";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  getDocs,
  Timestamp,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


// Guard: only students can view this page
guardPage("student");

let currentUser = null;
// Pagination & Search State
let allAvailableBooks = [];
let filteredBooks = [];
let currentPage = 1;
const BOOKS_PER_PAGE = 100;

// Load current user on module init
(async () => { currentUser = await getCurrentUser(); })();

// ==========================================
// 📚 CATALOG & MODAL LOGIC
// ==========================================

// ==========================================
// 📚 CATALOG, PAGINATION & SEARCH LOGIC
// ==========================================

async function loadCatalog() {
  const catalogGrid = document.getElementById("studentCatalog");
  if (!catalogGrid) return; 

  catalogGrid.style = "display: flex; flex-direction: column; gap: 15px;";
  catalogGrid.innerHTML = "<p style='color: var(--text-muted);'>Loading physical inventory...</p>";

  // Fetch all available books ONCE
  const q = query(collection(db, "books"), where("status", "==", "Available"));
  const snapshot = await getDocs(q);

  allAvailableBooks = [];
  snapshot.forEach(docSnap => {
    allAvailableBooks.push({ id: docSnap.id, ...docSnap.data() });
  });

  if (allAvailableBooks.length === 0) {
    catalogGrid.innerHTML = "<p style='color: var(--text-muted);'>All books are currently checked out!</p>";
    return;
  }

  // Initialize filtered array and render the first page
  filteredBooks = [...allAvailableBooks];
  renderCatalogPage(1);
  setupSearchListener();
}

function renderCatalogPage(page) {
  currentPage = page;
  const catalogGrid = document.getElementById("studentCatalog");
  catalogGrid.innerHTML = "";

  // Math for 100 items per page
  const startIndex = (page - 1) * BOOKS_PER_PAGE;
  const endIndex = startIndex + BOOKS_PER_PAGE;
  const booksToRender = filteredBooks.slice(startIndex, endIndex);

  if (booksToRender.length === 0) {
    catalogGrid.innerHTML = "<p style='color: var(--text-muted);'>No books found matching your search.</p>";
  }

  booksToRender.forEach(book => {
    const card = document.createElement("div");
    card.style = "background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: 8px; padding: 15px; cursor: pointer; transition: transform 0.2s; display: flex; flex-direction: row; gap: 20px; align-items: center;";
    card.onmouseover = () => card.style.transform = "translateX(5px)";
    card.onmouseout = () => card.style.transform = "translateX(0)";
    
    const coverHTML = book.coverUrl 
      ? `<img src="${book.coverUrl}" alt="Cover" style="height: 120px; width: 80px; object-fit: cover; border-radius: 4px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); flex-shrink: 0;">`
      : `<div style="height: 120px; width: 80px; background: linear-gradient(135deg, var(--secondary-color), var(--bg-dark)); border-radius: 4px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 10px; text-align: center; flex-shrink: 0;">No Cover</div>`;

    card.innerHTML = `
      ${coverHTML}
      <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
        <h3 style="margin: 0 0 5px 0; color: var(--text-light); font-size: 18px;">${book.title}</h3>
        <p style="margin: 0 0 10px 0; color: var(--text-muted); font-size: 14px;">${book.author}</p>
        <div>
          <span style="background: var(--secondary-color); padding: 4px 8px; border-radius: 4px; font-size: 12px; color: white;">${book.genre}</span>
        </div>
      </div>
    `;

    card.onclick = () => window.openModal(book);
    catalogGrid.appendChild(card);
  });

  updatePaginationControls();
}

function updatePaginationControls() {
  const prevBtn = document.getElementById("prevPageBtn");
  const nextBtn = document.getElementById("nextPageBtn");
  const indicator = document.getElementById("pageIndicator");

  const totalPages = Math.ceil(filteredBooks.length / BOOKS_PER_PAGE) || 1;
  indicator.innerText = `Page ${currentPage} of ${totalPages}`;

  // Hide/Show buttons based on current page
  prevBtn.style.display = currentPage > 1 ? "block" : "none";
  nextBtn.style.display = currentPage < totalPages ? "block" : "none";
}

// Global functions for the HTML buttons to call
window.nextPage = function() { renderCatalogPage(currentPage + 1); window.scrollTo(0, 0); };
window.prevPage = function() { renderCatalogPage(currentPage - 1); window.scrollTo(0, 0); };

// Search Filter Logic
function setupSearchListener() {
  const searchInput = document.getElementById("studentSearch");
  if (!searchInput) return;

  searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase().trim();
    
    filteredBooks = allAvailableBooks.filter(book => {
      const titleMatch = book.title.toLowerCase().includes(term);
      const authorMatch = book.author.toLowerCase().includes(term);
      const genreMatch = book.genre.toLowerCase().includes(term);
      return titleMatch || authorMatch || genreMatch;
    });

    // Reset to page 1 whenever they type a new search
    renderCatalogPage(1);
  });
}

window.openModal = function(book) {
  selectedBook = book;
  document.getElementById("modalTitle").textContent = book.title;
  document.getElementById("modalAuthor").textContent = book.author;
  document.getElementById("modalGenre").textContent = book.genre;
  document.getElementById("modalDescription").textContent = book.description || "No description available.";
  
  // Handle the Cover Image
  const coverContainer = document.getElementById("modalCover");
  if (book.coverUrl) {
    coverContainer.innerHTML = `<img src="${book.coverUrl}" style="width: 100%; height: 100%; object-fit: cover;">`;
  } else {
    coverContainer.innerHTML = `<div style="width: 100%; height: 100%; background: linear-gradient(135deg, var(--primary-color), var(--secondary-color)); display: flex; align-items: center; justify-content: center; color: white; text-align: center; font-size: 12px; padding: 10px;">${book.title}</div>`;
  }

  // Reset the dropdown to default (14 days) every time they open a new book
  document.getElementById("borrowDuration").value = "14";

  document.getElementById("bookModal").style.display = "flex";
};

window.closeModal = function() {
  document.getElementById("bookModal").style.display = "none";
  selectedBook = null;
  document.getElementById("chatHistory").innerHTML = `
    <div style="color: var(--text-muted); font-size: 13px; text-align: center; margin-top: auto; margin-bottom: auto;">
      Ask me to summarize chapters, explain concepts, or quiz you on this book!
    </div>`;
};

// ============================================================
// SECTION 1 — BORROW A BOOK
//
// KEY FEATURE: dueDate is auto-calculated from the book's
// borrowDuration field (set by Admin: 7 / 14 / 28 days).
// Student does NOT choose the duration — Admin does.
// ============================================================

export async function borrowBook(book) {
  // book = { id, title, author, genre, borrowDuration, status }

  if (!currentUser) return { success: false, error: "Not logged in." };

  // Double-check availability before writing
  if (book.status !== "Available") {
    return { success: false, error: "This book is no longer available." };
  }

  // Check if student already has 3 active borrows (optional limit)
  const activeCount = await getActiveBorrowCount(currentUser.uid);
  if (activeCount >= 3) {
    return { success: false, error: "You have reached the maximum of 3 borrowed books." };
  }

  const borrowDate  = new Date();
  const dueDate     = new Date(borrowDate);

  // ← Use the book's Admin-set borrowDuration (7 / 14 / 28 days)
  dueDate.setDate(dueDate.getDate() + book.borrowDuration);

  try {
    // WRITE 1 — Create transaction record
    await addDoc(collection(db, "transactions"), {
      bookId:       book.id,
      bookTitle:    book.title,     // denormalized — avoids extra lookup in admin panel
      bookAuthor:   book.author,
      bookGenre:    book.genre,

      studentId:    currentUser.uid,
      studentName:  currentUser.name,

      borrowDate:   Timestamp.fromDate(borrowDate),
      dueDate:      Timestamp.fromDate(dueDate),
      durationDays: book.borrowDuration,  // store what was set at time of borrow

      returned:     false,
      returnDate:   null,

      createdAt:    serverTimestamp()
    });

    // WRITE 2 — Update book status (triggers real-time update for all users)
    await updateDoc(doc(db, "books", book.id), {
      status:       "Borrowed",
      borrowedBy:   currentUser.uid,
      borrowerName: currentUser.name,
      borrowDate:   Timestamp.fromDate(borrowDate),
      dueDate:      Timestamp.fromDate(dueDate)
    });

    return {
      success:      true,
      dueDate:      dueDate,
      durationDays: book.borrowDuration
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
}


// ============================================================
// SECTION 2 — RETURN A BOOK
// ============================================================

export async function returnBook(bookId, transactionId) {
  if (!currentUser) return { success: false, error: "Not logged in." };

  const returnDate = new Date();

  try {
    // WRITE 1 — Mark transaction as returned
    await updateDoc(doc(db, "transactions", transactionId), {
      returned:   true,
      returnDate: Timestamp.fromDate(returnDate)
    });

    // WRITE 2 — Free up the book for everyone else
    await updateDoc(doc(db, "books", bookId), {
      status:       "Available",
      borrowedBy:   null,
      borrowerName: null,
      borrowDate:   null,
      dueDate:      null
    });

    return { success: true, returnDate };

  } catch (error) {
    return { success: false, error: error.message };
  }
}


// ============================================================
// SECTION 3 — REAL-TIME AVAILABLE BOOK CATALOG
// Filters out books currently borrowed by anyone.
// Includes borrowDuration display so student knows the period.
// ============================================================

export function streamAvailableBooks(renderCallback) {
  const q = query(
    collection(db, "books"),
    where("status", "==", "Available"),
    orderBy("title", "asc")
  );

  return onSnapshot(q, (snapshot) => {
    const books = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    renderCallback(books);
  });
}


// ============================================================
// SECTION 4 — STUDENT'S ACTIVE BORROWS
// Shows books currently borrowed by this student with due dates
// ============================================================

export function streamMyBorrows(renderCallback) {
  if (!currentUser) return;

  const q = query(
    collection(db, "transactions"),
    where("studentId",  "==", currentUser.uid),
    where("returned",   "==", false),
    orderBy("dueDate",  "asc")
  );

  return onSnapshot(q, (snapshot) => {
    const borrows = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        transactionId: docSnap.id,
        bookId:        data.bookId,
        bookTitle:     data.bookTitle,
        bookAuthor:    data.bookAuthor,
        borrowDate:    data.borrowDate?.toDate(),
        dueDate:       data.dueDate?.toDate(),
        durationDays:  data.durationDays,
        ...getOverdueStatus(data.dueDate?.toDate())
      };
    });
    renderCallback(borrows);
  });
}


// ============================================================
// ✨ HYBRID RECOMMENDATION ENGINE
// Combines efficient Firebase querying with local weighted scoring
// ============================================================

export async function getRecommendations() {
  if (!currentUser) return [];

  // Step 1: Fetch History & Build User Profile
  const historyQuery = query(
    collection(db, "transactions"),
    where("studentId", "==", currentUser.uid)
  );
  const historySnap = await getDocs(historyQuery);

  if (historySnap.empty) return []; 

  const genreWeights = {};
  const readBookIds = new Set(); // Track what they've already read

  historySnap.forEach(docSnap => {
    const data = docSnap.data();
    // Add weight to the genre
    if (data.bookGenre) {
      genreWeights[data.bookGenre] = (genreWeights[data.bookGenre] || 0) + 1;
    }
    // Record the book as read
    if (data.bookId) readBookIds.add(data.bookId); 
  });

  // Grab the top 3 genres to use in our database query
  const topGenres = Object.keys(genreWeights)
    .sort((a, b) => genreWeights[b] - genreWeights[a])
    .slice(0, 3);

  if (topGenres.length === 0) return [];

  // Step 2: Efficient Database Fetch (Only pull relevant genres)
  const recQuery = query(
    collection(db, "books"),
    where("genre", "in", topGenres),
    where("status", "==", "Available")
  );
  const recSnap = await getDocs(recQuery);

  // Step 3: Algorithmic Scoring & Filtering
  let scoredBooks = [];
  
  recSnap.forEach(docSnap => {
    const book = { id: docSnap.id, ...docSnap.data() };

    // 🛑 FILTER: Do not recommend a book they have already read
    if (readBookIds.has(book.id)) return;

    // 🧮 SCORE: Assign mathematical weight based on their history
    book.score = genreWeights[book.genre] || 0;
    scoredBooks.push(book);
  });

  // Step 4: Rank highest to lowest and return the Top 3
  return scoredBooks
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// ============================================================
// SECTION 6 — BORROW HISTORY (for student's past borrows view)
// ============================================================

export async function getBorrowHistory() {
  if (!currentUser) return [];

  const q = query(
    collection(db, "transactions"),
    where("studentId", "==", currentUser.uid),
    where("returned",  "==", true),
    orderBy("returnDate", "desc")
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id:           docSnap.id,
      bookTitle:    data.bookTitle,
      bookAuthor:   data.bookAuthor,
      bookGenre:    data.bookGenre,
      borrowDate:   data.borrowDate?.toDate(),
      returnDate:   data.returnDate?.toDate(),
      durationDays: data.durationDays
    };
  });
}


// ============================================================
// HELPER — Count active borrows for a student
// ============================================================

async function getActiveBorrowCount(studentId) {
  const q = query(
    collection(db, "transactions"),
    where("studentId", "==", studentId),
    where("returned",  "==", false)
  );
  const snap = await getDocs(q);
  return snap.size;
}

