addEventListener('fetch', event => {
  event.passThroughOnException()
  event.respondWith(handleRequest(event))
})

const DEBUG=true

async function handleRequest(event) {
  try{
    // log start time
    const stime = Date.now()

    // double slashed urls will be fixed here
    let url = new URL(event.request.url)

    // apply (sub)domain modification/corection
    url.hostname = modifyHostname(url)

    // create new request object with new `url`
    let request = new Request(url, event.request)
    

    // if it's debug mode pass same values via header
    if ( DEBUG ){
      // enterprise only
      //let result = await fetch(request, { cf: { cacheKey: url } })
    
      // get response from origin server with new url
      let result = await fetch(request)
    
      let response = new Response(result.body, result)

      // set debug headers
      response.headers.set("x-dbg-cache-key", url)
      response.headers.set("x-dbg-worker-time", Date.now()-stime)
      return response
    }else{
      // enterprise only
      //return fetch(request, { cf: { cacheKey: url } })
      
      // if not debug mode return fetch
      return fetch(request, { cf: { cacheKey: url } })
    }
  }catch(e){
    clog('Error: ' + e, 'debug')
    return fetch(event.request)
  }
}

function modifyHostname(url){
   let subDomainMap = {
    "cdn1": "www.mycdn.com",
    "cdn2": "www.mycdn.com",
    "cdn3": "www.mycdn.com"
  };

  const subDomain = url.host.split('.')[0]
  const newHost = subDomainMap[subDomain] || url.hostname
  clog(url.toString())
  return newHost
}

function clog(msg){
  if( DEBUG ){
    console.log(msg)
  }
}

