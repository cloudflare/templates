import type { DomainRow, ChannelRow } from "./types.js";
import { computeBudget } from "./budget.js";

function parseDomainRow(raw: Record<string, unknown>): DomainRow {
  return {
    fqdn: raw["fqdn"] as string,
    added_at: raw["added_at"] as number,
    cadence_minutes: raw["cadence_minutes"] as number,
    phase_offset_minutes: raw["phase_offset_minutes"] as number,
    next_due_at: raw["next_due_at"] as number,
    paused: raw["paused"] as number,
    last_status: (raw["last_status"] as string | null) ?? null,
    last_status_changed_at: (raw["last_status_changed_at"] as number | null) ?? null,
    last_checked_at: (raw["last_checked_at"] as number | null) ?? null,
    pending_confirm_status: (raw["pending_confirm_status"] as string | null) ?? null,
    pending_confirm_count: (raw["pending_confirm_count"] as number | null) ?? 0,
    notify_on: raw["notify_on"] as string,
    label: (raw["label"] as string | null) ?? null,
    tld_supported: raw["tld_supported"] as number,
  };
}

function parseChannelRow(raw: Record<string, unknown>): ChannelRow {
  return {
    id: raw["id"] as string,
    type: raw["type"] as ChannelRow["type"],
    target: raw["target"] as string,
    label: (raw["label"] as string | null) ?? null,
    disabled: raw["disabled"] as number,
    last_delivery_result: (raw["last_delivery_result"] as string | null) ?? null,
    last_delivery_at: (raw["last_delivery_at"] as number | null) ?? null,
  };
}

export async function getDueDomains(
  db: D1Database,
  now: number,
  limit: number,
): Promise<DomainRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM domains WHERE next_due_at <= ? AND paused = 0 AND tld_supported = 1 ORDER BY next_due_at LIMIT ?`,
    )
    .bind(now, limit)
    .all<Record<string, unknown>>();
  return (result.results ?? []).map(parseDomainRow);
}

export async function recordCheckBatch(
  db: D1Database,
  updates: Array<{
    fqdn: string;
    checkedAt: number;
    nextDueAt: number;
    newStatus?: string;
    pendingConfirmStatus?: string | null;
    pendingConfirmCount?: number;
  }>,
): Promise<void> {
  if (updates.length === 0) return;
  const stmts = updates.map((u) =>
    db
      .prepare(
        `UPDATE domains SET last_checked_at = ?, next_due_at = ?,
          last_status = COALESCE(?, last_status),
          pending_confirm_status = ?,
          pending_confirm_count = ?
        WHERE fqdn = ?`,
      )
      .bind(
        u.checkedAt,
        u.nextDueAt,
        u.newStatus ?? null,
        u.pendingConfirmStatus ?? null,
        u.pendingConfirmCount ?? 0,
        u.fqdn,
      ),
  );
  await db.batch(stmts);
}

export async function listDomains(
  db: D1Database,
  opts?: { includePaused?: boolean },
): Promise<DomainRow[]> {
  const sql = opts?.includePaused
    ? `SELECT * FROM domains ORDER BY fqdn`
    : `SELECT * FROM domains WHERE paused = 0 ORDER BY fqdn`;
  const result = await db.prepare(sql).all<Record<string, unknown>>();
  return (result.results ?? []).map(parseDomainRow);
}

export async function getDomain(
  db: D1Database,
  fqdn: string,
): Promise<DomainRow | null> {
  const row = await db
    .prepare(`SELECT * FROM domains WHERE fqdn = ?`)
    .bind(fqdn)
    .first<Record<string, unknown>>();
  return row ? parseDomainRow(row) : null;
}

export async function deleteDomain(
  db: D1Database,
  fqdn: string,
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM domains WHERE fqdn = ?`)
    .bind(fqdn)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function updateDomain(
  db: D1Database,
  fqdn: string,
  patch: Partial<Pick<DomainRow, "cadence_minutes" | "paused" | "notify_on" | "label">>,
): Promise<DomainRow | null> {
  const sets: string[] = [];
  const binds: unknown[] = [];

  if (patch.cadence_minutes !== undefined) {
    sets.push("cadence_minutes = ?");
    binds.push(patch.cadence_minutes);
  }
  if (patch.paused !== undefined) {
    sets.push("paused = ?");
    binds.push(patch.paused);
  }
  if (patch.notify_on !== undefined) {
    sets.push("notify_on = ?");
    binds.push(patch.notify_on);
  }
  if (patch.label !== undefined) {
    sets.push("label = ?");
    binds.push(patch.label);
  }

  if (sets.length === 0) return getDomain(db, fqdn);

  binds.push(fqdn);
  await db
    .prepare(`UPDATE domains SET ${sets.join(", ")} WHERE fqdn = ?`)
    .bind(...binds)
    .run();

  return getDomain(db, fqdn);
}

