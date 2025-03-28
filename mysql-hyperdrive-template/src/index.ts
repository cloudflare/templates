import { createConnection } from 'mysql2/promise';

export interface Env {
  HYPERDRIVE: Hyperdrive;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		try{
			const connection = await createConnection({
				host: env.HYPERDRIVE.host,
				user: env.HYPERDRIVE.user,
				password: env.HYPERDRIVE.password,
				database: env.HYPERDRIVE.database,
				disableEval: true // Important: This is needed for mysql2 to work on Workers
			});

			const [results, fields] = await connection.query(
				'SHOW TABLES;'
			);

			return new Response(JSON.stringify({ results, fields }), {
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			});
		} catch(e) {
			console.log(e);
      return Response.json({ error: (e as any).message }, { status: 500 });
		}
	},
} satisfies ExportedHandler<Env>;
