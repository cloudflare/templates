import { checkProvenance, type C2PAEnv } from "./c2pa";
import { detectImage, MODEL, type DetectionEnv } from "./detection";
import { HttpError } from "./errors";
import {
	completeJob,
	failJob,
	claimJob,
	setRetrying,
	type JobsEnv,
} from "./jobs";
import type { ProvenanceResult, QueueJob } from "./schema";
import { fetchSource, type SourceEnv } from "./source";

export type QueueEnv = JobsEnv &
	DetectionEnv &
	C2PAEnv &
	SourceEnv & {
		ENABLE_C2PA: boolean;
		ENABLE_METADATA_CHECK: boolean;
	};

const MAX_RETRIES = 3;

export async function queueConsumer(
	batch: MessageBatch<QueueJob>,
	env: QueueEnv,
): Promise<void> {
	for (const message of batch.messages) {
		const job = message.body;
		let claimed: boolean;
		try {
			claimed = await claimJob(env, job.id, message.attempts);
		} catch (error) {
			console.error("Could not claim provenance job", {
				jobId: job.id,
				attempt: message.attempts,
				error,
			});
			message.retry();
			continue;
		}
		if (!claimed) {
			message.ack();
			continue;
		}

		const started = performance.now();
		try {
			const fetchStarted = performance.now();
			const source = await fetchSource(job.url, env);
			const fetchMs = performance.now() - fetchStarted;

			let provenanceMs: number | null = null;
			const provenanceStarted = performance.now();
			const provenance = await checkProvenance(
				env,
				source.bytes,
				source.contentType,
				{
					enableC2PA: env.ENABLE_C2PA,
					enableMetadataCheck: env.ENABLE_METADATA_CHECK,
				},
			);
			if (env.ENABLE_C2PA || env.ENABLE_METADATA_CHECK)
				provenanceMs = performance.now() - provenanceStarted;

			const detection = await detectImage(
				env,
				source.bytes,
				source.contentType,
				job.mode,
			);

			const result: ProvenanceResult = {
				detection: { model: MODEL, ...detection },
				provenance,
				source: {
					url: source.url,
					content_type: source.contentType,
					bytes: source.bytes.byteLength,
				},
				timing_ms: {
					fetch: Number(fetchMs.toFixed(3)),
					provenance:
						provenanceMs === null ? null : Number(provenanceMs.toFixed(3)),
					total: Number((performance.now() - started).toFixed(3)),
				},
			};

			await completeJob(env, job.id, message.attempts, result);
			message.ack();
		} catch (error) {
			console.error("Provenance job failed", {
				jobId: job.id,
				attempt: message.attempts,
				error,
			});
			const publicError =
				error instanceof HttpError && error.status < 500
					? error.message
					: "analysis failed";
			const retryable = !(error instanceof HttpError) || error.status === 502;
			if (!retryable || message.attempts > MAX_RETRIES) {
				await failJob(env, job.id, publicError, message.attempts);
				message.ack();
			} else {
				const retrying = await setRetrying(
					env,
					job.id,
					message.attempts,
					publicError,
				);
				if (retrying) message.retry();
				else message.ack();
			}
		}
	}
}
