import worker from "../src/index";

const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const env = {
	AI: {
		run: async () => pngSignature,
	},
} as unknown as Env;

export default {
	fetch(request: Request): Promise<Response> {
		return worker.fetch(request, env);
	},
};
