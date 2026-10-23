import test from "node:test";
import assert from "node:assert/strict";
import {
  agentelInfoLimit,
  assertPinnedInfoCosts,
  createInfoBudget,
  pinnedInfoCost,
  PINNED_INFO_COST_RULES
} from "../src/info-budget.ts";
import {
  agentelAiTools,
  AGENTEL_SERVER_ID,
  AGENTEL_TOOL_NAMES
} from "../src/agentel-mcp.ts";

const clone = (value) => JSON.parse(JSON.stringify(value));
const connection = () => ({
  content: [],
  structuredContent: { costRules: clone(PINNED_INFO_COST_RULES) }
});
const catalog = AGENTEL_TOOL_NAMES.map((name) => ({
  name,
  serverId: AGENTEL_SERVER_ID,
  annotations: { readOnlyHint: true },
  inputSchema: { type: "object", additionalProperties: true },
  outputSchema: { type: "object" }
}));
function fixture(overrides = {}) {
  const calls = [];
  let stopped = 0;
  const host = {
    mcp: {
      listTools: () => catalog,
      callTool: async (request, _schema, options) => {
        calls.push({ name: request.name, args: request.arguments });
        if (request.name === "get_connection")
          return overrides.connection
            ? overrides.connection(options)
            : connection();
        return overrides.business
          ? overrides.business(request, options)
          : { content: [], structuredContent: { items: [] } };
      }
    }
  };
  const tools = agentelAiTools(
    host,
    {
      AGENTEL_READER_KEY: "synthetic-info-reader",
      AGENTEL_MAX_INFO_PER_TURN: "7",
      ...overrides.env
    },
    () => stopped++,
    overrides.signal
  );
  return { calls, tools, stopped: () => stopped };
}
const read = (fixture, name, args = {}) =>
  fixture.tools[`tool_agentelnetwork_${name}`].execute(args);

test("INFO cap is optional and validates strict positive integers", () => {
  assert.equal(agentelInfoLimit({}), undefined);
  for (const value of ["1", "7", "30", "9999"])
    assert.equal(
      agentelInfoLimit({ AGENTEL_MAX_INFO_PER_TURN: value }),
      Number(value)
    );
  for (const value of ["", "0", "07", "7.0", "-1", " 7", "10000", "unlimited"])
    assert.throws(
      () => agentelInfoLimit({ AGENTEL_MAX_INFO_PER_TURN: value }),
      /integer from 1 to 9999/
    );
});

test("pinned admitted-attempt costs cover all current tool and page paths", () => {
  const examples = [
    ["get_connection", {}, 0],
    ["get_participation_guide", {}, 0],
    ["get_participation_guide", { target: {} }, 1],
    ["get_network_item", {}, 1],
    ["list_posts", {}, 1],
    ["list_posts", { limit: 20 }, 2],
    ["search_network", { limit: 10 }, 5],
    ["search_network", { limit: 11 }, 10],
    ["list_missions", {}, 1],
    ["list_missions", { limit: 20 }, 2],
    ["list_missions", { query: " ", limit: 20 }, 2],
    ["list_missions", { query: "skill" }, 5],
    ["list_missions", { query: "skill", limit: 20 }, 10]
  ];
  for (const [name, args, cost] of examples)
    assert.equal(pinnedInfoCost(name, args), cost);
  for (const limit of [0, 21, 1.5, "20"])
    assert.throws(
      () => pinnedInfoCost("search_network", { limit }),
      /valid page limit/
    );
  assert.throws(
    () => pinnedInfoCost("list_missions", { query: 10 }),
    /valid Mission query/
  );
});

test("cost comparison ignores property order and rejects changed or extra rules", () => {
  const rules = clone(PINNED_INFO_COST_RULES);
  const reordered = Object.fromEntries(Object.entries(rules).reverse());
  assert.doesNotThrow(() =>
    assertPinnedInfoCosts({ structuredContent: { costRules: reordered } })
  );
  for (const mutate of [
    (value) => {
      value.search_network.upTo10 = 6;
    },
    (value) => {
      value.chargeBasis = "SUCCESS_ONLY";
    },
    (value) => {
      value.new_tool = 1;
    },
    (value) => {
      value.list_missions.extra = 1;
    },
    (value) => {
      delete value.get_connection;
    }
  ]) {
    const changed = clone(rules);
    mutate(changed);
    assert.throws(
      () =>
        assertPinnedInfoCosts({ structuredContent: { costRules: changed } }),
      /unavailable or changed/
    );
  }
  for (const value of [
    null,
    {},
    { content: [{ type: "text", text: JSON.stringify(rules) }] },
    { isError: true, structuredContent: { costRules: rules } },
    { structuredContent: { error: {}, costRules: rules } }
  ])
    assert.throws(() => assertPinnedInfoCosts(value), /unavailable or changed/);
});

