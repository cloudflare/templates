import { useLoaderData } from "react-router";
import BookDetail from "../components/BookDetail";

export async function loader({ params, request }) {
  const { bookId } = params;
  const url = new URL(request.url);

  try {
    const bookResponse = await fetch(`${url.origin}/api/books/${bookId}`);

    if (!bookResponse.ok) {
      throw new Error(`API returned status: ${bookResponse.status}`);
    }

    const bookData = await bookResponse.json();
    const relatedResponse = await fetch(
      `${url.origin}/api/books/${bookId}/related`,
    );

    if (!relatedResponse.ok) {
      throw new Error(`API returned status: ${relatedResponse.status}`);
    }

    const relatedData = await relatedResponse.json();

    return {
      book: bookData.book,
      relatedBooks: relatedData.relatedBooks,
      recentRecommendations: relatedData.recentRecommendations,
      genreStats: relatedData.genreStats,
    };
  } catch (error) {
    console.error("Error in book detail loader:", error);
    throw new Response("Error loading book details", { status: 500 });
  }
}

export default function BookDetailRoute() {
  const bookDetail = useLoaderData();

  return <BookDetail bookData={bookDetail} />;
}
