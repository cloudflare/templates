import { Outlet, useLoaderData } from "react-router";
import { groupByGenre } from "../lib/utils";
import Sidebar from "../components/Sidebar";
import MockDataBanner from "../components/MockDataBanner";

export async function loader({ request, context }) {
	try {
		const booksService = context?.cloudflare?.env?.BOOKS_SERVICE;

		if (!booksService) {
			console.warn(
				"[Book Layout Loader] BOOKS_SERVICE binding not available, returning empty genres",
			);
			return { genres: [], dataSource: "fallback" };
		}

		// Call the service binding method to get all books
		const data = await booksService.getBooks();

		// Ensure we have books data or empty array
		const books = data.books || [];
		let genreGroups = [];

		if (books.length > 0) {
			genreGroups = groupByGenre(books);
		} else {
			console.warn("[Book Layout Loader] No books data available from service");
		}

		return {
			genres: genreGroups,
			dataSource: data.source,
		};
	} catch (error) {
		// Return empty genres on error
		return { genres: [], dataSource: "error" };
	}
}

export default function BookLayout() {
	const { genres, dataSource } = useLoaderData();

	return (
		<div className="layout">
			<Sidebar genres={genres} counts />
			<main className="main-content">
				{dataSource === "mock" && <MockDataBanner />}
				<Outlet context={{ genres }} />
			</main>
		</div>
	);
}
