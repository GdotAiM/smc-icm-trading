// retry.ts — shared exponential-backoff fetch helper (TypeScript)
// Mirrors tools/lib/http_retry.cjs for the TS MCP server layer.
// Called from connection.ts to guard CDP target-discovery calls.

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  onError?: (err: Error, attempt: number, url: string) => void;
}

const DEFAULTS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 500,
  timeoutMs: 8000,
  onError: () => {},
};

function isRetryable(statusCode: number, body: string): boolean {
  if (statusCode >= 500) return true;
  if (statusCode === 429) return true;
  if (/busy|unavailable|error/i.test(body)) return true;
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrapped fetch() with exponential backoff + jitter.
 * Returns a normal Response on success; throws after final retry failure.
 */
export async function fetchRetry(
  url: string,
  opts: RetryOptions = {}
): Promise<Response> {
  const { maxRetries, baseDelayMs, timeoutMs, onError } = { ...DEFAULTS, ...opts };
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        if (isRetryable(resp.status, body)) {
          lastErr = new Error(`HTTP ${resp.status}: ${body.slice(0, 120)}`);
          onError(lastErr, attempt, url);
          if (attempt < maxRetries)
            await sleep(baseDelayMs * Math.pow(2, attempt - 1) * (0.75 + Math.random() * 0.5));
          continue;
        }
      }
      return resp;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      onError(lastErr, attempt, url);
      if (attempt < maxRetries)
        await sleep(baseDelayMs * Math.pow(2, attempt - 1) * (0.75 + Math.random() * 0.5));
    }
  }

  throw Object.assign(
    new Error(`CDP fetch failed after ${maxRetries} retries: ${url} — ${lastErr?.message}`),
    { cause: lastErr }
  );
}
