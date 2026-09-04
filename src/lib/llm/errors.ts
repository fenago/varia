import Anthropic from "@anthropic-ai/sdk";

export type LlmErrorKind = "auth" | "rate" | "network" | "refusal" | "parse" | "other";

/**
 * The one error type the rest of the app sees from the provider.
 * `kind` drives UI behaviour: auth → route to Settings, rate/network → retried
 * here, refusal/parse/other → mark the variant as errored and continue.
 */
export class LlmError extends Error {
  kind: LlmErrorKind;
  status?: number;
  /** Refusal category from `stop_details`, when the API supplied one. */
  category?: string | null;

  constructor(kind: LlmErrorKind, message: string, opts: { status?: number; cause?: unknown; category?: string | null } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "LlmError";
    this.kind = kind;
    if (opts.status !== undefined) this.status = opts.status;
    if (opts.category !== undefined) this.category = opts.category;
  }

  get retryable(): boolean {
    return this.kind === "rate" || this.kind === "network";
  }
}

/** Map anything thrown by the SDK (or by us) to an LlmError. Most specific first. */
export function toLlmError(e: unknown): LlmError {
  if (e instanceof LlmError) return e;

  if (e instanceof Anthropic.AuthenticationError) {
    return new LlmError("auth", "Anthropic rejected the API key (401).", { status: 401, cause: e });
  }
  if (e instanceof Anthropic.PermissionDeniedError) {
    return new LlmError("auth", "This key is not permitted to use the requested model (403).", { status: 403, cause: e });
  }
  if (e instanceof Anthropic.RateLimitError) {
    return new LlmError("rate", "Rate limited by Anthropic (429).", { status: 429, cause: e });
  }
  if (e instanceof Anthropic.APIUserAbortError) {
    return new LlmError("other", "Request cancelled.", { cause: e });
  }
  // APIConnectionError is a subclass of APIError in the TS SDK: check it before APIError.
  if (e instanceof Anthropic.APIConnectionError) {
    return new LlmError("network", "Could not reach api.anthropic.com. Check your connection and try again.", { cause: e });
  }
  if (e instanceof Anthropic.APIError) {
    const status = typeof e.status === "number" ? e.status : undefined;
    // Overloaded / server errors are transient: treat like a rate limit so withRetry backs off.
    if (status !== undefined && (status === 529 || status >= 500)) {
      return new LlmError("rate", `Anthropic returned ${status}: ${e.message}`, { status, cause: e });
    }
    return new LlmError("other", `Anthropic returned ${status ?? "an error"}: ${e.message}`, { status, cause: e });
  }
  // zodOutputFormat / the parser throw a plain AnthropicError when the JSON does not match the schema.
  if (e instanceof Anthropic.AnthropicError && /structured output/i.test(e.message)) {
    return new LlmError("parse", e.message, { cause: e });
  }
  if (e instanceof Error) {
    if (e.name === "AbortError") return new LlmError("other", "Request cancelled.", { cause: e });
    return new LlmError("other", e.message, { cause: e });
  }
  return new LlmError("other", String(e));
}

export interface RetryOptions {
  tries?: number;
  baseMs?: number;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new LlmError("other", "Request cancelled."));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(t);
      reject(new LlmError("other", "Request cancelled."));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Retry `fn` on rate-limit and network errors only, with exponential backoff
 * plus jitter. Every other error kind is thrown immediately as an LlmError.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { tries = 3, baseMs = 800 }: RetryOptions = {},
  signal?: AbortSignal,
): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) throw new LlmError("other", "Request cancelled.");
    try {
      return await fn();
    } catch (raw) {
      const err = toLlmError(raw);
      attempt += 1;
      if (!err.retryable || attempt >= tries) throw err;
      const backoff = baseMs * 2 ** (attempt - 1);
      const jitter = Math.random() * baseMs;
      await sleep(backoff + jitter, signal);
    }
  }
}
