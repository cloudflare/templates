import { Hono } from "hono";
import { selectDataSource, booksMockUtils } from "../lib/utils.js";

// Create books router
const booksRouter = new Hono();

// Books list endpoint with filtering and sorting
booksRouter.get("/", async (c) => {
  const { genre, sort } = c.req.query();

  // Use imported mock logic
  const mockLogic = async (c) => {
    return booksMockUtils.getBooksList(c, genre, sort);
  };

  // Database logic
  const dbLogic = async (c) => {
    const sql = c.env.SQL;
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

    // Return results
    return Response.json({
      books: results,
      source: "database",
    });
  };

  return selectDataSource(c, dbLogic, mockLogic);
});

// Book details endpoint
booksRouter.get("/:id", async (c) => {
  const bookId = c.req.param("id");

  // Use imported mock logic
  const mockLogic = async (c) => {
    return booksMockUtils.getBookDetail(c, bookId);
  };

  // Database logic
  const dbLogic = async (c) => {
    const sql = c.env.SQL;

    // Get the specific book by ID
    const book = await sql`SELECT * FROM public.books WHERE id = ${bookId}`;

    if (book.length === 0) {
      return Response.json({ error: "Book not found" }, { status: 404 });
    }

    return Response.json({
      book: book[0],
      source: "database",
    });
  };

  return selectDataSource(c, dbLogic, mockLogic);
});

export default booksRouter;
