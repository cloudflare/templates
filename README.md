<h1 align="center">Cloudflare Workers | Recipes</h1>

This repository contains examples of how Workers can be used to accomplish common tasks. **You are welcome to use, modify, and extend this code!** Pull requests are encourged.
  

<div align="center">
   <h3 align="center">
      <a href="https://cloudflareworkers.com/">
         In-Browser Editor
      </a>
      <span> | </span>
      <a href="https://developers.cloudflare.com/workers">
         Official Workers Documentation
      </a>
      <span> | </span>
      <a href="https://community.cloudflare.com/tags/workers">
         Community
      </a>
     <br/>
     <br/>
     ⚡️
   </h3>
  
</div>
  
  

## What is Workers?

Workers make it possible to write serverless JavaScript applications and run them on Cloudflare's global cloud network of 165 data centers. Workers ...
* run on Chrome V8 and uses [standard JavaScript API's](https://developers.cloudflare.com/workers/reference/)
* can also be written in languages like Rust and C# then compiled via WebAssembly
* are used to achieve a wide array of goals, from trivializing small tasks like intercepting requests to an origin server:
```js
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event))
})

/*
 * Add an extra header to the client request
 */
async function handleRequest (event) {
  let request = new Request(event.request)
  request.headers.append('X-My-Request-Header', 'was set in Workers')
  const response = await fetch(request)
  console.log(`Got status: ${response.status} ${response.statusText}`)
  return response
}
```
... to developing full stack Internet-scale applications using Cloudflare's globally-distributed object storage, [Workers KV Store](https://developers.cloudflare.com/workers/kv/):
```js
addEventListener('fetch', event => {
 event.respondWith(readFromStorage(event))
})

/* 
 * Retrieve some JSON data from KV Store 
 */
async function readFromStorage (event) {
  // const writeKey = await FIRST_KV_NAMESPACE.put('first-key', '{ "foo": "bar" }')
  const value = await FIRST_KV_NAMESPACE.get('first-key')
  return new Response(value, { headers: 'Content-Type': 'application/json' })
}
```

You  can use Workers to perform cryptographic operations using the WebCrypto API, rewrite HTML response streams on-the-fly and serve dynamic content to visitors halfway around the world in milliseconds!

## Questions
Questions about Workers can be addressed on our [community site](https://community.cloudflare.com/tags/workers).
