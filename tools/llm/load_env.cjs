// load_env.cjs — Best-effort project .env loader for standalone tools
//
// llm_client.cjs only loads .env when it is the entry module, so any tool that
// merely requires it (council, continuous_learn, setup_auditor, validator
// --edge, ) would miss the API keys. This idempotent loader exists for those
// consumers. It never overrides already-set variables.

const path = require("path");
const fs = require("fs");

function loadProjectEnv(rootOverride) {
  const root = rootOverride || process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..", "..");
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return false;
  try {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = { loadProjectEnv };