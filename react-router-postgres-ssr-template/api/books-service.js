import postgres from "postgres";
import { WorkerEntrypoint } from "cloudflare:workers";
import { mockBooks } from "./lib/mockData.js";

export class BooksService extends WorkerEntrypoint {
	constructor(ctx, env) {
		super(ctx, env);
	}

	// Initialize database connection if available
	async _initializeDatabase() {
		if (this.env.HYPERDRIVE) {
			try {
				const sql = postgres(this.env.HYPERDRIVE.connectionString, {
					max: 5,
					fetch_types: false,
				});

				console.log("[BooksService] Database connection established");
				return { sql, dbAvailable: true };
			} catch (error) {
				console.error("[BooksService] Database connection error:", error);
				return { sql: null, dbAvailable: false };
			}
		} else {
			console.log(
				"[BooksService] No Hyperdrive binding available, using mock data",
			);
			return { sql: null, dbAvailable: false };
		}
	}

	// RPC method: Get single book by ID
	async getBook(bookId) {
		console.log("[BooksService] getBook called", { bookId });

		const { sql, dbAvailable } = await this._initializeDatabase();

		try {
			if (dbAvailable && sql) {
				// Database logic
				const book = await sql`SELECT * FROM public.books WHERE id = ${bookId}`;

				if (book.length === 0) {
					console.log("[BooksService] Book not found in database", { bookId });
					return { error: "Book not found", status: 404 };
				}

				console.log("[BooksService] Book found in database", {
					bookId,
					title: book[0].title,
				});

				return {
					book: book[0],
					source: "database",
				};
			} else {
				// Mock data logic
				const bookIdNum = parseInt(bookId, 10);
				const book = mockBooks.find((book) => book.id === bookIdNum);

				if (!book) {
					console.log("[BooksService] Book not found in mock data", { bookId });
					return { error: "Book not found", status: 404 };
				}

				console.log("[BooksService] Book found in mock data", {
					bookId,
					title: book.title,
				});

				return {
					book,
					source: "mock",
				};
			}
		} catch (error) {
			console.error("[BooksService] Error in getBook:", error);
			throw error;
		} finally {
			if (sql) {
				this.ctx.waitUntil(sql.end());
			}
		}
	}

	// RPC method: Get related books data
	async getRelatedBooks(bookId) {
		console.log("[BooksService] getRelatedBooks called", { bookId });

		const { sql, dbAvailable } = await this._initializeDatabase();

		try {
			if (dbAvailable && sql) {
				// Database logic
				const book = await sql`SELECT * FROM public.books WHERE id = ${bookId}`;

				if (book.length === 0) {
					console.log("[BooksService] Book not found for related books", {
						bookId,
					});
					return { error: "Book not found", status: 404 };
				}

				const bookGenre = book[0].genre;

				const relatedBooks = await sql`
          SELECT * FROM public.books 
          WHERE genre = ${bookGenre} AND id != ${bookId}
          LIMIT 3`;

				const genreCounts = await sql`
          SELECT genre, COUNT(*) as count 
          FROM public.books 
          GROUP BY genre 
          ORDER BY count DESC`;

				const recentBooks = await sql`
          SELECT * FROM public.books 
          WHERE id != ${bookId} 
          ORDER BY created_at DESC 
          LIMIT 2`;

				console.log("[BooksService] Related books found in database", {
					bookId,
					bookGenre,
					relatedBooksCount: relatedBooks.length,
					recentBooksCount: recentBooks.length,
				});

				return {
					bookId: bookId,
					bookGenre: bookGenre,
					relatedBooks,
					recentRecommendations: recentBooks,
					genreStats: genreCounts,
					source: "database",
				};
			} else {
				// Mock data logic
				const bookIdNum = parseInt(bookId, 10);
				const book = mockBooks.find((book) => book.id === bookIdNum);

				if (!book) {
					console.log(
						"[BooksService] Book not found for related books in mock data",
						{ bookId },
					);
					return { error: "Book not found", status: 404 };
				}

				const bookGenre = book.genre;

				// Generate mock related data
				const relatedBooks = mockBooks
					.filter((b) => b.genre === bookGenre && b.id !== bookIdNum)
					.slice(0, 3);

				// Generate mock recent books
				const recentBooks = mockBooks
					.filter((b) => b.id !== bookIdNum)
					.slice(0, 2);

				// Generate mock genre counts
				const genres = {};
				mockBooks.forEach((b) => {
					genres[b.genre] = (genres[b.genre] || 0) + 1;
				});

				const genreCounts = Object.entries(genres)
					.map(([genre, count]) => ({
						genre,
						count,
					}))
					.sort((a, b) => b.count - a.count);

				console.log("[BooksService] Related books found in mock data", {
					bookId,
					bookGenre,
					relatedBooksCount: relatedBooks.length,
					recentBooksCount: recentBooks.length,
				});

				return {
					bookId: bookId,
					bookGenre: bookGenre,
					relatedBooks,
					recentRecommendations: recentBooks,
					genreStats: genreCounts,
					source: "mock",
				};
			}
		} catch (error) {
			console.error("[BooksService] Error in getRelatedBooks:", error);
			throw error;
		} finally {
			if (sql) {
				this.ctx.waitUntil(sql.end());
			}
		}
	}

