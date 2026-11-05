export type InfoBudgetBindings = {
  AGENTEL_MAX_INFO_PER_TURN?: string;
};

export const MAX_AGENTEL_MODEL_TOOL_CALLS = 8;

// Pinned from the accepted RC3 preflight costRules, not a future price promise.
export const PINNED_INFO_COST_RULES = Object.freeze({
  chargeBasis: "ADMITTED_ATTEMPT",
  list_posts: Object.freeze({ upTo10: 1, upTo20: 2 }),
  list_missions: Object.freeze({
    browseUpTo10: 1,
    browseUpTo20: 2,
    queryUpTo10: 5,
    queryUpTo20: 10
  }),
  search_network: Object.freeze({ upTo10: 5, upTo20: 10 }),
  get_network_item: Object.freeze({ perPage: 1 }),
  get_participation_guide: Object.freeze({ static: 0, withTarget: 1 }),
  get_connection: 0
});

export type InfoBudgetSnapshot = {
  limitInfoUnits: number;
  reservedInfoUnits: number;
  costRulesChecked: boolean;
  blocked: boolean;
};

export type AgentelTurnSnapshot = {
  infoLimitUnits: number | null;
  reservedInfoUnits: number | null;
  paidReadAdmissions: number;
  mcpCallAttempts: number;
  pricingCheckCallAttempts: number;
  modelSelectedCallAttempts: number;
  successfulCallResults: number;
  businessErrorResults: number;
  unknownCallOutcomes: number;
  localBlockedCalls: {
    infoLimit: number;
    paidReadLimit: number;
    allToolLimit: number;
  };
  actualChargedInfoUnits: null;
  chargeObservation: "UNKNOWN";
};

/** Counts SDK dispatches and local reservations, never inferred server charges. */
export function createAgentelTurnMeter() {
  let infoLimitUnits: number | null = null;
  let reservedInfoUnits: number | null = null;
  let paidReadAdmissions = 0;
  let mcpCallAttempts = 0;
  let pricingCheckCallAttempts = 0;
  let modelSelectedCallAttempts = 0;
  let successfulCallResults = 0;
  let businessErrorResults = 0;
  const localBlockedCalls = { infoLimit: 0, paidReadLimit: 0, allToolLimit: 0 };
  return {
    observeBudget(value: InfoBudgetSnapshot) {
      infoLimitUnits = value.limitInfoUnits;
      reservedInfoUnits = value.reservedInfoUnits;
    },
    admitPaidRead() {
      paidReadAdmissions++;
    },
    block(reason: "infoLimit" | "paidReadLimit" | "allToolLimit") {
      localBlockedCalls[reason]++;
    },
    dispatch(source: "pricingCheck" | "modelSelected") {
      mcpCallAttempts++;
      if (source === "pricingCheck") pricingCheckCallAttempts++;
      else modelSelectedCallAttempts++;
      let settled = false;
      return (outcome: "success" | "businessError" | "unknown") => {
        if (settled) return;
        settled = true;
        if (outcome === "success") successfulCallResults++;
        else if (outcome === "businessError") businessErrorResults++;
      };
    },
    snapshot(): AgentelTurnSnapshot {
      return {
        infoLimitUnits,
        reservedInfoUnits,
        paidReadAdmissions,
        mcpCallAttempts,
        pricingCheckCallAttempts,
        modelSelectedCallAttempts,
        successfulCallResults,
        businessErrorResults,
        unknownCallOutcomes:
          mcpCallAttempts - successfulCallResults - businessErrorResults,
        localBlockedCalls: { ...localBlockedCalls },
        actualChargedInfoUnits: null,
        chargeObservation: "UNKNOWN"
      };
    }
  };
}

export type AgentelTurnMeter = ReturnType<typeof createAgentelTurnMeter>;

