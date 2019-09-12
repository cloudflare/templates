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
 * gets the path to look up in KV
 * e.g. /dir/ -> dir/index.html
 * @param {*} path
 */
function normalize_path(path) { // TODO: handle this by generating Asset Manifest
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
