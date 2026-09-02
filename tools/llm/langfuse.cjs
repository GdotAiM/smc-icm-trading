// Langfuse LLM observability — lazy init, graceful skip without keys.
// Configure in .env:
//   LANGFUSE_PUBLIC_KEY=pk-...
//   LANGFUSE_SECRET_KEY=sk-...
//   LANGFUSE_HOST=https://cloud.langfuse.com   (optional; set for self-hosted)
//
// Every chatCompletion call in llm_client.cjs becomes a Langfuse generation
// (model, temperature, input messages, output, token usage, provider tag).
// Queues and flushes in the background — never blocks the trading pipeline.
const Langfuse = require("langfuse");

let client = null;
let inited = false;

function init() {
  if (inited) return client;
  inited = true;
  const pk = process.env.LANGFUSE_PUBLIC_KEY;
  const sk = process.env.LANGFUSE_SECRET_KEY;
  if (!pk || !sk) return null;
  try {
    client = new Langfuse({
      publicKey: pk,
      secretKey: sk,
      baseUrl: process.env.LANGFUSE_HOST || "https://cloud.langfuse.com",
    });
    // Flush queued events before the process exits (short-lived CLI calls).
    const flush = () => { try { client.flushAsync(); } catch {} };
    process.once("beforeExit", flush);
    process.once("SIGINT", flush);
  } catch (e) {
    console.error(`[LANGFUSE] init failed: ${e.message}`);
    client = null;
  }
  return client;
}

// Start a generation. Returns null (caller skips tracing) when disabled.
function startGeneration({ name, messages, config, opts }) {
  const c = init();
  if (!c) return null;
  try {
    return c.generation({
      name: name || "chatCompletion",
      model: config.model,
      modelParameters: {
        temperature: opts.temperature ?? 0.3,
        maxTokens: opts.maxTokens ?? 1024,
      },
      input: messages,
      metadata: {
        provider: config.provider,
        caller: opts.caller || null,
        pair: opts.pair || null,
      },
    });
  } catch {
    return null;
  }
}

// End a generation with output, usage and error level. Never throws.
function endGeneration(gen, result) {
  if (!gen) return;
  try {
    const ok = !result.text.startsWith("[LLM");
    gen.end({
      output: result.text,
      usage: result.usage
        ? {
            input: result.usage.prompt_tokens,
            output: result.usage.completion_tokens,
            total: result.usage.total_tokens,
          }
        : undefined,
      metadata: {
        provider: result.provider,
        model: result.model,
        hasToolCalls: !!(result.toolCalls && result.toolCalls.length),
      },
      level: ok ? "DEFAULT" : "ERROR",
    });
  } catch {}
}

module.exports = { init, startGeneration, endGeneration, isEnabled: () => !!init() };