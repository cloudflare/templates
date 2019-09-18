// handleStaticRequests should deal with getting stuff out of KV
import { getAssetFromKV } from "@cloudflare/kv-asset-handlers";

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  let url = new URL(request.url);
  if (url.pathname === "/") {
    request = new Request(`${url}/index.html`)
  }
  try {
    return await getAssetFromKV(request)
  } catch (e) {
    return new Response(`"${url.pathname}" not found`, { status: 404, statusText: "not found" })
  }
}
