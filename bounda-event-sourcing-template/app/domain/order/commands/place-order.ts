import type { Command } from "./+types/place-order";

export const payload = ({ z }: Command.PayloadArgs) =>
	z.object({
		orderId: z.uuid(),
		customerId: z.string().min(1),
		total: z.number().positive(),
	});

export const rejections = ({ command }: Command.RejectionsArgs) => ({
	AlreadyPlaced: `Order ${command.aggregateId} was already placed`,
});

export const handler = ({
	command,
	state,
	events,
	reject,
}: Command.HandlerArgs) => {
	if (state.status !== undefined) return reject("AlreadyPlaced");
	return [
		events.orderPlaced({
			customerId: command.payload.customerId,
			total: command.payload.total,
		}),
	];
};