test("7 INFO reserves one search and two details then returns immutable local guard", async () => {
  const budget = createInfoBudget(7);
  let checks = 0;
  const check = async () => {
    checks++;
    return connection();
  };
  await budget.reserve("search_network", { query: "first" }, check);
  await budget.reserve("get_network_item", {}, check);
  await budget.reserve("get_network_item", {}, check);
  const stopped = await budget.reserve("get_network_item", {}, check);
  assert.equal(checks, 1);
  assert.equal(stopped.structuredContent.source, "LOCAL_GUARD");
  assert.equal(stopped.structuredContent.requestSent, false);
  assert.equal(stopped.structuredContent.budget.reservedInfoUnits, 7);
  assert.throws(() => {
    stopped.structuredContent.budget.reservedInfoUnits = 0;
  }, TypeError);
  assert.equal(await budget.reserve("search_network", {}, check), stopped);
  assert.deepEqual(budget.snapshot(), {
    limitInfoUnits: 7,
    reservedInfoUnits: 7,
    costRulesChecked: true,
    blocked: true
  });
});

test("failed and unknown outcomes never refund an admitted reservation", async () => {
  const budget = createInfoBudget(7);
  await budget.reserve("search_network", {}, async () => connection());
  assert.equal(budget.snapshot().reservedInfoUnits, 5);
  const result = await budget.reserve("search_network", {}, async () => {
    throw new Error("must not run");
  });
  assert.equal(result.structuredContent.budget.reservedInfoUnits, 5);
  assert.equal(result.structuredContent.budget.proposedInfoUnits, 5);
});

test("concurrent reservations waiting on the same check preserve the first stop", async () => {
  const budget = createInfoBudget(7);
  let checks = 0;
  const check = async () => {
    checks++;
    await Promise.resolve();
    return connection();
  };
  const [first, second, third] = await Promise.all([
    budget.reserve("search_network", {}, check),
    budget.reserve("search_network", {}, check),
    budget.reserve("list_posts", {}, check)
  ]);
  assert.equal(first, undefined);
  assert.equal(second.structuredContent.requestSent, false);
  assert.equal(third, second);
  assert.equal(checks, 1);
  assert.equal(budget.snapshot().reservedInfoUnits, 5);
});

test("failed tariff check is never retried and no units are reserved", async () => {
  const budget = createInfoBudget(7);
  let checks = 0;
  const check = async () => {
    checks++;
    throw new Error("synthetic-private-error");
  };
  await assert.rejects(
    budget.reserve("search_network", {}, check),
    /cost check failed/
  );
  await assert.rejects(
    budget.reserve("list_posts", {}, check),
    /cost check failed/
  );
  assert.equal(checks, 1);
  assert.equal(budget.snapshot().reservedInfoUnits, 0);
});

test("parallel search executions share capped queue and second never dispatches", async () => {
  const state = fixture();
  const [first, second] = await Promise.all([
    read(state, "search_network", { query: "one" }),
    read(state, "search_network", { query: "two" })
  ]);
  assert.equal(first.structuredContent.items.length, 0);
  assert.equal(second.structuredContent.source, "LOCAL_GUARD");
  assert.deepEqual(
    state.calls.map((call) => call.name),
    ["get_connection", "search_network"]
  );
  assert.equal(state.stopped(), 0);
  const third = await read(state, "get_network_item");
  assert.equal(third, second);
  assert.equal(state.calls.length, 2);
});

test("20-row search is blocked at 7 before any business request", async () => {
  const state = fixture();
  const result = await read(state, "search_network", {
    query: "one",
    limit: 20
  });
  assert.equal(result.structuredContent.budget.proposedInfoUnits, 10);
  assert.deepEqual(
    state.calls.map((call) => call.name),
    ["get_connection"]
  );
});

