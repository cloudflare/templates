import test from "node:test";
import assert from "node:assert/strict";
import { createModelBudgetFetch } from "../src/model-budget.ts";

const endpoint = "https://model.example/anthropic/v1/messages";
const key = "synthetic-model-secret-v1";
function input(
  body = { model: "synthetic-model", max_tokens: 1536 },
  extra = {}
) {
  return {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify(body),
    ...extra
  };
}
const success = () => Response.json({ content: [{ text: "safe" }] });
const stream = (chunks, extra = {}) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks)
          controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      }
    }),
    { headers: { "content-type": "text/event-stream", ...extra } }
  );

test("fixed HTTPS endpoint and positive integer budgets are required", () => {
  for (const url of [
    "http://model.example/v1/messages",
    "https://user:pass@model.example/v1/messages",
    endpoint + "?key=synthetic",
    endpoint + "#part",
    "invalid"
  ])
    assert.throws(() => createModelBudgetFetch(url), /fixed model endpoint/);
  for (const options of [
    { maxRequests: 0 },
    { maxRequests: 1.2 },
    { maxOutputTokens: NaN },
    { maxRequestBytes: -1 },
    { maxResponseBytes: 0 }
  ])
    assert.throws(
      () => createModelBudgetFetch(endpoint, options),
      /Invalid model budget/
    );
});

test("wrong endpoint, method and body reject before sending", async () => {
  let calls = 0;
  const send = createModelBudgetFetch(endpoint, {}, async () => {
    calls++;
    return success();
  });
  await assert.rejects(
    send("https://other.example/v1/messages", input()),
    /endpoint or method/
  );
  await assert.rejects(send(endpoint, { method: "GET" }), /endpoint or method/);
  await assert.rejects(
    send(endpoint, input({}, { headers: { "content-type": "text/plain" } })),
    /must be JSON/
  );
  await assert.rejects(
    send(endpoint, input({}, { body: "{synthetic-secret-invalid" })),
    /Invalid model request body/
  );
  await assert.rejects(send(endpoint, input([])), /Invalid model request body/);
  assert.equal(calls, 0);
  assert.equal(send.snapshot().attempts, 0);
});

test("missing, fractional, excessive and contradictory output limits reject before sending", async () => {
  let calls = 0;
  const send = createModelBudgetFetch(endpoint, {}, async () => {
    calls++;
    return success();
  });
  for (const body of [
    {},
    { max_tokens: 0 },
    { max_tokens: "1536" },
    { max_tokens: 1536.1 },
    { max_tokens: 1537 },
    { max_completion_tokens: 1537 },
    { max_tokens: 1536, max_completion_tokens: 2000 }
  ])
    await assert.rejects(send(endpoint, input(body)), /output token limit/);
  assert.equal(calls, 0);
});

test("Anthropic and OpenAI output fields pass within exact boundary", async () => {
  const send = createModelBudgetFetch(endpoint, {}, async (request) => {
    assert.equal(request.url, endpoint);
    assert.equal(request.redirect, "manual");
    assert.equal(request.headers.get("x-api-key"), key);
    return success();
  });
  await send(endpoint, input({ max_tokens: 1536 }));
  await send(endpoint, input({ max_completion_tokens: 1536 }));
  assert.deepEqual(send.snapshot(), {
    attempts: 2,
    maxRequests: 6,
    remaining: 4
  });
});

test("request byte limit blocks large bodies without leaking them", async () => {
  let calls = 0;
  const send = createModelBudgetFetch(
    endpoint,
    { maxRequestBytes: 40 },
    async () => {
      calls++;
      return success();
    }
  );
  await assert.rejects(
    send(endpoint, input({ max_tokens: 1, prompt: key.repeat(30) })),
    (error) => !error.message.includes(key)
  );
  assert.equal(calls, 0);
});

test("send reservation survives thrown failure and there is no internal retry", async () => {
  let calls = 0;
  const send = createModelBudgetFetch(
    endpoint,
    { maxRequests: 1 },
    async () => {
      calls++;
      throw new Error(key);
    }
  );
  await assert.rejects(
    send(endpoint, input()),
    (error) => error.message === "Model provider request unavailable."
  );
  assert.equal(calls, 1);
  assert.deepEqual(send.snapshot(), {
    attempts: 1,
    maxRequests: 1,
    remaining: 0
  });
  await assert.rejects(send(endpoint, input()), /request limit reached/);
  assert.equal(calls, 1);
});

test("parallel sends share one reservation counter", async () => {
  let calls = 0;
  const send = createModelBudgetFetch(
    endpoint,
    { maxRequests: 1 },
    async () => {
      calls++;
      await Promise.resolve();
      return success();
    }
  );
  const outcomes = await Promise.allSettled([
    send(endpoint, input()),
    send(endpoint, input())
  ]);
  assert.equal(
    outcomes.filter((outcome) => outcome.status === "fulfilled").length,
    1
  );
  assert.equal(calls, 1);
  assert.equal(send.snapshot().attempts, 1);
});

test("redirect refuses body/location and still consumes the attempt", async () => {
  let calls = 0;
  const send = createModelBudgetFetch(endpoint, {}, async () => {
    calls++;
    return new Response(key, {
      status: 302,
      headers: { location: `https://other.example/${key}` }
    });
  });
  await assert.rejects(
    send(endpoint, input()),
    (error) => error.message === "Model provider redirects are forbidden."
  );
  assert.equal(calls, 1);
  assert.equal(send.snapshot().attempts, 1);
});

