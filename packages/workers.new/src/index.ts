// Redirect https://workers.new/<known> requests to IDE.
// Redirect https://workers.new/*? requests to dashboard.
// Similar to the concept of https://docs.new.

// stackblitz repository source
const source = 'github/cloudflare/templates/tree/main';

const redirects: Record<string, [string, string, string, string?]> = {
	'/durable-objects': ['worker-durable-objects', 'index.js', 'Workers Durable Objects counter'],
	'/example-wordle': ['worker-example-wordle', 'src/index.ts', 'Workers Wordle example'],
	'/router': ['worker-router', 'index.js', 'Workers router'],
	'/typescript': ['worker-typescript', 'src/index.ts', 'Workers TypeScript'],
	'/websocket': ['worker-websocket', 'index.js', 'Workers WebSocket'],
	'/websocket-durable-objects': [
		'worker-websocket-durable-objects',
		'src/index.ts',
		'Workers WebSocket Durable Objects',
	],
	'/worktop': ['worker-worktop', 'src/index.ts', 'Workers worktop'],
};

const worker: ExportedHandler = {
	fetch(request) {
		const { pathname } = new URL(request.url);
		const [subdir, file, title, terminal] = redirects[pathname] || [];

		if (subdir) {
			const focus = encodeURIComponent(file);
			const target = `https://stackblitz.com/fork/${source}/${subdir}?file=${focus}&title=${title}&terminal=${terminal || "start-stackblitz"}`;
			return Response.redirect(target, 302);
		}

		return Response.redirect('https://dash.cloudflare.com/?to=/:account/workers/services/new', 302);
	},
};

export default worker;
