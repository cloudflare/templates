export interface Env {
  DB: D1Database;
  EVENTS: KVNamespace;
  BOOTSTRAP: KVNamespace;
  ADMIN_TOKEN?: string;
  SESSION_SECRET: string;
  WEBAUTHN_RP_ID?: string;
  EMAIL?: { send: (message: unknown) => Promise<void> };
  ALERT_FROM_ADDRESS?: string;
  WEBHOOK_HOST_ALLOWLIST?: string;
  VERSION?: string;
  DEMO_MODE?: string; // "1" enables read-only public landing + daily reset
  DEMO_ADMIN_EMAIL?: string; // when DEMO_MODE=1, only this email can request a code
  EMAIL_STUB?: string; // "1" skips real email send, writes code to KV instead
  RDAP_BASE_URL?: string; // override RDAP root for tests
  ASSETS?: { fetch: (req: Request) => Promise<Response> };
}

export interface DomainRow {
  fqdn: string;
  added_at: number;
  cadence_minutes: number;
  phase_offset_minutes: number;
  next_due_at: number;
  paused: number;
  last_status: string | null;
  last_status_changed_at: number | null;
  last_checked_at: number | null;
  pending_confirm_status: string | null;
  pending_confirm_count: number | null;
  notify_on: string;
  label: string | null;
  tld_supported: number;
}

export interface ChannelRow {
  id: string;
  type: ChannelType;
  target: string;
  label: string | null;
  disabled: number;
  last_delivery_result: string | null;
  last_delivery_at: number | null;
}

export type ChannelType =
  | "email"
  | "webhook-generic"
  | "webhook-teams"
  | "webhook-slack"
  | "webhook-discord";

export type RdapStatus =
  | "available"
  | "registered"
  | "dropping"
  | "expiring"
  | "indeterminate";

export interface AlertTransition {
  fqdn: string;
  oldStatus: RdapStatus | null;
  newStatus: RdapStatus;
  detectedAt: number;
  rdap?: { source?: string };
}

export interface BudgetReport {
  checksPerDay: number;
  peakDuePerMinute: number;
  peakBucketMinute: number;
  d1WritesPerDay: number;
  withinFreeTier: boolean;
  headroom: number;
  warnings: string[];
}
