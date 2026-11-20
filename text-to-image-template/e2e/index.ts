import worker from "../src/index";

const jpegStart = String.fromCharCode(0xff, 0xd8, 0xff, 0xe0);
let calls = 0;
const env = {
	AI: {
		run: async () => {
			calls++;
			// Flag every other image, so each request needs one retry.
			if (calls % 2 === 1) {
				throw new Error("3030: Your output has been flagged.");
			}
			return { image: btoa(jpegStart) };
		},
	},
} as unknown as Env;

export default {
	fetch(request: Request): Promise<Response> {
		return worker.fetch(request, env);
	},
};
