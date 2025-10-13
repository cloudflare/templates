# React Router 7 + PostgreSQL + Hyperdrive on Cloudflare Workers

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/react-router-postgres-ssr-template)

<!-- dash-content-start -->

This project demonstrates a full-stack application with a React Router app with Server-Side Rendering (SSR), served through Cloudflare Workers. The backend consists of API routes built with Hono, running on Cloudflare Workers, connecting to a PostgreSQL database through Hyperdrive. Smart Placement is enabled to automatically position your Worker closer to your database for reduced latency.

<!-- dash-content-end -->

## Architecture Overview

This application demonstrates a full-stack architecture using Cloudflare Workers:

- **Frontend**: React with React Router 7 for both server and client-side rendering
  - Built with Vite and deployed as assets via Workers
- **Backend**: API routes served by a Worker using Hono framework
  - API endpoints defined in `/api/routes` directory
  - Automatic fallback to mock data when database is unavailable
- **Database**: PostgreSQL database connected via Cloudflare Hyperdrive
  - Smart Placement enabled for optimal performance
  - Handles missing connection strings or connection failures

## Smart Placement Benefits

This application uses Cloudflare Workers' [Smart Placement](https://developers.cloudflare.com/workers/configuration/smart-placement/) feature to optimize performance:

- **What is Smart Placement?** Smart Placement dynamically positions your Worker in Cloudflare's network to minimize latency between your Worker and database.

- **Why it's enabled in this app:** The application makes multiple database round trips per request. Smart Placement analyzes this traffic pattern and can choose to position the Worker and Hyperdrive closer to your deployed database to reduce latency.

- **Performance implications:** This can significantly improve response times, especially for read-intensive operations requiring multiple database queries, as demonstrated in the book-related API endpoints.

- **No configuration needed:** Smart Placement works automatically when enabled in `wrangler.jsonc` with `"mode": "smart"`.

## Rendering Modes

This application uses Server-Side Rendering (SSR) with React Router 7:

1. **Server-Side Rendering (SSR)**: Initial page loads are rendered on the server, which improves performance and SEO. This is configured in `react-router.config.js` with `ssr: true`.

2. **Client-Side Navigation**: After the initial server render, React Router takes over for smooth client-side navigation between routes.

3. **API-driven data fetching**: Backend data is retrieved from API endpoints that connect to either:
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
6. Build the application with `npm run build`
7. Deploy with `npm run deploy`
8. Monitor your worker with `npm wrangler tail`

### Option 2: Without Database (Demo Mode)

1. Run `npm i`
2. Keep the Hyperdrive binding commented out in `wrangler.jsonc` (this is the default)
3. Build the application with `npm run build`
4. Deploy with `npm run deploy`
5. The app will automatically use mock data instead of a real database

## Setting Up Hyperdrive Bindings

Hyperdrive is Cloudflare's database connector that provides optimized connections between your Workers and various database providers. Here's a detailed explanation of how to set it up:

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

1. **Local connection requirements**: Hyperdrive's local development mode requires a database running on localhost with the exact configuration specified in `localConnectionString`
2. **Compatibility**: The Docker setup ensures the PostgreSQL instance is properly configured to work with the local Hyperdrive development environment
3. **Automatic configuration**: The container automatically runs the init.sql script to create tables and load sample data
4. **Connection reliability**: The Docker setup guarantees consistent connection behavior between your local Wrangler environment and the database
5. **Development/production parity**: Using Docker ensures your local development closely resembles the production environment

This approach is the recommended and supported method for local development with this application. Attempting to use a remote database for local development with Hyperdrive is not currently supported, but is being worked on.

## Resources

- [React Router Documentation](https://reactrouter.com/en/main)
- [Neon PostgreSQL with Cloudflare Workers and Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/neon/)
- [Cloudflare Vite Plugin](https://www.npmjs.com/package/@cloudflare/vite-plugin)
- [Cloudflare Hyperdrive Documentation](https://developers.cloudflare.com/hyperdrive/get-started/)
- [Hono - Fast, Lightweight, Web Framework for Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Workers Smart Placement](https://developers.cloudflare.com/workers/configuration/smart-placement/)
