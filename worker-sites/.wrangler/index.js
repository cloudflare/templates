// handleStaticRequests should deal with getting stuff out of KV
import { AssetWorker } from "@cloudflare/kv-asset-handlers";

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const subworkers = [new AssetWorker()];

  console.log(request.url)
  let url = new URL(request.url);
  if (url.pathname === "/") {
    request = new Request(`${url}/index.html`)
  }

  for (let i = 0; i < subworkers.length; i++) {
    const subworker = subworkers[i];
    if (await subworker.condition(request)) {
      return await subworker.handler(request);
    }
  }
  return new Response("not found", { status: 404, statusText: "not found" });
}
