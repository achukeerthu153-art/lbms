// server.js
// Run: npm init -y && npm install express express-session
// Then: node server.js
// Open in browser: http://localhost:5000

const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

// ---------- Helpers ----------
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const FILES = {
  users: path.join(DATA_DIR, "users.json"),
  books: path.join(DATA_DIR, "books.json"),
  issued: path.join(DATA_DIR, "issued.json"),
  requests: path.join(DATA_DIR, "requests.json"),
};

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- Seed Data ----------
if (!fs.existsSync(FILES.users)) {
  writeJSON(FILES.users, [
    { id: 1, username: "admin", password: "admin123", role: "admin" },
    { id: 2, username: "student1", password: "stud123", role: "student" },
  ]);
}
if (!fs.existsSync(FILES.books)) {
  writeJSON(FILES.books, [
    { id: 1, title: "Clean Code", author: "Robert C. Martin", available: 3 },
    { id: 2, title: "Atomic Habits", author: "James Clear", available: 2 },
    { id: 3, title: "The Pragmatic Programmer", author: "Andrew Hunt", available: 1 },
  ]);
}
if (!fs.existsSync(FILES.issued)) writeJSON(FILES.issued, []);
if (!fs.existsSync(FILES.requests)) writeJSON(FILES.requests, []);

// ---------- Middleware ----------
app.use(express.json());
app.use(
  session({
    secret: "lms-secret-xyz",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 hours
  })
);
app.use(express.static(path.join(__dirname, "public")));

// ---------- Auth Helpers ----------
function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
  next();
}
function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user || req.session.user.role !== role)
      return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

// ---------- Auth Routes ----------
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const users = readJSON(FILES.users);
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(400).json({ error: "Invalid credentials" });

  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.json({ success: true, role: user.role });
});

app.post("/signup", (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role)
    return res.status(400).json({ error: "Missing fields" });

  const users = readJSON(FILES.users);
  if (users.some(u => u.username === username))
    return res.status(400).json({ error: "Username already exists" });

  const newUser = {
    id: users.length ? Math.max(...users.map(u => u.id)) + 1 : 1,
    username,
    password,
    role,
  };
  users.push(newUser);
  writeJSON(FILES.users, users);
  res.json({ success: true });
});

app.post("/logout", (req, res) => req.session.destroy(() => res.json({ success: true })));
app.get("/whoami", (req, res) => res.json({ user: req.session.user || null }));

// ---------- Books ----------
app.get("/api/books", requireLogin, (req, res) => {
  res.json(readJSON(FILES.books));
});

app.post("/api/books", requireRole("admin"), (req, res) => {
  const { title, author, available } = req.body;
  if (!title || !author) return res.status(400).json({ error: "Missing fields" });

  const books = readJSON(FILES.books);
  const newBook = {
    id: books.length ? Math.max(...books.map(b => b.id)) + 1 : 1,
    title,
    author,
    available: available || 1,
  };
  books.push(newBook);
  writeJSON(FILES.books, books);
  res.json({ success: true });
});

app.delete("/api/books/:id", requireRole("admin"), (req, res) => {
  const id = Number(req.params.id);
  let books = readJSON(FILES.books);
  books = books.filter(b => b.id !== id);
  writeJSON(FILES.books, books);
  res.json({ success: true });
});

// ---------- Student ----------
app.get("/api/mybooks", requireRole("student"), (req, res) => {
  const issued = readJSON(FILES.issued);
  const mine = issued.filter(
    i => i.username === req.session.user.username && !i.return_date
  );
  res.json(mine);
});

app.get("/api/myrequests", requireRole("student"), (req, res) => {
  const requests = readJSON(FILES.requests);
  const mine = requests.filter(r => r.username === req.session.user.username);
  res.json(mine);
});

app.post("/api/request-borrow", requireRole("student"), (req, res) => {
  const { bookId } = req.body;
  const books = readJSON(FILES.books);
  const book = books.find(b => b.id === Number(bookId));
  if (!book) return res.status(404).json({ error: "Book not found" });
  if (book.available <= 0)
    return res.status(400).json({ error: "No copies available" });

  const requests = readJSON(FILES.requests);
  requests.push({
    id: requests.length ? Math.max(...requests.map(r => r.id)) + 1 : 1,
    type: "borrow",
    username: req.session.user.username,
    bookId: book.id,
    title: book.title,
    requested_at: new Date().toISOString(),
    status: "pending",
  });
  writeJSON(FILES.requests, requests);
  res.json({ success: true });
});

app.post("/api/request-return", requireRole("student"), (req, res) => {
  const { bookId } = req.body;
  const issued = readJSON(FILES.issued);
  const record = issued.find(
    i =>
      i.username === req.session.user.username &&
      i.bookId === Number(bookId) &&
      !i.return_date
  );
  if (!record) return res.status(400).json({ error: "Not borrowed" });

  const requests = readJSON(FILES.requests);
  requests.push({
    id: requests.length ? Math.max(...requests.map(r => r.id)) + 1 : 1,
    type: "return",
    username: req.session.user.username,
    bookId: record.bookId,
    title: record.title,
    requested_at: new Date().toISOString(),
    status: "pending",
  });
  writeJSON(FILES.requests, requests);
  res.json({ success: true });
});

// ---------- Admin ----------
app.get("/api/requests", requireRole("admin"), (req, res) => {
  res.json(readJSON(FILES.requests).filter(r => r.status === "pending"));
});

app.get("/api/issued", requireRole("admin"), (req, res) => {
  res.json(readJSON(FILES.issued));
});

app.post("/api/requests/approve", requireRole("admin"), (req, res) => {
  const { requestId } = req.body;
  const requests = readJSON(FILES.requests);
  const request = requests.find(r => r.id === Number(requestId));
  if (!request) return res.status(404).json({ error: "Request not found" });

  const books = readJSON(FILES.books);
  const issued = readJSON(FILES.issued);

  if (request.type === "borrow") {
    const book = books.find(b => b.id === request.bookId);
    if (!book || book.available <= 0)
      return res.status(400).json({ error: "Book unavailable" });
    book.available--;
    issued.push({
      id: issued.length ? Math.max(...issued.map(i => i.id)) + 1 : 1,
      username: request.username,
      bookId: book.id,
      title: book.title,
      issue_date: today(),
    });
  } else if (request.type === "return") {
    const rec = issued.find(
      i => i.bookId === request.bookId && i.username === request.username && !i.return_date
    );
    if (rec) rec.return_date = today();
    const book = books.find(b => b.id === request.bookId);
    if (book) book.available++;
  }

  request.status = "approved";
  writeJSON(FILES.books, books);
  writeJSON(FILES.issued, issued);
  writeJSON(FILES.requests, requests);
  res.json({ success: true });
});

app.post("/api/requests/reject", requireRole("admin"), (req, res) => {
  const { requestId } = req.body;
  const requests = readJSON(FILES.requests);
  const request = requests.find(r => r.id === Number(requestId));
  if (!request) return res.status(404).json({ error: "Request not found" });
  request.status = "rejected";
  writeJSON(FILES.requests, requests);
  res.json({ success: true });
});
app.use(express.static("public"));

// ---------- Server ----------
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
