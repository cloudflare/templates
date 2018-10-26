var PRELOAD = true;

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
  // Only process HTTP/2 traffic
  if (url.protocol == 'https:') {
    const bypass = url.searchParams.get('cf-worker') == 'bypass';
    if (!bypass) {
      PRELOAD = !(url.searchParams.get('cf-preload') == 'disable');
      if (url.pathname.startsWith('/fonts.gstatic.com/')) {
        // Restrict proxying to same-site referer
        const referer = event.request.headers.get('referer');
        if (referer) {
          const refererUrl = new URL(referer);
          if (refererUrl.origin == url.origin) {
            // Pass the font requests through to the origin font server
            // (through the underlying request cache).
            event.respondWith(fetch('https:/' + url.pathname, event.request));
          }
        }
      } else if (event.request.headers.get('accept').indexOf("text/html") !== -1) {
        event.respondWith(processHtmlRequest(event.request));
      }
    }
  }
})

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
  if (response.headers.get("content-type").indexOf("text/html") !== -1) {
    
    // Create an identity TransformStream (a.k.a. a pipe).
    // The readable side will become our new response body.
    const { readable, writable } = new TransformStream();

    // get the character encoding if available
    const charsetRegex = /charset\s*=\s*([^\s;]+)/mgi;
    let contentType = response.headers.get("content-type");
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
 * - Attempt to buffer the full head to reduce the likelihood of the font css spanning multiple response chunks
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

  let partial = '';
  let content = '';
  let preloads = [];

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      if (partial.length) {
        partial = await modifyHtmlChunk(partial, request, preloads);
        await writer.write(encoder.encode(partial));
        partial = '';
      }
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

      // See if there is an unclosed link tag at the end (and if so, carve it out
      // to complete when the remainder comes in).
      // This isn't perfect (case sensitive and doesn't allow whitespace in the tag)
      // but it is good enough for our purpose and much faster than a regex.
      const linkPos = content.lastIndexOf('<link');
      if (linkPos >= 0) {
        const linkClose = content.indexOf('/>', linkPos);
        if (linkClose == -1) {
          partial = content.slice(linkPos);
          content = content.slice(0, linkPos);
        }
      }

      if (content.length) {
        content = await modifyHtmlChunk(content, request, preloads);
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
 * Identify any <link> tags that pull ing Google font css and inline the css file.
 * Also add preload tags for any font files that include the ascii character range.
 * 
 * @param {*} content - Text chunk from the streaming HTML (or accumulated head)
 * @param {*} request - Original request object for downstream use.
 */
async function modifyHtmlChunk(content, request, preloads) {
  // Fully tokenizing and parsing the HTML is expensive.  This regex is much faster and should be reasonably safe.
  // It looks for Stylesheet links for the Google fonts css and extracts the URL as match #1.  It shouldn't match
  // in-text content because the < > brackets would be escaped in the HTML.  There is some potential risk of
  // matching it in an inline script (unlikely but possible).
  const fontCSSRegex = /<link\s+[^>]*href\s*=\s*['"]((https?:)?\/\/fonts.googleapis.com\/css[^'"]+)[^>]*>/mgi;
  let match = fontCSSRegex.exec(content);
  while (match != null) {
    const matchString = match[0];
    if (matchString.indexOf('stylesheet') >= 0) {
      const fontInfo = await fetchCSS(match[1], request);
      if (fontInfo.css.length) {
        // See if there is a media type on the link tag
        let mediaStr = '';
        const mediaMatch = matchString.match(/media\s*=\s*['"][^'"]*['"]/mig);
        if (mediaMatch) {
          mediaStr = ' ' + mediaMatch[0];
        }
        // Replace the actual css
        let cssString = "<style" + mediaStr + ">\n";
        cssString += fontInfo.css;
        cssString += "\n</style>\n";
        // Keep track of the preload URLs
        if (PRELOAD) {
          for (fontUrl in fontInfo.urls) {
            preloads.push(fontUrl);
          }
          preloads.concat(fontInfo.urls);
        }
        content = content.replace(matchString, cssString)
      }
      match = fontCSSRegex.exec(content);
    }
  }

  // Add preload hints before the closing head tag (if there is one)
  if (preloads.length) {
    let offset = content.indexOf('</head');
    if (offset >= 0) {
      let preloadStr = "\n"
      while (preloads.length) {
        fontUrl = preloads.pop();
        preloadStr += '<link rel="preload" href="' + fontUrl + '" as="font">\n';
      }
      content = content.substring(0, offset) + preloadStr + content.substring(offset);
    }
  }

  return content;
}

// In-memory cache for high-traffic sites
var FONT_CACHE = {};

/**
 * Fetch the font css from Google using the same browser user-agent string to make sure the
 * correct CSS is returned and rewrite the font URLs to proxy them through the worker (on
 * the same origin to avoid a new connection).
 * 
 * @param {*} url - URL for the Google font css.
 * @param {*} request - Original request for the page HTML so the user-agent can be passed through 
 * and the origin can be used for rewriting the font paths.
 */
async function fetchCSS(url, request) {
  let result = {
    css: '',
    urls: {}
  };
  const userAgent = request.headers.get('user-agent');
  const clientAddr = request.headers.get('cf-connecting-ip');
  const browser = getCacheKey(userAgent);
  const cacheKey = browser ? url + '&' + browser : url;
  const cacheKeyRequest = new Request(cacheKey);
  let cache = null;

  let foundInCache = false;
  if (cacheKey in FONT_CACHE) {
    // hit in the memory cache
    result = FONT_CACHE[cacheKey];
    foundInCache = true;
  } else {
    // Try pulling it from the cache API (wrap it in case it's not implemented)
    try {
      cache = await caches.open('Google-Fonts');
      let response = await cache.match(cacheKeyRequest);
      if (response) {
        result = response.json();
        foundInCache = true;
      }
    } catch(e) {
      console.error(e, e.stack);
    }
  }

  if (!foundInCache) {
    let headers = {'Referer': request.url};
    if (browser) {
      // Only pass through the user agent if it is a known browser, otherwise get a default css.
      headers['User-Agent'] = userAgent;
    }
    if (clientAddr) {
      headers['X-Forwarded-For'] = clientAddr;
    }
    const response = await fetch(url, {headers: headers});
    result.css = await response.text();

    // Rewrite all of the font URLs to come through the worker
    const pageUrl = new URL(request.url);
    const originPath = pageUrl.origin + '/fonts.gstatic.com/';
    result.css = result.css.replace(/(https?:)?\/\/fonts\.gstatic\.com\//mgi, originPath);

    // Get all of the urls for the font files (for preloading)
    const urlRegex = /url\s*\(\s*([^\s)]*)\)([^}]*unicode-range\s*:\s*([^;]*))?/mgi;
    const unicodeRangeRegex = /U\+([^-,]+)(-([^\s,]+))?/mgi;
    let match = urlRegex.exec(result.css);
    while (match != null) {
      fontUrl = match[1];
      if (match.length >= 4) {
        // If the font specifies a unicode range, just preload the fonts that
        // include the ascii range (0-128)
        let ascii = false;
        const unicodeRanges = match[3];
        if (unicodeRanges.startsWith('U+0000')) {
          ascii = true;
        } else {
          let uMatch = unicodeRangeRegex.exec(unicodeRanges);
          while (uMatch != null) {
            const rangeStart = parseInt(uMatch[1], 16);
            if (rangeStart <= 128) {
              ascii = true;
              break;
            }
            uMatch = unicodeRangeRegex.exec(unicodeRanges);
          }
        }
        if (ascii) {
          result.urls[fontUrl] = true;
        }
      } else {
        // If no unicode range is specified then default to preloading it (though
        // it's possible that the browsers that don't support woff2 and unicode ranges
        // also don't support preloading).
        result.urls[fontUrl] = true;
      }
      match = urlRegex.exec(result.css);
    }

    // Add the css info to the font caches
    FONT_CACHE[cacheKey] = result;
    try {
      if (cache) {
        const cacheResponse = new Response(JSON.stringify(result), {ttl: 86400});
        cache.put(cacheKeyRequest, cacheResponse);
      }
    } catch(e) {
      console.error(e, e.stack);
    }
  }

  return result;
}

/**
 * Identify the common browsers (and versions) for using browser-specific css.
 * Others will use a common fallback css fetched without a user agent string (ttf).
 * 
 * @param {*} userAgent - Browser user agent string
 */
function getCacheKey(userAgent) {
  let os = '';
  const osRegex = /^[^(]*\(\s*(\w+)/mgi;
  let match = osRegex.exec(userAgent);
  if (match) {
    os = match[1];
  }

  let mobile = ''
  if (userAgent.match(/Mobile/mgi)) {
    mobile = 'Mobile';
  }

  // Detect Edge first since it includes Chrome and Safari
  const edgeRegex = /\s+Edge\/(\d+)/mgi;
  match = edgeRegex.exec(userAgent);
  if (match) {
    return 'Edge' + match[1] + os + mobile;
  }

  // Detect Chrome next (and browsers using the Chrome UA/engine)
  const chromeRegex = /\s+Chrome\/(\d+)/mgi;
  match = chromeRegex.exec(userAgent);
  if (match) {
    return 'Chrome' + match[1] + os + mobile;
  }

  // Detect Safari and Webview next
  const webkitRegex = /\s+AppleWebKit\/(\d+)/mgi;
  match = webkitRegex.exec(userAgent.match);
  if (match) {
    return 'WebKit' + match[1] + os + mobile;
  }

  // Detect Firefox
  const firefoxRegex = /\s+Firefox\/(\d+)/mgi;
  match = firefoxRegex.exec(userAgent);
  if (match) {
    return 'Firefox' + match[1] + os + mobile;
  }
  
  return null;
}
