/**
 * Definitions for content to self-host.
 */

const SCRIPT_URLS = [
  // Hosted libraries (usually CDN's for open source).
  '/ajax.aspnetcdn.com/',
  '/ajax.cloudflare.com/',
  '/ajax.googleapis.com/ajax/',
  '/cdn.jsdelivr.net/',
  '/cdnjs.com/',
  '/cdnjs.cloudflare.com/',
  '/code.jquery.com/',
  '/maxcdn.bootstrapcdn.com/',
  '/netdna.bootstrapcdn.com/',
  '/oss.maxcdn.com/',
  '/stackpath.bootstrapcdn.com/',

  // Popular scripts (can be site-specific)
  '/a.optmnstr.com/app/js/',
  '/cdn.onesignal.com/sdks/',
  '/cdn.optimizely.com/',
  '/cdn.shopify.com/s/',
  '/css3-mediaqueries-js.googlecode.com/svn/',
  '/html5shim.googlecode.com/svn/',
  '/html5shiv.googlecode.com/svn/',
  '/maps.google.com/maps/api/js',
  '/maps.googleapis.com/maps/api/js',
  '/pagead2.googlesyndication.com/pagead/js/',
  '/platform.twitter.com/widgets.js',
  '/platform-api.sharethis.com/js/',
  '/s7.addthis.com/js/',
  '/stats.wp.com/',
  '/ws.sharethis.com/button/',
  '/www.google.com/recaptcha/api.js',
  '/www.google-analytics.com/analytics.js',
  '/www.googletagmanager.com/gtag/js',
  '/www.googletagmanager.com/gtm.js',
  '/www.googletagservices.com/tag/js/gpt.js',
];

// Regex patterns for matching script and link tags
const SCRIPT_PRE = '<\\s*script[^>]+src\\s*=\\s*[\'"]\\s*((https?:)?/';
const PATTERN_POST = '[^\'" ]+)\\s*["\'][^>]*>';

/**
 * Main worker entry point. Looks for font requests that are being proxied and
 * requests for HTML content. All major browsers explicitly send an accept: text/html
 * for navigational requests and the fallback is to just pass the request through
 * unmodified (safe).
 */
addEventListener("fetch", event => {
  // Fail-safe in case of an unhandled exception
  event.passThroughOnException();

  const url = new URL(event.request.url);
  const bypass = new URL(event.request.url).searchParams.get('cf-worker') == 'bypass';
  if (!bypass) {
    let accept = event.request.headers.get('accept');
    if (isProxyRequest(url)) {
      event.respondWith(proxyUrl(url, event.request));
    } else if (accept && accept.indexOf("text/html") >= 0) {
      event.respondWith(processHtmlRequest(event.request));
    }
  }
})

/**
 * See if the requested resource is a proxy request to an overwritten origin
 * (something that starts with a prefix in one of our lists).
 * 
 * @param {*} url 
 * @param {*} request 
 */
function isProxyRequest(url) {
  let found_prefix = false;
  const path = url.pathname + url.search;
  for (let prefix of SCRIPT_URLS) {
    if (path.startsWith(prefix) && path.indexOf('cf_hash=') >= 0) {
      found_prefix = true;
      break;
    }
  }
  return found_prefix;
}

/**
 * Fetch a proxied URL and make it cacheable since it is hashed.
 * @param {URL} url - Unmodified request URL
 */
async function proxyUrl(url, request) {
  // See if we have a cached response with the hash
  try {
    const cacheKey = new Request(url);
    let cache = await caches.open('Third-Parties');
    let response = await cache.match(cacheKey);
    if (response) {
      return response;
    }
  } catch(e) {
    console.error(e, e.stack);
  }

  let originUrl = 'https:/' + url.pathname + url.search;
  let hashOffset = originUrl.indexOf('cf_hash=');
  if (hashOffset >= 2) {
    originUrl = originUrl.substring(0, hashOffset - 1);
  }

  // TODO: Add an additional caching layer for the origin requests to ignore cache-control: private
  const userAgent = request.headers.get('user-agent');
  const clientAddr = request.headers.get('cf-connecting-ip');
  const referer = request.headers.get('referer');
  let headers = {'User-Agent': userAgent};
  if (clientAddr) {
    headers['X-Forwarded-For'] = clientAddr;
  }
  if (referer) {
    headers['Referer'] = referer;
  }
  const response = await fetch(originUrl, {headers: headers});
  if (response && response.status == 200) {
    // Only include a strict subset of response headers
    let responseHeaders = {'Cache-Control': 'private; max-age=315360000'};
    const contentType = response.headers.get('content-type');
    if (contentType) {
      responseHeaders['Content-Type'] = contentType;
    }

    // Extend the browser cache time for the hashed URL
    const newResponse = new Response(response.body, responseHeaders);
    newResponse.headers.set('Cache-Control', 'private; max-age=315360000');
    return newResponse;
  } else {
    return response;
  }
}

