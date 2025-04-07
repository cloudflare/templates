# React + Vite + PostgreSQL + Hyperdrive on Cloudflare Workers

<!-- dash-content-start -->

This project demonstrates a full-stack application with a React single-page application frontend, served as [static assets through Cloudflare Workers](https://developers.cloudflare.com/workers/static-assets/). The backend
consists of API routes built with Hono, running on Cloudflare Workers, connecting to a PostgreSQL database through [Hyperdrive](https://developers.cloudflare.com/hyperdrive/). [Smart Placement](https://developers.cloudflare.com/workers/configuration/smart-placement/) is enabled to
automatically position your Worker closer to your database for reduced latency.

<!-- dash-content-end -->

## Architecture Overview & Key Files

This application demonstrates a full-stack architecture using Cloudflare Workers, with the following structure:

- **Frontend**: React SPA with React Router for client-side navigation ([using declarative routing](https://reactrouter.com/en/main/start/overview))
  - Built with Vite and deployed as static assets via Workers
  - single-page application (SPA) mode enabled in `wrangler.jsonc` for client-side navigation
  - Key files:
    - `src/App.jsx` - Main application component and routing setup
    - `src/components/` - React components for UI elements
    - `src/lib/utils.js` - Frontend utility functions
    - `index.html` - HTML entry point
    - `vite.config.js` - Vite configuration

- **Backend**: API routes served by a Worker using Hono framework
  - API endpoints defined in `/api/routes` directory
  - Automatic fallback to mock data when database is unavailable
  - Key files:
    - `api/index.js` - API entry point handling all routes
    - `api/routes/books.js` - Main book listing endpoints
    - `api/routes/book-related.js` - Related book information endpoints
    - `api/lib/mockData.js` - Fallback data when database is unavailable
    - `api/lib/utils.js` - Backend utility functions

- **Database**: PostgreSQL database connected via Cloudflare Hyperdrive
  - Smart Placement enabled for optimal performance
  - Graceful handling of missing connection strings or connection failures
  - Key files:
    - `wrangler.jsonc` - Cloudflare Workers configuration (including Hyperdrive setup)
    - `init.sql` - Database schema and sample data
    - `docker-compose.yml` - Local development environment setup

## Smart Placement Benefits

This application uses Cloudflare Workers' [Smart Placement](https://developers.cloudflare.com/workers/configuration/smart-placement/) feature to optimize performance:

- **What is Smart Placement?** Smart Placement [can dynamically position](https://developers.cloudflare.com/workers/configuration/smart-placement/#understand-how-smart-placement-works) your Worker in Cloudflare's network to minimize latency between your Worker and database.

- **Why it's enabled in this app:** The application makes multiple database round trips per request. Smart Placement analyzes this traffic pattern and can choose to position the Worker and Hyperdrive closer to your deployed database to reduce latency.

- **Performance implications:** This can significantly improve response times, especially for read-intensive operations requiring multiple database queries, as demonstrated in the book-related API endpoints.

- **No configuration needed:** Smart Placement works automatically when enabled in `wrangler.jsonc` with `"mode": "smart"`.

## Rendering Modes

This application uses two main rendering modes:

1. **Single-page application (SPA)**: The entire application is rendered client-side using React Router, with assets served by Cloudflare Workers.

2. **API-driven data fetching**: Backend data is retrieved from API endpoints that connect to either:
   - A real PostgreSQL database via Hyperdrive (production mode)
   - Mock data automatically provided when no database is available (demo mode)

## Deployment Options

This application can be deployed in two ways:

### Option 1: With Database (Full Experience)

1. Run `npm i`
2. Sign up for a PostgreSQL provider like [Neon](https://neon.tech) and create a database
3. Load the sample data using the provided SQL script:
   - The `/init.sql` file contains all database schema and sample data
   - You can either:
     - Copy and paste the contents into your database provider's SQL editor
     - Or use a command line tool like `psql`: `psql -h hostname -U username -d dbname -f init.sql`
4. Create a Hyperdrive connection by running:
   ```
   npx wrangler hyperdrive create <YOUR_CONFIG_NAME> --connection-string="<postgres://user:password@HOSTNAME_OR_IP_ADDRESS:PORT/database_name>"
   ```
5. Uncomment and update the Hyperdrive binding in `wrangler.jsonc` with the ID from step 4:
   ```json
   "hyperdrive": [
     {
       "binding": "HYPERDRIVE",
       "id": "YOUR_HYPERDRIVE_ID",
       "localConnectionString": "postgresql://myuser:mypassword@localhost:5432/mydatabase"
     }
   ]
   ```
6. Deploy with `npm run deploy`

### Option 2: Without Database (Demo Mode)

1. Run `npm i`
2. Keep the Hyperdrive binding commented out in `wrangler.jsonc` (this is the default)
3. Deploy with `npm run deploy`
4. The app will automatically use mock data instead of a real database

## Setting Up Hyperdrive Bindings

Hyperdrive is Cloudflare's database connector that provides optimized connections between your Workers and various database providers. Here's a detailed explanation of how to set it up (or you can read more in [documentation](https://developers.cloudflare.com/hyperdrive/configuration/connect-to-postgres/):

1. **Create a Hyperdrive configuration**:

   ```
   npx wrangler hyperdrive create my-hyperdrive-config --connection-string="postgres://user:password@hostname:port/dbname"
   ```

   This command will return a Hyperdrive ID that you'll need for your configuration.

2. **Configure Hyperdrive in wrangler.jsonc**:

   ```json
   "hyperdrive": [
     {
       "binding": "HYPERDRIVE",  // Name used to access the binding in your code
       "id": "YOUR_HYPERDRIVE_ID",  // ID from the create command
       "localConnectionString": "postgresql://myuser:mypassword@localhost:5432/mydatabase"  // Local dev connection
     }
   ]
   ```

3. **Access in your code**:

   ```javascript
   // Example from this project
   if (c.env.HYPERDRIVE) {
     const sql = postgres(c.env.HYPERDRIVE.connectionString);
     // Use SQL client
   }
   ```

4. **Fallback handling**: This application automatically falls back to mock data if:
   - Hyperdrive binding is not configured
   - Database connection fails for any reason

## Running Locally

To run locally, you can use the Docker container defined in the docker compose:

1. `docker-compose up -d`
   - Creates container with PostgreSQL and seeds it with the "init.sql" data
2. `npm run dev`

If you update the "init.sql" file, make sure to run `docker-compose down -v` to teardown.

### Why Docker is Required for Local Development

When developing locally with Hyperdrive, you **must** use the Docker setup provided:

- **Local connection requirements**: Hyperdrive's local development mode requires a database running on localhost with the exact configuration specified in `localConnectionString`.
- **Compatibility**: The Docker setup ensures the PostgreSQL instance is properly configured to work with the local Hyperdrive development environment.
- **Automatic configuration**: The container automatically runs the init.sql script to create tables and load sample data.

This approach is the recommended and supported method for local development with this application. Attempting to use a remote database for local development with Hyperdrive is not currently supported, but is being worked on.

## Resources

- [Neon PostgreSQL with Cloudflare Workers and Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/neon/)
- [Cloudflare Vite Plugin](https://www.npmjs.com/package/@cloudflare/vite-plugin)
- [Cloudflare Hyperdrive Documentation](https://developers.cloudflare.com/hyperdrive/get-started/)
- [Hono - Fast, Lightweight, Web Framework for Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Workers Smart Placement](https://developers.cloudflare.com/workers/configuration/smart-placement/)
