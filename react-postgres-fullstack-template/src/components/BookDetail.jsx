import { useNavigate } from "react-router";
import Breadcrumbs from "./Breadcrumbs";

function BookDetail({ bookData }) {
  const navigate = useNavigate();
  const { book, relatedBooks } = bookData;

  const breadcrumbItems = [{ label: "All Books", value: null }];

  if (book.genre) {
    breadcrumbItems.push({ label: book.genre, value: book.genre });
  }

  breadcrumbItems.push({ label: book.title, value: "book" });

  const handleNavigate = (value) => {
    if (value === null) {
      navigate("/");
    } else if (value !== "book") {
      navigate(`/genre/${encodeURIComponent(value)}`);
    }
  };

  const handleRelatedBookClick = (bookId) => {
    navigate(`/book/${bookId}`);
  };

  return (
    <div>
      <Breadcrumbs items={breadcrumbItems} onNavigate={handleNavigate} />

      <div className="space-y-12 mt-6">
        <div className="card">
          <div className="md:flex gap-10">
            <div className="md:w-1/3 lg:w-1/4 flex-shrink-0 mb-8 md:mb-0">
              <img
                src={book.image_url}
                alt={book.title}
                className="w-full h-full object-contain rounded-md border border-gray-200"
              />
            </div>
            <div className="md:w-2/3 lg:w-3/4">
              <h1 className="mb-3">{book.title}</h1>
              <h2 className="text-xl text-gray-900 mb-6 font-serif font-normal">
                by {book.author}
              </h2>

              {book.genre && (
                <div className="mb-6">
                  <span
                    className="inline-block border border-blue-800 text-blue-800 text-sm px-3 py-1 rounded-full font-sans cursor-pointer"
                    onClick={() =>
                      navigate(`/genre/${encodeURIComponent(book.genre)}`)
                    }
                  >
                    {book.genre}
                  </span>
                </div>
              )}

              <p className="text-gray-900 leading-relaxed">
                {book.description}
              </p>
            </div>
          </div>
        </div>

        {/* Other books in this genre - combined section */}
        {relatedBooks.length > 0 && (
          <section className="mb-12">
            <h3 className="mb-6">
              {book.genre
                ? `Other Books in ${book.genre}`
                : "You May Also Like"}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
              {relatedBooks.map((relBook) => (
                <div
                  key={relBook.id}
                  className="card py-4 px-5 text-center cursor-pointer"
                  onClick={() => handleRelatedBookClick(relBook.id)}
                >
                  <div className="w-24 h-32 mx-auto mb-3">
                    <img
                      src={relBook.image_url}
                      alt={relBook.title}
                      className="w-full h-full object-contain rounded-sm border border-gray-200"
                    />
                  </div>
                  <div className="font-serif text-gray-900 mb-1 line-clamp-1">
                    {relBook.title}
                  </div>
                  <div className="text-gray-900 text-sm font-sans">
                    {relBook.author}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default BookDetail;
