import test from "node:test";
import assert from "node:assert/strict";
import {
  agentelAiTools,
  AGENTEL_SERVER_ID,
  AGENTEL_TOOL_NAMES
} from "../src/agentel-mcp.ts";
import {
  createAgentelTurnMeter,
  PINNED_INFO_COST_RULES
} from "../src/info-budget.ts";
import {
  chatDeadline,
  createChatBudgetRecorder,
  boundedChatModel
} from "../src/chat-model.ts";

const connection = () => ({
  content: [],
  structuredContent: { costRules: structuredClone(PINNED_INFO_COST_RULES) }
});
function fixture(options = {}) {
  const sent = [];
  const meter = createAgentelTurnMeter();
  const catalog = AGENTEL_TOOL_NAMES.map((name) => ({
    name,
    serverId: AGENTEL_SERVER_ID,
    annotations: { readOnlyHint: true },
    inputSchema:
      name === "search_network"
        ? {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"]
          }
        : { type: "object", additionalProperties: true },
    outputSchema: { type: "object" }
  }));
  const tools = agentelAiTools(
    {
      mcp: {
        listTools: () => catalog,
        callTool: async (request, _schema, callOptions) => {
          sent.push(request.name);
          if (request.name === "get_connection")
            return options.connection
              ? options.connection(callOptions)
              : connection();
          return options.business
            ? options.business(request, callOptions)
            : { content: [], structuredContent: { items: [] } };
        }
      }
    },
    {
      AGENTEL_READER_KEY: "synthetic-only-reader",
      AGENTEL_MAX_INFO_PER_TURN: "7",
      ...options.env
    },
    undefined,
    options.signal,
    meter
  );
  return {
    sent,
    meter,
    read: (name, args = {}) =>
      tools[`tool_agentelnetwork_${name}`].execute(args),
    tools
  };
}

test("observed search/detail/targeted-guide reserve 7, dispatch four including pricing, then block paid #4", async () => {
  const state = fixture();
  assert.equal(Object.keys(state.tools).length, 6);
  await state.read("search_network", { query: "real task" });
  await state.read("get_network_item");
  await state.read("get_participation_guide", {
    target: { kind: "MISSION", id: "synthetic" }
  });
  const block = await state.read("list_missions");
  assert.equal(block.structuredContent.requestSent, false);
  assert.deepEqual(state.sent, [
    "get_connection",
    "search_network",
    "get_network_item",
    "get_participation_guide"
  ]);
  const receipt = state.meter.snapshot();
  assert.equal(receipt.reservedInfoUnits, 7);
  assert.equal(receipt.paidReadAdmissions, 3);
  assert.equal(receipt.mcpCallAttempts, state.sent.length);
  assert.equal(receipt.pricingCheckCallAttempts, 1);
  assert.equal(receipt.modelSelectedCallAttempts, 3);
  assert.equal(receipt.successfulCallResults, 4);
  assert.equal(receipt.unknownCallOutcomes, 0);
  assert.equal(receipt.localBlockedCalls.paidReadLimit, 1);
  assert.equal(receipt.actualChargedInfoUnits, null);
  assert.equal(receipt.chargeObservation, "UNKNOWN");
});

test("INFO blocks are counted per request and never imply an extra SDK dispatch", async () => {
  const state = fixture();
  await state.read("search_network", { query: "one" });
  await state.read("search_network", { query: "two" });
  await state.read("get_network_item");
  assert.deepEqual(state.sent, ["get_connection", "search_network"]);
  const receipt = state.meter.snapshot();
  assert.equal(receipt.reservedInfoUnits, 5);
  assert.equal(receipt.localBlockedCalls.infoLimit, 2);
  assert.equal(receipt.paidReadAdmissions, 1);
  assert.equal(receipt.mcpCallAttempts, 2);
});

test("free model calls count SDK attempts but reserve no INFO; eight calls are bounded independently", async () => {
  const state = fixture();
  for (let i = 0; i < 10; i++) await state.read("get_connection");
  const receipt = state.meter.snapshot();
  assert.equal(state.sent.length, 8);
  assert.equal(receipt.modelSelectedCallAttempts, 8);
  assert.equal(receipt.pricingCheckCallAttempts, 0);
  assert.equal(receipt.reservedInfoUnits, 0);
  assert.equal(receipt.paidReadAdmissions, 0);
  assert.equal(receipt.localBlockedCalls.allToolLimit, 2);
});

