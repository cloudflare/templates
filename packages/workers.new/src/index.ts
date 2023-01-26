// Redirect https://workers.new/<known> requests to IDE.
// Redirect https://workers.new/*? requests to dashboard.
// Similar to the concept of https://docs.new.

type Redirects = Record<string, [string, string, string, string?]>;

// stackblitz repository source
const source = 'github/cloudflare/templates/tree/main';

// deploy with cloudflare source

const src = 'https://github.com/cloudflare/templates/tree/main';

const redirects: Redirects = {
	'/pages-image-sharing': [
		'pages-image-sharing',
		'src/index.tsx',
		'Image Sharing Website with Pages Functions',
	],
	'/stream/auth/stripe': ['stream/auth/stripe', 'src/index.html', 'Stream + Stripe Checkout'],
	'/worker-durable-objects': [
		'worker-durable-objects',
		'index.js',
		'Workers Durable Objects counter',
	],
	'/d1': ['worker-d1', 'src/index.ts', 'Workers D1'],
	'/r2': ['worker-r2', 'src/index.ts', 'Workers + R2'],
	'/router': ['worker-router', 'index.js', 'Workers Router'],
	'/typescript': ['worker-typescript', 'src/index.ts', 'Workers TypeScript'],
	'/websocket': ['worker-websocket', 'index.js', 'Workers WebSocket'],
	'/example-wordle': ['worker-example-wordle', 'src/index.ts', 'Workers Wordle example'],
	'/example-request-scheduler': [
		'worker-example-request-scheduler',
		'src/index.ts',
		'Workers Request Scheduler',
	],
	'/websocket-durable-objects': [
		'worker-websocket-durable-objects',
		'src/index.ts',
		'Workers WebSocket Durable Objects',
	],
	'/worktop': ['worker-worktop', 'src/index.ts', 'Workers Worktop'],
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
	'/stream/signed-urls-public-content': [
		'stream/auth/signed-urls-public-content',
		'src/index.html',
		'Example of using Cloudflare Stream Signed URLs with public content',
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

	li:nth-child(-n+3) {
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
		border-radius: 5px;
	}

	.link:hover {
		background: #f1740a;
		color: #fff;
	}

	.card-title {
		font-size: 18px;
		font-weight: 600;
	}

	.url {
		color: #f1740a;
		font-weight: 700;
	}
	.github-corner:hover .octo-arm{
		animation:octocat-wave 560ms ease-in-out
	}
	@keyframes octocat-wave{
		0%,100%{
			transform:rotate(0)
		}
		20%,60%{
			transform:rotate(-25deg)
		}
		40%,80%{
			transform:rotate(10deg)
		}
	}
	@media (max-width:500px){
		.github-corner:hover .octo-arm{
			animation:none
		}
		.github-corner .octo-arm{
			animation:octocat-wave 560ms ease-in-out
		}
	}

</style>
<body>
	<nav class="nav">
		<a href="https://workers.cloudflare.com">
			<img src="https://imagedelivery.net/T24Zz2DP7HaLOEAdMToO-g/70363224-4bee-4f48-a775-06ffdfbc6d00/public" height="50" alt="Cloudflare Workers" />
		</a>
		<div>
			<a href="https://developers.cloudflare.com/workers">Documentation</a>
			<a href="https://github.com/cloudflare/templates" class="github-corner" aria-label="View source on GitHub"><svg width="80" height="80" viewBox="0 0 250 250" style="fill:#f1740a; color:#fff; position: absolute; top: 0; border: 0; right: 0;" aria-hidden="true"><path d="M0,0 L115,115 L130,115 L142,142 L250,250 L250,0 Z"></path><path d="M128.3,109.0 C113.8,99.7 119.0,89.6 119.0,89.6 C122.0,82.7 120.5,78.6 120.5,78.6 C119.2,72.0 123.4,76.3 123.4,76.3 C127.3,80.9 125.5,87.3 125.5,87.3 C122.9,97.6 130.6,101.9 134.4,103.2" fill="currentColor" style="transform-origin: 130px 106px;" class="octo-arm"></path><path d="M115.0,115.0 C114.9,115.1 118.7,116.5 119.8,115.4 L133.7,101.6 C136.9,99.2 139.9,98.4 142.2,98.6 C133.8,88.0 127.5,74.4 143.8,58.0 C148.5,53.4 154.0,51.2 159.7,51.0 C160.3,49.4 163.2,43.6 171.4,40.1 C171.4,40.1 176.1,42.5 178.8,56.2 C183.1,58.6 187.2,61.8 190.9,65.4 C194.5,69.0 197.7,73.2 200.1,77.6 C213.8,80.2 216.3,84.9 216.3,84.9 C212.7,93.1 206.9,96.0 205.4,96.6 C205.1,102.4 203.0,107.8 198.3,112.5 C181.9,128.9 168.3,122.5 157.7,114.1 C157.9,116.9 156.7,120.9 152.7,124.9 L141.0,136.5 C139.8,137.7 141.6,141.9 141.8,141.8 Z" fill="currentColor" class="octo-body"></path></svg></a>
		</div>
	</nav>
	<p class="heading">Cloudflare Workers Templates</p>
	<p class="subheading">Ready to use templates to start building applications on Cloudflare Workers.</p>
	<ul>		
		${Object.keys(redirects)
			.map(pathname => {
				const [subdir, file, title, terminal] = redirects[pathname] || [];
				return `<li>
				<p class="card-title"> ${title} </p>
				<p class="title">${subdir}</p>
				<span class="link"><a target="_blank" href="https://workers.new${pathname}">Open with StackBlitz</a></span>
				<span class="link"><a target="_blank" href="https://deploy.workers.cloudflare.com/?url=${src}/${subdir}">Deploy with Workers</a></span>
				</li>`;
			})
			.join('\n')}
	</ul>
</body>
</html>
`;
}

export default worker;
