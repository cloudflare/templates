addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const { greet } = wasm_bindgen;
const instance = wasm_bindgen(wasm)

/**
 * Fetch and log a request
 * @param {Request} request
 */
async function handleRequest(request) {
    await instance;
  
    const greeting = greet()
    return new Response(greeting, {status: 200})
}
