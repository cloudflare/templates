/**
 * Selects appropriate data source based on database availability
 * @param {object} c - Hono context
 * @param {function} dbLogic - Function to execute when DB is available
 * @param {function} mockLogic - Function to execute when using mock data
 * @returns {Response} API response
 */
export async function selectDataSource(c, dbLogic, mockLogic) {
  try {
    // Use mock data if database is not available
    if (!c.env.DB_AVAILABLE) {
      return await mockLogic(c);
    }

    // Use database if available
    return await dbLogic(c);
  } catch (e) {
    console.error("API Error:", e);
    return Response.json(
      { error: e instanceof Error ? e.message : e },
      { status: 500 },
    );
  }
}

/**
 * Contains mock data logic functions for book-related endpoints
 */
export const bookRelatedMockUtils = {
  /**
   * Generates mock related books response
   * @param {object} c - Hono context
   * @param {string} bookId - Book ID to fetch related data for
   * @returns {Response} Mock API response
   */
  getRelatedBookData: async (c, bookId) => {
    const bookIdNum = parseInt(bookId, 10);
    const book = c.env.MOCK_DATA.find((book) => book.id === bookIdNum);

    if (!book) {
      return Response.json({ error: "Book not found" }, { status: 404 });
    }

    const bookGenre = book.genre;

    // Generate mock related data
    const relatedBooks = c.env.MOCK_DATA.filter(
      (b) => b.genre === bookGenre && b.id !== bookIdNum,
    ).slice(0, 3);

    // Generate mock recent books
    const recentBooks = c.env.MOCK_DATA.filter((b) => b.id !== bookIdNum).slice(
      0,
      2,
    );

    // Generate mock genre counts
    const genres = {};
    c.env.MOCK_DATA.forEach((b) => {
      genres[b.genre] = (genres[b.genre] || 0) + 1;
    });

    const genreCounts = Object.entries(genres)
      .map(([genre, count]) => ({
        genre,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    return Response.json({
      bookId: bookId,
      bookGenre: bookGenre,
      relatedBooks,
      recentRecommendations: recentBooks,
      genreStats: genreCounts,
      source: "mock",
    });
  },
};

/**
 * Contains mock data logic functions for books endpoints
 */
export const booksMockUtils = {
  /**
   * Generates mock books list with optional filtering and sorting
   * @param {object} c - Hono context
   * @param {string} genre - Optional genre filter
   * @param {string} sort - Optional sort parameter
   * @returns {Response} Mock API response
   */
  getBooksList: async (c, genre, sort) => {
    let results = [...c.env.MOCK_DATA];

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

    return Response.json({
      books: results,
      source: "mock",
    });
  },

  /**
   * Generates mock book detail response
   * @param {object} c - Hono context
   * @param {string} bookId - Book ID to fetch
   * @returns {Response} Mock API response
   */
  getBookDetail: async (c, bookId) => {
    const bookIdNum = parseInt(bookId, 10);
    const book = c.env.MOCK_DATA.find((book) => book.id === bookIdNum);

    if (!book) {
      return Response.json({ error: "Book not found" }, { status: 404 });
    }

    return Response.json({
      book,
      source: "mock",
    });
  },
};
