
// server.js
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to SQLite database (stored locally)
const dbPath = path.join(__dirname, "library.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Error connecting to database:", err);
  } else {
    console.log("✅ Connected to SQLite database");
  }
});

// Example route: Home
app.get("/", (req, res) => {
  res.send("<h2>📚 Library Management System Backend (Vercel Serverless)</h2>");
});

// Example route: Get all books
app.get("/api/books", (req, res) => {
  db.all("SELECT * FROM books", [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ books: rows });
    }
  });
});

// Example route: Add a new book
app.post("/api/books", (req, res) => {
  const { title, author, year } = req.body;
  if (!title || !author) {
    return res.status(400).json({ error: "Missing title or author" });
  }

  const query = "INSERT INTO books (title, author, year) VALUES (?, ?, ?)";
  db.run(query, [title, author, year], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json({ message: "✅ Book added successfully", id: this.lastID });
    }
  });
});

// Export the app (Vercel handles app.listen)
module.exports = app;
