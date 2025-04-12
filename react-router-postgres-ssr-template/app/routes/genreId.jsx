import { useParams, useLoaderData } from "react-router";
import BooksList from "../components/BooksList";
import Breadcrumbs from "../components/Breadcrumbs";

export async function loader({ params, request }) {
  const { genreId } = params;
  const activeGenre = genreId ? decodeURIComponent(genreId) : null;
  const url = new URL(request.url);

  try {
    const params = new URLSearchParams();
    if (activeGenre) params.append("genre", activeGenre);

    const apiUrl = `${url.origin}/api/books${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`API returned status: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error("Error in genre loader:", error);
    return { books: [] };
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

      <BooksList initialBooks={data.books} filter={activeGenre} />
    </>
  );
}
