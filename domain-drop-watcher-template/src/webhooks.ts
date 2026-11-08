export interface AllowlistResult {
  allowed: boolean;
  reason?: string;
  normalizedHost?: string;
}

// single-label wildcard only — Workers edge-resolves DNS, user code cannot see resolved IPs, so we allowlist by hostname shape rather than IP range.
export function isWebhookAllowed(url: string, allowlist: string[]): AllowlistResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: "invalid-url" };
  }

  if (parsed.protocol !== "https:") {
    return { allowed: false, reason: "non-https" };
  }

  const rawHost = parsed.hostname;

  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(rawHost)) {
    return { allowed: false, reason: "literal-ipv4" };
  }
  if (rawHost.startsWith("[")) {
    return { allowed: false, reason: "literal-ipv6" };
  }

  const normalizedHost = rawHost.toLowerCase().replace(/\.$/, "");

  for (const pattern of allowlist) {
    const trimmed = pattern.trim().toLowerCase().replace(/\.$/, "");
    if (trimmed === "") continue;

    if (!trimmed.includes("*")) {
      if (normalizedHost === trimmed) {
        return { allowed: true, normalizedHost };
      }
    } else {
      const starIdx = trimmed.indexOf("*");
      const prefix = trimmed.slice(0, starIdx);
      const suffix = trimmed.slice(starIdx + 1);

      if (prefix !== "" && prefix !== ".") continue;

      const afterStar = suffix.startsWith(".") ? suffix.slice(1) : suffix;

      if (normalizedHost === afterStar) continue;

      if (normalizedHost.endsWith("." + afterStar)) {
        const labelPart = normalizedHost.slice(0, normalizedHost.length - afterStar.length - 1);
        if (!labelPart.includes(".")) {
          return { allowed: true, normalizedHost };
        }
      }
    }
  }

  return { allowed: false, reason: "not-allowed" };
}

export const DEFAULT_WEBHOOK_HOST_ALLOWLIST =
  "*.webhook.office.com,hooks.slack.com,discord.com,discordapp.com";

export function parseAllowlist(csv: string | undefined): string[] {
  const trimmed = (csv ?? "").trim();
  const source = trimmed === "" ? DEFAULT_WEBHOOK_HOST_ALLOWLIST : trimmed;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of source.split(",")) {
    const trimmed = entry.trim();
    if (trimmed !== "" && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}
