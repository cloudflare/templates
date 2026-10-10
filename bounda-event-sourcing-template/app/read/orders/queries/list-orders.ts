import type { Query } from "./+types/list-orders";

export const payload = ({ z }: Query.PayloadArgs) =>
	z.object({ customerId: z.string().min(1) });

export const repository = ({ table, customerId }: Query.RepositoryArgs) =>
	table.findMany({
		where: { customerId },
		orderBy: { field: "placedAt", direction: "asc" },
	});

export const handler = ({ repositoryData }: Query.HandlerArgs) => ({
	orders: repositoryData,
	total: repositoryData.reduce((sum, order) => sum + order.total, 0),
});
