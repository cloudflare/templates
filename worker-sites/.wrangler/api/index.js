/**
 * we generally expect userland code to execute in front of the static site handling.
 * this should CONDITIONALLY return a response, and otherwise fall through to the
 * static site handler.
 * @param {Event} event
 */
async function handleApiRequests(event) {
	const { request } = event
	if (request.method !== 'GET' || !request.pathname.startsWith('/api')) {
		return new Response('Hello worker!', { status: 200 })
	}
}
