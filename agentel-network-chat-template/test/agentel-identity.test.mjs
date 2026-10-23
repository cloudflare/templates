import assert from "node:assert/strict";
import { test } from "node:test";
import { readAgentelIdentity } from "../src/agentel.ts";

const agentId = "agent_24823b7d-3ee3-4e35-8891-15d2d7d671c1";
const syntheticKey = "synthetic-test-key-not-a-credential";

test("missing or blank identity configuration rejects before any request", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    throw new Error("Unexpected network request in an offline test.");
  });

  const cases = [
    ["missing both", {}],
    ["missing Agent ID", { AGENTEL_API_KEY: syntheticKey }],
    ["missing key", { AGENTEL_AGENT_ID: agentId }],
    [
      "blank Agent ID",
      { AGENTEL_AGENT_ID: "  ", AGENTEL_API_KEY: syntheticKey }
    ],
    ["blank key", { AGENTEL_AGENT_ID: agentId, AGENTEL_API_KEY: "  " }]
  ];

  for (const [name, env] of cases) {
    await t.test(name, async () => {
      await assert.rejects(
        readAgentelIdentity(env),
        /Agentel is not configured/
      );
      assert.equal(requests, 0);
    });
  }
});

test("a different /me Agent ID rejects after one read-only request", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const request = new Request(input, init);
    requests.push({ url: request.url, method: request.method });
    return Response.json({
      agent: {
        id: "agent_different",
        name: "Other Agent",
        slug: "other-agent"
      },
      credential: { scopes: ["identity:read"] }
    });
  });

  await assert.rejects(
    readAgentelIdentity({
      AGENTEL_AGENT_ID: agentId,
      AGENTEL_API_KEY: syntheticKey
    }),
    /does not match the identity returned by \/me/
  );
  assert.deepEqual(requests, [
    { url: "https://agentel.tech/api/v1/me", method: "GET" }
  ]);
});

test("matching identity returns only public identity fields", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const request = new Request(input, init);
    requests.push({
      url: request.url,
      method: request.method,
      authorization: request.headers.get("Authorization")
    });
    return Response.json({
      agent: {
        id: agentId,
        name: "Agentel Cloudflare Agents",
        slug: "agentel-cloudflare-agents",
        privateDescription: "Synthetic field that must not reach the model",
        reputation: null
      },
      credential: {
        scopes: ["identity:read", "updates:write"],
        keyHint: "synthetic"
      },
      extraMetadata: "Synthetic metadata that must not reach the model"
    });
  });

  const result = await readAgentelIdentity({
    AGENTEL_AGENT_ID: ` ${agentId} `,
    AGENTEL_API_KEY: ` ${syntheticKey} `,
    AGENTEL_API_BASE_URL: " https://identity-test.invalid/api/v1/ "
  });

  assert.deepEqual(result, {
    agent: {
      id: agentId,
      name: "Agentel Cloudflare Agents",
      slug: "agentel-cloudflare-agents"
    }
  });
  assert.deepEqual(requests, [
    {
      url: "https://identity-test.invalid/api/v1/me",
      method: "GET",
      authorization: `Bearer ${syntheticKey}`
    }
  ]);
});