test("non-2xx status is retained while error body and headers are discarded", async () => {
  const send = createModelBudgetFetch(
    endpoint,
    {},
    async () => new Response(key, { status: 429, headers: { "x-echo": key } })
  );
  const response = await send(endpoint, input());
  assert.equal(response.status, 429);
  assert.equal(await response.text(), "Model provider request failed.");
  assert.equal(response.headers.get("x-echo"), null);
  assert.equal(send.snapshot().attempts, 1);
});

test("successful JSON scrubs both credential headers, object names and response headers", async () => {
  const bearer = "synthetic-bearer-secret-v1";
  const send = createModelBudgetFetch(endpoint, {}, async () =>
    Response.json(
      { [key]: bearer, content: [{ text: `echo ${key} ${bearer}` }] },
      { headers: { "x-echo": `${key}/${bearer}`, "content-length": "999" } }
    )
  );
  const response = await send(
    endpoint,
    input(
      { max_tokens: 1 },
      {
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          authorization: `Bearer ${bearer}`
        }
      }
    )
  );
  const body = await response.text();
  assert(!body.includes(key));
  assert(!body.includes(bearer));
  assert(body.includes("[REDACTED]"));
  assert.equal(response.headers.get("x-echo"), "[REDACTED]/[REDACTED]");
  assert.equal(response.headers.get("content-length"), null);
});

test("SSE scrubs secrets split across network chunks and escaped JSON strings", async () => {
  const escaped = key.replace("model", "\\u006dodel");
  const full = `event: content_block_delta\r\ndata: {"delta":{"text":"${escaped}"}}\r\n\r\ndata: [DONE]\n`;
  const cut = full.indexOf("secret") + 2;
  const send = createModelBudgetFetch(endpoint, {}, async () =>
    stream([full.slice(0, cut), full.slice(cut)])
  );
  const body = await (await send(endpoint, input())).text();
  assert(!body.includes(key));
  assert(!body.includes(escaped));
  assert(body.includes('"text":"[REDACTED]"'));
  assert(body.includes("event: content_block_delta\r\n"));
  assert(body.includes("data: [DONE]\n"));
});

test("JSON response size and invalid body reject with static safe error", async () => {
  for (const result of [
    () => Response.json({ value: key.repeat(20) }),
    () => new Response(key, { headers: { "content-type": "application/json" } })
  ]) {
    const send = createModelBudgetFetch(
      endpoint,
      { maxResponseBytes: 40 },
      async () => result()
    );
    await assert.rejects(
      send(endpoint, input()),
      (error) => error.message === "Model response unavailable."
    );
    assert.equal(send.snapshot().attempts, 1);
  }
});

test("SSE size and invalid event failures do not leak provider data", async () => {
  for (const chunks of [
    [`data: {"text":"${key.repeat(20)}"}\n\n`],
    [`data: ${key}\n\n`]
  ]) {
    const send = createModelBudgetFetch(
      endpoint,
      { maxResponseBytes: 40 },
      async () => stream(chunks)
    );
    const response = await send(endpoint, input());
    await assert.rejects(
      response.text(),
      (error) => error.message === "Model event response unavailable."
    );
    assert.equal(send.snapshot().attempts, 1);
  }
});

test("unknown response content type never forwards the response body", async () => {
  const send = createModelBudgetFetch(
    endpoint,
    {},
    async () => new Response(key, { headers: { "content-type": "text/plain" } })
  );
  await assert.rejects(
    send(endpoint, input()),
    /Unsupported model provider response type/
  );
});

test("already aborted turn sends no request", async () => {
  const controller = new AbortController();
  controller.abort(new Error(key));
  let calls = 0;
  const send = createModelBudgetFetch(
    endpoint,
    { signal: controller.signal },
    async () => {
      calls++;
      return success();
    }
  );
  await assert.rejects(
    send(endpoint, input()),
    (error) => error.message === "Model request aborted."
  );
  assert.equal(calls, 0);
  assert.equal(send.snapshot().attempts, 0);
});

test("turn deadline aborts hung fetch and preserves its attempt", async () => {
  const controller = new AbortController();
  let observedSignal;
  const send = createModelBudgetFetch(
    endpoint,
    { signal: controller.signal },
    async (request) => {
      observedSignal = request.signal;
      return new Promise(() => {});
    }
  );
  const pending = send(endpoint, input());
  while (!observedSignal)
    await new Promise((resolve) => setTimeout(resolve, 1));
  controller.abort(new Error(key));
  await assert.rejects(
    pending,
    (error) => error.message === "Model provider request unavailable."
  );
  assert.equal(observedSignal.aborted, true);
  assert.equal(send.snapshot().attempts, 1);
});

test("aborting after headers also terminates a pending SSE body", async () => {
  const controller = new AbortController();
  const send = createModelBudgetFetch(
    endpoint,
    { signal: controller.signal },
    async () =>
      new Response(
        new ReadableStream({
          pull() {
            return new Promise(() => {});
          }
        }),
        { headers: { "content-type": "text/event-stream" } }
      )
  );
  const response = await send(endpoint, input());
  const pending = response.text();
  controller.abort(new Error(key));
  await assert.rejects(
    pending,
    (error) => error.message === "Model event response unavailable."
  );
  assert.equal(send.snapshot().attempts, 1);
});

test("snapshot is detached and contains no credential or endpoint state", async () => {
  const send = createModelBudgetFetch(endpoint, {}, async () => success());
  const snapshot = send.snapshot();
  snapshot.attempts = 999;
  await send(endpoint, input());
  assert.deepEqual(send.snapshot(), {
    attempts: 1,
    maxRequests: 6,
    remaining: 5
  });
  assert(!JSON.stringify(send.snapshot()).includes(key));
});
