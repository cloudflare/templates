function MockDataBanner() {
  return (
    <div className="mock-data-banner">
      <div className="banner-content">
        <h2>Demo Mode: Using Mock Data</h2>
        <p>
          You're viewing this app with mock data. To connect to a real database:
        </p>
        <ol>
          <li>
            <a
              href="https://developers.cloudflare.com/hyperdrive/configuration/connect-to-postgres/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Set up a PostgreSQL database
            </a>
          </li>
          <li>Create a Hyperdrive binding in your wrangler.jsonc file.</li>
          <li>
            See the{" "}
            <a
              href="https://github.com/cloudflare/templates/tree/main/react-postgres-fullstack-template"
              target="_blank"
              rel="noopener noreferrer"
            >
              project README.md
            </a>{" "}
            for complete instructions.
          </li>
        </ol>
      </div>
    </div>
  );
}

export default MockDataBanner;
