export type ModelBudgetOptions = {
  maxRequests?: number;
  maxOutputTokens?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  signal?: AbortSignal;
};

export type ModelBudgetSnapshot = {
  attempts: number;
  maxRequests: number;
  remaining: number;
};

export type ModelBudgetFetch = typeof fetch & {
  snapshot: () => ModelBudgetSnapshot;
};

function budgetError(message: string): never {
  // Never include the provider response, request body, headers or credential.
  throw new Error(message);
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1)
    budgetError(`Invalid model budget ${name}.`);
  return value;
}

async function withinSignal<T>(
  signal: AbortSignal,
  operation: () => Promise<T>
): Promise<T> {
  if (signal.aborted) budgetError("Model request aborted.");
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(new Error("Model request aborted."));
    signal.addEventListener("abort", aborted, { once: true });
    Promise.resolve()
      .then(() => {
        if (signal.aborted) budgetError("Model request aborted.");
        return operation();
      })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", aborted));
  });
}

function redactText(value: string, secrets: readonly string[]): string {
  for (const secret of secrets) value = value.replaceAll(secret, "[REDACTED]");
  return value;
}

function redactValue(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === "string") return redactText(value, secrets);
  if (Array.isArray(value))
    return value.map((item) => redactValue(item, secrets));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [
        redactText(name, secrets),
        redactValue(item, secrets)
      ])
    );
  return value;
}

function requestSecrets(request: Request): string[] {
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  const apiKey = request.headers.get("x-api-key");
  return [
    ...new Set([bearer, apiKey].filter((value): value is string => !!value))
  ];
}

function safeHeaders(response: Response, secrets: readonly string[]): Headers {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("location");
  for (const [name, value] of headers) {
    if (secrets.some((secret) => name.includes(secret.toLowerCase())))
      headers.delete(name);
    else headers.set(name, redactText(value, secrets));
  }
  return headers;
}

async function safeJsonBody(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  maxBytes: number,
  secrets: readonly string[]
): Promise<string> {
  const reader = body.getReader();
  let bytes = 0;
  let text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const next = await withinSignal(signal, () => reader.read());
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maxBytes) budgetError("Model response size limit reached.");
      text += decoder.decode(next.value, { stream: true });
    }
    text += decoder.decode();
    try {
      return JSON.stringify(redactValue(JSON.parse(text), secrets));
    } catch {
      budgetError("Invalid model JSON response.");
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    budgetError("Model response unavailable.");
  } finally {
    reader.releaseLock();
  }
}

function safeEventStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  maxBytes: number,
  secrets: readonly string[]
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let bytes = 0;
  let ended = false;

  const sanitizeLine = (line: string) => {
    const ending = line.endsWith("\r\n")
      ? "\r\n"
      : line.endsWith("\n")
        ? "\n"
        : "";
    const content = line.slice(0, line.length - ending.length);
    if (!content.startsWith("data:"))
      return redactText(content, secrets) + ending;
    const payload = content.slice(5).trim();
    if (payload === "[DONE]" || !payload) return content + ending;
    try {
      return `data: ${JSON.stringify(redactValue(JSON.parse(payload), secrets))}${ending}`;
    } catch {
      budgetError("Invalid model event response.");
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (signal.aborted) budgetError("Model request aborted.");
        while (true) {
          const newline = buffer.indexOf("\n");
          if (newline >= 0) {
            const line = buffer.slice(0, newline + 1);
            buffer = buffer.slice(newline + 1);
            controller.enqueue(encoder.encode(sanitizeLine(line)));
            return;
          }
          if (ended) {
            if (buffer) {
              controller.enqueue(encoder.encode(sanitizeLine(buffer)));
              buffer = "";
            }
            controller.close();
            reader.releaseLock();
            return;
          }
          const next = await withinSignal(signal, () => reader.read());
          if (next.done) {
            buffer += decoder.decode();
            ended = true;
          } else {
            bytes += next.value.byteLength;
            if (bytes > maxBytes)
              budgetError("Model response size limit reached.");
            buffer += decoder.decode(next.value, { stream: true });
          }
        }
      } catch {
        await reader.cancel().catch(() => undefined);
        controller.error(new Error("Model event response unavailable."));
      }
    },
    async cancel() {
      await reader.cancel().catch(() => undefined);
    }
  });
}

