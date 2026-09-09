import { sqliteTable, text } from "drizzle-orm/sqlite-core";

// ─── shopify_shop ───────────────────────────────────────────────────────────
//
// The single table the starter ships with. Every other table in a real app
// should reference this one via a non-null `shopId` text FK with
// `onDelete: 'cascade'` (the GDPR SHOP_REDACT pattern).
//
// All IDs are `crypto.randomUUID()`. Timestamps are ISO 8601 strings.
//
export const shopifyShop = sqliteTable("shopify_shop", {
	id: text("id").primaryKey(),

	// Custom fields
	installDate: text("install_date"),
	plan: text("plan"),

	// Shopify identifiers / contact
	myshopifyDomain: text("myshopify_domain"),
	domain: text("domain"),
	name: text("name"),
	email: text("email"),
	shopOwner: text("shop_owner"),
	city: text("city"),
	countryName: text("country_name"),
	currency: text("currency"),
	ianaTimezone: text("iana_timezone"),
	primaryLocale: text("primary_locale"),

	status: text("status", { enum: ["installed", "uninstalled"] }),

	createdAt: text("created_at"),
	updatedAt: text("updated_at"),
});
