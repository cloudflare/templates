import "@shopify/shopify-api/adapters/cf-worker";
import { shopifyApi, ApiVersion } from "@shopify/shopify-api";
import { KVSessionStorage } from "@shopify/shopify-app-session-storage-kv";
import type { Env } from "./types/env";

export const createShopify = (env: Env) =>
	shopifyApi({
		apiKey: env.SHOPIFY_CLIENT_ID,
		apiSecretKey: env.SHOPIFY_API_SECRET,
		scopes: ["read_products", "read_orders"],
		hostName: env.HOST,
		apiVersion: ApiVersion.April26,
		isEmbeddedApp: true,
	});

export const createSessionStorage = (env: Env) =>
	new KVSessionStorage(env.SESSION_KV);
