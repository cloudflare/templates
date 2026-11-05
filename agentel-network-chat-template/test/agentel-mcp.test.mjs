import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENTEL_MCP_URL,
  AGENTEL_SERVER_ID,
  AGENTEL_TOOL_NAMES,
  createReaderFetch,
  connectAgentelMcp,
  callAgentelTool,
  agentelAiTools,
  agentelReadLimit,
  redactReader
} from "../src/agentel-mcp.ts";
import { checkDemoAccess } from "../src/demo-access.ts";

const key = "synthetic-reader-secret-v1";
const env = { AGENTEL_READER_KEY: key };
const catalog = AGENTEL_TOOL_NAMES.map((name) => ({
  name,
  serverId: AGENTEL_SERVER_ID,
  annotations: { readOnlyHint: true },
  outputSchema: { type: "object" },
  inputSchema: { type: "object", properties: {}, additionalProperties: false }
}));
function host(overrides = {}) {
  const calls = [];
  return {
    calls,
    mcp: {
      removeServer: async (id) => calls.push(["remove", id]),
      registerServer: async (id, options) =>
        calls.push(["register", id, options]),
      connectToServer: async () => ({ state: "connected" }),
      discoverIfConnected: async () => ({ success: true }),
      listTools: () => catalog,
      callTool: async (params) => {
        calls.push(["call", params]);
        return { content: [], structuredContent: { value: key } };
      },
      getAITools: () =>
        Object.fromEntries(
          [
            ...catalog,
            { name: "write_extra", serverId: AGENTEL_SERVER_ID }
          ].map((t) => [
            `tool_${t.serverId.replace(/-/g, "")}_${t.name}`,
            { description: t.name }
          ])
        ),
      ...overrides
    }
  };
}

test("missing Reader configuration fails before fetch", () =>
  assert.throws(() => createReaderFetch({}), /Configure/));
test("Reader with whitespace is rejected", () =>
  assert.throws(
    () => createReaderFetch({ AGENTEL_READER_KEY: "a b" }),
    /Configure/
  ));
test("transport injects Reader only into fixed endpoint with redirect rejection", async () => {
  const send = createReaderFetch(env, async (r) => {
    assert.equal(r.url, AGENTEL_MCP_URL);
    assert.equal(r.headers.get("Authorization"), `Bearer ${key}`);
    assert.equal(r.redirect, "manual");
    return Response.json({ result: { value: key } });
  });
  assert.deepEqual(
    await (await send(AGENTEL_MCP_URL, { method: "POST", body: "{}" })).json(),
    { result: { value: "[REDACTED]" } }
  );
});
test("offhost URL blocked before network", async () => {
  let sent = 0;
  const send = createReaderFetch(env, async () => {
    sent++;
    return Response.json({});
  });
  await assert.rejects(send("https://external.invalid/mcp"), /fixed/);
  assert.equal(sent, 0);
});
test("same origin alternate path blocked", async () =>
  await assert.rejects(
    createReaderFetch(env)("https://agentel.tech/other"),
    /fixed/
  ));
test("non-2xx credential echo and OAuth discovery headers suppressed", async () => {
  const send = createReaderFetch(
    env,
    async () =>
      new Response(key, {
        status: 401,
        headers: {
          "WWW-Authenticate":
            'Bearer resource_metadata="https://external.invalid/metadata"'
        }
      })
  );
  const response = await send(AGENTEL_MCP_URL);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("WWW-Authenticate"), null);
  assert(!(await response.text()).includes(key));
});
test("register serializes no bearer, fetch function is ephemeral", async () => {
  const h = host();
  await connectAgentelMcp(h, env);
  const options = h.calls.find((c) => c[0] === "register")[2];
  assert.equal(options.transport.type, "streamable-http");
  assert.equal(typeof options.transport.fetch, "function");
  assert.equal(options.retry.maxAttempts, 1);
  const persisted = JSON.stringify(options);
  assert(!persisted.includes(key));
  assert(!persisted.includes("Authorization"));
  assert(!persisted.includes("authProvider"));
});
test("failed connection removes server, no retry and safe error", async () => {
  let attempts = 0;
  const h = host({
    connectToServer: async () => {
      attempts++;
      throw new Error(key);
    }
  });
  await assert.rejects(
    connectAgentelMcp(h, env),
    (e) => !e.message.includes(key)
  );
  assert.equal(attempts, 1);
  assert.equal(h.calls.filter((c) => c[0] === "remove").length, 2);
});
test("partial catalog fails closed", async () =>
  await assert.rejects(
    connectAgentelMcp(host({ listTools: () => catalog.slice(1) }), env),
    /failed/
  ));
