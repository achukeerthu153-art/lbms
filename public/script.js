async function loadBooks() {
  const res = await fetch("/api/books");
  const data = await res.json();
  const div = document.getElementById("books");
  if (data.length === 0) {
    div.innerHTML = "<p>No books found.</p>";
  } else {
    div.innerHTML = data.map(b => `<p><b>${b.title}</b> by ${b.author}</p>`).join("");
  }
}
