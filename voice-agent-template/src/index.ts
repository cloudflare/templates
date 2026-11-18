import { routeAgentRequest } from "agents";
import { authorizeVoiceAgentRequest } from "./auth";
import { FIXED_PIPELINE, statusPage } from "./statusPage";

export { VoiceAgent } from "./VoiceAgent";

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/health") {
			return Response.json({
				status: "ok",
				agent: FIXED_PIPELINE.agent,
				pipeline: {
					stt: FIXED_PIPELINE.stt,
					llm: FIXED_PIPELINE.llm,
					tts: FIXED_PIPELINE.tts,
					voice: FIXED_PIPELINE.voice,
				},
			});
		}

		if (url.pathname === "/") {
			return statusPage();
		}

		const authorize = (agentRequest: Request) =>
			authorizeVoiceAgentRequest(agentRequest, env);
		const agentResponse = await routeAgentRequest(request, env, {
			onBeforeConnect: authorize,
			onBeforeRequest: authorize,
		});
		if (agentResponse) return agentResponse;

		return Response.json({ error: "Not found." }, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
