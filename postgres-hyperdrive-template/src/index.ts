import postgres from "postgres";

export interface Env {
  HYPERDRIVE: Hyperdrive;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const sql = postgres(env.HYPERDRIVE.connectionString);

		try{
			const result = await sql`SELECT * FROM pg_tables LIMIT 10`;

			ctx.waitUntil(sql.end());

			return Response.json({
				result: result
			})
		} catch(e) {
			console.log(e);
      return Response.json({ error: (e as any).message }, { status: 500 });
		}
	},
} satisfies ExportedHandler<Env>;
