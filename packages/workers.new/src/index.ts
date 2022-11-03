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
	'/pages-example-forum-app': [
		'pages-example-forum-app',
		'functions/api/code.ts',
		'Pages Example Forum app',
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
	'/stream/shaka-player': [
		'stream/playback/shaka-player',
		'src/index.js',
		'Cloudflare Stream + Shaka Player',
	],
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
	'/stream/webrtc': [
		'stream/webrtc',
		'src/index.html',
		'Stream live video (using WHIP) and playback (using WHEP) over WebRTC with Cloudflare Stream',
	],
	'/stream/webrtc-whip': [
		'stream/webrtc',
		'src/index.html',
		'Stream live video (using WHIP) over WebRTC with Cloudflare Stream',
	],
	'/stream/webrtc-whep': [
		'stream/webrtc',
		'src/index.html',
		'Play live video (using WHEP) over WebRTC with Cloudflare Stream',
	],
	'/stream/stripe-checkout': [
		'stream/auth/stripe',
		'functions/api/success.js',
		'Example of using Cloudflare Stream and Stripe Checkout to paywall content',
	],
};

const worker: ExportedHandler = {
	fetch(request) {
		const { pathname } = new URL(request.url);

		if (pathname === '/templates') {
			return new Response(getListHTML(redirects), { headers: { 'content-type': 'text/html' } });
		}

		const redirectUrl = getRedirectUrlForPathname(pathname);
		if (redirectUrl) {
			return Response.redirect(redirectUrl, 302);
		}
		return new Response('Workers.new');

		// return Response.redirect('https://dash.cloudflare.com/?to=/:account/workers/services/new', 302);
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
<head>
	<link href='https://fonts.googleapis.com/css2?family=Inter:wght@200;300;500;700&display=swap' rel='stylesheet'>
</head>
<style>
	body {
		margin: 2rem 10rem;
		font-family: "Inter", sans-serif;
	}
	h1{
		text-align: center;
		margin: 20px 0;
		font-size: 5rem;
	}

	.nav {
		display: flex;
		justify-content: space-between;
		font-size: 18px;
	}
	
	a {
		text-decoration: none;
	}

	a {
		color: inherit; 
	}

	.heading {
		font-size: 25px;
		text-align: center;
		margin: 0;
		font-weight: 700;
	}

	.subheading {
		text-align: center;
		font-size: 18px;
		font-weight: 300;
	}

	.title {
		font-weight: 400;
		margin-bottom: 50px;
	}

	ul {
		list-style: none;
		display: flex;
    flex-wrap: wrap;
    gap: 20px;
    justify-content: center;
		text-align: center;
		padding-top: 30px;
	}

	li {
		padding: 20px 20px;
		border: 1px solid #d5d7d8;
		border-radius: 10px;
	}

	.featured {
		padding: 20px 20px;
		border: 4px solid #f1740a;
		border-radius: 10px;
		background: #fef1e6;
	}

	.btn {
		margin: 0 10px;
		text-decoration: underline;
	}

	.link {
		padding: 10px;
		border: 1px dotted #f1740a;
		background: #fef1e6;
		font-color: #fff;
		border-radius: 5px;
	}

	.link:hover {
		background: #f1740a;
	}

	.card-title {
		font-weight: 600;
	}

</style>
<body>
	<nav class="nav">
		<a href="https://workers.cloudflare.com">
			<img src="https://imagedelivery.net/T24Zz2DP7HaLOEAdMToO-g/70363224-4bee-4f48-a775-06ffdfbc6d00/public" height="50" alt="Cloudflare Workers" />
		</a>
		<a href="https://developers.cloudflare.com/workers">Documentation</a>
	</nav>
	<p class="heading">Cloudflare Workers Templates</p>
	<p class="subheading">Ready to use templates to start building applications on Cloudflare Workers.</p>
	<ul>
		<li class="featured">
			<p class="heading">workers.new</p>
			<p class="title"> Cloudflare Dashboard Shortcut </p>

			<span class="btn"><a href="https://workers.new/">Open with Stackblitz</a></span>
			<span class="btn"><a href="/">Deploy with Workers</a></span>
		</li>
		<li class="featured">
			<p class="heading">Stream + Stripe </p>
			<p class="title"> Cloudflare Dashboard Shortcut </p>

			<span class="btn"><a href="https://workers.new/">Open with Stackblitz</a></span>
			<span class="btn"><a href="/">Deploy with Workers</a></span>
		</li>
		<li class="featured">
			<p class="heading">Paste.video</p>
			<p class="title"> Made with Stream, Workers, D1 & R2 </p>

			<span class="btn"><a href="https://workers.new/">Open with Stackblitz</a></span>
			<span class="btn"><a href="/">Deploy with Workers</a></span>
		</li>
		
		${Object.keys(redirects)
			.map(pathname => {
				const [subdir, file, title, terminal] = redirects[pathname] || [];
				return `<li>
				<p class="card-title">${subdir}</p>
				<p class="title"> ${title} </p>
				<span class="link"><a href="https://workers.new${pathname}">Open with Stackblitz</a></span>
				<span class="link"><a href="/">Deploy with Workers</a></span>
				</li>`;
			})
			.join('\n')}
	</ul>
</body>
</html>
`;
}

export default worker;
