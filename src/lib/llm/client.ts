import Anthropic from "@anthropic-ai/sdk";

/**
 * Browser client. The key comes from the Settings object only: it is never
 * read from the environment and never leaves this machine except in requests
 * to api.anthropic.com made by the official SDK.
 *
 * `maxRetries: 0` because `withRetry` in errors.ts owns retry policy.
 * `timeout` is in milliseconds in the TypeScript SDK.
 */
export function makeClient(apiKey: string, workspaceId?: string | null): Anthropic {
  const ws = workspaceId?.trim();
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 0,
    timeout: 10 * 60 * 1000,
    ...(ws ? { defaultHeaders: { "anthropic-workspace-id": ws } } : {}),
  });
}
