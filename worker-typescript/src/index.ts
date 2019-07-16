addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request))
})

export async function handleRequest(request: Request): Promise<Response> {
    return new Response("Hello World!")
}
