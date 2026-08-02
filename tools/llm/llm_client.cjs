// LLM Client — Lightweight OpenAI-compatible provider abstraction
//
// Supports 6 free providers + paid fallback from free-llm-api-resources:
//   gemini     → Google AI Studio (250K tokens/min, Gemini 3.6 Flash — free)
//   cerebras   → Cerebras Cloud (1M tokens/day, gpt-oss-120b — free)
//   groq       → Groq Cloud (14,400 req/day, Llama 3.1 8B — free)
//   openrouter → OpenRouter (50 req/day free, multi-model router)
//   fireworks  → Fireworks AI (paid, DeepSeek V4 Pro)
//   openai     → OpenAI API (paid, GPT-4o)
//   custom     → Any OpenAI-compatible endpoint
//
// Environment variables:
//   LLM_PROVIDER  = "gemini" (default) — which provider to use
//   LLM_API_KEY   = override API key for any provider
//   LLM_MODEL     = override model name
//   GEMINI_API_KEY, CEREBRAS_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY,
//   FIREWORKS_API_KEY, OPENAI_API_KEY — provider-specific keys
//
// Graceful fallback: if no API key is configured, calls return an error
// message string instead of throwing — the trading pipeline is never
// blocked by a missing LLM.

const https = require("https");
const http = require("http");

// ── Provider defaults ──────────────────────────────────────────────────────────

const PROVIDERS = {
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.6-flash",
    apiKeyEnv: "GEMINI_API_KEY",
    rateLimit: "250K tokens/min, 20 req/day (free)",
  },
  cerebras: {
    baseUrl: "https://api.cerebras.ai/v1",
    model: "gpt-oss-120b",
    apiKeyEnv: "CEREBRAS_API_KEY",
    rateLimit: "1M tokens/day, 30K tokens/min (free)",
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.1-8b-instant",
    apiKeyEnv: "GROQ_API_KEY",
    rateLimit: "14,400 req/day, 6K tokens/min (free)",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    model: "google/gemma-4-31b-it:free",
    apiKeyEnv: "OPENROUTER_API_KEY",
    rateLimit: "50 req/day free, 1,000/day with $10 topup",
  },
  fireworks: {
    baseUrl: "https://api.fireworks.ai/inference/v1",
    model: "accounts/fireworks/models/deepseek-v4-pro",
    apiKeyEnv: "FIREWORKS_API_KEY",
    rateLimit: "paid — no free tier",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    apiKeyEnv: "OPENAI_API_KEY",
    rateLimit: "paid — no free tier",
  },
  custom: {
    baseUrl: process.env.LLM_BASE_URL || "http://localhost:8000/v1",
    model: process.env.LLM_MODEL || "gemma-4-26b",
    apiKeyEnv: null,
    rateLimit: "user-defined",
  },
};

// ── Resolve config ─────────────────────────────────────────────────────────────

function resolveConfig(overrides) {
  const providerName = overrides?.provider || process.env.LLM_PROVIDER || "gemini";
  const def = PROVIDERS[providerName];

  if (!def) {
    return {
      error: `Unknown LLM provider: "${providerName}". Supported: ${Object.keys(PROVIDERS).join(", ")}`,
      provider: providerName,
    };
  }

  // Resolve API key: explicit override → provider-specific env → LLM_API_KEY
  let apiKey = overrides?.apiKey || "";
  if (!apiKey && def.apiKeyEnv) {
    apiKey = process.env[def.apiKeyEnv] || "";
  }
  if (!apiKey) {
    apiKey = process.env.LLM_API_KEY || "";
  }

  const config = {
    provider: providerName,
    baseUrl: overrides?.baseUrl || def.baseUrl,
    apiKey,
    model: overrides?.model || process.env.LLM_MODEL || def.model,
    rateLimit: def.rateLimit,
    hasKey: apiKey.length > 0,
  };

  return config;
}

// ── Non-streaming chat completion ──────────────────────────────────────────────

/**
 * Send a chat completion request and return the full response text.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {Object} opts
 * @param {string}  opts.provider   - override LLM_PROVIDER
 * @param {string}  opts.model      - override model
 * @param {string}  opts.apiKey     - override API key
 * @param {number}  opts.maxTokens  - max output tokens (default 1024)
 * @param {number}  opts.temperature - sampling temperature (default 0.3)
 * @param {number}  opts.timeout    - request timeout ms (default 30000)
 * @returns {Promise<{text: string, provider: string, model: string, usage?: object}>}
 */
