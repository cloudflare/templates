/**
 * @type {ExportedHandler}
 */
const worker = {
	fetch(request) {
		return new Response('Hello worker!', {
			headers: {
				'content-type': 'text/plain'
			}
		});
	}
};

export default worker;
