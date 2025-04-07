export function groupByGenre(books) {
  const genresMap = {};

  // Group books by genre
  books.forEach((book) => {
    if (book.genre) {
      if (!genresMap[book.genre]) {
        genresMap[book.genre] = [];
      }
      genresMap[book.genre].push(book);
    }
  });

  // Convert to sorted array
  return Object.entries(genresMap)
    .map(([name, books]) => ({
      name,
      count: books.length,
      books,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
