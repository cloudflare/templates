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
	'/example-request-scheduler': [
		'worker-example-request-scheduler',
		'src/index.ts',
		'Workers Request Scheduler',
	],
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
	'/stream/stream-player': [
		'stream/playback/stream-player',
		'src/index.html',
		'Cloudflare Stream Player',
	],
	'/stream/video-js': [
		'stream/playback/video-js',
		'src/index.html',
		'Cloudflare Stream + Video.js',
	],
	'/stream/vidstack': [
		'stream/playback/vidstack',
		'src/index.html',
		'Cloudflare Stream + Vidstack',
	],
	'/stream/hls-js': ['stream/playback/hls-js', 'src/index.html', 'Cloudflare Stream + hls.js'],
	'/stream/dash-js': ['stream/playback/dash-js', 'src/index.html', 'Cloudflare Stream + dash.js'],
	'/stream/direct-creator-uploads': [
		'stream/upload/direct-creator-uploads',
		'src/index.html',
		'Direct Creator Uploads to Cloudflare Stream',
	],
	'/stream/direct-creator-uploads-tus': [
		'stream/upload/direct-creator-uploads-tus',
		'src/index.html',
		'Direct Creator Uploads to Cloudflare Stream, using TUS',
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
		border: 20px solid #003682;
		margin: 0px;
	}

	h1{
		text-align: center;
		margin: 20px 0;
		font-size: 5rem;
	}

	.title-accent {
		color: #003682;
		font-weight: 600;
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
  border: 2px solid #003682;
  box-sizing: border-box;
  color: #00132C;
  font-size: 24px;
  font-weight: 900;
  padding: 50px 30px;
  position: relative;
}

li:before {
  background-color: #D5EDF6;
  content: "";
  height: calc(100% + 3px);
  position: absolute;
  right: -7px;
  top: -9px;
  transition: background-color 300ms ease-in;
  width: 100%;
  z-index: -1;
}

li:hover:before {
  background-color: #C2E3FB;
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
