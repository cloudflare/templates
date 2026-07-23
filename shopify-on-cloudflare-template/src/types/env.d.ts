export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SESSION_KV: KVNamespace;
  R2: R2Bucket;
  ENVIRONMENT?: string;
  SHOPIFY_CLIENT_ID: string;
  SHOPIFY_API_SECRET: string;
  HOST: string;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { shopId: string };
};
