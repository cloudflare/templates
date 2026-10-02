/**
 * Sample product catalog
 *
 * Included so the template works out of the box without a Shopify store.
 * Replace this with your own product source by setting SHOPIFY_STORE_DOMAIN
 * in wrangler.json, or swap in a different product API entirely.
 *
 * The key insight these products demonstrate: specs like "polycarbonate cap,
 * DIN 0.75-3.0" are meaningless to an AI agent trying to answer "find beginner
 * skis for my 3-year-old." The enrichment module transforms these raw specs
 * into natural language an agent can reason with.
 */

import type { RawProduct } from "./types";

export const CATALOG: RawProduct[] = [
	{
		slug: "little-ripper-70-skis",
		name: "Little Ripper 70 Ski Package",
		price: 89.99,
		currency: "USD",
		category: "toddler-skis",
		inStock: true,
		stockCount: 18,
		specs: {
			length: "70cm",
			construction: "Polycarbonate cap",
			core: "Foam composite",
			binding: "Step-in, DIN 0.75-3.0",
			weight: "1.2 kg/pair",
			boot_compatibility: "Mondo 15.5-20.5",
			ages: "2-5",
			skill_level: "Beginner",
		},
		description:
			"Youth ski package with polycarbonate construction and step-in bindings, DIN 0.75-3.0.",
		imageUrl: undefined,
		lastUpdated: new Date().toISOString(),
	},
	{
		slug: "snow-sprout-helmet",
		name: "Snow Sprout Toddler Helmet",
		price: 49.99,
		currency: "USD",
		category: "helmets",
		inStock: true,
		stockCount: 31,
		specs: {
			certification: "ASTM F2040, CE EN 1077",
			size_range: "48-52cm",
			adjustment: "Dial-fit system",
			weight: "350g",
			ventilation: "8 passive vents",
			ear_protection: "Integrated removable ear pads",
			liner: "EPS foam, anti-bacterial fabric",
			seasons_of_use: "2-3 (adjustable fit)",
		},
		description:
			"ASTM/CE certified toddler ski helmet, 48-52cm, dial-fit adjustment, 350g.",
		imageUrl: undefined,
		lastUpdated: new Date().toISOString(),
	},
	{
		slug: "tiny-tracks-boots",
		name: "Tiny Tracks Ski Boots",
		price: 59.99,
		currency: "USD",
		category: "boots",
		inStock: true,
		stockCount: 14,
		specs: {
			mondo_range: "15.5-19.5",
			buckles: "1 (single macro buckle)",
			flex: "20",
			shell: "Polyolefin",
			liner: "Integrated thermal, removable",
			insulation: "Rated to -10C",
			entry: "Wide-opening rear entry",
			sole: "GripWalk compatible",
		},
		description:
			"Single-buckle toddler ski boot, Mondo 15.5-19.5, polyolefin shell, flex 20.",
		imageUrl: undefined,
		lastUpdated: new Date().toISOString(),
	},
	{
		slug: "powder-pup-snow-suit",
		name: "Powder Pup One-Piece Snow Suit",
		price: 119.99,
		currency: "USD",
		category: "clothing",
		inStock: true,
		stockCount: 22,
		specs: {
			waterproofing: "10,000mm",
			breathability: "5,000g/m2",
			insulation: "200g synthetic fill",
			seams: "Fully taped",
			cuffs: "Elastic wrist and ankle with snow gaiters",
			zipper: "Full-length front, storm flap",
			sizes: "2T, 3T, 4T, 5T",
			features: "Fold-over mitt cuffs, reflective trim, diaper-friendly design",
		},
		description:
			"Toddler one-piece snow suit, 10,000mm waterproofing, 200g insulation, sizes 2T-5T.",
		imageUrl: undefined,
		lastUpdated: new Date().toISOString(),
	},
	{
		slug: "mountain-cub-goggles",
		name: "Mountain Cub Toddler Goggles",
		price: 29.99,
		currency: "USD",
		category: "accessories",
		inStock: true,
		stockCount: 45,
		specs: {
			lens: "Cylindrical, S1 VLT 55%",
			uv_protection: "UV400",
			frame: "TPU flexible frame",
			fit: "Helmet-compatible, fits ages 2-5",
			strap: "Adjustable elastic, silicone grip",
			anti_fog: "Double-lens with anti-fog coating",
			ventilation: "Perimeter venting",
		},
		description:
			"Toddler ski goggles, cylindrical S1 lens, UV400, TPU frame, helmet-compatible.",
		imageUrl: undefined,
		lastUpdated: new Date().toISOString(),
	},
	{
		slug: "first-turns-harness",
		name: "First Turns Ski Training Harness",
		price: 34.99,
		currency: "USD",
		category: "accessories",
		inStock: false,
		stockCount: 0,
		specs: {
			type: "Ski training harness with handle and leash",
			weight_capacity: "Up to 25 kg / 55 lbs",
			material: "Padded nylon webbing",
			attachment_points: "Rear handle + detachable 1.5m leash",
			closure: "Quick-release buckle, adjustable chest and waist",
			ages: "18 months - 5 years",
		},
		description:
			"Padded ski training harness with rear handle and detachable leash, up to 25kg.",
		imageUrl: undefined,
		lastUpdated: new Date().toISOString(),
	},
];

/** Simulate real-time inventory changes. */
export function getCatalogWithLiveInventory(): RawProduct[] {
	return CATALOG.map((product) => ({
		...product,
		// Simulate slight inventory fluctuations
		stockCount: product.inStock
			? Math.max(1, product.stockCount + Math.floor(Math.random() * 5 - 2))
			: 0,
		lastUpdated: new Date().toISOString(),
	}));
}
