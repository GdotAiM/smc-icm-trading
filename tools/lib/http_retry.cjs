// http_retry.cjs — fetch() wrapper with exponential backoff + jitter
//
// Wraps the native fetch() so CDP calls (and any localhost HTTP) survive
// transient TV busy-states without crashing the pipeline.
//
// Usage:
//   const { fetchRetry } = require("./lib/http_retry.cjs");
//   const resp = await fetchRetry("http://127.0.0.1:9222/json/list");
//   // Same shape as a normal Response — .json(), .text(), etc.
//
// Config (all optional):
//   maxRetries    — default 3
//   baseDelayMs   — default 500 (doubles each attempt: 500→1000→2000)
//   timeoutMs     — default 8000 per attempt
//   onError       — optional callback(err, attempt, url) for logging

const DEFAULTS = { maxRetries: 3, baseDelayMs: 500, timeoutMs: 8000 };

function isRetryable(statusCode, body) {
  // 429, 503, 500+ are retryable; some CDP responses mention "busy" in body
  if (statusCode >= 500) return true;
  if (statusCode === 429) return true;
  if (typeof body === "string" && /busy|unavailable|error/i.test(body)) return true;
  return false;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} url            — target URL
 * @param {object} [opts]         — override defaults
 * @param {number} [opts.maxRetries]
 * @param {number} [opts.baseDelayMs]
 * @param {number} [opts.timeoutMs]
 * @param {function} [opts.onError]
 * @returns {Promise<Response>}    — resolved Response on success or after last failed retry
 */
async function fetchRetry(url, opts = {}) {
  const { maxRetries, baseDelayMs, timeoutMs, onError } = { ...DEFAULTS, ...opts };
  let lastErr = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      // Check for retryable server errors (read body once to inspect)
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        if (isRetryable(resp.status, body)) {
          lastErr = new Error(`HTTP ${resp.status}: ${body.slice(0, 120)}`);
          onError?.(lastErr, attempt, url);
          if (attempt < maxRetries) await sleep(baseDelayMs * Math.pow(2, attempt - 1) * (0.75 + Math.random() * 0.5));
          continue;
        }
      }
      return resp; // success or non-retryable error — caller handles
    } catch (err) {
      lastErr = err;
      onError?.(err, attempt, url);
      if (attempt < maxRetries) await sleep(baseDelayMs * Math.pow(2, attempt - 1) * (0.75 + Math.random() * 0.5));
    }
  }

  throw Object.assign(new Error(`CDP fetch failed after ${maxRetries} retries: ${url} — ${lastErr?.message}`), { cause: lastErr });
}

module.exports = { fetchRetry };
