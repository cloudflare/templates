// Redirect https://workers.new/<known> requests to IDE.
// Redirect https://workers.new/*? requests to dashboard.
// Similar to the concept of https://docs.new.

// stackblitz repository source
const source = 'github/cloudflare/templates/tree/main';

const redirects: Record<string, [string, string]> = {
  '/durable-objects': ['worker-durable-objects', 'index.js'],
  '/router': ['worker-router', 'index.js'],
  '/typescript': ['worker-typescript', 'src/index.ts'],
  '/websocket': ['worker-websocket', 'index.js'],
  '/worktop': ['worker-worktop', 'src/index.ts'],
};

const worker: ExportedHandler = {
  fetch(request) {
    const { pathname } = new URL(request.url);
    const [subdir, file] = redirects[pathname] || [];

    if (subdir) {
      const focus = encodeURIComponent(file);
      const target = `https://stackblitz.com/fork/${source}/${subdir}?file=${focus}`;
      return Response.redirect(target, 302);
    }

    return Response.redirect('https://dash.cloudflare.com/?to=/:account/workers/services/new', 302);
  },
};

export default worker;
