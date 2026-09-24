import type { Event } from "./+types/order-placed";

export const payload = ({ z }: Event.PayloadArgs) =>
	z.object({ customerId: z.string(), total: z.number().positive() });

export const apply = ({ state, event }: Event.ApplyArgs) => ({
	...state,
	status: "placed" as const,
	customerId: event.payload.customerId,
	total: event.payload.total,
});