test("hidden fee check is exactly one extra SDK call, not a model-selected slot", async () => {
  const state = fixture();
  await state.read("list_posts");
  for (let i = 0; i < 7; i++) await state.read("get_connection");
  await state.read("get_connection");
  const receipt = state.meter.snapshot();
  assert.equal(state.sent.length, 9);
  assert.equal(receipt.mcpCallAttempts, 9);
  assert.equal(receipt.pricingCheckCallAttempts, 1);
  assert.equal(receipt.modelSelectedCallAttempts, 8);
  assert.equal(receipt.localBlockedCalls.allToolLimit, 1);
});

test("invalid arguments cause neither tariff dispatch nor INFO admission", async () => {
  const state = fixture();
  await assert.rejects(
    state.read("search_network", { query: 7 }),
    /Invalid Agentel read arguments/
  );
  assert.deepEqual(state.sent, []);
  const receipt = state.meter.snapshot();
  assert.equal(receipt.mcpCallAttempts, 0);
  assert.equal(receipt.paidReadAdmissions, 0);
  assert.equal(receipt.reservedInfoUnits, 0);
});

test("network failure keeps the reservation and unknown attempt; queued reads do not dispatch", async () => {
  const state = fixture({
    business: () => {
      throw new Error("synthetic-only");
    }
  });
  const results = await Promise.allSettled([
    state.read("search_network", { query: "task" }),
    state.read("list_posts")
  ]);
  assert(results.every((r) => r.status === "rejected"));
  assert.deepEqual(state.sent, ["get_connection", "search_network"]);
  const receipt = state.meter.snapshot();
  assert.equal(receipt.reservedInfoUnits, 5);
  assert.equal(receipt.paidReadAdmissions, 1);
  assert.equal(receipt.unknownCallOutcomes, 1);
  assert.equal(receipt.successfulCallResults, 1);
  assert.equal(receipt.actualChargedInfoUnits, null);
});

test("returned business error is distinguished from unknown transport outcome without inferring charge", async () => {
  const state = fixture({ business: () => ({ isError: true, content: [] }) });
  await assert.rejects(
    state.read("search_network", { query: "task" }),
    /business error/
  );
  const receipt = state.meter.snapshot();
  assert.equal(receipt.businessErrorResults, 1);
  assert.equal(receipt.unknownCallOutcomes, 0);
  assert.equal(receipt.reservedInfoUnits, 5);
  assert.equal(receipt.actualChargedInfoUnits, null);
});

test("failed hidden pricing call remains unknown with zero local admission and no retry", async () => {
  const state = fixture({
    connection: () => {
      throw new Error("synthetic-only");
    }
  });
  await assert.rejects(state.read("search_network", { query: "task" }));
  await assert.rejects(state.read("list_posts"));
  const receipt = state.meter.snapshot();
  assert.deepEqual(state.sent, ["get_connection"]);
  assert.equal(receipt.pricingCheckCallAttempts, 1);
  assert.equal(receipt.unknownCallOutcomes, 1);
  assert.equal(receipt.reservedInfoUnits, 0);
  assert.equal(receipt.paidReadAdmissions, 0);
});

test("in-flight cancellation records unknown at terminal and blocks every queued dispatch", async () => {
  const controller = new AbortController();
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const state = fixture({
    signal: controller.signal,
    business: (_request, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(new Error("cancelled synthetic request")),
          { once: true }
        );
        started();
      })
  });
  const pending = Promise.allSettled([
    state.read("search_network", { query: "task" }),
    state.read("list_posts")
  ]);
  await ready;
  const before = state.meter.snapshot();
  assert.equal(before.unknownCallOutcomes, 1);
  controller.abort();
  await pending;
  assert.deepEqual(state.sent, ["get_connection", "search_network"]);
  assert.equal(state.meter.snapshot().reservedInfoUnits, 5);
  assert.equal(state.meter.snapshot().unknownCallOutcomes, 1);
});

test("cancellation in pricing check prevents any business admission or dispatch", async () => {
  const controller = new AbortController();
  const state = fixture({
    signal: controller.signal,
    connection: () => {
      controller.abort();
      return connection();
    }
  });
  await assert.rejects(state.read("search_network", { query: "task" }));
  const receipt = state.meter.snapshot();
  assert.deepEqual(state.sent, ["get_connection"]);
  assert.equal(receipt.paidReadAdmissions, 0);
  assert.equal(receipt.reservedInfoUnits, 0);
  assert.equal(receipt.successfulCallResults, 1);
});

