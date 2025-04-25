import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import BookCard from "./BookCard";

function useBooks(filter, sortBy) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const params = new URLSearchParams();
        if (filter) params.append("genre", filter);
        if (sortBy) params.append("sort", sortBy);

        const url = `/api/books${params.toString() ? `?${params.toString()}` : ""}`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`API returned status: ${response.status}`);
        }

        const data = await response.json();

        if (!data.books?.length) {
          console.error("No books data found:", data);
          setBooks([]);
        } else {
          setBooks(data.books);
        }
      } catch (error) {
        console.error("Error loading books:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBooks();
  }, [filter, sortBy]);

  return { books, loading };
}

function BooksList({ filter, onSelectBook }) {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState("");
  const { books, loading } = useBooks(filter, sortBy);

  const handleBookSelect = (bookId) => {
    onSelectBook ? onSelectBook(bookId) : navigate(`/book/${bookId}`);
  };
  const handleSortChange = (e) => {
    setSortBy(e.target.value);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="h-10 w-10 border-2 border-blue-800 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <select
          className="py-2 px-4 border border-gray-300 rounded-md bg-white"
          value={sortBy}
          onChange={handleSortChange}
        >
          <option value="">Sort by...</option>
          <option value="title_asc">Title (A-Z)</option>
          <option value="title_desc">Title (Z-A)</option>
          <option value="author_asc">Author (A-Z)</option>
          <option value="author_desc">Author (Z-A)</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {books.map((book) => (
          <BookCard
            key={book.id}
            book={book}
            onClick={() => handleBookSelect(book.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default BooksList;
