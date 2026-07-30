// Shared error logger — every catch block should call this
// Usage: const { logError } = require("./logger.cjs"); logError("module", "context", error);
const fs = require("fs");
const path = require("path");

const ROOT = "C:/Users/cash/smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
const ERROR_LOG = path.join(ROOT, "shared", DATE, "error_log.jsonl");

function ensureDir() {
  try { fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true }); } catch {}
}

function logError(module, context, error) {
  ensureDir();
  const entry = {
    time: new Date().toISOString(),
    module: module,
    context: context,
    message: error?.message || String(error),
    stack: error?.stack?.substring(0, 300) || "",
    code: error?.code || "",
  };
  try {
    fs.appendFileSync(ERROR_LOG, JSON.stringify(entry) + "\n");
  } catch {}
  // Always write to stderr so it's visible in terminal too
  console.error(`[ERROR:${module}] ${context}: ${entry.message}`);
}

function logWarning(module, context, detail) {
  ensureDir();
  const entry = {
    time: new Date().toISOString(),
    module: module,
    context: context,
    message: detail,
    level: "WARN"
  };
  try {
    fs.appendFileSync(ERROR_LOG, JSON.stringify(entry) + "\n");
  } catch {}
  console.error(`[WARN:${module}] ${context}: ${detail}`);
}

module.exports = { logError, logWarning };
