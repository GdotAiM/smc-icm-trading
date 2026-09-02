// Healthchecks.io heartbeat ping — fire-and-forget, never throws.
// Pings every URL in HEALTHCHECKS_URLS (comma-separated) on each call.
// Configure in .env:
//   HEALTHCHECKS_URLS=https://hc-ping.com/xxxx-1,https://hc-ping.com/xxxx-2
//
// Wire into long-running drivers:
//   const healthcheck = require("./healthcheck.cjs");
//   healthcheck.ping("scheduler");   // at the top of every cycle
const https = require("https");
const http = require("http");

const URLS = (process.env.HEALTHCHECKS_URLS || "").split(",")
  .map(s => s.trim())
  .filter(Boolean);

function pingOnce(url) {
  return new Promise(resolve => {
    const mod = url.startsWith("https:") ? https : http;
    const req = mod.get(url, { timeout: 8000 }, res => {
      res.resume();
      resolve({ url, status: res.statusCode });
    });
    req.on("error", err => {
      // Never break the caller; log to stderr only.
      console.error(`[HEALTHCHECK] ping failed ${url}: ${err.message}`);
      resolve({ url, status: 0 });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ url, status: 0 });
    });
  });
}

// Ping all configured healthchecks.io URLs (and any URL, e.g. Cronitor).
// Returns resolved array; callers should not await for critical paths.
async function ping(label) {
  if (URLS.length === 0) return [];
  const results = await Promise.all(URLS.map(pingOnce));
  return results;
}

module.exports = { ping };
