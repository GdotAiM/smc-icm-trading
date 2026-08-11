// memory_lessons.cjs — Active trade-graph memory for LLM prompts
//
// Loads the unified trade graph (shared/trade_graph.json) and returns the
// active lessons + unresolved knowledge gaps for a pair, formatted for
// injection into LLM prompts. This is the LLM-layer counterpart of
// memory_injector.cjs (which writes markdown for stage output files).
//
// The graph is the authority; if it is missing or unreadable this module
// degrades to empty results so no LLM call is ever blocked.
//
// Usage:
//   const { loadActiveLessons } = require("./memory_lessons.cjs");
//   const mem = loadActiveLessons({ pair: "EURUSD", limit: 8 });
//   // mem = { pair, lessons: [...], gaps: [...], graphVersion, error }

const path = require("path");
const fs = require("fs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..", "..");
const GRAPH_FILE = path.join(ROOT, "shared", "trade_graph.json");

function loadGraphSafe() {
  if (!fs.existsSync(GRAPH_FILE)) return null;
  try {
    const tg = require(path.join(ROOT, "tools", "trade_graph.cjs"));
    if (typeof tg.loadGraph === "function") return tg.loadGraph();
  } catch (_) {
    /* fall through to raw parse */
  }
  try {
    return JSON.parse(fs.readFileSync(GRAPH_FILE, "utf8"));
  } catch (_) {
    return null;
  }
}

/**
 * Load active lessons + unresolved gaps for a pair from the trade graph.
 * @param {Object}   opts
 * @param {string}   opts.pair   - pair symbol, e.g. "EURUSD"
 * @param {number}   opts.limit  - max lessons (default 8)
 * @returns {{pair: string, lessons: Array, gaps: Array, graphVersion?: *, error?: string}}
 */
function loadActiveLessons({ pair, limit = 8 } = {}) {
  const result = { pair: (pair || "").toUpperCase(), lessons: [], gaps: [] };
  if (!result.pair) {
    result.error = "no pair provided";
    return result;
  }

  const graph = loadGraphSafe();
  if (!graph) {
    result.error = "trade graph missing or unreadable";
    return result;
  }

  try {
    const tg = require(path.join(ROOT, "tools", "trade_graph.cjs"));
    if (typeof tg.getActiveLessons === "function") {
      result.lessons = tg.getActiveLessons(graph, result.pair, limit)
        .map((l) => ({
          title: l.title,
          detail: l.detail,
          category: l.category,
          pair: l.pair || result.pair,
          date: l.date || l.tradeDate || "",
          tradeDate: l.tradeDate || l.date || "",
        }));
    }
    if (typeof tg.getUnresolvedGaps === "function") {
      result.gaps = tg
        .getUnresolvedGaps(graph)
        .filter((g) => {
          const gapPair = (g.pair || "").toUpperCase();
          return !gapPair || gapPair === result.pair;
        })
        .map((g) => ({
          title: g.title,
          detail: g.detail,
          severity: g.severity || "medium",
          pair: g.pair || "",
        }));
    }
    result.graphVersion = graph.version;
  } catch (e) {
    result.error = `trade_graph error: ${e.message}`;
  }

  return result;
}

/** Compact markdown block for prompt injection (empty string if nothing loaded). */
function formatMemoryMarkdown(mem, opts = {}) {
  if (!mem || mem.error) return "";
  const sections = [];
  if (mem.lessons.length) {
    sections.push(
      `Active Lessons (${mem.pair}):\n` +
        mem.lessons
          .map(
            (l) =>
              `- [${l.category || "general"}] ${l.title} — ${l.detail}${l.tradeDate ? ` (from ${l.tradeDate})` : ""}`,
          )
          .join("\n"),
    );
  }
  if (mem.gaps.length) {
    sections.push(
      `Unresolved Knowledge Gaps (${mem.pair}):\n` +
        mem.gaps
          .map((g) => `- (${g.severity}) ${g.title} — ${g.detail || ""}`)
          .join("\n"),
    );
  }
  return sections.join("\n\n");
}

// ── CLI ────────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const pair = (args[0] || "").toUpperCase();
  if (!pair || pair === "--help") {
    console.log(`Usage: node tools/llm/memory_lessons.cjs <PAIR> [limit]
Example: node tools/llm/memory_lessons.cjs EURUSD 8`);
    return;
  }
  const mem = loadActiveLessons({ pair, limit: Number(args[1]) || 8 });
  console.log(JSON.stringify(mem, null, 2));
}

// ── Exports ────────────────────────────────────────────────────────────────────

module.exports = { loadActiveLessons, formatMemoryMarkdown, GRAPH_FILE };

if (require.main === module) {
  main();
}
