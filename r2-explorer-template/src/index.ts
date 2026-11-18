import { R2Explorer } from "r2-explorer";

type Explorer = ReturnType<typeof R2Explorer>;
type Env = Parameters<Explorer["fetch"]>[1] & {
	// Password for the dashboard and API. Sign in with the username "admin".
	ADMIN_PASSWORD?: string;
};

let cached: { password: string; explorer: Explorer } | undefined;

function getExplorer(password: string) {
	if (cached?.password !== password) {
		cached = {
			password,
			explorer: R2Explorer({
				// Set to false to allow users to upload files
				readonly: true,

				basicAuth: { username: "admin", password },

				// To use Cloudflare Access instead of a password, see:
				// https://r2explorer.com/getting-started/security/
				// cfAccessTeamName: "my-team-name",
			}),
		};
	}
	return cached.explorer;
}

// Receiving email doesn't go through the dashboard or API, so it needs no password.
const emailHandler = R2Explorer({ readonly: true });

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		if (!env.ADMIN_PASSWORD) {
			return new Response(
				"R2 Explorer is disabled. Set the ADMIN_PASSWORD secret to enable it.",
				{ status: 403 },
			);
		}
		return getExplorer(env.ADMIN_PASSWORD).fetch(request, env, ctx);
	},
	email: emailHandler.email,
};
