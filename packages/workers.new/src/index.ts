// Redirect https://workers.new/<known> requests to IDE.
// Redirect https://workers.new/*? requests to dashboard.
// Similar to the concept of https://docs.new.

type Redirects = Record<string, [string, string, string, string?]>;

// stackblitz repository source
const source = 'github/cloudflare/templates/tree/main';

const redirects: Redirects = {
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
	'/pages-functions-cors': [
		'pages-functions-cors',
		'functions/api/_middleware.ts',
		'Pages Functions CORS',
		'dev',
	],
	'/pages-plugin-static-forms': [
		'pages-plugin-static-forms',
		'functions/_middleware.ts',
		'Pages Plugin static forms',
		'dev',
	],
};

const worker: ExportedHandler = {
	fetch(request) {
		const { pathname } = new URL(request.url);

		if (pathname === '/list') {
			return new Response(getListHTML(redirects), { headers: { 'content-type': 'text/html' } });
		}

		const redirectUrl = getRedirectUrlForPathname(pathname);
		if (redirectUrl) {
			return Response.redirect(redirectUrl, 302);
		}

		return Response.redirect('https://dash.cloudflare.com/?to=/:account/workers/services/new', 302);
	},
};

function getRedirectUrlForPathname(pathname: string): string | undefined {
	const [subdir, file, title, terminal] = redirects[pathname] || [];
	if (subdir) {
		const focus = encodeURIComponent(file);
		const target = `https://stackblitz.com/fork/${source}/${subdir}?file=${focus}&title=${title}&terminal=${
			terminal || 'start-stackblitz'
		}`;
		return target;
	}
}

function getListHTML(redirects: Redirects) {
	return `
<html>
<head></head>
<body>
	<h1>List of workers.new redirects</h1>
	<ul>
		<li><a href="/">workers.new</a> - Cloudflare Dashboard shortcut</li>
		${Object.keys(redirects)
			.map(pathname => {
				const [subdir, file, title, terminal] = redirects[pathname] || [];
				return `<li><a href="${pathname}">workers.new${pathname}</a> - ${title}</li>`;
			})
			.join('\n')}
	</ul>
</body>
</html>
`;
}

export default worker;
