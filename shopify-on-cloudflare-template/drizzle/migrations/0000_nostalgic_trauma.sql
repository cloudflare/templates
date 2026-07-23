CREATE TABLE `shopify_shop` (
	`id` text PRIMARY KEY NOT NULL,
	`install_date` text,
	`plan` text,
	`myshopify_domain` text,
	`domain` text,
	`name` text,
	`email` text,
	`shop_owner` text,
	`city` text,
	`country_name` text,
	`currency` text,
	`iana_timezone` text,
	`primary_locale` text,
	`status` text,
	`created_at` text,
	`updated_at` text
);