test("write-annotated expected tool fails closed", async () =>
  await assert.rejects(
    connectAgentelMcp(
      host({
        listTools: () =>
          catalog.map((t) => ({ ...t, annotations: { readOnlyHint: false } }))
      }),
      env
    ),
    /failed/
  ));
test("unknown write name is blocked before transport", async () => {
  const h = host();
  await assert.rejects(callAgentelTool(h, env, "apply_to_mission", {}), /six/);
  assert.equal(h.calls.length, 0);
});
test("raw RPC invalid inputs blocked before paid request", async () => {
  const h = host();
  for (const args of [null, [], { unknown: true }])
    await assert.rejects(
      callAgentelTool(h, env, "get_connection", args),
      /Invalid/
    );
  assert.equal(h.calls.length, 0);
});
test("successful and business-error results redact Reader", async () => {
  const h = host();
  const result = await callAgentelTool(h, env, "get_connection", {});
  assert(!JSON.stringify(result).includes(key));
  const failed = host({
    callTool: async () => ({
      isError: true,
      content: [{ type: "text", text: key }]
    })
  });
  assert.equal(
    (await callAgentelTool(failed, env, "get_connection", {})).isError,
    true
  );
});
test("AI tools include only six reserved native tools and error stops", async () => {
  const tools = agentelAiTools(host(), env);
  assert.equal(Object.keys(tools).length, 6);
  assert(!Object.keys(tools).some((n) => n.includes("write_extra")));
  const failed = agentelAiTools(
    host({ callTool: async () => ({ isError: true, content: [] }) }),
    env
  );
  await assert.rejects(
    failed[
      `tool_${AGENTEL_SERVER_ID.replace(/-/g, "")}_get_connection`
    ].execute({}),
    /business error/
  );
});
test("nested status redaction preserves other fields", () =>
  assert.deepEqual(
    redactReader({ state: "failed", error: key, more: [key] }, env),
    { state: "failed", error: "[REDACTED]", more: ["[REDACTED]"] }
  ));
test("unconfigured or short operator secret fails closed", async () => {
  assert.equal(
    (await checkDemoAccess(new Request("https://example.invalid/"))).status,
    503
  );
  assert.equal(
    (await checkDemoAccess(new Request("https://example.invalid/"), "short"))
      .status,
    503
  );
});
test("assets, RPC and WebSocket paths require operator login", async () => {
  for (const path of [
    "/",
    "/favicon.ico",
    "/agents/chat-agent/default",
    "/oauth/callback"
  ]) {
    const response = await checkDemoAccess(
      new Request(`https://example.invalid${path}`),
      "operator-password-with-24-chars"
    );
    assert.equal(response.status, 401);
    assert(response.headers.get("WWW-Authenticate").startsWith("Basic "));
  }
});
test("correct operator password succeeds; wrong username or malformed header fails", async () => {
  const token = "operator-password-with-24-chars";
  const request = (value) =>
    new Request("https://example.invalid/", {
      headers: { Authorization: value }
    });
  assert.equal(
    await checkDemoAccess(request("Basic " + btoa(`agentel:${token}`)), token),
    null
  );
  for (const value of [
    "Basic " + btoa(`other:${token}`),
    "Basic %%%",
    "Bearer " + token
  ])
    assert.equal((await checkDemoAccess(request(value), token)).status, 401);
});

