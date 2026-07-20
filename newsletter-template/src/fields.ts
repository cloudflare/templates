// Extra signup fields.
//
// `email` (required) and `name` (optional) are built in and always shown on the
// form. To collect more, add entries here — each one automatically appears on
// the signup + embed forms and is stored as JSON in the subscribers.data column.
// No other file needs to change.
//
// Example:
//   export const EXTRA_FIELDS: Field[] = [
//     { name: "company", label: "Company" },
//     { name: "country", label: "Country", required: true },
//   ];

export type Field = {
	name: string; // key stored in `data` (keep it simple: a-z, no spaces)
	label: string; // shown as the input placeholder
	type?: "text" | "tel" | "url" | "number"; // input type (default "text")
	required?: boolean; // reject the signup if left empty
};

export const EXTRA_FIELDS: Field[] = [];