/**
 * Handle all of the processing for a (likely) HTML request.
 * - Pass through the request to the origin and inspect the response.
 * - If the response is HTML set up a streaming transform and pass it on to modifyHtmlStream for processing
 * 
 * Extra care needs to be taken to make sure the character encoding from the original
 * HTML is extracted and converted to utf-8 and that the downstream response is identified
 * as utf-8.
 * 
 * @param {*} request 
 */
async function processHtmlRequest(request) {
  // Fetch from origin server.
  const response = await fetch(request)
  let contentType = response.headers.get("content-type");
  if (contentType && contentType.indexOf("text/html") !== -1) {
    // Create an identity TransformStream (a.k.a. a pipe).
    // The readable side will become our new response body.
    const { readable, writable } = new TransformStream();

    // get the character encoding if available
    const charsetRegex = /charset\s*=\s*([^\s;]+)/mgi;
    const match = charsetRegex.exec(contentType);
    let charset = null;
    if (match !== null) {
      charset = match[1].toLowerCase();
      contentType = contentType.replace(charsetRegex, "charset=utf-8");
    } else {
      contentType += "; charset=utf-8";
    }

    // Create a cloned response with our modified stream and content type header
    const newResponse = new Response(readable, response);
    newResponse.headers.set('Content-Type', contentType);

    // Start the async processing of the response stream (don't wait for it to finish)
    modifyHtmlStream(response.body, writable, charset, request);

    // Return the in-process response so it can be streamed.
    return newResponse;
  } else {
    return response;
  }
}

/**
 * Process the streaming HTML response from the origin server.
 * - Attempt to buffer the full head to reduce the likelihood of the patterns spanning multiple response chunks
 * - Scan the first response chunk for a charset meta tag (and replace it with utf-8 if found)
 * - Pass the gathered head and each subsequent chunk to modifyHtmlChunk() for actual processing of the text.
 * 
 * @param {*} readable - Input stream (from the origin).
 * @param {*} writable - Output stream (to the browser).
 * @param {*} charset - Detected charset from the http response headers (if any).
 * @param {*} request - Original request object for downstream use.
 */
async function modifyHtmlStream(readable, writable, charset, request) {
  const reader = readable.getReader()
  const writer = writable.getWriter()
  const encoder = new TextEncoder();
  let decoder = null;
  try {
    decoder = charset === null ? new TextDecoder() : new TextDecoder(charset);
  } catch {
    decoder = new TextDecoder();
  }
  let firstChunk = true;
  
  // build the list of url patterns we are going to look for.
  let patterns = [];
  for (let scriptUrl of SCRIPT_URLS) {
    let regex = new RegExp(SCRIPT_PRE + scriptUrl + PATTERN_POST, 'gi');
    patterns.push(regex);
  }

  let partial = '';
  let content = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (partial.length) {
        partial = await modifyHtmlChunk(partial, patterns, request);
        await writer.write(encoder.encode(partial));
      }
      partial = '';
      break;
    }
    try {
      let chunk = decoder.decode(value, {stream:true});

      // Look inside of the first chunk for a HTML charset meta tag.
      // If one is found, update the decoder and change it to UTF-8
      if (firstChunk) {
        firstChunk = false;
        const charsetRegex = /<\s*meta[^>]+charset\s*=\s*['"]([^'"]*)['"][^>]*>/mgi;
        const charsetMatch = charsetRegex.exec(chunk);
        if (charsetMatch) {
          const docCharset = charsetMatch[1].toLowerCase();
          if (docCharset !== charset) {
            charset = docCharset;
            try {
              decoder = new TextDecoder(charset);
            } catch {
              decoder = new TextDecoder();
            }
            chunk = decoder.decode(value, {stream:true});
          }
          if (docCharset != 'utf-8') {
            chunk = chunk.replace(charsetRegex, '<meta charset="utf-8">');
          }
        }
      }

      // TODO: Optimize this so we aren't continuously adding strings together
      content = partial + chunk;
      partial = '';

      // See if there is an unclosed script tag at the end (and if so, carve 
      // it out to complete when the remainder comes in).
      // This isn't perfect (case sensitive and doesn't allow whitespace in the tag)
      // but it is good enough for our purpose and much faster than a regex.
      const scriptPos = content.lastIndexOf('<script');
      if (scriptPos >= 0) {
        const scriptClose = content.indexOf('>', scriptPos);
        if (scriptClose == -1) {
          partial = content.slice(scriptPos);
          content = content.slice(0, scriptPos);
        }
      }

      if (content.length) {
        content = await modifyHtmlChunk(content, patterns, request);
      }
    } catch (e) {
      console.error(e, e.stack);
    }
    if (content.length) {
      await writer.write(encoder.encode(content));
      content = '';
    }
  }
  await writer.close()
}

