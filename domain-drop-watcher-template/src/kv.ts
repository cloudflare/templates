export interface EventEntry {
  ts: number;
  kind: string;
  fqdn?: string;
  data?: unknown;
}

const RING_KEY = "events:ring";
const DEFAULT_MAX_RING = 200;

export async function appendEvent(
  events: KVNamespace,
  entry: EventEntry,
  maxRing: number = DEFAULT_MAX_RING,
): Promise<void> {
  const raw = await events.get(RING_KEY, "text");
  let ring: EventEntry[] = [];
  if (raw) {
    try {
      ring = JSON.parse(raw) as EventEntry[];
    } catch {
      ring = [];
    }
  }
  ring.push(entry);
  if (ring.length > maxRing) {
    ring = ring.slice(ring.length - maxRing);
  }
  await events.put(RING_KEY, JSON.stringify(ring));
}

export async function listEvents(
  events: KVNamespace,
  opts?: { fqdn?: string; limit?: number },
): Promise<EventEntry[]> {
  const raw = await events.get(RING_KEY, "text");
  if (!raw) return [];
  let ring: EventEntry[] = [];
  try {
    ring = JSON.parse(raw) as EventEntry[];
  } catch {
    return [];
  }
  if (opts?.fqdn) {
    ring = ring.filter((e) => e.fqdn === opts.fqdn);
  }
  const limit = opts?.limit ?? ring.length;
  return ring.slice(-limit);
}

export async function getBootstrap(bootstrap: KVNamespace): Promise<unknown | null> {
  const raw = await bootstrap.get("bootstrap:iana-rdap-dns", "text");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function setBootstrap(
  bootstrap: KVNamespace,
  data: unknown,
  ttlSeconds: number = 86400,
): Promise<void> {
  await bootstrap.put("bootstrap:iana-rdap-dns", JSON.stringify(data), {
    expirationTtl: ttlSeconds,
  });
}

export async function markAlertSeen(
  events: KVNamespace,
  fqdn: string,
  status: string,
  ttlSeconds: number = 86400,
): Promise<boolean> {
  const key = `seen:${fqdn}:${status}`;
  const existing = await events.get(key, "text");
  if (existing !== null) return false;
  await events.put(key, "1", { expirationTtl: ttlSeconds });
  return true;
}
