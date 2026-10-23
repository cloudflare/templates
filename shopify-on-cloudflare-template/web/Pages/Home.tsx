import { useAppBridge } from "@shopify/app-bridge-react";
import { useQuery } from "@tanstack/react-query";
import {
	Avatar,
	Badge,
	Banner,
	Card,
	DescriptionList,
	HorizontalStack,
	Layout,
	Link,
	Page,
	Spinner,
	Text,
	VerticalStack,
} from "@shopify/polaris";
import { apiFetch, createAuthenticatedFetch } from "../api";

const REPO_URL = "https://github.com/devkindhq/shopify-on-cloudflare";
const DEVKIND_URL = "https://devkind.com.au";

type ShopProfile = {
	name: string | null;
	domain: string | null;
	myshopifyDomain: string | null;
	plan: string | null;
	owner: string | null;
	email: string | null;
	country: string | null;
	currency: string | null;
	installedAt: string | null;
	status: "installed" | "uninstalled" | null;
};

type ExampleResponse = { shop: ShopProfile };

const show = (v: string | null | undefined) => (v && v.trim() ? v : "Not set");

const asDate = (iso: string | null) => {
	if (!iso) return "Not set";
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
};

const initials = (name: string) =>
	name
		.replace(/^https?:\/\//, "")
		.slice(0, 2)
		.toUpperCase();

export default function Home() {
	const shopify = useAppBridge();
	const fetcher = createAuthenticatedFetch(shopify);

	const { data, isLoading, error } = useQuery<ExampleResponse, Error>({
		queryKey: ["shop"],
		queryFn: () => apiFetch<ExampleResponse>(fetcher, "/api/example"),
	});

	const shop = data?.shop;
	const storeName = show(shop?.name ?? shop?.myshopifyDomain);

	return (
		<Page title="Shopify on Cloudflare">
			<Layout>
				<Layout.Section>
					<Card sectioned>
						{isLoading && (
							<HorizontalStack align="center">
								<Spinner accessibilityLabel="Loading store" size="small" />
							</HorizontalStack>
						)}

						{error && (
							<Banner status="critical">
								{error instanceof Error
									? error.message
									: "Could not load your store"}
							</Banner>
						)}

						{shop && (
							<VerticalStack gap="4">
								<HorizontalStack
									align="space-between"
									blockAlign="center"
									wrap={false}
								>
									<HorizontalStack gap="3" blockAlign="center" wrap={false}>
										<Avatar name={storeName} initials={initials(storeName)} />
										<VerticalStack gap="0">
											<Text as="h2" variant="headingMd">
												{storeName}
											</Text>
											<Text as="p" variant="bodySm" color="subdued">
												{show(shop.myshopifyDomain)}
											</Text>
										</VerticalStack>
									</HorizontalStack>
									<Badge
										status={
											shop.status === "installed" ? "success" : "attention"
										}
									>
										{shop.status === "installed" ? "Installed" : "Uninstalled"}
									</Badge>
								</HorizontalStack>

								<DescriptionList
									items={[
										{ term: "Plan", description: show(shop.plan) },
										{ term: "Owner", description: show(shop.owner) },
										{ term: "Email", description: show(shop.email) },
										{ term: "Country", description: show(shop.country) },
										{ term: "Currency", description: show(shop.currency) },
										{ term: "Primary domain", description: show(shop.domain) },
										{
											term: "Installed",
											description: asDate(shop.installedAt),
										},
									]}
								/>
							</VerticalStack>
						)}
					</Card>
				</Layout.Section>

				<Layout.Section>
					<Card sectioned>
						<VerticalStack gap="2">
							<Text as="h3" variant="headingSm">
								Built by Devkind
							</Text>
							<Text as="p" variant="bodyMd" color="subdued">
								An open-source Shopify embedded-app starter for Cloudflare
								Workers.
							</Text>
							<HorizontalStack gap="5">
								<Link url={DEVKIND_URL} external>
									devkind.com.au
								</Link>
								<Link url={REPO_URL} external>
									View source on GitHub
								</Link>
							</HorizontalStack>
						</VerticalStack>
					</Card>
				</Layout.Section>
			</Layout>
		</Page>
	);
}