/** Per-turn model transport budget. Credentials stay in transient fetch memory. */
export function createModelBudgetFetch(
  expectedUrl: string,
  options: ModelBudgetOptions = {},
  outbound: typeof fetch = fetch
): ModelBudgetFetch {
  let endpoint: URL;
  try {
    endpoint = new URL(expectedUrl);
  } catch {
    budgetError("Invalid fixed model endpoint.");
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.href !== expectedUrl ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    budgetError("Invalid fixed model endpoint.");
  const maxRequests = positiveInteger(
    options.maxRequests ?? 6,
    "request limit"
  );
  const maxOutputTokens = positiveInteger(
    options.maxOutputTokens ?? 1536,
    "output limit"
  );
  const maxRequestBytes = positiveInteger(
    options.maxRequestBytes ?? 256 * 1024,
    "request size"
  );
  const maxResponseBytes = positiveInteger(
    options.maxResponseBytes ?? 1024 * 1024,
    "response size"
  );
  let attempts = 0;

  const transport: typeof fetch = async (input, init) => {
    let request: Request;
    try {
      request = new Request(input, init);
    } catch {
      budgetError("Invalid model request.");
    }
    const signal = options.signal
      ? AbortSignal.any([request.signal, options.signal])
      : request.signal;
    if (signal.aborted) budgetError("Model request aborted.");
    if (request.url !== expectedUrl || request.method !== "POST")
      budgetError("Model endpoint or method changed.");
    if (!request.headers.get("content-type")?.includes("application/json"))
      budgetError("Model request must be JSON.");
    let parsed: Record<string, unknown>;
    try {
      const encoded = await withinSignal(signal, () => request.clone().text());
      if (new TextEncoder().encode(encoded).byteLength > maxRequestBytes)
        budgetError("Model request size limit reached.");
      parsed = JSON.parse(encoded);
    } catch {
      budgetError("Invalid model request body.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      budgetError("Invalid model request body.");
    const tokenLimits = [
      parsed.max_tokens,
      parsed.max_completion_tokens
    ].filter((value) => value !== undefined);
    if (
      !tokenLimits.length ||
      tokenLimits.some(
        (value) =>
          !Number.isSafeInteger(value) ||
          Number(value) < 1 ||
          Number(value) > maxOutputTokens
      )
    )
      budgetError(
        "Model output token limit is missing or exceeds this turn's budget."
      );
    if (signal.aborted) budgetError("Model request aborted.");
    if (attempts >= maxRequests)
      budgetError("Model request limit reached for this turn.");
    // Reserve immediately before sending. Failed/unknown attempts stay reserved.
    attempts++;
    let response: Response;
    try {
      response = await withinSignal(signal, () =>
        outbound(new Request(request, { redirect: "manual", signal }))
      );
    } catch {
      budgetError("Model provider request unavailable.");
    }
    if (
      response.redirected ||
      (response.status >= 300 && response.status < 400)
    ) {
      await response.body?.cancel().catch(() => undefined);
      budgetError("Model provider redirects are forbidden.");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return new Response("Model provider request failed.", {
        status: response.status,
        headers: { "content-type": "text/plain" }
      });
    }
    if (!response.body) budgetError("Model provider response is empty.");
    const secrets = requestSecrets(request);
    const headers = safeHeaders(response, secrets);
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream"))
      return new Response(
        safeEventStream(response.body, signal, maxResponseBytes, secrets),
        {
          status: response.status,
          headers
        }
      );
    if (contentType.includes("application/json"))
      return new Response(
        await safeJsonBody(response.body, signal, maxResponseBytes, secrets),
        {
          status: response.status,
          headers
        }
      );
    await response.body.cancel().catch(() => undefined);
    budgetError("Unsupported model provider response type.");
  };
  return Object.assign(transport, {
    snapshot: () => ({
      attempts,
      maxRequests,
      remaining: maxRequests - attempts
    })
  });
}
