// Sentry crash tracking — lazy init, graceful skip without SENTRY_DSN.
// Configure in .env:
//   SENTRY_DSN=https://xxx@sentry.io/yyy
//   SENTRY_ENV=production              (optional, default "production")
//
// Usage:
//   const sentry = require("./sentry.cjs");
//   sentry.initSentry();
//   sentry.captureError("module", "context", err);
//   sentry.captureMessage("warning", "message");
let Sentry = null;
let inited = false;
let enabled = false;

function initSentry() {
  if (inited) return enabled;
  inited = true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  try {
    Sentry = require("@sentry/node");
    const { execSync } = require("child_process");
    let release = undefined;
    try {
      release = execSync("git rev-parse --short HEAD", { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {}
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENV || "production",
      release: release || undefined,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.05"),
      serverName: process.env.SENTRY_SERVER_NAME || "smc-icm-trading",
    });
    enabled = true;
  } catch (e) {
    console.error(`[SENTRY] init failed: ${e.message}`);
  }
  return enabled;
}

// Capture an error. safe for non-error values. Never throws.
function captureError(module, context, error, extra) {
  if (!initSentry()) return;
  try {
    Sentry.withScope(scope => {
      scope.setTag("module", module);
      scope.setContext("context", { context });
      if (extra && typeof extra === "object") scope.setContext("extra", extra);
      const err = error instanceof Error ? error : new Error(String(error));
      Sentry.captureException(err);
    });
  } catch {}
}

// Capture a message at level "warning" | "error" | "info" | "debug".
function captureMessage(level, message, extra) {
  if (!initSentry()) return;
  try {
    Sentry.withScope(scope => {
      if (extra && typeof extra === "object") scope.setContext("extra", extra);
      Sentry.captureMessage(message, level);
    });
  } catch {}
}

// Flush pending events (call on shutdown for long-running drivers).
async function flush(timeoutMs) {
  if (!enabled || !Sentry) return;
  try { await Sentry.flush(timeoutMs || 2000); } catch {}
}

module.exports = { initSentry, captureError, captureMessage, flush, isEnabled: () => enabled };