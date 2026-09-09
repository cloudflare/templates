import type { JobResponse, Mode, ProvenanceResult, QueueJob } from "./schema";
import { HttpError } from "./errors";

export type JobsEnv = { JOBS: D1Database };

export async function createJob(env: JobsEnv, job: QueueJob): Promise<void> {
	const now = new Date().toISOString();
	await env.JOBS.prepare(
		"INSERT INTO jobs (id, source_url, mode, status, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, ?)",
	)
		.bind(job.id, job.url, job.mode, now, now)
		.run();
}

export async function claimJob(
	env: JobsEnv,
	id: string,
	attempt: number,
): Promise<boolean> {
	const result = await env.JOBS.prepare(
		"UPDATE jobs SET status = 'processing', error = NULL, processing_attempt = ?, updated_at = ? WHERE id = ? AND (status = 'queued' OR (status IN ('processing', 'retrying') AND processing_attempt < ?))",
	)
		.bind(attempt, new Date().toISOString(), id, attempt)
		.run();
	return result.meta.changes > 0;
}

export async function setRetrying(
	env: JobsEnv,
	id: string,
	attempt: number,
	error: string,
): Promise<boolean> {
	const result = await env.JOBS.prepare(
		"UPDATE jobs SET status = 'retrying', error = ?, updated_at = ? WHERE id = ? AND status = 'processing' AND processing_attempt = ?",
	)
		.bind(error, new Date().toISOString(), id, attempt)
		.run();
	return result.meta.changes > 0;
}

export async function completeJob(
	env: JobsEnv,
	id: string,
	attempt: number,
	result: ProvenanceResult,
): Promise<boolean> {
	const updated = await env.JOBS.prepare(
		"UPDATE jobs SET status = 'complete', result_json = ?, error = NULL, updated_at = ? WHERE id = ? AND status = 'processing' AND processing_attempt = ?",
	)
		.bind(JSON.stringify(result), new Date().toISOString(), id, attempt)
		.run();
	return updated.meta.changes > 0;
}

export async function failJob(
	env: JobsEnv,
	id: string,
	error: string,
	attempt?: number,
): Promise<boolean> {
	const statement =
		attempt === undefined
			? env.JOBS.prepare(
					"UPDATE jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status = 'queued'",
				).bind(error, new Date().toISOString(), id)
			: env.JOBS.prepare(
					"UPDATE jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status = 'processing' AND processing_attempt = ?",
				).bind(error, new Date().toISOString(), id, attempt);
	const result = await statement.run();
	return result.meta.changes > 0;
}

type JobRow = {
	id: string;
	source_url: string;
	mode: Mode;
	status: "queued" | "processing" | "retrying" | "complete" | "failed";
	result_json: string | null;
	error: string | null;
};

export async function getJob(
	env: JobsEnv,
	id: string,
): Promise<JobResponse | null> {
	const row = await env.JOBS.prepare(
		"SELECT id, source_url, mode, status, result_json, error FROM jobs WHERE id = ?",
	)
		.bind(id)
		.first<JobRow>();
	if (!row) return null;

	if (row.status === "complete" && row.result_json) {
		return {
			job_id: row.id,
			status: "complete",
			result: JSON.parse(row.result_json) as ProvenanceResult,
		};
	}
	if (row.status === "failed") {
		return {
			job_id: row.id,
			status: "failed",
			error: row.error ?? "analysis failed",
		};
	}
	if (
		row.status === "queued" ||
		row.status === "processing" ||
		row.status === "retrying"
	) {
		return { job_id: row.id, status: row.status };
	}

	throw new HttpError(500, "Job contains an unknown status");
}
