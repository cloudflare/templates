/**
 * Here is where we might suggest users add API handlers.
 * These should execute based on a router that falls through
 * to remaining event listeners on undefined routes.
 */
addEventListener('fetch', event => {
	let response = await handleApiRequests(event.request)

	if (response) event.respondWith(response)
})

/**
 * Here is where a user might introduce custom redirect logic like
 * we use on the workers docs site. This is totally optional, but is
 * for sure part of handling static sites. If we wanted to get really
 * all-in-one, we might add this as an option to the package we build
 * Or we can take a list of handlers. There are many possibilities.
 */
addEventListener('fetch', event => {
	let response = await handleRedirects(event.request)

	if (response) event.respondWith(response)
})

/**
 * This is the meat of static site serving. If we want to encourage
 * users to manipulate response bodies with something like HTMLRewriter,
 * we might consider adding an example of that here; between getting the
 * response out of KV, and actually returning it to the eyeball.
 */
addEventListener('fetch', event => {
	let response = handleStaticRequests(event.request)

	if (response) event.respondWith(response)
})

/**
 * Finally, we need a catch-all NotFound handler. To start we can
 * have this default to just redirecting to 404.html, but it's also pretty
 * trivial to give the user custom control over this, as we have done here
 * for workers docs.
 */
addEventListener('fetch', event => {
	event.respondWith(handleNotFound(event.request))
})

/**
 * we generally expect userland code to execute in front of the static site handling.
 * this should CONDITIONALLY return a response, and otherwise fall through to the
 * static site handler.
 * @param {Event} event
 */
async function handleApiRequests(request) {
	if (request.method !== "GET" || !request.pathname.startsWith("/api")) {
		return new Response('Hello worker!', { status: 200 })
	}
}

/**
 * This is an example of some logic a user might want to inject into their static site
 * serving logic.
 */
export function handleRedirects(request) {
  let requestURL = new URL(request.url)
  let path = requestURL.pathname

  // prefix stuff; removable with configuration and/or asset manifest
  path = path.replace('/workers', '')

  // ensure any requests to /dir/index.html redirect
  // to /dir/ immediately
  if (pathname.endsWith('index.html')) {
    const url = request.url.replace(/\/*index.html\/*/i, '/')
    return Response.redirect(url, 301)
  }

  // ensure all directories are redirected with a trailing
  // slash
  if (!path.endsWith('/') && is_directory(path)) {
    return Response.redirect(request.url + '/', 301)
  }

  //strip last slash (also handled by asset manifest model of the world)
  path = path.replace(/\/$/, '')
  console.log(`Looking for ${path}`)

  let location = newDocsMap.get(path) || oldDocsMap.get(path)
  if (location) {
    location = newDocsBase + location
    console.log(`Found match, redirecting to ${location}`)
    return Response.redirect(location, 301)
  } else if (oldDocsMap.has(path)) {
    location = newDocsBase + '/archive' + path
    console.log(`Found archived docs, redirecting to new route`)
    return Response.redirect(location, 301)
  }
}

/**
 * Fetch and log a request
 * @param {Request} request
 */
async function handleStaticRequests(request) {
  try {
    var parsedUrl = new URL(request.url)
    var pathname = parsedUrl.pathname

    // custom prefix logic could be generalized using a `prefix` config
    // and asset manifest
    pathname = pathname.replace('/workers', '')

    // this would also be eliminated if the `asset manifest` was calculated
    // before upload
    var path = normalize_path(pathname)

    var contentType = determine_content_type(path)

    let body = await STATIC_CONTENT.get(path, 'arrayBuffer')

    // strip  trailing slashes since newDocsMaps won't include
    pathname = pathname.replace(/\/$/, '')
    if (!body || newDocsMap.has(pathname) || oldDocsMap.has(pathname)) {
      console.log('Handling redirect')
      return handleRedirect(request)
    }

    let res = new Response(body, { status: 200 })
    res.headers.set('Content-type', contentType)
    return res
  } catch (err) {
    console.log(err)
    let res = new Response(err.body, { status: err.status })
    res.headers.set('Content-type', 'text/html')
    return res
  }
}

/**
 * allowing this to be customizable is nice.
 */
function handleNotFound(event) {
	// TODO: make this configurable; default 404.html
	return Response.redirect(newDocsOverview, 301)
}

/**
 * gets the path to look up in KV
 * e.g. /dir/ -> dir/index.html
 * @param {*} path
 */
function normalize_path(path) {
  // strip first slash
  path = path.replace(/^\/+/, '')
  // root page
  if (path == '') {
    return 'index.html'
    // directory page with a trailing /
  } else if (path.endsWith('/')) {
    return path + 'index.html'
    // normal path, no need to do anything!
  } else {
    return path
  }
}

function is_directory(path) {
  const bits = path.split('/')
  const last = bits[bits.length - 1]

  // does the final component contain a dot? technically there may be edge cases
  // here but this is fine for now!
  return !last.includes('.')
}

function determine_content_type(path) {
  if (path.endsWith('html')) {
    return 'text/html'
  } else if (path.endsWith('css')) {
    return 'text/css'
  } else if (path.endsWith('ttf')) {
    return 'application/font-sfnt'
  } else if (path.endsWith('yml')) {
    return 'text/yaml'
  } else if (path.endsWith('eot')) {
    return 'application/vnd.ms-fontobject'
  } else if (path.endsWith('json')) {
    return 'application/json'
  } else if (path.endsWith('md')) {
    return 'text/markdown'
  } else if (path.endsWith('webm')) {
    return 'video/webm'
  } else if (path.endsWith('otf')) {
    return 'application/font-sfnt'
  } else if (path.endsWith('js')) {
    return 'text/javascript'
  } else if (path.endsWith('xml')) {
    return 'text/xml'
  } else if (path.endsWith('svg')) {
    return 'image/svg+xml'
  } else if (path.endsWith('scss')) {
    return 'text/x-sass'
  } else if (path.endsWith('woff')) {
    return 'application/font-woff'
  } else if (path.endsWith('woff2')) {
    return 'font/woff2'
  } else if (path.endsWith('png')) {
    return 'image/png'
  } else if (path.endsWith('jpg')) {
    return 'image/jpeg'
  } else if (path.endsWith('mp4')) {
    return 'video/mp4'
  } else if (path.endsWith('gif')) {
    return 'image/gif'
  } else {
    return 'text/plain'
  }
}
