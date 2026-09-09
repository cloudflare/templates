import { Container, getRandom } from "@cloudflare/containers";
import { z } from "zod";
import { HttpError } from "./errors";

export class C2PAContainer extends Container<Env> {
	defaultPort = 8080;
	sleepAfter = "2m";
	envVars = {
		C2PA_TRUST_ANCHORS_URL: this.env.C2PA_TRUST_ANCHORS_URL,
		MAX_IMAGE_BYTES: String(this.env.MAX_IMAGE_BYTES),
	};
}

const CONTAINER_POOL_SIZE = 5;

export type C2PAEnv = {
	C2PA_CONTAINER: DurableObjectNamespace<C2PAContainer>;
	C2PA_TRUST_ANCHORS_URL: string;
	MAX_IMAGE_BYTES: number;
};

const C2PAResultSchema = z
	.object({
		status: z.enum([
			"disabled",
			"verified",
			"invalid",
			"present_unverified",
			"not_found",
			"error",
		]),
		declares_ai_generation: z.boolean().optional(),
		issuer: z.string().nullable().optional(),
		claim_generator: z.string().nullable().optional(),
	})
	.strict();

const MetadataResultSchema = z
	.object({
		status: z.enum(["disabled", "found", "not_found", "error"]),
		capture_hints: z.array(z.string()),
		ai_hints: z.array(z.string()),
	})
	.strict();

const ProvenanceCheckSchema = z
	.object({
		c2pa: C2PAResultSchema,
		metadata: MetadataResultSchema,
	})
	.strict();

export type ProvenanceCheck = z.infer<typeof ProvenanceCheckSchema>;

export async function checkProvenance(
	env: C2PAEnv,
	bytes: ArrayBuffer,
	contentType: string,
	options: { enableC2PA: boolean; enableMetadataCheck: boolean },
): Promise<ProvenanceCheck> {
	if (!options.enableC2PA && !options.enableMetadataCheck) {
		return {
			c2pa: { status: "disabled" },
			metadata: { status: "disabled", capture_hints: [], ai_hints: [] },
		};
	}

	const form = new FormData();
	form.append("file", new Blob([bytes], { type: contentType }), "image");
	form.append("enable_c2pa", String(options.enableC2PA));
	form.append("enable_metadata", String(options.enableMetadataCheck));

	const container = await getRandom(env.C2PA_CONTAINER, CONTAINER_POOL_SIZE);
	let response: Response;
	try {
		response = await container.fetch(
			new Request("http://container/verify", { method: "POST", body: form }),
		);
	} catch (error) {
		console.error("C2PA container request failed", error);
		throw new HttpError(502, "provenance check failed");
	}
	if (!response.ok) {
		console.error("C2PA container returned", response.status);
		throw new HttpError(502, "provenance check failed");
	}

	const body = await response.json().catch(() => null);
	const parsed = ProvenanceCheckSchema.safeParse(body);
	if (!parsed.success)
		throw new HttpError(
			502,
			"provenance checker returned an unexpected response",
		);
	return parsed.data;
}