export async function listChannels(db: D1Database): Promise<ChannelRow[]> {
  const result = await db
    .prepare(`SELECT * FROM channels ORDER BY id`)
    .all<Record<string, unknown>>();
  return (result.results ?? []).map(parseChannelRow);
}

export async function getChannel(
  db: D1Database,
  id: string,
): Promise<ChannelRow | null> {
  const row = await db
    .prepare(`SELECT * FROM channels WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();
  return row ? parseChannelRow(row) : null;
}

export async function createChannel(
  db: D1Database,
  ch: Omit<ChannelRow, "last_delivery_result" | "last_delivery_at">,
): Promise<ChannelRow> {
  await db
    .prepare(
      `INSERT INTO channels (id, type, target, label, disabled) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(ch.id, ch.type, ch.target, ch.label ?? null, ch.disabled)
    .run();
  const row = await getChannel(db, ch.id);
  if (!row) throw new Error(`createChannel: insert failed for id=${ch.id}`);
  return row;
}

export async function updateChannel(
  db: D1Database,
  id: string,
  patch: Partial<Pick<ChannelRow, "disabled" | "target" | "label">>,
): Promise<ChannelRow | null> {
  const sets: string[] = [];
  const binds: unknown[] = [];

  if (patch.disabled !== undefined) {
    sets.push("disabled = ?");
    binds.push(patch.disabled);
  }
  if (patch.target !== undefined) {
    sets.push("target = ?");
    binds.push(patch.target);
  }
  if (patch.label !== undefined) {
    sets.push("label = ?");
    binds.push(patch.label);
  }

  if (sets.length === 0) return getChannel(db, id);

  binds.push(id);
  await db
    .prepare(`UPDATE channels SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();

  return getChannel(db, id);
}

export async function deleteChannel(
  db: D1Database,
  id: string,
  force: boolean,
): Promise<{ deleted: boolean; referencingDomains?: string[] }> {
  if (!force) {
    const refs = await db
      .prepare(`SELECT fqdn FROM domain_channels WHERE channel_id = ?`)
      .bind(id)
      .all<{ fqdn: string }>();
    const domains = (refs.results ?? []).map((r) => r.fqdn);
    if (domains.length > 0) {
      return { deleted: false, referencingDomains: domains };
    }
  }
  const result = await db
    .prepare(`DELETE FROM channels WHERE id = ?`)
    .bind(id)
    .run();
  return { deleted: (result.meta?.changes ?? 0) > 0 };
}

export async function recordChannelDelivery(
  db: D1Database,
  id: string,
  result: string,
  at: number,
): Promise<void> {
  await db
    .prepare(`UPDATE channels SET last_delivery_result = ?, last_delivery_at = ? WHERE id = ?`)
    .bind(result, at, id)
    .run();
}

export async function linkChannel(
  db: D1Database,
  fqdn: string,
  channelId: string,
): Promise<void> {
  await db
    .prepare(`INSERT OR IGNORE INTO domain_channels (fqdn, channel_id) VALUES (?, ?)`)
    .bind(fqdn, channelId)
    .run();
}

export async function unlinkChannel(
  db: D1Database,
  fqdn: string,
  channelId: string,
): Promise<void> {
  await db
    .prepare(`DELETE FROM domain_channels WHERE fqdn = ? AND channel_id = ?`)
    .bind(fqdn, channelId)
    .run();
}

export async function getChannelsForDomain(
  db: D1Database,
  fqdn: string,
): Promise<ChannelRow[]> {
  const result = await db
    .prepare(
      `SELECT c.* FROM channels c
       JOIN domain_channels dc ON dc.channel_id = c.id
       WHERE dc.fqdn = ?
       ORDER BY c.id`,
    )
    .bind(fqdn)
    .all<Record<string, unknown>>();
  return (result.results ?? []).map(parseChannelRow);
}

export async function upsertDomainWithBudgetCheck(
  db: D1Database,
  row: Omit<
    DomainRow,
    | "last_status"
    | "last_status_changed_at"
    | "last_checked_at"
    | "pending_confirm_status"
    | "pending_confirm_count"
    | "added_at"
  >,
  subreqLimit: number,
): Promise<{ inserted: boolean; reason?: string }> {
  const lcmWindow = 1440;
  const result = await db
    .prepare(
      `INSERT INTO domains (fqdn, added_at, cadence_minutes, phase_offset_minutes, next_due_at, paused, notify_on, label, tld_supported)
      SELECT ?, unixepoch(), ?, ?, ?, ?, ?, ?, ?
      WHERE (
        WITH minutes(m) AS (SELECT 0 UNION ALL SELECT m+1 FROM minutes WHERE m < ?),
             proposed AS (
               SELECT cadence_minutes, phase_offset_minutes FROM domains WHERE paused=0
               UNION ALL SELECT ?, ?
             )
        SELECT COALESCE(MAX(cnt), 0) FROM (
          SELECT m, COUNT(*) AS cnt FROM minutes, proposed
          WHERE m % cadence_minutes = phase_offset_minutes
          GROUP BY m
        )
      ) <= ?`,
    )
    .bind(
      row.fqdn,
      row.cadence_minutes,
      row.phase_offset_minutes,
      row.next_due_at,
      row.paused,
      row.notify_on,
      row.label ?? null,
      row.tld_supported,
      lcmWindow - 1,
      row.cadence_minutes,
      row.phase_offset_minutes,
      subreqLimit,
    )
    .run();

  if ((result.meta?.changes ?? 0) === 0) {
    return { inserted: false, reason: "budget_exceeded" };
  }
  return { inserted: true };
}

export async function getConfig(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT v FROM config WHERE k = ?`)
    .bind(key)
    .first<{ v: string }>();
  return row?.v ?? null;
}

export async function setConfig(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(`INSERT INTO config (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`)
    .bind(key, value)
    .run();
}

export async function getAppConfig(
  db: D1Database,
  key: string,
): Promise<string | null> {
  if (!key.startsWith("app.")) throw new Error(`getAppConfig: key must start with app., got: ${key}`);
  return getConfig(db, key);
}

export async function setAppConfig(
  db: D1Database,
  key: string,
  value: string,
  updatedBy: string | null,
): Promise<void> {
  if (!key.startsWith("app.")) throw new Error(`setAppConfig: key must start with app., got: ${key}`);
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare(`INSERT INTO config (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`)
      .bind(key, value),
    db.prepare(`INSERT INTO config_meta (k, updated_at, updated_by) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .bind(key, now, updatedBy ?? null),
  ]);
}

export async function deleteAppConfig(
  db: D1Database,
  key: string,
): Promise<void> {
  if (!key.startsWith("app.")) throw new Error(`deleteAppConfig: key must start with app., got: ${key}`);
  await db.prepare(`DELETE FROM config WHERE k = ?`).bind(key).run();
}
