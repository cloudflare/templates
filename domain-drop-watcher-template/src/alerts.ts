import type { ChannelRow, DomainRow, Env, AlertTransition } from "./types.js";
import { isWebhookAllowed, parseAllowlist } from "./webhooks.js";
import { getAlertFromAddress, getWebhookHostAllowlist } from "./env-config.js";
import { recordChannelDelivery } from "./db.js";

export interface AlertContext {
  env: Env;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface DispatchResult {
  channelId: string;
  ok: boolean;
  error?: string;
  statusCode?: number;
}

export function detectWebhookType(url: string): "webhook-teams" | "webhook-slack" | "webhook-discord" | "webhook-generic" {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "webhook-generic";
  }
  if (host === "webhook.office.com" || host.endsWith(".webhook.office.com")) return "webhook-teams";
  if (host === "hooks.slack.com" || host.endsWith(".slack.com")) return "webhook-slack";
  if (host === "discord.com" || host === "discordapp.com" || host.endsWith(".discord.com")) return "webhook-discord";
  return "webhook-generic";
}

function themeColor(transition: AlertTransition): string {
  const s = transition.newStatus;
  if (s === "dropping" || s === "available") return "e42e1b";
  if (s === "expiring") return "c0392b";
  return "e42e1b";
}

export function formatTeamsCard(domain: DomainRow, transition: AlertTransition): unknown {
  return {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    themeColor: themeColor(transition),
    summary: `Domain drop-watch: ${domain.fqdn}`,
    title: `Domain drop-watch: ${domain.fqdn}`,
    sections: [
      {
        facts: [
          { name: "Domain", value: domain.fqdn },
          { name: "Label", value: domain.label ?? "(none)" },
          { name: "Old status", value: transition.oldStatus ?? "(none)" },
          { name: "New status", value: transition.newStatus },
          { name: "Detected at", value: new Date(transition.detectedAt).toISOString() },
        ],
      },
    ],
  };
}

export function formatSlackBlocks(domain: DomainRow, transition: AlertTransition): unknown {
  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `Domain drop-watch: ${domain.fqdn}` },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Domain:*\n${domain.fqdn}` },
        { type: "mrkdwn", text: `*Label:*\n${domain.label ?? "(none)"}` },
        { type: "mrkdwn", text: `*Old status:*\n${transition.oldStatus ?? "(none)"}` },
        { type: "mrkdwn", text: `*New status:*\n${transition.newStatus}` },
        { type: "mrkdwn", text: `*Detected at:*\n${new Date(transition.detectedAt).toISOString()}` },
      ],
    },
  ];

  const rdap = (transition as AlertTransition & { rdap?: { source?: string } }).rdap;
  if (rdap?.source) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `RDAP source: ${rdap.source}` }],
    });
  }

  return { blocks };
}

export function formatDiscordEmbed(domain: DomainRow, transition: AlertTransition): unknown {
  return {
    embeds: [
      {
        color: 0xe42e1b,
        title: `Domain drop-watch: ${domain.fqdn}`,
        description: `Status transition detected for **${domain.fqdn}**`,
        fields: [
          { name: "Label", value: domain.label ?? "(none)", inline: true },
          { name: "Old status", value: transition.oldStatus ?? "(none)", inline: true },
          { name: "New status", value: transition.newStatus, inline: true },
        ],
        timestamp: new Date(transition.detectedAt).toISOString(),
      },
    ],
  };
}

export function formatGenericWebhook(domain: DomainRow, transition: AlertTransition): unknown {
  const rdap = (transition as AlertTransition & { rdap?: unknown }).rdap;
  return {
    fqdn: domain.fqdn,
    oldStatus: transition.oldStatus,
    newStatus: transition.newStatus,
    detectedAt: new Date(transition.detectedAt).toISOString(),
    label: domain.label,
    rdap: rdap ?? null,
  };
}

export function formatNativeEmail(
  domain: DomainRow,
  transition: AlertTransition,
  fromAddress: string,
  to: string,
): string {
  const subject = `[domain-drop-watcher] ${domain.fqdn} -> ${transition.newStatus}`;
  const detectedStr = new Date(transition.detectedAt).toISOString();
  const body = [
    `Domain: ${domain.fqdn}`,
    `Label: ${domain.label ?? "(none)"}`,
    `Old status: ${transition.oldStatus ?? "(none)"}`,
    `New status: ${transition.newStatus}`,
    `Detected at: ${detectedStr}`,
  ].join("\r\n");
  const msgId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@domain-drop-watcher>`;
  return [
    `From: ${fromAddress}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${msgId}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    body,
  ].join("\r\n");
}

function buildWebhookBody(
  type: "webhook-teams" | "webhook-slack" | "webhook-discord" | "webhook-generic",
  domain: DomainRow,
  transition: AlertTransition,
): unknown {
  if (type === "webhook-teams") return formatTeamsCard(domain, transition);
  if (type === "webhook-slack") return formatSlackBlocks(domain, transition);
  if (type === "webhook-discord") return formatDiscordEmbed(domain, transition);
  return formatGenericWebhook(domain, transition);
}

export async function dispatchAlert(
  domain: DomainRow,
  transition: AlertTransition,
  channels: ChannelRow[],
  ctx: AlertContext,
): Promise<DispatchResult[]> {
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const nowFn = ctx.now ?? (() => Date.now());

  const settled = await Promise.allSettled(
    channels.map(async (channel): Promise<DispatchResult> => {
      if (channel.disabled !== 0) {
        return { channelId: channel.id, ok: true, error: "disabled-skip" };
      }

      let result: DispatchResult;

      if (channel.type === "email") {
        const emailBinding = ctx.env.EMAIL;
        const fromAddress = await getAlertFromAddress(ctx.env, ctx.env.DB);
        if (!emailBinding || !fromAddress) {
          result = { channelId: channel.id, ok: false, error: "email-not-configured" };
        } else {
          const mime = formatNativeEmail(domain, transition, fromAddress, channel.target);
          try {
            await emailBinding.send(new Response(mime));
            result = { channelId: channel.id, ok: true };
          } catch (e) {
            result = { channelId: channel.id, ok: false, error: String(e) };
          }
        }
      } else {
        const allowlist = parseAllowlist(await getWebhookHostAllowlist(ctx.env, ctx.env.DB));
        const check = isWebhookAllowed(channel.target, allowlist);
        if (!check.allowed) {
          result = { channelId: channel.id, ok: false, error: `not-allowed:${check.reason ?? "unknown"}` };
        } else {
          const webhookType =
            channel.type === "webhook-teams" ||
            channel.type === "webhook-slack" ||
            channel.type === "webhook-discord" ||
            channel.type === "webhook-generic"
              ? channel.type
              : detectWebhookType(channel.target);
          const body = buildWebhookBody(webhookType, domain, transition);
          try {
            const resp = await fetchImpl(channel.target, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            result = { channelId: channel.id, ok: resp.ok, statusCode: resp.status };
            if (!resp.ok) result.error = `webhook-http-${resp.status}`;
          } catch (e) {
            result = { channelId: channel.id, ok: false, error: String(e) };
          }
        }
      }

      await recordChannelDelivery(
        ctx.env.DB,
        channel.id,
        result.ok ? "ok" : (result.error ?? "error"),
        nowFn(),
      );

      return result;
    }),
  );

  return settled.map((s) => {
    if (s.status === "fulfilled") return s.value;
    return { channelId: "unknown", ok: false, error: String(s.reason) };
  });
}
