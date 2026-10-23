import test from "node:test";
import assert from "node:assert/strict";
import { generateText, tool } from "ai";
import { z } from "zod";
import {
  boundedChatModel,
  chatDeadline,
  CHAT_LIMITS,
  readonlyChat
} from "../src/chat-model.ts";

const base = {
  MODEL_API_BASE_URL: "https://model.example/v1",
  MODEL_API_KEY: "test-only-model-secret",
  MODEL_NAME: "test-model"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("locked Anthropic SDK uses the guarded messages route and bounded token payload", async () => {
  let seen;
  const settings = boundedChatModel(
    { ...base, MODEL_API_PROTOCOL: "anthropic-messages" },
    new AbortController().signal,
    async (request) => {
      seen = {
        url: request.url,
        redirect: request.redirect,
        body: await request.json()
      };
      return json({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "test-model",
        content: [{ type: "text", text: "Observed test result." }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 4 }
      });
    }
  );
  const result = await generateText({
    model: settings.model,
    maxRetries: settings.maxRetries,
    maxOutputTokens: settings.maxOutputTokens,
    providerOptions: settings.providerOptions,
    prompt: "Use a source only if you have one.",
    tools: {
      get_connection: tool({
        inputSchema: z.object({}),
        execute: async () => ({ readOnly: true })
      })
    }
  });
  assert.equal(result.text, "Observed test result.");
  assert.equal(seen.url, "https://model.example/v1/messages");
  assert.equal(seen.redirect, "manual");
  assert.equal(seen.body.max_tokens, 1536);
  assert.deepEqual(seen.body.thinking, { type: "disabled" });
  assert.deepEqual(
    seen.body.tools.map((t) => t.name),
    ["get_connection"]
  );
  assert.equal(settings.transport.snapshot().attempts, 1);
});

test("existing OpenAI-compatible setting stays on chat/completions", async () => {
  let seen;
  const settings = boundedChatModel(
    base,
    new AbortController().signal,
    async (request) => {
      seen = { url: request.url, body: await request.json() };
      return json({
        id: "cmpl_test",
        object: "chat.completion",
        created: 0,
        model: "test-model",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "OK" },
            finish_reason: "stop"
          }
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      });
    }
  );
  const result = await generateText({
    model: settings.model,
    maxRetries: settings.maxRetries,
    maxOutputTokens: settings.maxOutputTokens,
    prompt: "Reply OK"
  });
  assert.equal(result.text, "OK");
  assert.equal(seen.url, "https://model.example/v1/chat/completions");
  assert.equal(seen.body.max_tokens, 1536);
});

test("provider 503 is attempted once with SDK retries disabled", async () => {
  let calls = 0;
  const settings = boundedChatModel(
    { ...base, MODEL_API_PROTOCOL: "anthropic-messages" },
    new AbortController().signal,
    async () => {
      calls++;
      return json({ error: "secret" }, 503);
    }
  );
  await assert.rejects(
    generateText({
      model: settings.model,
      maxRetries: settings.maxRetries,
      maxOutputTokens: settings.maxOutputTokens,
      prompt: "Do not retry."
    })
  );
  assert.equal(calls, 1);
  assert.equal(settings.transport.snapshot().attempts, 1);
});

test("raw response byte cap runs before an OpenAI compatibility transform can buffer a line", async () => {
  let transformFinished = false;
  const settings = boundedChatModel(
    base,
    new AbortController().signal,
    async () =>
      new Response(
        new TextEncoder().encode("data: " + "x".repeat(1024 * 1024 + 1)),
        { headers: { "content-type": "text/event-stream" } }
      ),
    async (response) => {
      await response.text();
      transformFinished = true;
      return response;
    }
  );
  await assert.rejects(
    generateText({
      model: settings.model,
      maxRetries: settings.maxRetries,
      maxOutputTokens: settings.maxOutputTokens,
      prompt: "Reply"
    })
  );
  assert.equal(transformFinished, false);
  assert.equal(settings.transport.snapshot().attempts, 1);
});

test("unsupported protocol and insecure or parameterized endpoint never dispatch", () => {
  assert.throws(() =>
    boundedChatModel(
      { ...base, MODEL_API_PROTOCOL: "unknown" },
      new AbortController().signal
    )
  );
  for (const url of [
    "http://model.example/v1",
    "https://model.example/v1?key=secret",
    "https://x:y@model.example/v1"
  ]) {
    assert.throws(() =>
      boundedChatModel(
        { ...base, MODEL_API_BASE_URL: url },
        new AbortController().signal
      )
    );
  }
});

test("readonly mode is explicit and legacy omitted configuration is preserved", () => {
  assert.equal(readonlyChat(base), false);
  assert.equal(readonlyChat({ ...base, AGENTEL_READONLY_CHAT: "true" }), true);
  assert.equal(
    readonlyChat({ ...base, AGENTEL_READONLY_CHAT: "false" }),
    false
  );
  assert.throws(() => readonlyChat({ ...base, AGENTEL_READONLY_CHAT: "yes" }));
});

test("turn deadline is bounded and disposal removes the idle-preventing timer", () => {
  const originalSet = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  let callback, delay, cleared;
  try {
    globalThis.setTimeout = (fn, ms) => {
      callback = fn;
      delay = ms;
      return 123;
    };
    globalThis.clearTimeout = (id) => {
      cleared = id;
    };
    const deadline = chatDeadline();
    assert.equal(delay, CHAT_LIMITS.durationMs);
    assert.equal(deadline.signal.aborted, false);
    callback();
    assert.equal(deadline.signal.aborted, true);
    deadline.dispose();
    assert.equal(cleared, 123);
  } finally {
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
  }
});
