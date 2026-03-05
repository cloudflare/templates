import { useNavigate, useSearchParams } from "react-router";
import BookCard from "./BookCard";

function BooksList({ books = [], onSelectBook }) {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const currentSort = searchParams.get("sort") || "";

	const handleBookSelect = (bookId) => {
		onSelectBook ? onSelectBook(bookId) : navigate(`/book/${bookId}`);
	};

	const handleSortChange = (e) => {
		const newSort = e.target.value;
		const newSearchParams = new URLSearchParams(searchParams);

		if (newSort) {
			newSearchParams.set("sort", newSort);
		} else {
			newSearchParams.delete("sort");
		}

		setSearchParams(newSearchParams);
	};

	return (
		<div className="space-y-6">
			<div className="flex justify-end">
				<select
					className="py-2 px-4 border border-gray-300 rounded-md bg-white"
					value={currentSort}
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