export function agentelInfoLimit(env: InfoBudgetBindings): number | undefined {
  const value = env.AGENTEL_MAX_INFO_PER_TURN;
  if (value === undefined) return undefined;
  if (!/^[1-9]\d{0,3}$/.test(value))
    throw new Error(
      "AGENTEL_MAX_INFO_PER_TURN must be an integer from 1 to 9999."
    );
  return Number(value);
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (object(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export function assertPinnedInfoCosts(raw: unknown): void {
  if (
    !object(raw) ||
    raw.isError === true ||
    !object(raw.structuredContent) ||
    raw.structuredContent.error != null ||
    !object(raw.structuredContent.costRules) ||
    stable(raw.structuredContent.costRules) !== stable(PINNED_INFO_COST_RULES)
  )
    throw new Error(
      "Agentel current INFO cost rules are unavailable or changed. No business read was sent."
    );
}

export function pinnedInfoCost(
  name: string,
  args: Record<string, unknown>
): number {
  if (name === "get_connection") return 0;
  if (name === "get_participation_guide")
    return args.target == null
      ? PINNED_INFO_COST_RULES.get_participation_guide.static
      : PINNED_INFO_COST_RULES.get_participation_guide.withTarget;
  if (name === "get_network_item")
    return PINNED_INFO_COST_RULES.get_network_item.perPage;
  const limit = args.limit ?? 10;
  if (!Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > 20)
    throw new Error(
      "Agentel INFO reservation requires a valid page limit from 1 to 20."
    );
  const large = Number(limit) > 10;
  if (name === "list_posts")
    return large
      ? PINNED_INFO_COST_RULES.list_posts.upTo20
      : PINNED_INFO_COST_RULES.list_posts.upTo10;
  if (name === "search_network")
    return large
      ? PINNED_INFO_COST_RULES.search_network.upTo20
      : PINNED_INFO_COST_RULES.search_network.upTo10;
  if (name === "list_missions") {
    if (args.query != null && typeof args.query !== "string")
      throw new Error(
        "Agentel INFO reservation requires a valid Mission query."
      );
    const query =
      typeof args.query === "string" && args.query.trim().length > 0;
    const rules = PINNED_INFO_COST_RULES.list_missions;
    return query
      ? large
        ? rules.queryUpTo20
        : rules.queryUpTo10
      : large
        ? rules.browseUpTo20
        : rules.browseUpTo10;
  }
  throw new Error("Unknown Agentel INFO reservation tool.");
}

function localInfoGuard(
  snapshot: InfoBudgetSnapshot,
  proposedInfoUnits: number | undefined,
  reason:
    | "INFO_PER_TURN_LIMIT"
    | "METERED_READ_ATTEMPT_LIMIT"
    | "ALL_TOOL_CALL_LIMIT" = "INFO_PER_TURN_LIMIT",
  toolCalls?: { modelToolAttempts: number; maxToolCalls: number }
) {
  const budget = Object.freeze({
    limitInfoUnits: snapshot.limitInfoUnits,
    reservedInfoUnits: snapshot.reservedInfoUnits,
    proposedInfoUnits
  });
  const structuredContent = Object.freeze({
    source: "LOCAL_GUARD",
    requestSent: false,
    reason,
    budget,
    ...(toolCalls ? { toolCalls: Object.freeze({ ...toolCalls }) } : {}),
    message:
      "This turn's local Agentel read budget is reached. Summarize existing results; further business reads require a new operator request. This is not a server response."
  });
  return Object.freeze({
    isError: false,
    content: Object.freeze([
      Object.freeze({ type: "text", text: JSON.stringify(structuredContent) })
    ]),
    structuredContent
  });
}

/** Must be used inside the existing per-turn serialized tool queue. */
export function createInfoBudget(limitInfoUnits: number) {
  if (
    !Number.isSafeInteger(limitInfoUnits) ||
    limitInfoUnits < 1 ||
    limitInfoUnits > 9999
  )
    throw new Error("Invalid local Agentel INFO budget.");
  let reservedInfoUnits = 0;
  let checked = false;
  let check: Promise<void> | undefined;
  let stoppedResult: ReturnType<typeof localInfoGuard> | undefined;
  let allToolStopResult: ReturnType<typeof localInfoGuard> | undefined;
  const snapshot = (): InfoBudgetSnapshot => ({
    limitInfoUnits,
    reservedInfoUnits,
    costRulesChecked: checked,
    blocked: stoppedResult !== undefined || allToolStopResult !== undefined
  });

  return {
    snapshot,
    stopForReadLimit() {
      stoppedResult ??= localInfoGuard(
        snapshot(),
        undefined,
        "METERED_READ_ATTEMPT_LIMIT"
      );
      return stoppedResult;
    },
    stopForAllToolLimit() {
      allToolStopResult ??= localInfoGuard(
        snapshot(),
        undefined,
        "ALL_TOOL_CALL_LIMIT",
        {
          modelToolAttempts: MAX_AGENTEL_MODEL_TOOL_CALLS,
          maxToolCalls: MAX_AGENTEL_MODEL_TOOL_CALLS
        }
      );
      return allToolStopResult;
    },
    async reserve(
      name: string,
      args: Record<string, unknown>,
      readConnection: () => Promise<unknown>,
      signal?: AbortSignal
    ) {
      if (signal?.aborted)
        throw new Error("Agentel INFO reservation stopped after cancellation.");
      if (allToolStopResult) return allToolStopResult;
      const cost = pinnedInfoCost(name, args);
      if (cost === 0) return undefined;
      if (stoppedResult) return stoppedResult;
      if (!check) {
        // Cache success and failure alike; a failed check is not replayed.
        check = (async () => {
          let raw: unknown;
          try {
            raw = await readConnection();
          } catch {
            throw new Error(
              "Agentel INFO cost check failed. No business read was sent."
            );
          }
          assertPinnedInfoCosts(raw);
          checked = true;
        })();
      }
      await check;
      if (signal?.aborted)
        throw new Error("Agentel INFO reservation stopped after cancellation.");
      if (stoppedResult) return stoppedResult;
      if (reservedInfoUnits + cost > limitInfoUnits) {
        stoppedResult = localInfoGuard(snapshot(), cost);
        return stoppedResult;
      }
      // Failed and unknown business outcomes keep their reservation.
      reservedInfoUnits += cost;
      return undefined;
    }
  };
}
