/**
 * Sample content so the template works the moment it's deployed — no data
 * source to configure. Replace `SAMPLE_RESOURCES` with your own pages, or
 * POST raw HTML/Markdown to `/api/resources` to enrich your real content.
 *
 * Each entry is intentionally a little messy (headings, lists, prose) so the
 * Workers AI enrichment pass has something realistic to summarize.
 */
import type { RawResource } from "./types";

export const SAMPLE_RESOURCES: RawResource[] = [
	{
		slug: "getting-started",
		url: "https://example.com/docs/getting-started",
		title: "Getting Started with Acme",
		body: `# Getting Started with Acme

Acme is a workflow automation platform. This guide walks you through creating
your first workflow in under five minutes.

## Install the CLI
Run \`npm install -g @acme/cli\` and authenticate with \`acme login\`. The CLI
stores a token in ~/.acme/config.

## Create a workflow
Workflows are YAML files. A minimal workflow has a trigger and one step:

- triggers: schedule, webhook, or manual
- steps: run a script, call an HTTP endpoint, or branch on a condition

Deploy with \`acme deploy workflow.yaml\`. Free accounts can run up to 1,000
workflow executions per month.`,
	},
	{
		slug: "pricing",
		url: "https://example.com/pricing",
		title: "Pricing",
		body: `# Pricing

Acme has three plans.

Free — $0/month. 1,000 executions, community support, 1 project.
Pro — $20/month. 50,000 executions, email support, unlimited projects, and
audit logs.
Enterprise — custom pricing. SSO, SLA, dedicated support, and on-prem options.

All plans include the visual workflow editor and the CLI. Annual billing saves
20%. There is no charge for failed executions.`,
	},
	{
		slug: "integrations",
		url: "https://example.com/docs/integrations",
		title: "Integrations",
		body: `# Integrations

Acme connects to the tools you already use. Built-in integrations include
Slack, GitHub, Stripe, Salesforce, and Google Sheets. Each integration is
configured once under Settings → Integrations and can then be referenced from
any workflow step.

For anything without a built-in connector, use the generic HTTP step to call
any REST API, or the Webhook trigger to start a workflow from an external
event. OAuth credentials are encrypted at rest.`,
	},
	{
		slug: "security",
		url: "https://example.com/security",
		title: "Security & Compliance",
		body: `# Security & Compliance

Acme is SOC 2 Type II certified and GDPR compliant. All data is encrypted in
transit (TLS 1.3) and at rest (AES-256). Secrets used in workflows are stored
in an isolated vault and never logged.

Enterprise customers can enable SAML single sign-on, scoped API tokens, and IP
allowlisting. We undergo annual third-party penetration testing and publish a
status page at status.example.com.`,
	},
	{
		slug: "faq",
		url: "https://example.com/faq",
		title: "Frequently Asked Questions",
		body: `# FAQ

Can I self-host Acme? Yes — Enterprise plans include an on-prem deployment
option packaged as a container.

Do you have an API? Yes, everything in the dashboard is available through the
REST API and the CLI.

What languages do workflow scripts support? JavaScript and Python today.

How do I cancel? From Settings → Billing. Cancellation takes effect at the end
of the current billing period; we don't offer prorated refunds.`,
	},
];