	// RPC method: Get books list with optional filtering and sorting
	async getBooks(options = {}) {
		const { genre, sort } = options;
		console.log("[BooksService] getBooks called", { genre, sort });

		const { sql, dbAvailable } = await this._initializeDatabase();

		try {
			if (dbAvailable && sql) {
				// Database logic
				let query = sql`SELECT * FROM public.books`;

				// Apply genre filter if provided
				if (genre) {
					query = sql`SELECT * FROM public.books WHERE genre = ${genre}`;
				}

				// Apply sorting if provided
				if (sort) {
					switch (sort) {
						case "title_asc":
							query = genre
								? sql`SELECT * FROM public.books WHERE genre = ${genre} ORDER BY title ASC`
								: sql`SELECT * FROM public.books ORDER BY title ASC`;
							break;
						case "title_desc":
							query = genre
								? sql`SELECT * FROM public.books WHERE genre = ${genre} ORDER BY title DESC`
								: sql`SELECT * FROM public.books ORDER BY title DESC`;
							break;
						case "author_asc":
							query = genre
								? sql`SELECT * FROM public.books WHERE genre = ${genre} ORDER BY author ASC`
								: sql`SELECT * FROM public.books ORDER BY author ASC`;
							break;
						case "author_desc":
							query = genre
								? sql`SELECT * FROM public.books WHERE genre = ${genre} ORDER BY author DESC`
								: sql`SELECT * FROM public.books ORDER BY author DESC`;
							break;
						default:
							// Default sort, no change to query needed
							break;
					}
				}

				// Execute query
				const results = await query;

				console.log("[BooksService] Books found in database", {
					booksCount: results.length,
					genre,
					sort,
				});

				return {
					books: results,
					source: "database",
				};
			} else {
				// Mock data logic
				let results = [...mockBooks];

				// Apply genre filter if provided
				if (genre) {
					results = results.filter((book) => book.genre === genre);
				}

				// Apply sorting if provided
				if (sort) {
					switch (sort) {
						case "title_asc":
							results.sort((a, b) => a.title.localeCompare(b.title));
							break;
						case "title_desc":
							results.sort((a, b) => b.title.localeCompare(a.title));
							break;
						case "author_asc":
							results.sort((a, b) => a.author.localeCompare(b.author));
							break;
						case "author_desc":
							results.sort((a, b) => b.author.localeCompare(a.author));
							break;
						default:
							// Default sort, no change needed
							break;
					}
				}

				console.log("[BooksService] Books found in mock data", {
					booksCount: results.length,
					genre,
					sort,
				});

				return {
					books: results,
					source: "mock",
				};
			}
		} catch (error) {
			console.error("[BooksService] Error in getBooks:", error);
			throw error;
		} finally {
			if (sql) {
				this.ctx.waitUntil(sql.end());
			}
		}
	}
}

export default BooksService;
