import { Outlet, useLoaderData } from "react-router";
import { groupByGenre } from "../lib/utils";
import Sidebar from "../components/Sidebar";
import MockDataBanner from "../components/MockDataBanner";

export async function loader({ request }) {
  try {
    const url = new URL(request.url);

    // Try fetching from the API
    let data = { books: [] };
    try {
      const response = await fetch(`${url.origin}/api/books`);
      if (response.ok) {
        data = await response.json();
      } else {
        console.warn(`API returned status: ${response.status}`);
        // If the API returns an error, let the backend handle it
      }
    } catch (fetchError) {
      console.warn("API fetch failed:", fetchError);
    }

    // Ensure we have books data or empty array
    const books = data.books || [];
    let genreGroups = [];

    if (books.length > 0) {
      genreGroups = groupByGenre(books);
    } else {
      console.warn("No books data available");
    }

    return {
      genres: genreGroups,
      dataSource: data.source, // Let the source come directly from the API
    };
  } catch (error) {
    console.error("Unexpected error in book layout loader:", error);
    // We still need a fallback, but we won't set a default source
    return { genres: [] };
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
