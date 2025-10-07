import { createConnection } from "mysql2/promise";

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
	const connection = await createConnection({
		host: env.HYPERDRIVE.host,
		user: env.HYPERDRIVE.user,
		password: env.HYPERDRIVE.password,
		database: env.HYPERDRIVE.database,
		port: env.HYPERDRIVE.port,

		// The following line is needed for mysql2 compatibility with Workers
		// mysql2 uses eval() to optimize result parsing for rows with > 100 columns
		// Configure mysql2 to use static parsing instead of eval() parsing with disableEval
		disableEval: true,
	});

	try {
		// API endpoint to check if tables exist
		if (url.pathname === "/api/check-tables" && request.method === "GET") {
			const [tables] = await connection.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND (table_name = 'organizations' OR table_name = 'users')
      `);

			const existingTables = (tables as any[]).map(
				(t) => t.TABLE_NAME || t.table_name,
			);

			return Response.json({
				organizations: existingTables.includes("organizations"),
				users: existingTables.includes("users"),
			});
		}

		// API endpoint to initialize tables
		if (url.pathname === "/api/initialize" && request.method === "POST") {
			// Create organizations table
			await connection.query(`
        CREATE TABLE IF NOT EXISTS organizations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

			// Create users table with foreign key
			await connection.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(255) NOT NULL,
          organization_id INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
        )
      `);

			return Response.json({
				success: true,
				message: "Tables initialized successfully",
			});
		}

		// API endpoint for Organizations GET operation
		if (url.pathname === "/api/organizations" && request.method === "GET") {
			const [rows] = await connection.query(
				"SELECT * FROM organizations ORDER BY id",
			);
			return Response.json(rows);
		}

		// API endpoint for Organizations POST operation
		if (url.pathname === "/api/organizations" && request.method === "POST") {
			const body = await request.json<{ name: string }>();

			if (!body.name || typeof body.name !== "string") {
				return Response.json(
					{ error: "Organization name is required" },
					{ status: 400 },
				);
			}

			const [result] = await connection.query(
				"INSERT INTO organizations (name) VALUES (?)",
				[body.name],
			);

			return Response.json({
				success: true,
				message: "Organization created successfully",
				id: (result as any).insertId,
			});
		}

		// API endpoint for Organizations DELETE operation
		if (
			url.pathname.startsWith("/api/organizations/") &&
			request.method === "DELETE"
		) {
			const orgId = Number(url.pathname.split("/").pop());

			// First check if there are any users associated with this organization
			const [userCheck] = await connection.query(
				"SELECT COUNT(*) as count FROM users WHERE organization_id = ?",
				[orgId],
			);

			if ((userCheck as any[])[0].count > 0) {
				return Response.json(
					{
						error: "Cannot delete organization with associated users",
					},
					{ status: 400 },
				);
			}

			await connection.query("DELETE FROM organizations WHERE id = ?", [orgId]);
			return Response.json({
				success: true,
				message: "Organization deleted successfully",
			});
		}

		// API endpoint for Users GET operation
		if (url.pathname === "/api/users" && request.method === "GET") {
			let query =
				"SELECT users.*, organizations.name as organization_name FROM users LEFT JOIN organizations ON users.organization_id = organizations.id";
			const params = [];

			// Filter by organization if specified
			const orgFilter = url.searchParams.get("organization_id");
			if (orgFilter) {
				query += " WHERE organization_id = ?";
				params.push(orgFilter);
			}

			query += " ORDER BY users.id";
			const [rows] = await connection.query(query, params);

			return Response.json(rows);
		}

		// API endpoint for Users POST operation
		if (url.pathname === "/api/users" && request.method === "POST") {
			const body = await request.json<{
				username: string;
				organization_id?: string;
			}>();

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
				const [orgCheck] = await connection.query(
					"SELECT id FROM organizations WHERE id = ?",
					[orgId],
				);

				if ((orgCheck as any[]).length === 0) {
					return Response.json(
						{ error: "Organization not found" },
						{ status: 400 },
					);
				}
			}

			const [result] = await connection.query(
				"INSERT INTO users (username, organization_id) VALUES (?, ?)",
				[body.username, orgId],
			);

			return Response.json({
				success: true,
				message: "User created successfully",
				id: (result as any).insertId,
			});
		}

		// API endpoint for Users PUT operation
		if (url.pathname.startsWith("/api/users/") && request.method === "PUT") {
			const userId = Number(url.pathname.split("/").pop());
			const body = await request.json<{
				username: string;
				organization_id?: string;
			}>();

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
				const [orgCheck] = await connection.query(
					"SELECT id FROM organizations WHERE id = ?",
					[orgId],
				);

				if ((orgCheck as any[]).length === 0) {
					return Response.json(
						{ error: "Organization not found" },
						{ status: 400 },
					);
				}
			}

			let query = "UPDATE users SET username = ?";
			const params: any[] = [body.username];

			if (orgId !== undefined) {
				query += ", organization_id = ?";
				params.push(orgId);
			}

			query += " WHERE id = ?";
			params.push(userId);

			await connection.query(query, params);

			return Response.json({
				success: true,
				message: "User updated successfully",
			});
		}

		// API endpoint for Users DELETE operation
		if (url.pathname.startsWith("/api/users/") && request.method === "DELETE") {
			const userId = Number(url.pathname.split("/").pop());
			await connection.query("DELETE FROM users WHERE id = ?", [userId]);

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
		await connection.end();
	}
}