test("free model reads stay free and capped business check runs exactly once", async () => {
  const state = fixture();
  await read(state, "get_connection");
  await read(state, "get_participation_guide");
  await read(state, "list_missions");
  await read(state, "list_posts");
  assert.deepEqual(
    state.calls.map((call) => call.name),
    [
      "get_connection",
      "get_participation_guide",
      "get_connection",
      "list_missions",
      "list_posts"
    ]
  );
});

test("free connection and static guide remain available after local INFO stop", async () => {
  const state = fixture();
  await read(state, "search_network");
  await read(state, "search_network");
  await read(state, "get_connection");
  await read(state, "get_participation_guide");
  assert.deepEqual(
    state.calls.map((call) => call.name),
    [
      "get_connection",
      "search_network",
      "get_connection",
      "get_participation_guide"
    ]
  );
});

test("changed or unavailable current tariffs block all business dispatch without retry", async () => {
  for (const make of [
    () => {
      const value = connection();
      value.structuredContent.costRules.search_network.upTo10 = 4;
      return value;
    },
    () => ({
      content: [],
      structuredContent: { error: { code: "UNAVAILABLE" } }
    }),
    () => {
      throw new Error("synthetic-private-error");
    }
  ]) {
    const state = fixture({ connection: make });
    const results = await Promise.allSettled([
      read(state, "search_network"),
      read(state, "list_posts")
    ]);
    assert(results.every((value) => value.status === "rejected"));
    assert.deepEqual(
      state.calls.map((call) => call.name),
      ["get_connection"]
    );
    assert.equal(state.stopped(), 1);
  }
});

test("unknown business outcome stops queued reads after the one reservation", async () => {
  const state = fixture({
    business: () => {
      throw new Error("synthetic-private-error");
    }
  });
  const results = await Promise.allSettled([
    read(state, "search_network"),
    read(state, "list_posts")
  ]);
  assert(results.every((value) => value.status === "rejected"));
  assert.deepEqual(
    state.calls.map((call) => call.name),
    ["get_connection", "search_network"]
  );
  assert.equal(state.stopped(), 1);
});

test("absent INFO cap preserves original dispatch and does not add tariff reads", async () => {
  const state = fixture({ env: { AGENTEL_MAX_INFO_PER_TURN: undefined } });
  await read(state, "search_network");
  await read(state, "search_network");
  await read(state, "search_network");
  await assert.rejects(
    read(state, "search_network"),
    /paid-read limit reached/
  );
  assert.deepEqual(
    state.calls.map((call) => call.name),
    ["search_network", "search_network", "search_network"]
  );
});

test("configured INFO cap reports local attempt stop without a false INFO reservation", async () => {
  const state = fixture();
  await read(state, "list_posts");
  await read(state, "list_posts");
  await read(state, "list_posts");
  const result = await read(state, "list_posts");
  assert.equal(result.structuredContent.reason, "METERED_READ_ATTEMPT_LIMIT");
  assert.equal(result.structuredContent.budget.reservedInfoUnits, 3);
  assert.equal(result.structuredContent.requestSent, false);
  assert.deepEqual(
    state.calls.map((call) => call.name),
    ["get_connection", "list_posts", "list_posts", "list_posts"]
  );
  assert.equal(state.stopped(), 0);
});

test("INFO-capped mode preserves the separately configured metered attempt limit", async () => {
  const state = fixture({ env: { AGENTEL_MAX_PAID_READS_PER_TURN: "10" } });
  for (let index = 0; index < 3; index++) await read(state, "list_posts");
  const result = await read(state, "list_posts");
  assert.deepEqual(result.structuredContent.items, []);
  assert.equal(
    state.calls.filter((call) => call.name === "list_posts").length,
    4
  );
});

test("new chat binding creates a fresh INFO reservation and tariff check", async () => {
  const first = fixture();
  await read(first, "search_network");
  await read(first, "search_network");
  const second = fixture();
  await read(second, "search_network");
  assert.deepEqual(
    second.calls.map((call) => call.name),
    ["get_connection", "search_network"]
  );
});

