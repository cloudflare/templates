const urlParams = new URLSearchParams(window.location.search);
let sessionId = urlParams.get('session_id');
const token = urlParams.get('token');

// TODO
// const sessionCookie = ...
// sessionId = sessionCookie

if (sessionId) {
	// TODO: Set session cookie if none present
	// TODO: Use sessionId it to fetch signed URL if no token is present
} else {
	// TODO: redirect to /api/create-checkout-session
}

if (token) {
	document.getElementById('stream-player').innerHTML = `
		<iframe
			src="https://customer-oqspz44v7yl3ii55.cloudflarestream.com/${token}/iframe"
			style="border: none; position: absolute; top: 0; left: 0; height: 100%; width: 100%"
			allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
			allowfullscreen="true"
		></iframe>
	`;
}
