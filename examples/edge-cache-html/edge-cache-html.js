// IMPORTANT: A Key/Value Namespace must be bound to this worker script
// using the variable name EDGE_CACHE.

/**
 * Main worker entry point. 
 */
addEventListener("fetch", event => {
  const request = event.request;
  let upstreamCache = request.headers.get('x-HTML-Edge-Cache');

  // Only process requests if KV store is set up and there is no
  // HTML edge cache in front of this worker (only the outermost cache
  // should handle HTML caching in case there are varying levels of support).
  if (typeof EDGE_CACHE !== 'undefined' && upstreamCache === null) {
    event.passThroughOnException();
    event.respondWith(processRequest(request, event));
  }
});

/**
 * Process every request coming through to add the edge-cache header,
 * watch for purge responses and possibly cache HTML GET requests.
 * 
 * @param {Request} originalRequest - Original request
 * @param {Event} event - Original event (for additional async waiting)
 */
async function processRequest(originalRequest, event) {
  let {response, cacheVer, status} = await getCachedResponse(originalRequest);

  if (response === null) {
    // Clone the request, add the edge-cache header and send it through.
    let request = new Request(originalRequest);
    request.headers.set('x-HTML-Edge-Cache', 'supports=cache,purgeall,bypass-cookies');
    response = await fetch(request);

    if (response) {
      const options = getResponseOptions(response);
      if (options.purge) {
        await purgeCache(cacheVer, event);
        status += ', Purged';
      }
      if (options.cache) {
        const cached = await cacheResponse(cacheVer, originalRequest, response, event);
        if (cached) {
          status += ', Cached';
        }
      }
    }
  }

  const accept = originalRequest.headers.get('Accept');
  if (response && status !== null && originalRequest.method === 'GET' && response.status === 200 && accept && accept.indexOf('text/html') >= 0) {
    response = new Response(response.body, response);
    response.headers.set('x-HTML-Edge-Cache-Status', status);
    if (cacheVer !== null) {
      response.headers.set('x-HTML-Edge-Cache-Version', cacheVer.toString());
    }
  }

  return response;
}

const CACHE_HEADERS = ['Cache-Control', 'Expires', 'Pragma'];

/**
 * Check for cached HTML GET requests.
 * 
 * @param {Request} request - Original request
 */
async function getCachedResponse(request) {
  let response = null;
  let cacheVer = null;
  let status = 'Bypass';

  // Only check for HTML GET requests (saves on reading from KV unnecessarily)
  // and not when there are cache-control headers on the request (refresh)
  const accept = request.headers.get('Accept');
  const cacheControl = request.headers.get('Cache-Control');
  if (cacheControl === null && request.method === 'GET' && accept && accept.indexOf('text/html') >= 0) {
    // Build the versioned URL for checking the cache
    cacheVer = await GetCurrentCacheVersion(cacheVer);
    const cacheKeyRequest = GenerateCacheRequest(request, cacheVer);

    // See if there is a request match in the cache
    try {
      let cache = caches.default;
      let cachedResponse = await cache.match(cacheKeyRequest);
      if (cachedResponse) {
        let bypassCache = false;

        // Copy Response object so that we can edit headers.
        cachedResponse = new Response(cachedResponse.body, cachedResponse);

        // Check to see if the response needs to be skipped for a login cookie.
        const options = getResponseOptions(cachedResponse);
        const cookieHeader = request.headers.get('cookie');
        if (cookieHeader && cookieHeader.length && options.bypassCookies.length) {
          const cookies = cookieHeader.split(';');
          for (let cookie of cookies) {
            // See if the cookie starts with any of the logged-in user prefixes
            for (let prefix of options.bypassCookies) {
              if (cookie.trim().startsWith(prefix)) {
                bypassCache = true;
                break;
              }
            }
            if (bypassCache) {
              break;
            }
          }
        }
      
        // Copy the original cache headers back and clean up any control headers
        if (bypassCache) {
          status = 'Bypass Cookie';
        } else {
          status = 'Hit';
          response = cachedResponse;
          response.headers.delete('x-HTML-Edge-Cache');
          response.headers.delete('Cache-Control');
          for (header of CACHE_HEADERS) {
            let value = response.headers.get('x-HTML-Edge-Cache-' + header);
            if (value) {
              response.headers.delete('x-HTML-Edge-Cache-' + header);
              response.headers.set(header, value);
            }
          }
        }
      } else {
        status = 'Miss';
      }
    } catch (err) {
      // Ignore the exception
    }
  }

  return {response, cacheVer, status};
}

