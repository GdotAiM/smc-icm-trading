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
    baseUrl: process.env.LLM_BASE_URL || "https://opencode.ai/zen/v1",
    model: process.env.LLM_MODEL || "deepseek-v4-flash-free",
    apiKeyEnv: null,
    rateLimit: "FREE — keyless OpenCode Zen gateway (deepseek-v4-flash-free)",
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
    // LLM_MODEL only overrides the "custom" provider. Named providers (gemini,
    // groq, cerebras, openrouter, fireworks, openai) must use their own default
    // model — a stray global LLM_MODEL (e.g. a deepseek id) would 404 on their
    // endpoints. Explicit overrides.model still wins for any provider.
    model: overrides?.model || (providerName === "custom" ? (process.env.LLM_MODEL || def.model) : def.model),
    rateLimit: def.rateLimit,
    hasKey: apiKey.length > 0,
    // The "custom" provider may point at a keyless endpoint (e.g. an anonymoust
    // gateway). hasKey=false then still allows the request — just no auth header.
    keyless: providerName === "custom",
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
 * @param {Array}   opts.tools      - tool definitions to advertise (OpenAI function format)
 * @returns {Promise<{text: string, toolCalls: ?Array<{id,name,arguments}>, provider: string, model: string, usage?: object}>}
 */
async function chatCompletion(messages, opts = {}) {
  const config = resolveConfig(opts);

  if (config.error) {
    return { text: `[LLM config error: ${config.error}]`, provider: config.provider, model: "unknown" };
  }

  if (!config.hasKey && !config.keyless) {
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
    // Reasoning-aware budget. Some gateways (e.g. OpenCode Zen's
    // deepseek-v4-flash-free) emit a long `reasoning_content` BEFORE the answer;
    // with only max_tokens the budget can be exhausted by reasoning alone,
    // leaving the final content empty (finish_reason "length"). max_completion_tokens
    // lets the backend split the budget so the answer is always produced.
    ...(opts.maxCompletionTokens ? { max_completion_tokens: opts.maxCompletionTokens } : {}),
    temperature: opts.temperature ?? 0.3,
    stream: false,
    ...(opts.tools && opts.tools.length ? { tools: opts.tools, tool_choice: opts.toolChoice ?? "auto" } : {}),
  });

  const url = new URL(config.baseUrl + "/chat/completions");
  const isHttps = url.protocol === "https:";
  const transport = isHttps ? https : http;

  const headers = {
    "Content-Type": "application/json",
  };

  if (config.hasKey || !config.keyless) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  // OpenRouter needs HTTP-Referer and X-Title headers
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/cash/smc-icm-trading";
    headers["X-Title"] = "SMC-ICM Trading";
  }

  // The Zen gateway (custom provider → opencode.ai/zen/v1) keys its free tier
  // to the OpenCode client's User-Agent. Without it the request is treated as
  // anonymous third-party traffic and hits the exhausted shared pool (429
  // FreeUsageLimitError). Sending the same UA OpenCode itself sends routes the
  // call to the per-user free quota that reloads daily. Mirrors the version the
  // gateway observed (v1.18.x); any opencode/* UA is accepted.
  if (config.provider === "custom") {
    headers["User-Agent"] = "opencode/1.18.18";
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
            const message = json.choices?.[0]?.message || {};
            const text = message.content || "";
            resolve({
              text,
              toolCalls: parseToolCalls(message),
              rawMessage: message,
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

// ── Tool-calling helpers ───────────────────────────────────────────────────────

/**
 * Extract tool calls from a chat message object (OpenAI-compatible shape).
 * Gemini thinking models attach a `thoughtSignature`/`thought_signature` to
 * each functionCall part; it must be echoed back in the matching tool response,
 * so it is captured here as `signature`.
 * @param {Object} message - e.g. json.choices[0].message
 * @returns {?Array<{id: string, name: string, arguments: object, signature?: string}>} parsed calls or null
 */
function parseToolCalls(message) {
  const calls = message?.tool_calls;
  if (!Array.isArray(calls) || calls.length === 0) return null;
  return calls.map((c) => {
    let args = null;
    try {
      args = c.function?.arguments ? JSON.parse(c.function.arguments) : {};
    } catch (_) {
      args = { _raw: c.function?.arguments || "" };
    }
    return {
      id: c.id,
      name: c.function?.name,
      arguments: args,
      signature: c.thoughtSignature || c.thought_signature || null,
      // DeepSeek-style interleaved reasoning: `reasoning_content` must be echoed
      // back alongside tool_calls or the upstream rejects the follow-up request.
      reasoning: message.reasoning_content || null,
    };
  });
}

/**
 * Best-effort JSON extraction: tries a full parse, then falls back to the first
 * balanced {...} / [...] block found in the text.
 */
function safeJsonParse(text, fallback = null) {
  if (text == null) return fallback;
  const trimmed = String(text).trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    /* fall through */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch (_) {
      /* fall through */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch (_) {
      /* fall through */
    }
  }
  const aStart = trimmed.indexOf("[");
  const aEnd = trimmed.lastIndexOf("]");
  if (aStart !== -1 && aEnd > aStart) {
    try {
      return JSON.parse(trimmed.slice(aStart, aEnd + 1));
    } catch (_) {
      /* fall through */
    }
  }
  return fallback;
}

/**
 * Tally votes/candidates by a key function (defaults to stringified JSON).
 * @returns {Array<{value: *, count: number}>} sorted descending by count
 */
function tallyVotes(items, keyFn) {
  const key = keyFn || ((x) => (typeof x === "object" && x !== null ? JSON.stringify(x) : String(x)));
  const counts = new Map();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ReAct-style agent loop: repeatedly call the LLM with tool definitions,
 * dispatch any tool calls to `toolDispatch[name]`, append results, and loop
 * until the model answers without tool calls (or maxIterations is reached).
 *
 * The loop is audit-only by design: a `[LLM...` error string from chatCompletion
 * short-circuits the loop and returns `status: "llm_unavailable"` so callers
 * never block on a missing LLM.
 *
 * @param {Object}   opts
 * @param {Array}    opts.messages       - initial messages
 * @param {Array}    opts.tools          - OpenAI function tool definitions
 * @param {Object}   opts.toolDispatch   - map of tool name -> async fn(args, ctx)
 * @param {Object}   opts.llmOpts        - opts forwarded to client (provider, maxTokens...)
 * @param {number}   opts.maxIterations  - default 5
 * @param {Function} opts.client         - injectable client (default chatCompletion)
 * @param {Function} opts.log            - optional logger fn (msg)
 * @returns {Promise<{text: string, toolCalls: Array, trace: Array, status: string}>}
 */
async function agentLoop({ messages, tools = [], toolDispatch = {}, llmOpts = {}, maxIterations = 5, client = chatCompletion, log = null }) {
  const history = [...messages];
  const trace = [];
  const ctx = { pair: llmOpts.pair || "" };

  for (let i = 0; i < maxIterations; i++) {
    const resp = await client(history, { ...llmOpts, tools });
    trace.push({ iteration: i, response: resp });
    const text = resp.text || "";

    if (text.startsWith("[LLM")) {
      if (log) log(`agentLoop: LLM unavailable (${text.slice(0, 60)})`);
      return { text, toolCalls: [], trace, status: "llm_unavailable" };
    }

    const toolCalls = resp.toolCalls || [];
    if (toolCalls.length === 0) {
      return { text, toolCalls: [], trace, status: "complete" };
    }

    // Preserve the assistant's tool_calls verbatim (Gemini thinking models need
    // the thought_signature echoed back in the next turn; DeepSeek-style models
    // need reasoning_content echoed back alongside the tool calls).
    const firstReasoning = toolCalls.find((tc) => tc.reasoning)?.reasoning;
    history.push({
      role: "assistant",
      content: text,
      ...(firstReasoning ? { reasoning_content: firstReasoning } : {}),
      tool_calls:
        resp.rawMessage?.tool_calls ||
        toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments),
          },
        })),
    });

    for (const tc of toolCalls) {
      const fn = toolDispatch[tc.name];
      let result;
      if (typeof fn !== "function") {
        result = `[tool not found: ${tc.name}]`;
      } else {
        try {
          result = await fn(tc.arguments || {}, ctx);
        } catch (e) {
          result = `[tool error: ${e.message}]`;
        }
      }
      history.push({
        role: "tool",
        tool_call_id: tc.id,
        content: typeof result === "string" ? result : JSON.stringify(result),
        ...(tc.signature ? { thought_signature: tc.signature } : {}),
      });
      if (log) log(`agentLoop[${i}] ${tc.name} -> ${typeof result === "string" ? result.slice(0, 80) : "ok"}`);
      trace.push({ iteration: i, tool: tc.name, args: tc.arguments, result: typeof result === "string" ? result.slice(0, 1000) : result });
    }
  }

  return { text: "[agent loop: max iterations reached]", toolCalls: [], trace, status: "max_iterations" };
}

