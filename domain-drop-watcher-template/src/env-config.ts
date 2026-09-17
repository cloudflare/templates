import type { Env } from "./types.js";
import { getAppConfig } from "./db.js";

function readEnvString(env: Env, key: "ALERT_FROM_ADDRESS" | "WEBHOOK_HOST_ALLOWLIST"): string | undefined {
  const value = key === "ALERT_FROM_ADDRESS" ? env.ALERT_FROM_ADDRESS : env.WEBHOOK_HOST_ALLOWLIST;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function readConfigString(db: D1Database, key: string): Promise<string | undefined> {
  const val = await getAppConfig(db, key);
  return val && val.length > 0 ? val : undefined;
}

export async function getAlertFromAddress(env: Env, db: D1Database): Promise<string | undefined> {
  const dbVal = await readConfigString(db, "app.alert_from_address");
  if (dbVal) return dbVal;
  return readEnvString(env, "ALERT_FROM_ADDRESS");
}

export async function getWebhookHostAllowlist(env: Env, db: D1Database): Promise<string | undefined> {
  const dbVal = await readConfigString(db, "app.webhook_host_allowlist");
  if (dbVal) return dbVal;
  return readEnvString(env, "WEBHOOK_HOST_ALLOWLIST");
}
