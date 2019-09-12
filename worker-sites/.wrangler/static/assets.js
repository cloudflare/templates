import mime from 'mime/lite';

/**
 * Fetch and log a request
 * @param {Request} request
 */
async function handleStaticRequests(event) {
  try {
    const cache = caches.default;
    const req = event.request;
    const path = new URL(req.url).pathname;

    if (
      req.method === "GET"
      && typeof __STATIC_CONTENT !== "undefined"
      // && path in assetManifest
    ) {
      let res = await cache.match(req);

      if (res) {
        return event.respondWith(res);
      }

      const contentType = mime.getType(path);
      const body = await __STATIC_CONTENT.get(
        assetManifest[path],
        "arrayBuffer"
      );

      res = new Response(body, { status: 200 });
      res.headers.set("Content-Type", contentType);

      if (cachePaths.some(cachePath => minimatch(path, cachePath))) {
        res.headers.set("Cache-Control", "max-age=31536000, immutable");
        event.waitUntil(cache.put(req, res));
      }

      event.respondWith(res);
    }
  // first iteration: swallow the error and fall back to Not Found(?)
  } catch(e) {}
}
