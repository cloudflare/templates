/**
 * @summary Intercepts request and appends new headers
 */

addEventListener('fetch', event => {
	event.respondWith(fetchAndApply(event.request))
})

async function fetchAndApply(request) {
	// Copy request initializer onto new object
	let newInit = Object.assign({}, request);

	// Copy request headers onto new writable object
	let requestHeaders = new Headers(request.headers)

	// Create callback function to append new headers
	const addHeaders = (headerPairs) => {
		for (var prop in headerPairs) {
			(requestHeaders).append(prop, `${headerPairs[prop]}`);
		}
		return requestHeaders;
	}

	// Assign new headers to initializer copy
	newInit.headers = addHeaders({ "X-King-Kong": "Some value", "X-CF-Workers": "Another value" })

	// Create a new request object with original request URI
	// but initialize it with our modified object
	const updatedRequest = new Request(request.url, newInit)

	// Uncomment to test your code
	// console.log(updatedRequest.headers.get('X-CF-Workers')) // returns "Another value"

	return fetch(updatedRequest);
}
