import mime from 'mime/lite';

/**
 * Fetch and log a request
 * @param {Request} request
 */
async function handleStaticRequests(request) {
  try {
    let parsedUrl = new URL(request.url)
    let pathname = parsedUrl.pathname

    // this would also be eliminated if the `asset manifest` was calculated
    // before upload
    let path = normalize_path(pathname)

    let contentType = mime.getType(path)

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