/**
 * Self-consistency: run the same prompt `runs` times at higher temperature,
 * extract a verdict per run, and tally the majority.
 *
 * @param {Object}   opts
 * @param {Array}    opts.messages      - messages to run multiple times
 * @param {Object}   opts.llmOpts       - base opts (temperature overridden per run)
 * @param {number}   opts.runs          - default 3
 * @param {number}   opts.temperature   - default 0.7
 * @param {Function} opts.extract       - text -> verdict value (default raw text)
 * @param {Function} opts.client        - injectable client
 * @returns {Promise<{responses: Array, tally: Array, majority: ?*}>}
 */
async function selfConsistent({ messages, llmOpts = {}, runs = 3, temperature = 0.7, extract = null, client = chatCompletion }) {
  const responses = [];
  for (let i = 0; i < runs; i++) {
    const r = await client(messages, { ...llmOpts, temperature });
    responses.push(r);
  }
  const parsed = responses.map((r) => (extract ? extract(r.text) : r.text));
  const tally = tallyVotes(parsed);
  return { responses, tally, majority: tally.length ? tally[0] : null };
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

module.exports = {
  chatCompletion,
  resolveConfig,
  listProviders,
  PROVIDERS,
  parseToolCalls,
  safeJsonParse,
  tallyVotes,
  sleep,
  agentLoop,
  selfConsistent,
};

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
