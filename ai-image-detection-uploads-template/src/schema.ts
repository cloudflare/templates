import { z } from "zod";

export const MODES = ["fast", "basic", "advanced"] as const;
export type Mode = (typeof MODES)[number];
export const ModeSchema = z.enum(MODES);

export const CreateUploadRequest = z
	.object({
		mode: ModeSchema.optional(),
	})
	.strict();
export type CreateUploadRequest = z.infer<typeof CreateUploadRequest>;

export const AnalyzeUploadQuery = z
	.object({
		mode: ModeSchema.optional(),
	})
	.strict();

const optionalScore = z.preprocess(
	(value) => (value === undefined || value === "" ? undefined : value),
	z.coerce.number().min(0).max(1).optional(),
);

export const ListImagesQuery = z
	.object({
		min_score: optionalScore,
		max_score: optionalScore,
		limit: z.coerce.number().int().min(1).max(1000).default(20),
		cursor: z.string().max(2048).optional(),
	})
	.strict()
	.refine(
		(query) =>
			query.min_score === undefined ||
			query.max_score === undefined ||
			query.min_score <= query.max_score,
		{ message: "min_score must not exceed max_score" },
	);

export const ModelResultSchema = z
	.object({
		score: z.number().min(0).max(1),
		mode: ModeSchema,
		model_version: z.string().min(1).max(64),
		inference_time_ms: z.number().nonnegative(),
	})
	.strict();
export type ModelResult = z.infer<typeof ModelResultSchema>;

export const DetectionResultSchema = z
	.object({
		detection: ModelResultSchema.extend({ model: z.string().min(1) }),
		source: z.object({
			image_id: z.string(),
			filename: z.string().nullable(),
			content_type: z.string(),
			bytes: z.number().int().nonnegative(),
		}),
	})
	.strict();
export type DetectionResult = z.infer<typeof DetectionResultSchema>;

export type UploadMetadata =
	| { status: "pending"; mode?: Mode }
	| { status: "complete"; mode: Mode; ai_detection: DetectionResult };

export type ErrorResponse = { error: string };
