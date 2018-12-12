/******************************************************************************
 * Configuration settings (most defaults should work for Wordpress)
 *****************************************************************************/

// IMPORTANT: A Key/Value Namespace must be bound to this worker script
// using the variable name EDGE_CACHE for caching and purging to work.

// Regex URL paths to match for POST requests to trigger a purge.
const PURGE_PATHS = [
  /^\/wp-admin\/.*\.php/
];

// Login cookie prefixes
const LOGGED_IN_COOKIES = [
  'wp-',
  'wordpress',
  'comment_',
  'woocommerce_'
];

/**
 * Main worker entry point. 
 */
addEventListener("fetch", event => {
  if (typeof EDGE_CACHE !== 'undefined') {
    // Fail-safe in case of an unhandled exception
    event.passThroughOnException();
    const request = event.request;

    // Only process (likely) HTML requests.
    const accept = request.headers.get('accept');
    if (isLoggedInUser(request)) {
      // Bypass the cache for GETs but possibly invalidate the cache for POSTs
      if (request.method === 'POST') {
        event.respondWith(purgeCache(event));
      }
    } else if (request.method === 'GET' && accept.indexOf('text/html') >= 0) {
      event.respondWith(cacheHtmlRequest(event));
    }
  }
});

/**
 * See if the request includes a cookie that starts with a prefix of a
 * logged-in user cookie.
 * 
 * @param {*} request - Original Request
 * @returns {*} - true if there is a login cookie set on the request
 */
function isLoggedInUser(request) {
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader && cookieHeader.length) {
    const cookies = cookieHeader.split(';');
    for (let cookie of cookies) {
      // See if the cookie starts with any of the logged-in user prefixes
      for (let prefix of LOGGED_IN_COOKIES) {
        if (cookie.trim().startsWith(prefix)) {
          return true;
        }
      }
    }
  }
  return false;
}

// Global timer to rate-limit cache purges
let pendingPurge = false;

/**
 * Purge the cache if it looks like content was updated
 * 
 * @param {*} event - The original event (may need to wait for an async purge)
 */
async function purgeCache(event) {
  const request = event.request;
  const response = await fetch(request);
  let needsPurge = false;

  if (response.status === 200) {
    const url = new URL(event.request.url);
    for (path of PURGE_PATHS) {
      if (path.test(url.pathname)) {
        needsPurge = true;
        break;
      }
    }
  }

  // Asynchronously queue a purge to happen in 10 seconds
  if (needsPurge && !pendingPurge) {
    event.waitUntil(delayedPurge(10));
  }

  return response;
}

/**
 * Asynchronously run a delayed purge.
 * 
 * @param {*} seconds - Time to wait before purging in seconds.
 */
async function delayedPurge(seconds) {
  pendingPurge = true;

  // increment the cache version
  let cacheVer = await EDGE_CACHE.get('html_cache_version');
  if (cacheVer === null) {
    cacheVer = 0;
  } else {
    cacheVer = parseInt(cacheVer);
  }
  cacheVer++;

  // Wait 10 seconds before setting it to prevent thrashing
  await sleep(seconds * 1000);
  pendingPurge = false;

  // Write the new cache version number
  await EDGE_CACHE.put('html_cache_version', cacheVer.toString());
}

/**
 * Promise-based sleep.
 * 
 * @param {*} ms - Time to sleep in ms.
 * @returns {Promise} - Promise to await for sleep.
 */
function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

/**
 * Serve cached HTML if available. If not then cache the response from the origin.
 * 
 * @param {*} event - The original event (may need to wait for an async purge)
 */
async function cacheHtmlRequest(event) {
  const request = event.request;
  let cacheVer = await EDGE_CACHE.get('html_cache_version');
  if (cacheVer === null) {
    cacheVer = 0;
  } else {
    cacheVer = parseInt(cacheVer);
  }

  // Build the versioned URL for checking the cache
  let cacheUrl = request.url;
  if (cacheUrl.indexOf('?') >= 0) {
    cacheUrl += '&';
  } else {
    cacheUrl += '?';
  }
  cacheUrl += 'cf_edge_cache_ver=' + cacheVer;
  const cacheKeyRequest = new Request(cacheUrl);

  // Bypass the cache if the user is forcing a page reload
  const requestCacheControl = request.headers.get('Cache-Control');
  if (requestCacheControl === null) {
    try {
      let cache = caches.default;
      let response = await cache.match(cacheKeyRequest);
      if (response) {
        // Copy Response object so that we can edit headers.
        response = new Response(response.body, response);
        response.headers.set('x-HTML-Edge-Cache', 'Hit');
        response.headers.set('x-HTML-Edge-Cache-version', cacheVer.toString());
        // Make sure the version we send to the browser isn't cacheable
        response.headers.set('Cache-Control', 'no-cache');
        return response;
      }
    } catch (err) {
      // Ignore the exception
    }
  }

  // Not in the cache, fetch from the origin and add it to the cache
  let response = await fetch(request);
  if (response) {
    // Copy Response object so that we can edit headers.
    response = new Response(response.body, response);
    try {
      let cache = caches.default;
      let cacheResponse = response.clone();
      // Modify the cache-control header so it can be cached
      cacheResponse.headers.set('Cache-Control', 'public; max-age=315360000');
      cacheResponse.headers.delete('Expires');
      cacheResponse.headers.delete('Pragma');
      event.waitUntil(cache.put(cacheKeyRequest, cacheResponse));
    } catch (err) {
      // Send the exception back in response headers for debugging
      response.headers.set('x-Exception-Cache-Put', err.message);
    }
    if (requestCacheControl === null) {
      response.headers.set('x-HTML-Edge-Cache', 'Miss');
    } else {
      response.headers.set('x-HTML-Edge-Cache', 'Bypass');
    }
    response.headers.set('x-HTML-Edge-Cache-version', cacheVer.toString());
  }
  return response;
}
