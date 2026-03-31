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

  if (!formData.title || !formData.author || !formData.genre ) {
    return { success: false, error: "Please fill in all required fields." };
  }

  try {
    await addDoc(collection(db, "books"), {
      title:          formData.title.trim(),
      author:         formData.author.trim(),
      genre:          formData.genre.trim(),
      description:    formData.description?.trim() || "",
      coverUrl:       formData.coverUrl || "",


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

// ==========================================
// 🚨 OVERDUE METRICS & EMAIL PING SYSTEM
// ==========================================

export async function calculateMetrics() {
  const transQuery = query(collection(db, "transactions"), where("returned", "==", false));
  const transSnap = await getDocs(transQuery);

  let overdue = 0;
  let dueSoon = 0;
  const today = new Date();

  transSnap.forEach(docSnap => {
    const data = docSnap.data();
    if (!data.dueDate) return;

    const dueDate = new Date(data.dueDate);
    
    // Calculate difference in days
    const diffTime = dueDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      overdue++; // It is past the due date
    } else if (diffDays <= 3) {
      dueSoon++; // It is due within the next 3 days
    }
  });

  // Update the Admin Dashboard UI
  const overdueElement = document.getElementById("overdue-count");
  const dueSoonElement = document.getElementById("due-soon-count");
  
  if (overdueElement) overdueElement.innerText = overdue;
  if (dueSoonElement) dueSoonElement.innerText = dueSoon;
}

// The Email Generator Function
// The Two-State Email Generator Function
window.pingBorrower = function(studentEmail, studentName, bookTitle, dueDate, isOverdue) {
  let subject, body;

  if (isOverdue) {
    //THE OVERDUE WARNING
    subject = encodeURIComponent("URGENT: Overdue Book - " + bookTitle);
    body = encodeURIComponent(
      `Hello ${studentName},\n\n` +
      `This is an automated reminder from the Library System. ` +
      `Our records show that your borrowed book, "${bookTitle}", was due on ${dueDate} and is now OVERDUE.\n\n` +
      `Please return it to the library immediately via your Student Portal.\n\n` +
      `Thank you,\nLibrary Administration`
    );
  } else {
    //THE GENERAL NOTICE
    subject = encodeURIComponent("Library Notice Regarding: " + bookTitle);
    body = encodeURIComponent(
      `Hello ${studentName},\n\n` +
      `This is a message from the Library Administration regarding your currently borrowed book, "${bookTitle}" (Due: ${dueDate}).\n\n` +
      `[ Admin: Type your message here ]\n\n` +
      `Thank you,\nLibrary Administration`
    );
  }
  
  // The magic link that forces the Gmail web interface to open in compose mode
  const gmailLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${studentEmail}&su=${subject}&body=${body}`;
  
  // Opens in a new tab so they don't lose their place on the Admin Dashboard
  window.open(gmailLink, '_blank');
};

// ==========================================
// ✨ AI AUTO-SUMMARIZER (GEMINI API)
// ==========================================

window.generateSummary = async function() {
  const title = document.getElementById("bookTitle").value.trim();
  const author = document.getElementById("bookAuthor").value.trim();
  const genre = document.getElementById("bookGenre").value;

  if (!title || !author) {
    alert("Please enter a Title and Author first so the AI knows what book to summarize!");
    return;
  }

  const descriptionBox = document.getElementById("bookDescription");
  descriptionBox.value = "✨ AI is thinking..."; // Loading state

  // ⚠️ PASTE YOUR GOOGLE AI STUDIO KEY HERE:
  const apiKey = "AIzaSyBbaW0BC6zmu7B04MA_whvAoZ5V7c8S05s"; 
  
  // The Prompt Engineering
  const prompt = `You are a professional librarian. Write a compelling, 2-sentence catalog summary for the book "${title}" by ${author}. The genre is ${genre}. Do not use quotes around the summary. Make it engaging.`;

  try {
    // Calling the Gemini 1.5 Flash Model (Fast & Free)
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();
    
    // Extracting the text from the AI's JSON response
    const summary = data.candidates[0].content.parts[0].text;
    
    // Typing it into the form!
    descriptionBox.value = summary.trim();

  } catch (error) {
    console.error("AI Generation Error:", error);
    descriptionBox.value = "";
    alert("Failed to connect to the AI. Check your API key or internet connection.");
  }
};
// ==========================================
// 🚀 CSV DATA INGESTION PIPELINE
// ==========================================

window.importCSV = function() {
  const fileInput = document.getElementById('csvUpload');
  const statusText = document.getElementById('csvStatus');
  
  if (!fileInput.files.length) {
    alert("Please select a CSV file first!");
    return;
  }

  statusText.style.color = "#dde1ee";
  statusText.innerText = "Parsing CSV and uploading to Firestore... please wait.";

  // Use PapaParse to read the local file
  Papa.parse(fileInput.files[0], {
    header: true, // Tells the parser that the first row contains column names
    skipEmptyLines: true,
    complete: async function(results) {
      const books = results.data;
      let addedCount = 0;
      console.log("CSV First Row Data:", books[0]);

      for (const row of books) {
        // MATCHING YOUR EXACT LOWERCASE CSV HEADERS
        const title  = row.title;
        const author = row.authors;
        const genre  = row.categories || "Other"; 
        const desc   = row.description || "";
        const coverUrl = row.thumbnail || "";

        // Only add if both title and author exist (skips blank rows at the bottom of the CSV)
        if (title && author) {
          try {
            await window.handleAddBookSilent(title, author, genre, desc);
            addedCount++;
          } catch (e) {
            console.error(`Failed to add: ${title}`, e);
          }
        }
      }
      
      statusText.style.color = "#4E9F3D";
      statusText.innerText = `Success! Ingested ${addedCount} books into the database.`;
      
      // Clear the file input
      fileInput.value = "";
    }
  });
};

// A silent version of your add book function so it doesn't trigger UI popups 100 times
window.handleAddBookSilent = async function(title, author, genre, description) {
  // Uses your exported 'addBook' function from the top of admin.js
  await addBook({
    title: title,
    author: author,
    genre: genre,
    description: description,
    coverUrl: coverUrl
  });
};


