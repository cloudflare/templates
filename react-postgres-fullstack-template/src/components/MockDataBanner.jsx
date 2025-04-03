function MockDataBanner() {
  return (
    <div className="mock-data-banner">
      <div className="banner-content">
        <h2>Demo Mode: Using Mock Data</h2>
        <p>
          You're viewing this app with mock data. To connect to a real database:
        </p>
        <ol>
          <li>Set up a PostgreSQL database (any provider will work)</li>
          <li>Create a Hyperdrive binding in your wrangler.jsonc file</li>
          <li>See the README.md for complete instructions</li>
        </ol>
      </div>
    </div>
  );
}

export default MockDataBanner;