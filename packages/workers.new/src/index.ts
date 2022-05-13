// Redirect https://workers.new/<known> requests to IDE.
// Redirect https://workers.new/*? requests to dashboard.
// Similar to the concept of https://docs.new.

// stackblitz repository source
const source = 'github/cloudflare/templates/tree/main';

const redirects: Record<string, [string, string]> = {
  "/router": ["worker-router", "index.js"],
  "/typescript": ["worker-typescript", "src/index.ts"],
  "/durable-objects": ["worker-durable-objects", "index.js"],
  "/websocket": ["worker-websocket", "index.js"],
};

const worker: ExportedHandler = {
  fetch(request) {
    const { pathname } = new URL(request.url)
    const [subdir, file] = redirects[pathname] || [];

    if (subdir) {
      return Response.redirect(`https://stackblitz.com/fork/${source}/${subdir}?file=${encodeURIComponent(file)}`, 302);
    }

    // See the wiki below for a description of this URL works.
    // https://wiki.cfops.it/display/ONB/How+to+use+Dashboard+Deep+Links
    return Response.redirect('https://dash.cloudflare.com/?to=/:account/workers/services/new', 301);
  }
};

export default worker;
