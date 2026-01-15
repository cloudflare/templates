import { index, layout, route } from "@react-router/dev/routes";

export default [
	layout("layouts/book-layout.jsx", [
		index("routes/books.jsx"),
		route("book/:bookId", "routes/bookId.jsx"),
		route("genre/:genreId", "routes/genreId.jsx"),
	]),
];
