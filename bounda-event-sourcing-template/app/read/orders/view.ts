import type { View } from "./+types/view";

export const fields = ({ f }: View.FieldsArgs) => ({
	orderId: f.string().primaryKey(),
	customerId: f.string().index(),
	total: f.number(),
	placedAt: f.date(),
});
