import { Hono } from "hono";
import { selectDataSource, bookRelatedMockUtils } from "../lib/utils.js";

// Create book related router
const bookRelatedRouter = new Hono();

// Related books endpoint
bookRelatedRouter.get("/", async (c) => {
  const bookId = c.req.param("id");

  // Use the imported mock logic
  const mockLogic = async (c) => {
    return bookRelatedMockUtils.getRelatedBookData(c, bookId);
  };

  // Database logic
  const dbLogic = async (c) => {
    const sql = c.env.SQL;

    const book = await sql`SELECT * FROM public.books WHERE id = ${bookId}`;

    if (book.length === 0) {
      return Response.json({ error: "Book not found" }, { status: 404 });
    }

    let relatedBooks = [];
    let recentBooks = [];
    let genreCounts = [];

    const bookGenre = book[0].genre;

    relatedBooks = await sql`
      SELECT * FROM public.books 
      WHERE genre = ${bookGenre} AND id != ${bookId}
      LIMIT 3`;

    genreCounts = await sql`
      SELECT genre, COUNT(*) as count 
      FROM public.books 
      GROUP BY genre 
      ORDER BY count DESC`;

    recentBooks = await sql`
      SELECT * FROM public.books 
      WHERE id != ${bookId} 
      ORDER BY created_at DESC 
      LIMIT 2`;

    return Response.json({
      bookId: bookId,
      bookGenre: bookGenre,
      relatedBooks,
      recentRecommendations: recentBooks,
      genreStats: genreCounts,
      source: "database",
    });
  };

  return selectDataSource(c, dbLogic, mockLogic);
});

export default bookRelatedRouter;
