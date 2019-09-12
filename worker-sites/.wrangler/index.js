// everything in /api should be considered user code
import { handleApiRequests } from './api'

// handleStaticRequests should deal with getting stuff out of KV
import { handleStaticRequests } from './static/assets'
// handleNotFound may take a single response to return; should have default.
import { handleNotFound } from './static/notfound'

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
