import BooksList from "../components/BooksList";
import Breadcrumbs from "../components/Breadcrumbs";
import { useLoaderData } from "react-router";

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
        console.warn(`Books API returned status: ${response.status}`);
      }
    } catch (fetchError) {
      console.warn("Books API fetch failed:", fetchError);
    }

    // Ensure we have a books array even if the API fails
    return {
      books: data.books || [],
      source: data.source, // Let the source come directly from the API
    };
  } catch (error) {
    console.error("Unexpected error in books loader:", error);
    return { books: [] };
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

      <BooksList initialBooks={data.books} filter={null} />
    </>
  );
}