/**
 * Find any of the script tags we are looking for and replace them with hashed versions
 * that are proxied through the origin.
 * 
 * @param {*} content - Text chunk from the streaming HTML (or accumulated head)
 * @param {*} request - Original request object for downstream use.
 */
async function modifyHtmlChunk(content, patterns, request) {
  // Fully tokenizing and parsing the HTML is expensive.  This regex is much faster and should be reasonably safe.
  // It looks for the search patterns and extracts the URL as match #1.  It shouldn't match
  // in-text content because the < > brackets would be escaped in the HTML.  There is some potential risk of
  // matching it in an inline script (unlikely but possible).
  const pageUrl = new URL(request.url);
  for (let pattern of patterns) {
    let match = pattern.exec(content);
    while (match != null) {
      const originalUrl = match[1];
      let fetchUrl = originalUrl;
      if (fetchUrl.startsWith('//')) {
        fetchUrl = pageUrl.protocol + fetchUrl;
      }
      const proxyUrl = await hashContent(pageUrl, originalUrl, fetchUrl, request);
      if (proxyUrl) {
        console.log("Replacing '" + originalUrl + "' with '" + proxyUrl + "'"); 
        content = content.replace(new RegExp(originalUrl, 'g'), proxyUrl)
      }
      match = pattern.exec(content);
    }
  }
  return content;
}

/**
 * Fetch the original content and return a hash of the result (for detecting changes).
 * Use a local cache because some scripts use cache-control: private to prevent
 * proxies from caching.
 * 
 * @param {*} url - URL for the Google font css.
 * @param {*} request - Original request for the page HTML so the user-agent can be passed through 
 */
async function hashContent(pageUrl, originalUrl, url, request) {
  let proxyUrl = null;
  let hash = null;
  const userAgent = request.headers.get('user-agent');
  const clientAddr = request.headers.get('cf-connecting-ip');
  const hashCacheKey = new Request(url);
  let cache = null;

  let foundInCache = false;
  // Try pulling it from the cache API (wrap it in case it's not implemented)
  try {
    cache = await caches.open('Third-Parties');
    let response = await cache.match(hashCacheKey);
    if (response) {
      hash = response.text();
      proxyUrl = constructProxyUrl(pageUrl, originalUrl, hash);
      foundInCache = true;
    }
  } catch(e) {
    console.error(e, e.stack);
  }

  if (!foundInCache) {
    let headers = {'Referer': request.url,
                   'User-Agent': userAgent};
    if (clientAddr) {
      headers['X-Forwarded-For'] = clientAddr;
    }
    const response = await fetch(url, {headers: headers});
    let content = await response.arrayBuffer();
    if (content) {
      const hashBuffer = await crypto.subtle.digest('SHA-1', content);
      hash = hex(hashBuffer);
      proxyUrl = constructProxyUrl(pageUrl, originalUrl, hash);

      // Add the hash to the local cache
      try {
        if (cache) {
          let ttl = 60;
          const cacheControl = response.headers.get('cache-control');
          const maxAgeRegex = /max-age\s*=\s*(\d+)/i;
          const match = maxAgeRegex.exec(cacheControl);
          if (match) {
            ttl = parseInt(match[1], 10);
          }
          const hashCacheResponse = new Response(hash, {ttl: ttl});
          cache.put(hashCacheKey, hashCacheResponse);
        }
      } catch(e) {
        console.error(e, e.stack);
      }

      // Add the actual response to the cache for the new URL
      try {
        if (cache) {
          const cacheKey = new Request(proxyUrl);
          const cacheResponse = new Response(content, response);
          cacheResponse.headers.set('Cache-Control', 'max-age=315360000');
          cacheResponse.headers.set('ttl', '315360000');
          cache.put(hashCacheKey, cacheResponse);
        }
      } catch(e) {
        console.error(e, e.stack);
      }
    }
  }

  return proxyUrl;
}

/**
 * Generate the proxy URL given the content hash and base URL
 * @param {*} url 
 * @param {*} hash 
 */
function constructProxyUrl(pageUrl, originalUrl, hash) {
  let proxyUrl = null;
  let pathStart = originalUrl.indexOf('//');
  if (pathStart >= 0) {
    proxyUrl = originalUrl.substring(pathStart + 1);
    if (proxyUrl.indexOf('?') >= 0) {
      proxyUrl += '&';
    } else {
      proxyUrl += '?';
    }
    proxyUrl += 'cf_hash=' + hash;
  }
  return proxyUrl;
}

/**
 * Convert a buffer into a hex string (for hashes).
 * From: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
 * @param {*} buffer 
 */
function hex(buffer) {
  var hexCodes = [];
  var view = new DataView(buffer);
  for (var i = 0; i < view.byteLength; i += 4) {
    var value = view.getUint32(i)
    var stringValue = value.toString(16)
    var padding = '00000000'
    var paddedValue = (padding + stringValue).slice(-padding.length)
    hexCodes.push(paddedValue);
  }
  return hexCodes.join("");
}
