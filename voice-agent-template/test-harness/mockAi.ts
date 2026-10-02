export default {
	fetch(): Response {
		return Response.json(
			{ error: "Workers AI is disabled in the local test harness." },
			{ status: 503 },
		);
	},
};