function fakeTimer(fn) {
  const set = globalThis.setTimeout,
    clear = globalThis.clearTimeout;
  let callback,
    clears = 0;
  try {
    globalThis.setTimeout = (cb) => {
      callback = cb;
      return 7;
    };
    globalThis.clearTimeout = () => {
      clears++;
    };
    return fn({ fire: () => callback(), clears: () => clears });
  } finally {
    globalThis.setTimeout = set;
    globalThis.clearTimeout = clear;
  }
}

test("parent abort wins over later timeout without retaining arbitrary reasons", () =>
  fakeTimer(({ fire }) => {
    const parent = new AbortController(),
      deadline = chatDeadline(parent.signal);
    parent.abort(new Error("synthetic-private-do-not-persist"));
    fire();
    assert.equal(deadline.abortSource(), "PARENT_ABORT");
    const rows = [],
      meter = createAgentelTurnMeter();
    createChatBudgetRecorder(
      "test-turn",
      deadline,
      meter,
      () => 0,
      (r) => rows.push(r)
    ).finish("aborted");
    assert.equal(rows[0].abortSource, "PARENT_ABORT");
    assert(!JSON.stringify(rows).includes("synthetic-private"));
  }));

test("deadline wins over later parent abort; disposal removes parent listener and timer", () =>
  fakeTimer(({ fire, clears }) => {
    const parent = new AbortController(),
      deadline = chatDeadline(parent.signal);
    fire();
    parent.abort();
    assert.equal(deadline.abortSource(), "DEADLINE");
    deadline.dispose();
    assert.equal(clears(), 1);
    const untouchedParent = new AbortController(),
      disposed = chatDeadline(untouchedParent.signal);
    disposed.dispose();
    untouchedParent.abort();
    fire();
    assert.equal(disposed.abortSource(), "NONE");
    assert.equal(disposed.signal.aborted, false);
  }));

test("already aborted parent is recorded immediately without dispatch", () =>
  fakeTimer(() => {
    const parent = new AbortController();
    parent.abort();
    const deadline = chatDeadline(parent.signal);
    assert.equal(deadline.abortSource(), "PARENT_ABORT");
    assert.equal(deadline.signal.aborted, true);
    deadline.dispose();
  }));

test("terminal recorder covers setup failure, keeps absent usage unknown, and rejects repeated callbacks", () =>
  fakeTimer(() => {
    const rows = [],
      meter = createAgentelTurnMeter(),
      deadline = chatDeadline();
    const recorder = createChatBudgetRecorder(
      "test-turn",
      deadline,
      meter,
      () => 0,
      (r) => rows.push(r)
    );
    recorder.setStage("setup");
    assert.equal(recorder.finish("error"), true);
    assert.equal(recorder.finish("aborted"), false);
    assert.equal(recorder.finish("completed", { totalTokens: 999 }), false);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].stage, "setup");
    assert.equal(rows[0].terminal, "error");
    assert.equal(rows[0].modelRequestAttempts, 0);
    assert.equal(rows[0].totalTokens, null);
    assert.equal(rows[0].agentel.actualChargedInfoUnits, null);
  }));

test("unidentified SDK abort is unknown; completed usage does not manufacture missing token fields", () =>
  fakeTimer(() => {
    const rows = [],
      meter = createAgentelTurnMeter();
    createChatBudgetRecorder(
      "aborted-turn",
      chatDeadline(),
      meter,
      () => 1,
      (r) => rows.push(r)
    ).finish("aborted");
    const complete = createChatBudgetRecorder(
      "completed-turn",
      chatDeadline(),
      meter,
      () => 2,
      (r) => rows.push(r)
    );
    complete.setStage("stream");
    complete.finish("completed", { totalTokens: 5 });
    assert.equal(rows[0].abortSource, "UNKNOWN");
    assert.equal(rows[1].abortSource, "NONE");
    assert.equal(rows[1].modelRequestAttempts, 2);
    assert.equal(rows[1].totalTokens, 5);
    assert.equal(rows[1].inputTokens, null);
  }));

