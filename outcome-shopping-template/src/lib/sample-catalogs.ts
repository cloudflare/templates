import type { MerchantCatalog } from "./types";

/**
 * Sample merchant catalogs used when MERCHANT_ENDPOINTS is empty or all
 * configured merchants are unreachable. Each catalog mirrors what a real
 * merchant's /api/products endpoint would serve (same shape as the
 * commerce-llms-txt-template output), so the orchestrator exercises its
 * full happy path out of the box.
 *
 * Exposed as a function so timestamps are stamped at call time rather than
 * at module-load time — `fetchedAt` and `lastUpdated` always look current.
 */
export function getSampleCatalogs(): MerchantCatalog[] {
	const now = new Date().toISOString();
	return [
		{
			merchantName: "Summit Sprouts",
			merchantUrl: "https://summit-sprouts.example.com",
			fetchedAt: now,
			products: [
				{
					slug: "little-ripper-toddler-skis",
					name: "Little Ripper Toddler Ski Set",
					price: 89.99,
					currency: "USD",
					category: "skis",
					inStock: true,
					stockCount: 12,
					specs: {
						"DIN Range": "0.75-3.0",
						Length: "70cm",
						Binding: "Step-in",
						Material: "Polycarbonate cap",
					},
					description:
						"Entry-level ski set for toddlers learning on gentle slopes.",
					lastUpdated: now,
					agentSummary:
						"A lightweight, durable ski set designed for toddlers ages 2-4 taking their first turns. The polycarbonate cap construction keeps them light enough for small children to carry, while the 0.75-3.0 DIN binding releases easily to protect developing joints.",
					useCaseTags: [
						"toddler skiing",
						"beginner skis",
						"first skis",
						"learn to ski",
					],
					highlights: [
						"Ultra-lightweight polycarbonate construction",
						"Step-in bindings for easy on/off with mittens",
						"DIN 0.75-3.0 for safe release",
					],
					bestFor: "Toddlers ages 2-4 learning to ski for the first time.",
				},
				{
					slug: "mountain-cub-jacket",
					name: "Mountain Cub Insulated Jacket",
					price: 64.99,
					currency: "USD",
					category: "outerwear",
					inStock: true,
					stockCount: 8,
					specs: {
						Insulation: "80g synthetic",
						Waterproof: "10K mm",
						Sizes: "2T-5T",
					},
					description:
						"Warm, waterproof jacket for toddlers in cold conditions.",
					lastUpdated: now,
					agentSummary:
						"A fully waterproof, insulated toddler jacket built for ski resort conditions. 80g synthetic insulation keeps kids warm on chairlifts and during lessons, while the 10K waterproof rating handles snow and slush.",
					useCaseTags: [
						"ski jacket",
						"toddler outerwear",
						"winter jacket",
						"snow gear",
					],
					highlights: [
						"10K waterproof with sealed seams",
						"80g synthetic insulation for active play",
						"Grow cuffs extend sleeve length by 1.5 inches",
					],
					bestFor: "Toddlers ages 2-5 spending full days on the mountain.",
				},
				{
					slug: "powder-pup-snow-pants",
					name: "Powder Pup Snow Pants",
					price: 49.99,
					currency: "USD",
					category: "outerwear",
					inStock: true,
					stockCount: 15,
					specs: {
						Insulation: "60g synthetic",
						Waterproof: "10K mm",
						Sizes: "2T-5T",
						Reinforcement: "Knee and seat",
					},
					description: "Durable snow pants for toddlers with reinforced knees.",
					lastUpdated: now,
					agentSummary:
						"Rugged, insulated snow pants designed for toddlers who spend a lot of time on their knees. Reinforced knee and seat panels withstand the falls that come with learning to ski, while full-length side zips make diaper changes and bathroom breaks manageable in ski boots.",
					useCaseTags: [
						"snow pants",
						"ski pants",
						"toddler snow gear",
						"winter pants",
					],
					highlights: [
						"Reinforced knees and seat for durability",
						"Full-length side zips for easy on/off over boots",
						"Adjustable suspenders for secure fit",
					],
					bestFor: "Toddlers ages 2-5 learning to ski or playing in the snow.",
				},
			],
		},
		{
			merchantName: "Peak Riders Gear Co.",
			merchantUrl: "https://peak-riders-gear.example.com",
			fetchedAt: now,
			products: [
				{
					slug: "mini-shred-helmet",
					name: "Mini Shred Kids Ski Helmet",
					price: 54.99,
					currency: "USD",
					category: "helmets",
					inStock: true,
					stockCount: 20,
					specs: {
						Certification: "ASTM F2040, CE EN 1077",
						Sizes: "XXS-S",
						Weight: "350g",
						Ventilation: "8 passive vents",
					},
					description:
						"Certified ski helmet for children with adjustable fit system.",
					lastUpdated: now,
					agentSummary:
						"A dual-certified ski helmet sized for toddlers and young children. The in-mold construction keeps weight under 350g, and the dial-fit system adjusts to accommodate growth over multiple seasons. Meets both ASTM and CE safety standards.",
					useCaseTags: [
						"ski helmet",
						"kids helmet",
						"toddler helmet",
						"snow safety",
					],
					highlights: [
						"Dual certified: ASTM F2040 + CE EN 1077",
						"Dial-fit adjustment grows with the child",
						"Under 350g — barely noticeable for small heads",
					],
					bestFor: "Children ages 1-5 skiing, snowboarding, or sledding.",
				},
				{
					slug: "little-stomper-ski-boots",
					name: "Little Stomper Ski Boots",
					price: 74.99,
					currency: "USD",
					category: "boots",
					inStock: true,
					stockCount: 10,
					specs: {
						"Mondo Size": "15.5-20.5",
						Flex: "20",
						Buckles: "1 buckle + velcro",
						Sole: "GripWalk",
					},
					description: "Single-buckle ski boots for toddlers, easy to put on.",
					lastUpdated: now,
					agentSummary:
						"Toddler ski boots with a single buckle and velcro closure that parents can manage with cold hands. The 20-flex shell is soft enough for tiny legs to bend into a ski stance, and the GripWalk sole provides traction when walking to the lift.",
					useCaseTags: [
						"ski boots",
						"toddler boots",
						"beginner boots",
						"kids ski boots",
					],
					highlights: [
						"Single buckle + velcro — easy for parents",
						"20-flex for developing leg strength",
						"GripWalk sole for safe walking on ice and pavement",
					],
					bestFor: "Toddlers ages 2-5 in their first or second ski season.",
				},
				{
					slug: "summit-shield-goggles",
					name: "Summit Shield Kids Goggles",
					price: 29.99,
					currency: "USD",
					category: "goggles",
					inStock: true,
					stockCount: 25,
					specs: {
						Lens: "Cylindrical, S1 orange",
						Fit: "Small face, helmet-compatible",
						UV: "UV400",
						"Anti-fog": "Dual-pane",
					},
					description:
						"Low-light ski goggles for children with helmet compatibility.",
					lastUpdated: now,
					agentSummary:
						"Kids' ski goggles with an S1 orange lens optimized for low-light and overcast conditions — exactly when toddler ski lessons typically happen. The small-face fit prevents gaps, and dual-pane anti-fog keeps visibility clear during transitions between cold chairlifts and warm lodges.",
					useCaseTags: [
						"ski goggles",
						"kids goggles",
						"snow goggles",
						"toddler goggles",
					],
					highlights: [
						"S1 orange lens — ideal for flat light and lesson conditions",
						"Small-face fit prevents cold air gaps",
						"Helmet-compatible strap sits flat under any helmet",
					],
					bestFor:
						"Young children ages 2-6 who need goggles that fit and work in lesson conditions.",
				},
			],
		},
		{
			merchantName: "Snow Bunny Kids",
			merchantUrl: "https://snow-bunny-kids.example.com",
			fetchedAt: now,
			products: [
				{
					slug: "bunny-ears-ski-gloves",
					name: "Bunny Ears Insulated Ski Mittens",
					price: 24.99,
					currency: "USD",
					category: "gloves",
					inStock: true,
					stockCount: 30,
					specs: {
						Insulation: "100g Thinsulate",
						Waterproof: "Yes - insert",
						Sizes: "XS-M (ages 2-6)",
						Cuff: "Long gauntlet",
					},
					description:
						"Waterproof mittens for toddlers with long gauntlet cuff.",
					lastUpdated: now,
					agentSummary:
						"Toddler ski mittens with 100g Thinsulate insulation and a waterproof insert that keeps hands warm and dry all day. The long gauntlet cuff goes over jacket sleeves to seal out snow, and the mitten design is easier for small children than fingered gloves.",
					useCaseTags: [
						"ski mittens",
						"toddler gloves",
						"winter mittens",
						"snow gloves",
					],
					highlights: [
						"100g Thinsulate — warm to 0°F",
						"Long gauntlet cuff seals over jacket sleeves",
						"Mitten design is warmer and easier for toddlers than gloves",
					],
					bestFor:
						"Toddlers and young children ages 2-6 skiing or playing in snow.",
				},
				{
					slug: "cozy-cub-base-layer",
					name: "Cozy Cub Merino Base Layer Set",
					price: 39.99,
					currency: "USD",
					category: "base layers",
					inStock: true,
					stockCount: 18,
					specs: {
						Material: "80% merino wool, 20% nylon",
						Weight: "180 g/m²",
						Sizes: "2T-5T",
						"Odor resistant": "Natural merino",
					},
					description: "Merino wool base layer set for toddlers.",
					lastUpdated: now,
					agentSummary:
						"A two-piece merino wool base layer set (top and bottom) that regulates temperature naturally. Merino wicks moisture during active skiing and retains warmth when sitting on chairlifts. Won't get clammy like synthetic alternatives, and naturally resists odor over multi-day trips.",
					useCaseTags: [
						"base layer",
						"merino wool",
						"thermal underwear",
						"ski underlayer",
					],
					highlights: [
						"Merino wool regulates temperature in both active and rest phases",
						"Two-piece set: top and bottom included",
						"Naturally odor-resistant for multi-day trips",
					],
					bestFor:
						"Toddlers ages 2-5 who need a comfortable all-day layer under ski clothes.",
				},
				{
					slug: "yeti-steps-ski-socks",
					name: "Yeti Steps Ski Socks (2-Pack)",
					price: 18.99,
					currency: "USD",
					category: "socks",
					inStock: true,
					stockCount: 40,
					specs: {
						Material: "Merino blend",
						Cushion: "Shin and toe",
						Height: "Over-the-calf",
						Pack: "2 pairs",
					},
					description: "Over-the-calf ski socks for children, 2-pack.",
					lastUpdated: now,
					agentSummary:
						"Over-the-calf ski socks designed to fit properly inside ski boots without bunching. Targeted cushioning on the shin and toe protects against pressure points from boot contact. Two-pack so you always have a dry pair. Merino blend for warmth and moisture management.",
					useCaseTags: [
						"ski socks",
						"kids socks",
						"winter socks",
						"boot socks",
					],
					highlights: [
						"Over-the-calf height stays up inside ski boots",
						"Targeted shin and toe cushioning",
						"2-pack — always have a dry pair ready",
					],
					bestFor:
						"Children ages 2-8 wearing ski boots for lessons or full days.",
				},
			],
		},
	];
}
