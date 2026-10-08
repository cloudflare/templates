import type { Env } from "./types.js";
import { handleAdmin } from "./admin.js";
import { runScheduledTick } from "./tick.js";

export { runScheduledTick } from "./tick.js";

export async function runDemoReset(db: D1Database): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare("DELETE FROM domain_channels"),
    db.prepare("DELETE FROM domains"),
    db.prepare("DELETE FROM channels"),
    db.prepare("DELETE FROM auth_events WHERE event_type != 'demo_reset'"),
    db.prepare("INSERT INTO auth_events (ts, event_type, metadata) VALUES (?, 'demo_reset', '{}')").bind(now),
    db.prepare("INSERT OR REPLACE INTO config (k, v) VALUES ('last_demo_reset', ?)").bind(String(now)),
  ]);
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleAdmin(req, env, ctx);
    } catch (err) {
      console.error(err);
      return new Response(
        JSON.stringify({ error: "internal" }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
  },

  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    // Daily demo reset at 04:00 UTC. Fires once per day max, idempotent across restarts.
    // This runs in the cron handler only — not in runScheduledTick — so test endpoints
    // don't trigger demo data wipes.
    const now = Math.floor(Date.now() / 1000);
    if (env.DEMO_MODE === "1" && new Date(now * 1000).getUTCHours() === 4) {
      const lastResetRow = await env.DB
        .prepare("SELECT v FROM config WHERE k = 'last_demo_reset'")
        .first<{ v: string }>();
      const lastReset = Number(lastResetRow?.v ?? 0);
      if (now - lastReset > 23 * 3600) {
        ctx.waitUntil(runDemoReset(env.DB));
      }
    }

    await runScheduledTick(env);
  },
};