async function chatCompletion(messages, opts = {}) {
  const config = resolveConfig(opts);

  if (config.error) {
    return { text: `[LLM config error: ${config.error}]`, provider: config.provider, model: "unknown" };
  }

  if (!config.hasKey) {
    return {
      text: `[LLM not configured: no API key for "${config.provider}". Set ${PROVIDERS[config.provider]?.apiKeyEnv || "LLM_API_KEY"} in .env]`,
      provider: config.provider,
      model: config.model,
    };
  }

  const body = JSON.stringify({
    model: config.model,
    messages,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.3,
    stream: false,
  });

  const url = new URL(config.baseUrl + "/chat/completions");
  const isHttps = url.protocol === "https:";
  const transport = isHttps ? https : http;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };

  // OpenRouter needs HTTP-Referer and X-Title headers
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/cash/smc-icm-trading";
    headers["X-Title"] = "SMC-ICM Trading";
  }

  const timeout = opts.timeout ?? 30000;

  return new Promise((resolve) => {
    const req = transport.request(
      url,
      {
        method: "POST",
        headers,
        timeout,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            const errText = data.slice(0, 300);
            resolve({
              text: `[LLM error ${res.statusCode}: ${errText}]`,
              provider: config.provider,
              model: config.model,
            });
            return;
          }
          try {
            const json = JSON.parse(data);
            const text = json.choices?.[0]?.message?.content || "";
            resolve({
              text,
              provider: config.provider,
              model: config.model,
              usage: json.usage || undefined,
            });
          } catch (e) {
            resolve({
              text: `[LLM parse error: ${e.message}]`,
              provider: config.provider,
              model: config.model,
            });
          }
        });
      },
    );

    req.on("error", (err) => {
      resolve({
        text: `[LLM request failed: ${err.message}]`,
        provider: config.provider,
        model: config.model,
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        text: `[LLM timeout after ${timeout}ms]`,
        provider: config.provider,
        model: config.model,
      });
    });

    req.write(body);
    req.end();
  });
}

// ── Provider info ──────────────────────────────────────────────────────────────

function listProviders() {
  console.log("\nLLM Providers (from free-llm-api-resources)\n");
  console.log("═".repeat(70));
  for (const [name, def] of Object.entries(PROVIDERS)) {
    const configured = process.env[def.apiKeyEnv] ? "✅ configured" : "⚪ not set";
    const isFree = def.rateLimit.includes("free") && !def.rateLimit.includes("no free") ? "FREE " : "PAID ";
    console.log(`  ${name.padEnd(12)} ${isFree.padEnd(6)} ${def.model}`);
    console.log(`              ${def.rateLimit} | ${configured}`);
    console.log();
  }
  console.log("═".repeat(70));
  console.log(`Active: ${process.env.LLM_PROVIDER || "gemini"} → ${resolveConfig().model}\n`);
}

// ── CLI ────────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (!mode || mode === "--help") {
    console.log(`
LLM Client — Free LLM API integration for SMC-ICM Trading
Usage:
  node tools/llm/llm_client.cjs --providers          List all providers + status
  node tools/llm/llm_client.cjs --test [provider]     Test connectivity
  node tools/llm/llm_client.cjs --chat "<message>"    Send a single message

Examples:
  node tools/llm/llm_client.cjs --providers
  node tools/llm/llm_client.cjs --test gemini
  node tools/llm/llm_client.cjs --chat "What is a Fair Value Gap?"
`);
    return;
  }

  if (mode === "--providers") {
    listProviders();
    return;
  }

  if (mode === "--test") {
    const provider = args[1] || process.env.LLM_PROVIDER || "gemini";
    console.log(`Testing ${provider}...`);
    chatCompletion(
      [{ role: "user", content: "Say 'LLM connection successful' and nothing else." }],
      { provider, maxTokens: 50, temperature: 0 },
    ).then((r) => {
      console.log(`Provider: ${r.provider}`);
      console.log(`Model: ${r.model}`);
      console.log(`Response: ${r.text}`);
      if (r.usage) console.log(`Usage:`, r.usage);
    });
    return;
  }

  if (mode === "--chat") {
    const message = args.slice(1).join(" ");
    if (!message) {
      console.log("Error: Provide a message. Example: node tools/llm/llm_client.cjs --chat \"Hello\"");
      return;
    }
    console.log(`Asking ${process.env.LLM_PROVIDER || "gemini"}...`);
    chatCompletion([{ role: "user", content: message }]).then((r) => {
      console.log(`\n${r.text}\n`);
    });
    return;
  }

  console.log(`Unknown mode: ${mode}. Use --help.`);
}

// ── Exports ────────────────────────────────────────────────────────────────────

module.exports = { chatCompletion, resolveConfig, listProviders, PROVIDERS };

// Run CLI if called directly
if (require.main === module) {
  // Load .env from project root
  try {
    const path = require("path");
    const envPath = path.join(__dirname, "..", "..", ".env");
    const fs = require("fs");
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  } catch (_) { /* env loading is best-effort */ }

  main();
}
