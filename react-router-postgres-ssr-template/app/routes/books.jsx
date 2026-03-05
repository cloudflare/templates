import BooksList from "../components/BooksList";
import Breadcrumbs from "../components/Breadcrumbs";
import { useLoaderData } from "react-router";

export async function loader({ request, context }) {
	try {
		const url = new URL(request.url);
		const searchParams = new URLSearchParams(url.search);
		const genre = searchParams.get("genre");
		const sort = searchParams.get("sort");

		const booksService = context?.cloudflare?.env?.BOOKS_SERVICE;

		if (!booksService) {
			console.warn(
				"[Books Loader] BOOKS_SERVICE binding not available, returning empty array",
			);
			return { books: [], source: "fallback" };
		}

		console.log("[Books Loader] Calling books service", { genre, sort });

		// Call the service binding method
		const data = await booksService.getBooks({ genre, sort });

		// Ensure we have a books array even if the service fails
		return {
			books: data.books || [],
			source: data.source,
		};
	} catch (error) {
		console.error("[Books Loader] Error in books loader:", {
			error: error.message,
			stack: error.stack,
			requestUrl: request.url,
			timestamp: new Date().toISOString(),
		});
		return { books: [], source: "error" };
	}
}

export default function BooksRoot() {
	const data = useLoaderData();
	const breadcrumbItems = [{ label: "All Books", value: null }];

	return (
		<>
			<Breadcrumbs items={breadcrumbItems} onNavigate={() => {}} />

			<div className="page-header">
				<h1>My Library</h1>
				<p className="text-gray-900">Discover your next favorite book</p>
			</div>

			<BooksList books={data.books} />
		</>
	);
}
