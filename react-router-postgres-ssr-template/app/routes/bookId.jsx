import { useLoaderData } from "react-router";
import BookDetail from "../components/BookDetail";

export async function loader({ params, request, context }) {
	const { bookId } = params;

	try {
		const booksService = context?.cloudflare?.env?.BOOKS_SERVICE;

		if (!booksService) {
			throw new Error("BOOKS_SERVICE binding not available");
		}

		// Call the service binding methods directly
		const [bookData, relatedData] = await Promise.all([
			booksService.getBook(bookId),
			booksService.getRelatedBooks(bookId),
		]);

		// Check for errors in the responses
		if (bookData.error || bookData.status === 404) {
			throw new Response("Book not found", { status: 404 });
		}

		if (relatedData.error || relatedData.status === 404) {
			throw new Response("Related books not found", { status: 404 });
		}

		return {
			book: bookData.book,
			relatedBooks: relatedData.relatedBooks,
			recentRecommendations: relatedData.recentRecommendations,
			genreStats: relatedData.genreStats,
		};
	} catch (error) {
		console.error("[BookId Loader] Error in book detail loader:", {
			error: error.message,
			stack: error.stack,
			bookId,
			timestamp: new Date().toISOString(),
		});
		throw new Response("Error loading book details", { status: 500 });
	}
}

export default function BookDetailRoute() {
	const bookDetail = useLoaderData();

	return <BookDetail bookData={bookDetail} />;
}