test("capped mode sends at most eight free model reads then stops every later tool", async () => {
  const state = fixture();
  const results = await Promise.all(
    Array.from({ length: 12 }, (_value, index) =>
      read(state, index % 2 ? "get_connection" : "get_participation_guide")
    )
  );
  assert.equal(state.calls.length, 8);
  assert.equal(results[8].structuredContent.source, "LOCAL_GUARD");
  assert.equal(results[8].structuredContent.reason, "ALL_TOOL_CALL_LIMIT");
  assert.equal(results[8].structuredContent.requestSent, false);
  assert.deepEqual(results[8].structuredContent.toolCalls, {
    modelToolAttempts: 8,
    maxToolCalls: 8
  });
  assert.equal(results[11], results[8]);
  assert.equal(await read(state, "search_network"), results[8]);
  assert.equal(state.calls.length, 8);
  assert.equal(state.stopped(), 0);
});

test("local INFO guards do not use tool slots; hidden tariff check is the sole extra source call", async () => {
  const state = fixture();
  await read(state, "search_network");
  const infoStop = await read(state, "search_network");
  assert.equal(infoStop.structuredContent.reason, "INFO_PER_TURN_LIMIT");
  for (let index = 0; index < 7; index++) await read(state, "get_connection");
  const allStop = await read(state, "get_participation_guide");
  assert.equal(allStop.structuredContent.reason, "ALL_TOOL_CALL_LIMIT");
  assert.equal(allStop.structuredContent.budget.reservedInfoUnits, 5);
  assert.equal(state.calls.length, 9);
  assert.equal(
    state.calls.filter((call) => call.name === "search_network").length,
    1
  );
  assert.equal(await read(state, "list_posts"), allStop);
  assert.equal(state.calls.length, 9);
});

test("legacy mode keeps free reads uncapped and does not add tariff checks", async () => {
  const state = fixture({ env: { AGENTEL_MAX_INFO_PER_TURN: undefined } });
  for (let index = 0; index < 12; index++) await read(state, "get_connection");
  assert.equal(state.calls.length, 12);
});

test("already cancelled turn stops before any free check or business dispatch", async () => {
  const controller = new AbortController();
  controller.abort(new Error("synthetic-private-error"));
  const state = fixture({ signal: controller.signal });
  await assert.rejects(read(state, "search_network"), /after cancellation/);
  await assert.rejects(read(state, "get_connection"), /stopped for this turn/);
  assert.equal(state.calls.length, 0);
  assert.equal(state.stopped(), 1);
});

test("abort during one in-flight metered read prevents queued reads and retry", async () => {
  const controller = new AbortController();
  let started;
  const startedPromise = new Promise((resolve) => {
    started = resolve;
  });
  let observedSignal;
  const state = fixture({
    signal: controller.signal,
    business: (_request, options) =>
      new Promise((_resolve, reject) => {
        observedSignal = options.signal;
        options.signal.addEventListener(
          "abort",
          () => reject(new Error("synthetic-private-error")),
          { once: true }
        );
        started();
      })
  });
  const pending = Promise.allSettled([
    read(state, "search_network"),
    read(state, "list_posts"),
    read(state, "get_connection")
  ]);
  await startedPromise;
  assert.equal(observedSignal, controller.signal);
  controller.abort(new Error("synthetic-private-error"));
  const results = await pending;
  assert(results.every((result) => result.status === "rejected"));
  assert.deepEqual(
    state.calls.map((call) => call.name),
    ["get_connection", "search_network"]
  );
  assert.equal(state.stopped(), 1);
});

test("cancellation after tariff check finishes prevents business reservation and send", async () => {
  const controller = new AbortController();
  const state = fixture({
    signal: controller.signal,
    connection: () => {
      controller.abort(new Error("synthetic-private-error"));
      return connection();
    }
  });
  const results = await Promise.allSettled([
    read(state, "search_network"),
    read(state, "list_posts")
  ]);
  assert(results.every((result) => result.status === "rejected"));
  assert.deepEqual(
    state.calls.map((call) => call.name),
    ["get_connection"]
  );
  assert.equal(state.stopped(), 1);
});

test("cancellation never refunds a reservation whose business outcome may be unknown", async () => {
  const controller = new AbortController();
  const budget = createInfoBudget(7);
  await budget.reserve(
    "search_network",
    {},
    async () => connection(),
    controller.signal
  );
  controller.abort();
  await assert.rejects(
    budget.reserve(
      "list_posts",
      {},
      async () => connection(),
      controller.signal
    ),
    /after cancellation/
  );
  assert.equal(budget.snapshot().reservedInfoUnits, 5);
});
