import { promisify } from 'util';
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
<style>
	body {
		margin: 0px;
		font-family:  Arial, Helvetica, sans-serif;
	}

	h1{
		text-align: center;
		margin: 20px 0;
		font-size: 4rem;
	}

	.title-accent {
		color: #F6821F;
		font-weight: 700;
		text-decoration: underline;
	}

	.subtitle {
		text-align: center;
		margin-top: 20px;
		font-size: 2rem;
	}

	ul {
		text-decoration: none;
		list-style: none;
		display: flex;
    flex-wrap: wrap;
    gap: 20px;
    justify-content: center;
    min-height: 170px;
		font-size: 24px;
		text-align: center;
		padding-top: 30px;
	}

	a {
		color: inherit; 
	}

li {
	border-radius: 5px;
  font-size: 24px;
  font-weight: 700;
	border: 1px solid #f6821f;
  padding: 30px 20px;
	box-shadow: rgba(246, 130, 31, 0.4) 5px 5px;
	margin: 10px;
}

.title {
	font-size: 20px;
	font-weight: 400;
}

</style>
<body>
	<h1>List of <span class="title-accent">workers.new</span> Redirects</h1>
	<p class="subtitle">A collection of Stackblitz templates ready for you to use!</p>
	<ul>
		<li>
			<a href="/">workers.new</a>
			<p class="title"> Cloudflare Dashboard shortcut </p>
		</li>
		${Object.keys(redirects)
			.map(pathname => {
				const [subdir, file, title, terminal] = redirects[pathname] || [];
				return `<li>
					<a href="${pathname}">workers.new${pathname}</a> 
					<p class="title">${title}</p>
				</li>`;
			})
			.join('\n')}
	</ul>
</body>
</html>
`;
}

export default worker;