/**
 * Asynchronously purge the HTML cache (bump the cache version).
 * @param {Int} cacheVer - Current cache version (if retrieved)
 * @param {Event} event - Original event
 */
async function purgeCache(cacheVer, event) {
  cacheVer = await GetCurrentCacheVersion(cacheVer);
  cacheVer++;
  event.waitUntil(EDGE_CACHE.put('html_cache_version', cacheVer.toString()));
}

/**
 * Cache the returned content (but only if it was a successful GET request)
 * 
 * @param {Int} cacheVer - Current cache version (if already retrieved)
 * @param {Request} request - Original Request
 * @param {Response} response - Response to (maybe) cache
 * @param {Event} event - Original event
 * @returns {bool} true if the response was cached
 */
async function cacheResponse(cacheVer, request, response, event) {
  let cached = false;
  const accept = request.headers.get('Accept');
  if (request.method === 'GET' && response.status === 200 && accept && accept.indexOf('text/html') >= 0) {
    cacheVer = await GetCurrentCacheVersion(cacheVer);
    const cacheKeyRequest = GenerateCacheRequest(request, cacheVer);

    try {
      // Move the cache headers out of the way so the response can actually be cached.
      let cache = caches.default;
      response = response.clone();
      for (header of CACHE_HEADERS) {
        let value = response.headers.get(header);
        if (value) {
          response.headers.delete(header);
          response.headers.set('x-HTML-Edge-Cache-' + header, value);
        }
      }
      response.headers.set('Cache-Control', 'public; max-age=315360000');
      event.waitUntil(cache.put(cacheKeyRequest, response));
      cached = true;
    } catch (err) {
      // Ignore the exception
    }
  }
  return cached;
}

/******************************************************************************
 * Utility Functions
 *****************************************************************************/

/**
 * Parse the commands from the x-HTML-Edge-Cache response header.
 * @param {Response} response - HTTP response from the origin.
 * @returns {*} Parsed commands
 */
function getResponseOptions(response) {
  let options = {
    purge: false,
    cache: false,
    bypassCookies: []
  };

  let header = response.headers.get('x-HTML-Edge-Cache');
  if (header) {
    let commands = header.split(';');
    for (let command of commands) {
      if (command.trim() === 'purgeall') {
        options.purge = true;
      } else if (command.trim() === 'cache') {
        options.cache = true;
      } else if (command.trim().startsWith('bypass-cookies')) {
        let separator = command.indexOf('=');
        if (separator >= 0) {
          let cookies = command.substr(separator + 1).split(',');
          for (let cookie of cookies) {
            cookie = cookie.trim();
            if (cookie.length) {
              options.bypassCookies.push(cookie);
            }
          }
        }
      }
    }
  }

  return options;
}

/**
 * Retrieve the current cache version from KV
 * @param {Int} cacheVer - Current cache version value if set.
 * @returns {Int} The current cache version.
 */
async function GetCurrentCacheVersion(cacheVer) {
  if (cacheVer === null) {
    cacheVer = await EDGE_CACHE.get('html_cache_version');
    if (cacheVer === null) {
      cacheVer = 0;
    } else {
      cacheVer = parseInt(cacheVer);
    }
  }
  return cacheVer;
}

/**
 * Generate the versioned Request object to use for cache operations.
 * @param {Request} request - Base request
 * @param {Int} cacheVer - Current Cache version (must be set)
 * @returns {Request} Versioned request object
 */
function GenerateCacheRequest(request, cacheVer) {
  let cacheUrl = request.url;
  if (cacheUrl.indexOf('?') >= 0) {
    cacheUrl += '&';
  } else {
    cacheUrl += '?';
  }
  cacheUrl += 'cf_edge_cache_ver=' + cacheVer;
  return new Request(cacheUrl);
}
