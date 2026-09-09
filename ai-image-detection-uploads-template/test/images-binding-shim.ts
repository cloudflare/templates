import { env } from "cloudflare:test";

// The pool's Images simulator does not yet implement createDirectUpload.
// Keep simulated drafts isolated from the production Worker.

const draftImages = new Map<
	string,
	{ meta: unknown; creator?: string; requireSignedURLs: boolean }
>();
const originalImage = env.IMAGES.hosted.image.bind(env.IMAGES.hosted);

type CreateDirectUploadOptions = {
	metadata?: unknown;
	creator?: string;
	requireSignedURLs?: boolean;
};
type DirectUploadResult = { id: string; uploadURL: string };

env.IMAGES.hosted.createDirectUpload = (async (
	options?: CreateDirectUploadOptions,
): Promise<DirectUploadResult> => {
	const id = `draft-${crypto.randomUUID()}`;
	draftImages.set(id, {
		meta: options?.metadata ?? {},
		creator: options?.creator,
		requireSignedURLs: options?.requireSignedURLs ?? false,
	});
	return { id, uploadURL: `https://upload.example.invalid/${id}` };
}) as typeof env.IMAGES.hosted.createDirectUpload;

env.IMAGES.hosted.image = ((imageId: string) => {
	const draft = draftImages.get(imageId);
	if (!draft) return originalImage(imageId);
	return {
		details: async () => ({
			id: imageId,
			draft: true,
			meta: draft.meta,
			creator: draft.creator,
			requireSignedURLs: draft.requireSignedURLs,
			variants: [],
		}),
		bytes: async () => null,
		update: async () => {
			throw new Error(
				"images-binding-shim: update() is not implemented for a simulated draft",
			);
		},
		delete: async () => false,
		signedUrl: async () => {
			throw new Error(
				"images-binding-shim: signedUrl() is not implemented for a simulated draft",
			);
		},
	};
}) as typeof env.IMAGES.hosted.image;
