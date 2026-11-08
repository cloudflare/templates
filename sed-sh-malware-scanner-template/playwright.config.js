export default {
	use: {
		baseURL: "http://localhost:8787",
	},
	webServer: {
		command: "npx wrangler dev --port 8787",
		port: 8787,
		reuseExistingServer: true,
	},
};
