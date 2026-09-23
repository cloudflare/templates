import type { Projection } from "./+types/order-placed";

export const project = async ({ event, table }: Projection.Args) => {
	await table.upsert({
		orderId: event.aggregateId,
		customerId: event.payload.customerId,
		total: event.payload.total,
		placedAt: new Date(event.timestamp),
	});
};
