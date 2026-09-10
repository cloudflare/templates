import { z } from "zod";

export const MODES = ["fast", "basic", "advanced"] as const;
export type Mode = (typeof MODES)[number];
export const ModeSchema = z.enum(MODES);

function isFetchableHttpsUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "https:" && !url.username && !url.password;
	} catch {
		return false;
	}
}

export const AnalyzeRequest = z
	.object({
		url: z
			.string()
			.max(2048)
			.url()
			.refine(
				isFetchableHttpsUrl,
				"url must use https and must not include credentials",
			),
		mode: ModeSchema.optional(),
	})
	.strict();
export type AnalyzeRequest = z.infer<typeof AnalyzeRequest>;

export const ModelResultSchema = z
	.object({
		score: z.number().min(0).max(1),
		mode: ModeSchema,
		model_version: z.string().min(1).max(64),
		inference_time_ms: z.number().nonnegative(),
	})
	.strict();
export type ModelResult = z.infer<typeof ModelResultSchema>;

export type DetectionResult = {
	detection: ModelResult & { model: string };
	source: { url: string; content_type: string; bytes: number };
	timing_ms: { fetch: number; total: number };
};

export type ErrorResponse = { error: string };
