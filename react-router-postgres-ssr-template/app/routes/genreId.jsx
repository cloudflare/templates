import { useParams, useLoaderData } from "react-router";
import BooksList from "../components/BooksList";
import Breadcrumbs from "../components/Breadcrumbs";

export async function loader({ params, request, context }) {
	const { genreId } = params;
	const activeGenre = genreId ? decodeURIComponent(genreId) : null;

	const url = new URL(request.url);
	const searchParams = new URLSearchParams(url.search);
	const sort = searchParams.get("sort");

	try {
		const booksService = context?.cloudflare?.env?.BOOKS_SERVICE;

		if (!booksService) {
			console.warn(
				"[Genre Loader] BOOKS_SERVICE binding not available, returning empty array",
			);
			return { books: [], source: "fallback" };
		}

		// Call the service binding method with genre filter and sort
		const data = await booksService.getBooks({ genre: activeGenre, sort });

		return {
			books: data.books || [],
			source: data.source,
		};
	} catch (error) {
		console.error("[Genre Loader] Error in genre loader:", {
			error: error.message,
			stack: error.stack,
			activeGenre,
			sort,
			requestUrl: request.url,
			timestamp: new Date().toISOString(),
		});
		return { books: [], source: "error" };
	}
}

export default function GenrePage() {
	const { genreId } = useParams();
	const data = useLoaderData();
	const activeGenre = genreId ? decodeURIComponent(genreId) : null;

	const breadcrumbItems = [
		{ label: "All Books", value: null },
		{ label: activeGenre, value: activeGenre },
	];

	return (
		<>
			<Breadcrumbs items={breadcrumbItems} onNavigate={(value) => {}} />

			<div className="page-header">
				<h1>{activeGenre} Books</h1>
				<p className="text-gray-900">
					Explore our collection of {activeGenre.toLowerCase()} books
				</p>
			</div>

			<BooksList books={data.books} />
		</>
	);
}
