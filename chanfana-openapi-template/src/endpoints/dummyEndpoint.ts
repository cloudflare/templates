import { contentJson, OpenAPIRoute } from "chanfana";
import { AppContext } from "../types";
import { z } from "zod";

export class DummyEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["Dummy"],
		summary: "this endpoint is an example",
		operationId: "example-endpoint", // This is optional
		request: {
			params: z.object({
				slug: z.string(),
			}),
			body: contentJson(
				z.object({
					name: z.string(),
				}),
			),
		},
		responses: {
			"200": {
				description: "Returns the log details",
				...contentJson({
					success: Boolean,
					result: z.object({
						msg: z.string(),
						slug: z.string(),
						name: z.string(),
					}),
				}),
			},
		},
	};

	public async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();

		return {
			success: true,
			result: {
				msg: "this is a dummy endpoint, serving as example",
				slug: data.params.slug,
				name: data.body.name,
			},
		};
	}
}
