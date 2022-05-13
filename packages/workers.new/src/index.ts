// Requests to https://workers.new get redirected
// to the dashboard to create a new Worker. Similar
// to the concept of https://docs.new.
const worker: ExportedHandler = {
  async fetch(request) {
    const url = new URL(request.url)

    let customRedirect
    switch (url.pathname) {
      case "/durable-objects": customRedirect = "https://stackblitz.com/fork/github/cloudflare/worker-examples/tree/main/worker-durable-objects?file=index.js&terminal=dev"; break;
      case "/router": customRedirect = "https://stackblitz.com/fork/github/cloudflare/worker-examples/tree/main/worker-router?terminal=dev&file=index.js"; break;
      case "/typescript": customRedirect = "https://stackblitz.com/fork/github/cloudflare/worker-examples/tree/main/worker-typescript?terminal=dev&file=src%2Findex.ts"; break;
      case "/websocket": customRedirect = "https://stackblitz.com/fork/github/cloudflare/templates/tree/main/worker-websocket?file=index.js"; break;
    }

    if (customRedirect) {
      return Response.redirect(customRedirect, 302)
    }

    // See the wiki below for a description of this URL works.
    // https://wiki.cfops.it/display/ONB/How+to+use+Dashboard+Deep+Links
    return Response.redirect('https://dash.cloudflare.com/?to=/:account/workers/services/new')
  }
};

export default worker;
