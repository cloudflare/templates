import postgres from "postgres";

interface Env {
  HYPERDRIVE: Hyperdrive;
  ASSETS: Fetcher;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Handle API requests
    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest(request, env, ctx);
    }

    // Serve static assets for everything else
    return env.ASSETS.fetch(request);
  },
};

async function handleApiRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  console.log(env.HYPERDRIVE.connectionString);
  const sql = postgres(env.HYPERDRIVE.connectionString);

  try {
    // API endpoint to check if tables exist
    if (url.pathname === "/api/check-tables" && request.method === "GET") {
      const tables = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND (table_name = 'organizations' OR table_name = 'users')
      `;
      console.log("tables", tables);

      const existingTables = tables.map((t) => t.table_name);

      return Response.json({
        organizations: existingTables.includes("organizations"),
        users: existingTables.includes("users"),
      });
    }

    // API endpoint to initialize tables
    if (url.pathname === "/api/initialize" && request.method === "POST") {
      // Create organizations table
      await sql`
        CREATE TABLE IF NOT EXISTS organizations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;

      // Create trigger for updated_at
      await sql`
        CREATE OR REPLACE FUNCTION update_modified_column() 
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = now();
          RETURN NEW;
        END;
        $$ language 'plpgsql'
      `;

      await sql`
        DROP TRIGGER IF EXISTS update_organizations_modtime ON organizations
      `;

      await sql`
        CREATE TRIGGER update_organizations_modtime
        BEFORE UPDATE ON organizations
        FOR EACH ROW
        EXECUTE FUNCTION update_modified_column()
      `;

      // Create users table with foreign key
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) NOT NULL,
          organization_id INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
        )
      `;

      await sql`
        DROP TRIGGER IF EXISTS update_users_modtime ON users
      `;

      await sql`
        CREATE TRIGGER update_users_modtime
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION update_modified_column()
      `;

      return Response.json({
        success: true,
        message: "Tables initialized successfully",
      });
    }

    // API endpoint for Organizations GET operation
    if (url.pathname === "/api/organizations" && request.method === "GET") {
      const rows = await sql`SELECT * FROM organizations ORDER BY id`;
      return Response.json(rows);
    }

    // API endpoint for Organizations POST operation
    if (url.pathname === "/api/organizations" && request.method === "POST") {
      const body: any = await request.json();

      if (!body.name || typeof body.name !== "string") {
        return Response.json(
          { error: "Organization name is required" },
          { status: 400 },
        );
      }

      const result = await sql`
        INSERT INTO organizations (name) VALUES (${body.name}) RETURNING id
      `;

      return Response.json({
        success: true,
        message: "Organization created successfully",
        id: result[0].id,
      });
    }

    // API endpoint for Organizations DELETE operation
    if (
      url.pathname.startsWith("/api/organizations/") &&
      request.method === "DELETE"
    ) {
      const orgId = Number(url.pathname.split("/").pop());

      // First check if there are any users associated with this organization
      const userCheck = await sql`
        SELECT COUNT(*) as count FROM users WHERE organization_id = ${orgId}
      `;

      if (Number(userCheck[0].count) > 0) {
        return Response.json(
          {
            error: "Cannot delete organization with associated users",
          },
          { status: 400 },
        );
      }

      await sql`DELETE FROM organizations WHERE id = ${orgId}`;
      return Response.json({
        success: true,
        message: "Organization deleted successfully",
      });
    }

    // API endpoint for Users GET operation
    if (url.pathname === "/api/users" && request.method === "GET") {
      const orgFilter = url.searchParams.get("organization_id");

      let rows;
      if (orgFilter) {
        rows = await sql`
          SELECT users.*, organizations.name as organization_name 
          FROM users 
          LEFT JOIN organizations ON users.organization_id = organizations.id
          WHERE organization_id = ${Number(orgFilter)}
          ORDER BY users.id
        `;
      } else {
        rows = await sql`
          SELECT users.*, organizations.name as organization_name 
          FROM users 
          LEFT JOIN organizations ON users.organization_id = organizations.id
          ORDER BY users.id
        `;
      }

      return Response.json(rows);
    }

    // API endpoint for Users POST operation
    if (url.pathname === "/api/users" && request.method === "POST") {
      const body: any = await request.json();

      if (!body.username || typeof body.username !== "string") {
        return Response.json(
          { error: "Username is required" },
          { status: 400 },
        );
      }

      // Organization ID is optional (can be null)
      const orgId = body.organization_id ? Number(body.organization_id) : null;

      // If organization_id is provided, verify it exists
      if (orgId !== null) {
        const orgCheck = await sql`
          SELECT id FROM organizations WHERE id = ${orgId}
        `;

        if (orgCheck.length === 0) {
          return Response.json(
            { error: "Organization not found" },
            { status: 400 },
          );
        }
      }

      const result = await sql`
        INSERT INTO users (username, organization_id) 
        VALUES (${body.username}, ${orgId}) 
        RETURNING id
      `;

      return Response.json({
        success: true,
        message: "User created successfully",
        id: result[0].id,
      });
    }

    // API endpoint for Users PUT operation
    if (url.pathname.startsWith("/api/users/") && request.method === "PUT") {
      const userId = Number(url.pathname.split("/").pop());
      const body: any = await request.json();

      if (!body.username || typeof body.username !== "string") {
        return Response.json(
          { error: "Username is required" },
          { status: 400 },
        );
      }

      // Organization ID is optional (can be null)
      const orgId =
        body.organization_id !== undefined
          ? body.organization_id
            ? Number(body.organization_id)
            : null
          : undefined;

      // If organization_id is provided, verify it exists
      if (orgId !== undefined && orgId !== null) {
        const orgCheck = await sql`
          SELECT id FROM organizations WHERE id = ${orgId}
        `;

        if (orgCheck.length === 0) {
          return Response.json(
            { error: "Organization not found" },
            { status: 400 },
          );
        }
      }

      if (orgId !== undefined) {
        await sql`
          UPDATE users SET username = ${body.username}, organization_id = ${orgId}
          WHERE id = ${userId}
        `;
      } else {
        await sql`
          UPDATE users SET username = ${body.username}
          WHERE id = ${userId}
        `;
      }

      return Response.json({
        success: true,
        message: "User updated successfully",
      });
    }

    // API endpoint for Users DELETE operation
    if (url.pathname.startsWith("/api/users/") && request.method === "DELETE") {
      const userId = Number(url.pathname.split("/").pop());
      await sql`DELETE FROM users WHERE id = ${userId}`;

      return Response.json({
        success: true,
        message: "User deleted successfully",
      });
    }

    return Response.json({ error: "Not Found" }, { status: 404 });
  } catch (error) {
    console.error("Database error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  } finally {
    // Clean up the connection
    ctx.waitUntil(sql.end());
  }
}
