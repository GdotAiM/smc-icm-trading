// Memory Injector — "Ghost of Trades Past" (Graph-Powered)
// Uses the unified Trade Graph to inject rich relational context
// before Stage 01 (HTF Bias) and Stage 04 (Model Selection).
//
// Now powered by trade_graph.cjs — traverses typed edges to find:
//   - Similar past trades (model + session + pair)
//   - Active lessons from recent trades
//   - Failure patterns (losing model × session combinations)
//   - Model performance track records
//   - Unresolved knowledge gaps
//   - Session clustering patterns
//
// Usage:
//   node tools/memory_injector.cjs PAIR [MODEL]             Inject context for pair
//   node tools/memory_injector.cjs PAIR [MODEL] --rebuild    Rebuild graph then inject
//   node tools/memory_injector.cjs --summary                  Show graph summary

const fs = require("fs");
const path = require("path");
const graph = require("./trade_graph.cjs");

const ROOT = path.join(__dirname, "..");

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

function main() {
  const args = process.argv.slice(2);

  // ── Summary mode ────────────────────────────────────────────
  if (args[0] === "--summary") {
    const g = graph.ensureLoaded();
    const trades = Object.values(g.nodes).filter(n => n.type === "trade").length;
    const lessons = Object.values(g.nodes).filter(n => n.type === "lesson").length;
    const gaps = Object.values(g.nodes).filter(n => n.type === "gap" && !n.resolved).length;
    const patterns = graph.findFailurePatterns(g, null).slice(0, 5);

    console.log(JSON.stringify({
      graphBuilt: g.built,
      totalTrades: trades,
      activeLessons: lessons,
      unresolvedGaps: gaps,
      topFailurePatterns: patterns,
    }, null, 2));
    return;
  }

  // ── Rebuild flag ────────────────────────────────────────────
  const rebuildIdx = args.indexOf("--rebuild");
  if (rebuildIdx >= 0) {
    args.splice(rebuildIdx, 1);
    const g = graph.buildGraph();
    graph.saveGraph(g);
    console.log(JSON.stringify({ rebuilt: g.built }));
  }

  // ── Parse pair/model ────────────────────────────────────────
  const pair = args[0] || "GBPUSD";
  const model = args[1] || "";

  // ── Load graph and build context ────────────────────────────
  const g = graph.ensureLoaded();
  const ctx = graph.buildInjectionContext(g, pair, model || null);
  const md = graph.formatContextMarkdown(ctx);

  // ── Write output ────────────────────────────────────────────
  const outDir = path.join(ROOT, "stages", "00_macro_context", "output");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${pair.toLowerCase()}_memory.md`);

  if (md) {
    fs.writeFileSync(outFile, md, "utf8");
  }

  // ── Report ──────────────────────────────────────────────────
  console.log(JSON.stringify({
    pair: pair.toUpperCase(),
    model: model || "any",
    graphBuilt: g.built,
    similarFound: ctx.similarTrades.length,
    activeLessons: ctx.activeLessons.length,
    unresolvedGaps: ctx.unresolvedGaps.length,
    failurePatterns: ctx.failurePatterns.length,
    context: md ? `Injected into Stage 01/04 (${outFile})` : "No prior trade data — first session?",
    outputFile: outFile,
  }, null, 2));
}

main();
