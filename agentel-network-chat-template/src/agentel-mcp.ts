import type { Agent } from "agents";
import { z } from "zod";
import { jsonSchema } from "ai";
import {
  agentelInfoLimit,
  createInfoBudget,
  MAX_AGENTEL_MODEL_TOOL_CALLS,
  type AgentelTurnMeter,
  type InfoBudgetBindings
} from "./info-budget.ts";

export const AGENTEL_MCP_URL = "https://agentel.tech/mcp";
export const AGENTEL_SERVER_ID = "agentel-network";
export const AGENTEL_TOOL_NAMES = [
  "get_connection",
  "list_posts",
  "search_network",
  "get_network_item",
  "get_participation_guide",
  "list_missions"
] as const;

type McpHost = { mcp: Agent["mcp"] };
export type ReaderBindings = InfoBudgetBindings & {
  AGENTEL_READER_KEY?: string;
  AGENTEL_MAX_PAID_READS_PER_TURN?: string;
};

export function agentelReadLimit(env: ReaderBindings): number {
  const value = env.AGENTEL_MAX_PAID_READS_PER_TURN;
  if (value === undefined) return 3;
  if (!/^(?:[1-9]|10)$/.test(value))
    throw new Error(
      "AGENTEL_MAX_PAID_READS_PER_TURN must be an integer from 1 to 10."
    );
  return Number(value);
}

function consumesReadBudget(name: string, args: Record<string, unknown>) {
  // These are the two current zero-INFO paths. A targeted guide is metered.
  return (
    name !== "get_connection" &&
    (name !== "get_participation_guide" || args.target != null)
  );
}

export function redactReader<T>(value: T, env: ReaderBindings): T {
  const key = env.AGENTEL_READER_KEY?.trim();
  if (!key) return value;
  const redact = (item: unknown): unknown => {
    if (typeof item === "string") return item.replaceAll(key, "[REDACTED]");
    if (Array.isArray(item)) return item.map(redact);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item).map(([name, content]) => [
          name.replaceAll(key, "[REDACTED]"),
          redact(content)
        ])
      );
    return item;
  };
  return redact(value) as T;
}

