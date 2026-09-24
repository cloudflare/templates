import { DomainError } from "@bounda-dev/core";
import type { Command } from "./+types/place-order";

export const payload = ({ z }: Command.PayloadArgs) =>
	z.object({
		orderId: z.uuid(),
		customerId: z.string().min(1),
		total: z.number().positive(),
	});

export const handler = ({ command, state, events }: Command.HandlerArgs) => {
	if (state.status !== "new") {
		throw new DomainError(`Order ${command.aggregateId} was already placed`);
	}
	return [
		events.orderPlaced({
			customerId: command.payload.customerId,
			total: command.payload.total,
		}),
	];
};
