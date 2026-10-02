import { vi } from "vitest";

type ReplyBody = BodyInit | Record<string, unknown> | null | undefined;
type ReplyHandler = (options: {
	body: Uint8Array;
}) => ReplyBody | Promise<ReplyBody>;

interface PendingInterceptor {
	method: string;
	url: string;
	status: number;
	body: ReplyBody | ReplyHandler;
	headers?: HeadersInit;
}

const pendingInterceptors: PendingInterceptor[] = [];

export const fetchMock = {
	activate() {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const request = new Request(input, init);
				const index = pendingInterceptors.findIndex(
					(interceptor) =>
						interceptor.url === request.url &&
						interceptor.method === request.method,
				);

				if (index === -1) {
					throw new Error(
						`Unexpected outbound request: ${request.method} ${request.url}`,
					);
				}

				const [interceptor] = pendingInterceptors.splice(index, 1);
				const requestBody = new Uint8Array(await request.arrayBuffer());
				const body =
					typeof interceptor.body === "function"
						? await interceptor.body({ body: requestBody })
						: interceptor.body;

				return new Response(
					body !== null &&
						body !== undefined &&
						typeof body === "object" &&
						!(body instanceof ArrayBuffer) &&
						!ArrayBuffer.isView(body) &&
						!(body instanceof Blob) &&
						!(body instanceof FormData) &&
						!(body instanceof URLSearchParams) &&
						!(body instanceof ReadableStream)
						? JSON.stringify(body)
						: (body as BodyInit | null | undefined),
					{ status: interceptor.status, headers: interceptor.headers },
				);
			}),
		);
	},

	disableNetConnect() {},

	assertNoPendingInterceptors() {
		if (pendingInterceptors.length > 0) {
			throw new Error(
				`Pending outbound requests:\n${pendingInterceptors
					.map((interceptor) => `${interceptor.method} ${interceptor.url}`)
					.join("\n")}`,
			);
		}
	},

	get(origin: string) {
		return {
			intercept({ path, method = "GET" }: { path: string; method?: string }) {
				return {
					reply(
						status: number,
						body?: ReplyBody | ReplyHandler,
						options?: { headers?: HeadersInit },
					) {
						pendingInterceptors.push({
							method: method.toUpperCase(),
							url: new URL(path, origin).href,
							status,
							body,
							headers: options?.headers,
						});
					},
				};
			},
		};
	},
};