test("parsed JSON redacts Unicode-escaped Reader echo", async () => {
  const escaped = [...key]
    .map((c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("");
  const response = await createReaderFetch(
    env,
    async () =>
      new Response('{"value":"' + escaped + '"}', {
        headers: { "Content-Type": "application/json" }
      })
  )(AGENTEL_MCP_URL);
  assert.equal((await response.json()).value, "[REDACTED]");
});
test("Reader containing JSON punctuation redacts recursively", () => {
  const unusual = 'key-with-"quote-and-\\slash';
  assert.equal(
    redactReader({ [unusual]: unusual }, { AGENTEL_READER_KEY: unusual })[
      "[REDACTED]"
    ],
    "[REDACTED]"
  );
});
test("SSE and invalid JSON responses fail closed", async () => {
  for (const [type, body] of [
    ["text/event-stream", key],
    ["application/json", "{"]
  ]) {
    await assert.rejects(
      createReaderFetch(
        env,
        async () => new Response(body, { headers: { "Content-Type": type } })
      )(AGENTEL_MCP_URL),
      /response/
    );
  }
});
test("changed read-only annotation blocks direct and AI calls", async () => {
  const changed = host({
    listTools: () =>
      catalog.map((t) => ({ ...t, annotations: { readOnlyHint: false } }))
  });
  await assert.rejects(
    callAgentelTool(changed, env, "get_connection", {}),
    /Invalid/
  );
  assert.equal(Object.keys(agentelAiTools(changed, env)).length, 0);
  assert.equal(changed.calls.length, 0);
});
test("parallel AI reads serialize and halt after first business error", async () => {
  let reads = 0,
    stopped = 0;
  const tools = agentelAiTools(
    host({
      callTool: async () => {
        reads++;
        await new Promise((r) => setTimeout(r, 10));
        return { isError: true, content: [] };
      }
    }),
    env,
    () => stopped++
  );
  const execute =
    tools[`tool_${AGENTEL_SERVER_ID.replace(/-/g, "")}_get_connection`].execute;
  const results = await Promise.allSettled([
    execute({}),
    execute({}),
    execute({})
  ]);
  assert(results.every((r) => r.status === "rejected"));
  assert.equal(reads, 1);
  assert.equal(stopped, 1);
});
test("structured business errors also halt the AI turn", async () => {
  let reads = 0;
  const tools = agentelAiTools(
    host({
      callTool: async () => {
        reads++;
        return {
          content: [],
          structuredContent: { error: { code: "EXHAUSTED" } }
        };
      }
    }),
    env
  );
  const execute =
    tools[`tool_${AGENTEL_SERVER_ID.replace(/-/g, "")}_get_connection`].execute;
  await assert.rejects(execute({}), /business error/);
  await assert.rejects(execute({}), /stopped/);
  assert.equal(reads, 1);
});
test("correct Basic credentials cannot authorize cross-origin browser RPC or WS", async () => {
  const token = "operator-password-with-24-chars";
  for (const Origin of ["https://attacker.invalid", "null"]) {
    const r = new Request("https://example.invalid/agents/chat-agent/default", {
      headers: {
        Origin,
        Authorization: "Basic " + btoa(`agentel:${token}`),
        Upgrade: "websocket"
      }
    });
    assert.equal((await checkDemoAccess(r, token)).status, 403);
  }
  const sameOrigin = new Request(
    "https://example.invalid/agents/chat-agent/default",
    {
      headers: {
        Origin: "https://example.invalid",
        Authorization: "Basic " + btoa(`agentel:${token}`)
      }
    }
  );
  assert.equal(await checkDemoAccess(sameOrigin, token), null);
});

test("Reader echoed in MCP session or arbitrary response header fails closed", async () => {
  for (const header of ["mcp-session-id", "x-reader-echo"]) {
    const send = createReaderFetch(env, async () =>
      Response.json({ result: {} }, { headers: { [header]: key } })
    );
    await assert.rejects(send(AGENTEL_MCP_URL), /Unsafe/);
  }
});

test("AI binding works when native Zod output conversion cannot handle not", async () => {
  const current = catalog.map((t) => ({
    ...t,
    outputSchema: { type: "object", not: { required: ["error"] } }
  }));
  const h = host({
    listTools: () => current,
    getAITools: () => {
      throw new Error("not is not supported in Zod");
    }
  });
  const tools = agentelAiTools(h, env);
  assert.equal(Object.keys(tools).length, 6);
  const t = tools[`tool_${AGENTEL_SERVER_ID.replace(/-/g, "")}_get_connection`];
  assert.deepEqual(t.inputSchema.jsonSchema, current[0].inputSchema);
  await t.execute({});
  assert.equal(h.calls.filter((c) => c[0] === "call").length, 1);
  assert.deepEqual(current[0].outputSchema, {
    type: "object",
    not: { required: ["error"] }
  });
});

test("missing output schema fails closed before any business request", async () => {
  const h = host({
    listTools: () => catalog.map(({ outputSchema, ...t }) => t)
  });
  await assert.rejects(connectAgentelMcp(h, env), /failed/);
  await assert.rejects(
    callAgentelTool(h, env, "get_connection", {}),
    /Invalid/
  );
  assert.equal(Object.keys(agentelAiTools(h, env)).length, 0);
  assert.equal(h.calls.filter((c) => c[0] === "call").length, 0);
});
test("paginated tools/list fails closed; business result cursors are unaffected", async () => {
  const send = createReaderFetch(env, async () =>
    Response.json({
      jsonrpc: "2.0",
      result: { tools: [], nextCursor: "page2" }
    })
  );
  await assert.rejects(
    send(AGENTEL_MCP_URL, {
      method: "POST",
      body: JSON.stringify({ method: "tools/list" })
    }),
    /catalogs/
  );
  const unchanged = await send(AGENTEL_MCP_URL, {
    method: "POST",
    body: JSON.stringify({ method: "tools/call" })
  });
  assert.equal((await unchanged.json()).result.nextCursor, "page2");
});

test("batch catalog responses and batch requests cannot bypass catalog guard", async () => {
  const send = createReaderFetch(env, async () =>
    Response.json([
      { jsonrpc: "2.0", result: { tools: [], nextCursor: "page2" } }
    ])
  );
  await assert.rejects(
    send(AGENTEL_MCP_URL, {
      method: "POST",
      body: JSON.stringify({ method: "tools/list" })
    }),
    /Batch/
  );
  await assert.rejects(
    send(AGENTEL_MCP_URL, {
      method: "POST",
      body: JSON.stringify([{ method: "tools/list" }])
    }),
    /body/
  );
});

test("default paid-read cap serializes parallel attempts and blocks the fourth before transport", async () => {
  const h = host();
  let stopped = 0;
  const t = agentelAiTools(h, env, () => stopped++);
  const read = t.tool_agentelnetwork_list_missions;
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, () => read.execute({}))
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
  assert.equal(h.calls.filter((c) => c[0] === "call").length, 3);
  assert.match(results[3].reason.message, /limit reached/);
  assert.equal(stopped, 1);
});

test("free connection/static guide cap exemption; synthetic nullable handler defense; targeted guide counted", async () => {
  const h = host({
    listTools: () =>
      catalog.map((t) =>
        t.name === "get_participation_guide"
          ? {
              ...t,
              inputSchema: {
                type: "object",
                properties: { target: { type: ["object", "null"] } }
              }
            }
          : t
      )
  });
  const t = agentelAiTools(h, { ...env, AGENTEL_MAX_PAID_READS_PER_TURN: "1" });
  for (let i = 0; i < 3; i++) {
    await t.tool_agentelnetwork_get_connection.execute({});
    await t.tool_agentelnetwork_get_participation_guide.execute({});
    await t.tool_agentelnetwork_get_participation_guide.execute({
      target: null
    });
  }
  await t.tool_agentelnetwork_get_participation_guide.execute({ target: {} });
  await assert.rejects(
    t.tool_agentelnetwork_list_missions.execute({}),
    /limit reached/
  );
  assert.equal(h.calls.filter((c) => c[0] === "call").length, 10);
});

test("configured per-turn cap resets on a new binding and has bounded strict configuration", async () => {
  assert.equal(agentelReadLimit({}), 3);
  for (const value of ["1", "3", "10"])
    assert.equal(
      agentelReadLimit({ AGENTEL_MAX_PAID_READS_PER_TURN: value }),
      Number(value)
    );
  for (const value of ["", "0", "11", "-1", "3.5", "03", " 3", "unlimited"]) {
    assert.throws(
      () => agentelReadLimit({ AGENTEL_MAX_PAID_READS_PER_TURN: value }),
      /integer from 1 to 10/
    );
  }
  const h = host();
  const settings = { ...env, AGENTEL_MAX_PAID_READS_PER_TURN: "1" };
  const first = agentelAiTools(h, settings);
  await first.tool_agentelnetwork_list_missions.execute({});
  await assert.rejects(
    first.tool_agentelnetwork_list_missions.execute({}),
    /limit reached/
  );
  const next = agentelAiTools(h, settings);
  await next.tool_agentelnetwork_list_missions.execute({});
  assert.equal(h.calls.filter((c) => c[0] === "call").length, 2);
});

test("unknown outcome under the cap stops queued reads without retry", async () => {
  let sent = 0;
  let stopped = 0;
  const h = host({
    callTool: async () => {
      sent++;
      throw new Error("unknown");
    }
  });
  const t = agentelAiTools(h, env, () => stopped++);
  const results = await Promise.allSettled([
    t.tool_agentelnetwork_list_missions.execute({}),
    t.tool_agentelnetwork_list_missions.execute({})
  ]);
  assert.equal(
    results.every((r) => r.status === "rejected"),
    true
  );
  assert.equal(sent, 1);
  assert.equal(stopped, 1);
});

test("discovered object-only guide schema rejects null target before dispatch", async () => {
  const h = host({
    listTools: () =>
      catalog.map((t) =>
        t.name === "get_participation_guide"
          ? {
              ...t,
              inputSchema: {
                type: "object",
                properties: { target: { type: "object" } }
              }
            }
          : t
      )
  });
  const t = agentelAiTools(h, env);
  await assert.rejects(
    t.tool_agentelnetwork_get_participation_guide.execute({ target: null }),
    /Invalid/
  );
  assert.equal(h.calls.length, 0);
});