/** A native transport fetch, with an ephemeral server-side credential. */
export function createReaderFetch(
  env: ReaderBindings,
  outbound = fetch
): typeof fetch {
  const key = env.AGENTEL_READER_KEY?.trim();
  if (!key || !/^[\x21-\x7e]+$/.test(key))
    throw new Error("Configure AGENTEL_READER_KEY as a Worker secret.");
  return async (input, init) => {
    const request = new Request(input, init);
    if (request.url !== AGENTEL_MCP_URL)
      throw new Error("Agentel MCP endpoint is fixed.");
    let catalogRequest = false;
    if (request.method === "POST") {
      try {
        const rpc = await request.clone().json();
        if (Array.isArray(rpc))
          throw new Error("Batch requests are unsupported.");
        catalogRequest =
          rpc !== null &&
          typeof rpc === "object" &&
          "method" in rpc &&
          rpc.method === "tools/list";
      } catch {
        throw new Error("Invalid Agentel MCP request body.");
      }
    }
    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${key}`);
    const response = await outbound(
      new Request(request, {
        headers,
        // workerd supports manual, not the browser/Node "error" mode.
        // Non-2xx responses below never expose a redirect Location.
        redirect: "manual",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)])
      })
    );
    // Never expose upstream error bodies, auth-discovery links or echoed keys.
    if (!response.ok)
      return new Response("Agentel MCP request failed.", {
        status: response.status
      });
    if (response.status === 202 || response.status === 204)
      return new Response(null, { status: response.status });
    // Agentel's current stateless endpoint returns JSON. Fail closed on SSE or
    // an unknown content type rather than forward uninspected credentials.
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new Error("Unsupported Agentel MCP response type.");
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error("Invalid Agentel MCP JSON response.");
    }
    // The locked SDK resets output validators on each tools/list page.
    // Agentel's six definitions currently fit on one page. Business result
    // pagination is unaffected by this compatibility guard.
    if (catalogRequest && Array.isArray(body))
      throw new Error("Batch Agentel tool catalogs need compatibility review.");
    if (
      catalogRequest &&
      body &&
      typeof body === "object" &&
      "result" in body
    ) {
      const result = body.result;
      if (
        result &&
        typeof result === "object" &&
        "nextCursor" in result &&
        result.nextCursor
      )
        throw new Error(
          "Paginated Agentel tool catalogs need compatibility review."
        );
    }
    const safe = JSON.stringify(redactReader(body, env));
    const resultHeaders = new Headers(response.headers);
    for (const [name, value] of resultHeaders) {
      if (value.includes(key) || name.includes(key.toLowerCase()))
        throw new Error("Unsafe Agentel MCP response headers.");
    }
    resultHeaders.delete("content-length");
    resultHeaders.delete("content-encoding");
    return new Response(safe, {
      status: response.status,
      headers: resultHeaders
    });
  };
}

/** Rebuild the reserved native client. No bearer value is serialized to SQLite. */
export async function connectAgentelMcp(host: McpHost, env: ReaderBindings) {
  const transportFetch = createReaderFetch(env);
  await host.mcp.removeServer(AGENTEL_SERVER_ID);
  await host.mcp.registerServer(AGENTEL_SERVER_ID, {
    name: "Agentel Network",
    url: AGENTEL_MCP_URL,
    transport: { type: "streamable-http", fetch: transportFetch },
    retry: { maxAttempts: 1 }
  });
  try {
    const result = await host.mcp.connectToServer(AGENTEL_SERVER_ID);
    if (result.state !== "connected")
      throw new Error("Connection unavailable.");
    const discovered = await host.mcp.discoverIfConnected(AGENTEL_SERVER_ID);
    if (!discovered?.success) throw new Error("Discovery unavailable.");
    const available = host.mcp.listTools({ serverId: AGENTEL_SERVER_ID });
    if (
      !AGENTEL_TOOL_NAMES.every((name) =>
        available.some(
          (tool) =>
            tool.name === name &&
            tool.annotations?.readOnlyHint === true &&
            tool.outputSchema
        )
      )
    ) {
      throw new Error("Required read-only tools unavailable.");
    }
    return {
      state: "ready",
      readOnly: true,
      toolNames: [...AGENTEL_TOOL_NAMES]
    };
  } catch {
    await host.mcp.removeServer(AGENTEL_SERVER_ID);
    throw new Error(
      "Agentel MCP connection failed. Check the Reader key, scope and service availability."
    );
  }
}

export function isAgentelTool(
  name: string
): name is (typeof AGENTEL_TOOL_NAMES)[number] {
  return (AGENTEL_TOOL_NAMES as readonly string[]).includes(name);
}

function validateAgentelArguments(
  host: McpHost,
  name: string,
  args: Record<string, unknown>
) {
  if (!isAgentelTool(name))
    throw new Error("Only the six Agentel read tools are allowed.");
  const definition = host.mcp
    .listTools({ serverId: AGENTEL_SERVER_ID })
    .find((t) => t.name === name);
  if (
    !definition?.inputSchema ||
    !definition.outputSchema ||
    definition.annotations?.readOnlyHint !== true ||
    !args ||
    typeof args !== "object" ||
    Array.isArray(args)
  )
    throw new Error("Invalid Agentel read arguments.");
  try {
    if (
      !z
        .fromJSONSchema(
          definition.inputSchema as Parameters<typeof z.fromJSONSchema>[0]
        )
        .safeParse(args).success
    )
      throw new Error("Invalid arguments.");
  } catch {
    throw new Error("Invalid Agentel read arguments.");
  }
}

export async function callAgentelTool(
  host: McpHost,
  env: ReaderBindings,
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
  onDispatch?: () => (outcome: "success" | "businessError" | "unknown") => void
) {
  if (signal?.aborted)
    throw new Error(
      "Agentel MCP read stopped after cancellation. No read was sent."
    );
  validateAgentelArguments(host, name, args);
  let finishDispatch: ReturnType<NonNullable<typeof onDispatch>> | undefined;
  try {
    // After argument validation; this counts SDK calls, not server admissions.
    finishDispatch = onDispatch?.();
    const result = await host.mcp.callTool(
      { serverId: AGENTEL_SERVER_ID, name, arguments: args },
      undefined,
      { timeout: 15000, ...(signal ? { signal } : {}) }
    );
    finishDispatch?.(
      result.isError ||
        (result.structuredContent &&
          typeof result.structuredContent === "object" &&
          "error" in result.structuredContent &&
          result.structuredContent.error != null)
        ? "businessError"
        : "success"
    );
    if (signal?.aborted)
      throw new Error("Agentel MCP read stopped after cancellation.");
    return redactReader(result, env);
  } catch {
    finishDispatch?.("unknown");
    throw new Error(
      "Agentel MCP read failed; stop and inspect the connection. No business-call retry was made."
    );
  }
}

export function agentelAiTools(
  host: McpHost,
  env: ReaderBindings,
  onFailure: () => void = () => {},
  signal?: AbortSignal,
  meter?: AgentelTurnMeter
) {
  const readLimit = agentelReadLimit(env);
  const infoLimit = agentelInfoLimit(env);
  const infoBudget =
    infoLimit === undefined ? undefined : createInfoBudget(infoLimit);
  if (infoBudget) meter?.observeBudget(infoBudget.snapshot());
  let paidReadAttempts = 0;
  let modelToolAttempts = 0;
  let failed = false;
  let queue: Promise<unknown> = Promise.resolve();
  const checkAbort = () => {
    if (signal?.aborted)
      throw new Error(
        "Agentel reads are stopped for this turn after cancellation."
      );
  };
  // agents 0.17.4 getAITools converts outputSchema to Zod and skips the
  // current Agentel catalog's unsupported `not` rules. Preserve JSON schemas
  // for model inputs; the native MCP client still validates complete outputs.
  const tools = host.mcp
    .listTools({ serverId: AGENTEL_SERVER_ID })
    .filter(
      (t) =>
        isAgentelTool(t.name) &&
        t.annotations?.readOnlyHint === true &&
        t.outputSchema
    );
  return Object.fromEntries(
    tools.map((definition) => [
      `tool_${definition.serverId.replace(/-/g, "")}_${definition.name}`,
      {
        description: definition.description,
        title: definition.title ?? definition.annotations?.title,
        inputSchema: jsonSchema<Record<string, unknown>>(
          definition.inputSchema as Parameters<typeof jsonSchema>[0]
        ),
        execute: (args: Record<string, unknown>) => {
          // Serialize this turn's reads, including parallel model tool calls.
          // A failed or unknown result must stop any queued paid reads.
          const pending = queue.then(async () => {
            if (failed)
              throw new Error(
                "Agentel reads are stopped for this turn after an error."
              );
            try {
              checkAbort();
              if (
                infoBudget &&
                modelToolAttempts >= MAX_AGENTEL_MODEL_TOOL_CALLS
              ) {
                meter?.block("allToolLimit");
                return infoBudget.stopForAllToolLimit();
              }
              const toolName = definition.name;
              // Invalid input must not reserve INFO or dispatch a tariff check.
              validateAgentelArguments(host, toolName, args);
              if (consumesReadBudget(toolName, args)) {
                if (paidReadAttempts >= readLimit) {
                  meter?.block("paidReadLimit");
                  if (infoBudget) return infoBudget.stopForReadLimit();
                  throw new Error(
                    "Agentel paid-read limit reached for this turn. Stop; start a new request only if the operator chooses."
                  );
                }
                if (infoBudget) {
                  const localGuard = await infoBudget.reserve(
                    toolName,
                    args,
                    () => {
                      checkAbort();
                      return callAgentelTool(
                        host,
                        env,
                        "get_connection",
                        {},
                        signal,
                        meter ? () => meter.dispatch("pricingCheck") : undefined
                      );
                    },
                    signal
                  );
                  meter?.observeBudget(infoBudget.snapshot());
                  checkAbort();
                  if (localGuard) {
                    meter?.block("infoLimit");
                    return localGuard;
                  }
                }
                // Reserve before sending, including failed/unknown attempts.
                paidReadAttempts++;
                meter?.admitPaidRead();
              }
              checkAbort();
              if (infoBudget) modelToolAttempts++;
              const result = await callAgentelTool(
                host,
                env,
                toolName,
                args,
                signal,
                meter ? () => meter.dispatch("modelSelected") : undefined
              );
              checkAbort();
              if (
                result.isError ||
                (result.structuredContent &&
                  typeof result.structuredContent === "object" &&
                  "error" in result.structuredContent &&
                  result.structuredContent.error != null)
              )
                throw new Error(
                  "Agentel returned a business error. Stop; do not retry automatically."
                );
              return result;
            } catch (error) {
              failed = true;
              onFailure();
              throw error;
            }
          });
          queue = pending.catch(() => undefined);
          return pending;
        }
      }
    ])
  );
}