test("parent abort persists without SDK callbacks and late in-flight success cannot rewrite unknown terminal", () =>
  fakeTimer(() => {
    const rows = [],
      meter = createAgentelTurnMeter();
    const parent = new AbortController(),
      deadline = chatDeadline(parent.signal);
    const settled = meter.dispatch("modelSelected");
    const recorder = createChatBudgetRecorder(
      "cancelled-consumer",
      deadline,
      meter,
      () => 1,
      (r) => rows.push(r)
    );
    recorder.setStage("stream");
    parent.abort();
    // No AI SDK onAbort, onError, onFinish or stream pull is performed.
    assert.equal(rows.length, 1);
    assert.equal(rows[0].terminal, "aborted");
    assert.equal(rows[0].abortSource, "PARENT_ABORT");
    assert.equal(rows[0].agentel.unknownCallOutcomes, 1);
    assert.equal(rows[0].agentel.actualChargedInfoUnits, null);
    assert.equal(rows[0].totalTokens, null);
    settled("success");
    assert.equal(meter.snapshot().successfulCallResults, 1);
    assert.equal(recorder.finish("completed", { totalTokens: 100 }), false);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].agentel.successfulCallResults, 0);
    assert.equal(rows[0].agentel.unknownCallOutcomes, 1);
    assert.equal(rows[0].totalTokens, null);
  }));

test("deadline alone persists without downstream callbacks and preserves first abort cause", () =>
  fakeTimer(({ fire, clears }) => {
    const rows = [],
      meter = createAgentelTurnMeter();
    const parent = new AbortController(),
      deadline = chatDeadline(parent.signal);
    createChatBudgetRecorder(
      "deadline-consumer",
      deadline,
      meter,
      () => 1,
      (r) => rows.push(r)
    );
    fire();
    parent.abort();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].abortSource, "DEADLINE");
    assert.equal(rows[0].terminal, "aborted");
    assert.equal(clears(), 1);
  }));

test("terminal completion removes the direct abort observer and later parent cancellation does not append", () =>
  fakeTimer(() => {
    const rows = [],
      meter = createAgentelTurnMeter();
    const parent = new AbortController(),
      deadline = chatDeadline(parent.signal);
    let removals = 0;
    const remove = deadline.signal.removeEventListener.bind(deadline.signal);
    deadline.signal.removeEventListener = (...args) => {
      if (args[0] === "abort") removals++;
      return remove(...args);
    };
    const recorder = createChatBudgetRecorder(
      "completed-consumer",
      deadline,
      meter,
      () => 1,
      (r) => rows.push(r)
    );
    recorder.finish("completed", { totalTokens: 4 });
    parent.abort();
    assert.equal(removals, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].terminal, "completed");
    assert.equal(rows[0].abortSource, "NONE");
  }));

test("error notification records error once then aborts all late tool and provider work without changing origin", async () => {
  const parent = new AbortController(),
    deadline = chatDeadline(parent.signal);
  const state = fixture({ signal: deadline.signal });
  const rows = [];
  const recorder = createChatBudgetRecorder(
    "failed-turn",
    deadline,
    state.meter,
    () => 1,
    (r) => rows.push(r)
  );
  recorder.setStage("stream");
  recorder.finish("error");
  assert.equal(deadline.signal.aborted, true);
  assert.equal(deadline.abortSource(), "NONE");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].terminal, "error");
  assert.equal(rows[0].abortSource, "NONE");
  assert.equal(recorder.finish("aborted"), false);
  parent.abort();
  await assert.rejects(state.read("search_network", { query: "late task" }));
  assert.deepEqual(state.sent, []);
  let providerCalls = 0;
  const settings = boundedChatModel(
    {
      MODEL_API_BASE_URL: "https://synthetic.invalid/v1",
      MODEL_API_KEY: "synthetic-only",
      MODEL_NAME: "synthetic"
    },
    deadline.signal,
    async () => {
      providerCalls++;
      throw new Error("must not dispatch");
    }
  );
  await assert.rejects(
    settings.transport(
      new Request("https://synthetic.invalid/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ max_tokens: 1 })
      })
    )
  );
  assert.equal(providerCalls, 0);
  assert.equal(rows[0].agentel.actualChargedInfoUnits, null);
  assert.equal(rows[0].terminal, "error");
});

test("even a failed receipt write disposes the deadline and hard-stops an error turn", () => {
  const deadline = chatDeadline(),
    meter = createAgentelTurnMeter();
  const recorder = createChatBudgetRecorder(
    "failed-persistence",
    deadline,
    meter,
    () => 1,
    () => {
      throw new Error("synthetic SQL failure");
    }
  );
  assert.throws(() => recorder.finish("error"), /SQL failure/);
  assert.equal(deadline.signal.aborted, true);
  assert.equal(deadline.abortSource(), "NONE");
  assert.equal(recorder.finish("error"), false);
});
