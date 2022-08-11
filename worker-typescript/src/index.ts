export const worker = {
	async fetch(request: Request) {
		return new Response(`request method: ${request.method}`);
	},
};
