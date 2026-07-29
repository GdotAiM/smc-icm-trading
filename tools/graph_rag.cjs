// Graph RAG — Unified Concept + Experience Retrieval
// Combines TF-IDF concept search with trade graph traversal so the agent
// gets both "what is this ICT concept" AND "how have you traded it."
//
// Usage:
//   node tools/graph_rag.cjs --query "Silver Bullet London entry"
//   node tools/graph_rag.cjs --concept "ict-silver-bullet-strategy"
//   node tools/graph_rag.cjs --context GBPUSD
//   node tools/graph_rag.cjs --prep "Silver Bullet" GBPUSD

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RAG_DIR = path.join(ROOT, "references", "ict_knowledge", "rag");

// ═══════════════════════════════════════════════════════════════
// TF-IDF ENGINE (from ict_rag.cjs, re-implemented for require)
// ═══════════════════════════════════════════════════════════════

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her",
  "was", "one", "our", "out", "has", "have", "been", "some", "them", "then",
  "this", "that", "with", "from", "they", "will", "what", "when", "make", "like",
  "just", "over", "into", "your", "which", "their", "about", "there", "would",
  "could", "should", "more", "than", "also", "very", "much", "such", "these",
  "those", "only", "other", "each", "does", "done", "being", "its", "his", "how",
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2)
    .filter(w => !STOP_WORDS.has(w));
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (const k of Object.keys(a)) {
    dot += a[k] * (b[k] || 0);
    normA += a[k] * a[k];
  }
  for (const k of Object.keys(b)) {
    normB += b[k] * b[k];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function loadRagIndex() {
  const indexPath = path.join(RAG_DIR, "rag_index.json");
  const chunksPath = path.join(RAG_DIR, "chunks.json");

  if (!fs.existsSync(indexPath) || !fs.existsSync(chunksPath)) {
    console.error("RAG index not found. Run: node tools/ict_rag.cjs --build");
    return null;
  }

  const indexData = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  const chunks = JSON.parse(fs.readFileSync(chunksPath, "utf8"));

  // rag_index.json has { built, totalChunks, totalConcepts, vectors }
  // chunks.json has full chunk objects with content, title, tier, etc.
  const vectors = indexData.vectors || [];

  if (!vectors.length || !chunks.length) {
    console.error("RAG index is empty. Run: node tools/ict_rag.cjs --build");
    return null;
  }

  // Each vector entry: { id, vec, conceptId, section }
  // vec is the sparse TF-IDF vector: { word: weight, ... }
  // Pair with corresponding chunk by index
  return vectors.map((v, i) => ({
    vec: v.vec || v,  // extract the actual vector object
    chunk: chunks[i] || null,
  })).filter(d => d.chunk && d.chunk.content && d.vec);
}

function tfidfQuery(queryText, docs, topK = 5) {
  const queryTokens = tokenize(queryText);
  const queryVec = {};
  for (const t of queryTokens) {
    queryVec[t] = (queryVec[t] || 0) + 1;
  }
  const norm = Math.sqrt(Object.values(queryVec).reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (const t of Object.keys(queryVec)) queryVec[t] /= norm;
  }

  const scored = docs.map(doc => {
    const similarity = cosineSimilarity(queryVec, doc.vec);
    const tierBoost = [1.5, 1.3, 1.1, 1.0, 0.8][doc.chunk.tier] || 1.0;
    const exactBonus = doc.chunk.content.toLowerCase().includes(queryText.toLowerCase()) ? 1.5 : 1.0;
    const titleBonus = doc.chunk.title.toLowerCase().includes(queryTokens.slice(0, 3).join(" ")) ? 1.3 : 1.0;
    return { ...doc, score: similarity * tierBoost * exactBonus * titleBonus, rawSimilarity: similarity };
  });

  scored.sort((a, b) => b.score - a.score);

  const seen = new Set();
  const results = [];
  for (const s of scored) {
    if (s.score < 0.01) continue;
    if (!seen.has(s.chunk.conceptId)) {
      seen.add(s.chunk.conceptId);
      results.push({
        conceptId: s.chunk.conceptId,
        title: s.chunk.title,
        section: s.chunk.section,
        tier: s.chunk.tier,
        tierName: ["Foundations", "Core Mechanics", "Strategies", "Advanced", "Meta"][s.chunk.tier] || "Unknown",
        score: s.score.toFixed(3),
        excerpt: extractRelevant(s.chunk.content, queryTokens),
        source: s.chunk.source,
        file: s.chunk.file,
        cite: `${s.chunk.file}#L${s.chunk.lineStart}`,
        tags: s.chunk.tags,
      });
    }
    if (results.length >= topK) break;
  }
  return results;
}

function extractRelevant(content, queryTokens) {
  // Strip YAML frontmatter
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
  const sentences = body.split(/[.!?]\s+/);
  const relevant = sentences
    .filter(s => queryTokens.some(t => s.toLowerCase().includes(t)))
    .slice(0, 3)
    .map(s => s.trim().slice(0, 200))
    .join(". ");
  return relevant || body.slice(0, 300).replace(/\n/g, " ");
}

// ═══════════════════════════════════════════════════════════════
// GRAPH TRAVERSAL — Enrich concepts with trading experience
// ═══════════════════════════════════════════════════════════════

let _graph = null;
function loadGraph() {
  if (_graph) return _graph;
  try {
    _graph = require("./trade_graph.cjs").ensureLoaded();
  } catch (e) {
    _graph = null;
  }
  return _graph;
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Find all trades, lessons, gaps, and rules connected to a concept via graph edges */
function enrichConcept(conceptId, graph) {
  if (!graph) return null;

  const conceptNodeId = `concept:${conceptId}`;
  const concept = graph.nodes[conceptNodeId];
  if (!concept) return { linked: false, reason: "Concept not in graph" };

  const enrichment = {
    linked: true,
    usageCount: concept.usageCount || 0,
    trades: [],
    lessons: [],
    gaps: [],
    models: [],
    playbookRules: [],
  };

  // Find lessons linked to this concept
  const conceptEdgeIndices = graph._edgeIndex[conceptNodeId] || [];
  const lessonEdges = conceptEdgeIndices
    .map(i => graph.edges[i])
    .filter(e => e && (e.type === "LESSON_RELATES_TO" || e.type === "GAP_BLOCKS_CONCEPT"));

  for (const edge of lessonEdges) {
    if (edge.type === "LESSON_RELATES_TO") {
      const lesson = graph.nodes[edge.source];
      if (lesson) enrichment.lessons.push({
        title: lesson.title,
        detail: lesson.detail,
        category: lesson.category,
        date: lesson.date,
        pair: lesson.pair,
      });
    }
    if (edge.type === "GAP_BLOCKS_CONCEPT") {
      const gap = graph.nodes[edge.source];
      if (gap && !gap.resolved) enrichment.gaps.push({
        type: gap.gapType,
        severity: gap.severity,
        detail: gap.detail,
        recommendation: gap.recommendation,
      });
    }
  }

  // Find trades that used this concept (via USED_CONCEPT edges from trades)
  const tradeEdges = conceptEdgeIndices
    .map(i => graph.edges[i])
    .filter(e => e && e.type === "USED_CONCEPT" && e.source.startsWith("trade:"));

  const modelSet = new Set();
  for (const edge of tradeEdges) {
    const trade = graph.nodes[edge.source];
    if (!trade) continue;
    enrichment.trades.push({
      date: trade.date,
      pair: trade.pair,
      direction: trade.direction,
      model: trade.model,
      session: trade.session,
      outcome: trade.outcome,
      pnl: trade.pnl,
    });
    if (trade.model) modelSet.add(trade.model);
  }

  // Get model performance for models used with this concept
  for (const modelName of modelSet) {
    const modelNode = graph.nodes[`model:${slugify(modelName)}`];
    if (modelNode && modelNode.totalTrades) {
      enrichment.models.push({
        name: modelName,
        totalTrades: modelNode.totalTrades,
        winRate: modelNode.winRate,
        avgPnl: modelNode.avgPnl,
      });
    }
  }

  // Find playbook rules connected via lessons
  const lessonNodeIds = enrichment.lessons.map((l, i) => {
    // Use the actual lesson node ID format from the graph
    return `lesson:${slugify(l.pair || "unknown")}:${l.date}:${i}`;
  });
  for (const lessonId of lessonNodeIds) {
    const lessonEdgeIndices = graph._edgeIndex[lessonId] || [];
    const ruleEdges = lessonEdgeIndices
      .map(i => graph.edges[i])
      .filter(e => e && e.type === "LESSON_UPDATED_RULE");
    for (const re of ruleEdges) {
      const rule = graph.nodes[re.target];
      if (rule) enrichment.playbookRules.push({
        title: rule.title,
        rule: rule.rule,
        category: rule.category,
      });
    }
  }

  // Deduplicate playbook rules
  const seenRules = new Set();
  enrichment.playbookRules = enrichment.playbookRules.filter(r => {
    const key = r.title;
    if (seenRules.has(key)) return false;
    seenRules.add(key);
    return true;
  });

  // Deduplicate lessons
  const seenLessons = new Set();
  enrichment.lessons = enrichment.lessons.filter(l => {
    const key = l.title.slice(0, 40);
    if (seenLessons.has(key)) return false;
    seenLessons.add(key);
    return true;
  });

  enrichment.trades.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  enrichment.lessons.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return enrichment;
}

// ═══════════════════════════════════════════════════════════════
// QUERY MODES
// ═══════════════════════════════════════════════════════════════

/** Full Graph RAG query: concept definitions + your trading history */
function graphRagQuery(queryText, topK = 3) {
  const docs = loadRagIndex();
  if (!docs) return { error: "RAG index not available" };

  const graph = loadGraph();
  const concepts = tfidfQuery(queryText, docs, topK);

  const enriched = concepts.map(c => ({
    ...c,
    experience: enrichConcept(c.conceptId, graph),
  }));

  return {
    query: queryText,
    graphAvailable: !!graph,
    conceptsFound: enriched.length,
    results: enriched,
  };
}

/** Deep-dive on a single concept with full graph data */
function graphRagConcept(conceptIdOrName) {
  const docs = loadRagIndex();
  const graph = loadGraph();

  // Resolve concept ID (supports partial names like "silver bullet" → "ict-silver-bullet-strategy")
  let concept = null;
  let conceptId = conceptIdOrName;

  if (docs) {
    // Try exact match first
    const exact = docs.find(d => d.chunk.conceptId === conceptIdOrName);
    if (exact) {
      concept = {
        conceptId: exact.chunk.conceptId,
        title: exact.chunk.title,
        tier: exact.chunk.tier,
        tierName: ["Foundations", "Core Mechanics", "Strategies", "Advanced", "Meta"][exact.chunk.tier] || "Unknown",
        excerpt: exact.chunk.content.slice(0, 500).replace(/\n/g, " "),
        source: exact.chunk.source,
        file: exact.chunk.file,
      };
    } else {
      // Fuzzy: search by title or concept ID fragment
      const fuzzy = docs.find(d =>
        d.chunk.conceptId.includes(slugify(conceptIdOrName)) ||
        d.chunk.title.toLowerCase().includes(conceptIdOrName.toLowerCase())
      );
      if (fuzzy) {
        conceptId = fuzzy.chunk.conceptId;
        concept = {
          conceptId: fuzzy.chunk.conceptId,
          title: fuzzy.chunk.title,
          tier: fuzzy.chunk.tier,
          tierName: ["Foundations", "Core Mechanics", "Strategies", "Advanced", "Meta"][fuzzy.chunk.tier] || "Unknown",
          excerpt: fuzzy.chunk.content.slice(0, 500).replace(/\n/g, " "),
          source: fuzzy.chunk.source,
          file: fuzzy.chunk.file,
        };
      }
    }
  }

  if (!concept) {
    return { error: `Concept not found: "${conceptIdOrName}". Try a concept ID like "ict-silver-bullet-strategy" or a title keyword.` };
  }

  const enrichment = enrichConcept(conceptId, graph);

  return {
    concept,
    experience: enrichment,
    verdict: summarizeExperience(enrichment),
  };
}

/** Session prep: for a pair + optional model, return what you need to know */
function graphRagPrep(pair, model) {
  const graph = loadGraph();
  if (!graph) return { error: "Trade graph not available. Run: node tools/trade_graph.cjs --build" };

  const tradeGraph = require("./trade_graph.cjs");
  const ctx = tradeGraph.buildInjectionContext(graph, pair, model || null);
  const md = tradeGraph.formatContextMarkdown(ctx);

  // Also find relevant ICT concepts based on the model
  let conceptRefs = [];
  if (model) {
    const docs = loadRagIndex();
    if (docs) {
      const concepts = tfidfQuery(model, docs, 3);
      conceptRefs = concepts.map(c => ({
        conceptId: c.conceptId,
        title: c.title,
        excerpt: c.excerpt,
        cite: c.cite,
      }));
    }
  }

  // Find active lessons for the pair's active models
  const pairTrades = tradeGraph.findTradeNodes(graph, pair, model, null, 5);
  const activeModels = [...new Set(pairTrades.map(t => t.model).filter(Boolean))];
  const modelConcepts = [];
  for (const m of activeModels.slice(0, 3)) {
    const docs = loadRagIndex();
    if (docs) {
      const concepts = tfidfQuery(m, docs, 2);
      for (const c of concepts) {
        modelConcepts.push({ model: m, concept: c.title, conceptId: c.conceptId });
      }
    }
  }

  return {
    pair: pair.toUpperCase(),
    model: model || "any",
    graphContext: ctx,
    markdownContext: md,
    conceptReferences: conceptRefs,
    modelConceptMap: modelConcepts,
  };
}

function summarizeExperience(enrichment) {
  if (!enrichment || !enrichment.linked) return "No trading experience with this concept yet.";

  const parts = [];
  if (enrichment.trades.length > 0) {
    const wins = enrichment.trades.filter(t => t.outcome === "win").length;
    parts.push(`${enrichment.trades.length} trades (${wins}W/${enrichment.trades.length - wins}L)`);
  }
  if (enrichment.lessons.length > 0) {
    parts.push(`${enrichment.lessons.length} lessons learned`);
  }
  if (enrichment.gaps.length > 0) {
    parts.push(`${enrichment.gaps.length} unresolved gaps`);
  }
  if (enrichment.playbookRules.length > 0) {
    parts.push(`${enrichment.playbookRules.length} playbook rules`);
  }

  return parts.length > 0 ? parts.join(" | ") : "Concept studied but not yet traded.";
}

// ═══════════════════════════════════════════════════════════════
// FORMATTING
// ═══════════════════════════════════════════════════════════════

function formatGraphRagResult(result) {
  if (result.error) return `❌ ${result.error}`;

  let out = "";

  for (let i = 0; i < result.results.length; i++) {
    const r = result.results[i];
    out += `\n## ${i + 1}. ${r.title} (${r.tierName}, score: ${r.score})\n`;
    out += `**Concept**: \`${r.conceptId}\` | **Source**: ${r.cite}\n\n`;
    out += `> ${r.excerpt}\n`;

    const exp = r.experience;
    if (exp && exp.linked) {
      const summary = summarizeExperience(exp);
      out += `\n### 📊 Your Experience: ${summary}\n`;

      if (exp.trades.length > 0) {
        out += `\n**Recent trades using this concept:**\n`;
        for (const t of exp.trades.slice(0, 5)) {
          const icon = t.outcome === "win" ? "✅" : t.outcome === "loss" ? "❌" : "➖";
          out += `- ${t.date} | ${t.pair} | ${t.direction || "N/A"} | ${t.model} × ${t.session} | ${icon} ${t.outcome}\n`;
        }
      }

      if (exp.lessons.length > 0) {
        out += `\n**Lessons learned:**\n`;
        for (const l of exp.lessons.slice(0, 3)) {
          out += `- [${l.category}] ${l.title}: ${l.detail.slice(0, 100)}\n`;
        }
      }

      if (exp.gaps.length > 0) {
        out += `\n**⚠️ Unresolved gaps:**\n`;
        for (const g of exp.gaps) {
          out += `- [${g.severity}] ${g.type}: ${g.detail.slice(0, 100)}\n`;
        }
      }

      if (exp.models.length > 0) {
        out += `\n**Model performance:**\n`;
        for (const m of exp.models) {
          const wr = Math.round((m.winRate || 0) * 100);
          out += `- ${m.name}: ${m.totalTrades} trades, ${wr}% WR, avg PnL $${(m.avgPnl || 0).toFixed(2)}\n`;
        }
      }

      if (exp.playbookRules.length > 0) {
        out += `\n**Playbook rules:**\n`;
        for (const pr of exp.playbookRules) {
          out += `- [${pr.category}] ${pr.title}: ${pr.rule.slice(0, 100)}\n`;
        }
      }
    } else {
      out += `\n*No trading experience with this concept yet.*\n`;
    }

    out += `\n---\n`;
  }

  if (result.results.length === 0) {
    out += `\nNo ICT concepts found for "${result.query}". Try different search terms.\n`;
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════

function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (!mode || mode === "--help") {
    console.log(`
Graph RAG — Concept Knowledge + Trading Experience
Combines ICT concept retrieval with your trade history graph.

Usage:
  node tools/graph_rag.cjs --query "Silver Bullet London entry"
      Search concepts + show your trading experience with each

  node tools/graph_rag.cjs --concept "ict-silver-bullet-strategy"
      Deep-dive on one concept with full experience data

  node tools/graph_rag.cjs --concept "silver bullet"
      Fuzzy match — finds concept by partial name

  node tools/graph_rag.cjs --prep "Silver Bullet" GBPUSD
      Pre-session prep: trade history + relevant concepts for model+pair

  node tools/graph_rag.cjs --context GBPUSD
      Full memory injection context for a pair

  node tools/graph_rag.cjs --summary
      Quick overview: concepts vs. experience gaps

Examples:
  node tools/graph_rag.cjs --query "order block entry FVG"
  node tools/graph_rag.cjs --concept "breaker block"
  node tools/graph_rag.cjs --prep "Silver Bullet" XAUUSD
  node tools/graph_rag.cjs --summary
`);
    return;
  }

  // ── Query mode ─────────────────────────────────────────────────
  if (mode === "--query") {
    const queryText = args.slice(1).join(" ") || "Silver Bullet";
    const result = graphRagQuery(queryText, 3);
    if (result.error) {
      console.log(JSON.stringify(result));
    } else {
      console.log(formatGraphRagResult(result));
      // Also output JSON for programmatic use
      console.log("\n<!-- JSON");
      console.log(JSON.stringify(result, null, 2));
      console.log("-->");
    }
    return;
  }

  // ── Concept deep-dive ──────────────────────────────────────────
  if (mode === "--concept") {
    const conceptId = args[1];
    if (!conceptId) {
      console.log(JSON.stringify({ error: "Usage: --concept <concept-id-or-name>" }));
      return;
    }
    const result = graphRagConcept(conceptId);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // ── Pre-session prep ───────────────────────────────────────────
  if (mode === "--prep") {
    const model = args[1] || "";
    const pair = args[2] || "GBPUSD";
    const result = graphRagPrep(pair, model || null);
    console.log(result.markdownContext || JSON.stringify(result, null, 2));
    return;
  }

  // ── Context injection ──────────────────────────────────────────
  if (mode === "--context") {
    const pair = args[1] || "GBPUSD";
    const model = args[2] || null;
    const result = graphRagPrep(pair, model);
    console.log(result.markdownContext || "(No prior data for this pair)");
    return;
  }

  // ── Summary: concepts vs experience ────────────────────────────
  if (mode === "--summary") {
    const graph = loadGraph();
    const docs = loadRagIndex();

    if (!graph) {
      console.log(JSON.stringify({ error: "Trade graph not available" }));
      return;
    }

    const conceptNodes = Object.values(graph.nodes).filter(n => n.type === "concept");
    const traded = conceptNodes.filter(c => (c.usageCount || 0) > 0);
    const neverTraded = conceptNodes.filter(c => !c.usageCount && c.tier <= 2);
    const lessons = Object.values(graph.nodes).filter(n => n.type === "lesson");
    const gaps = Object.values(graph.nodes).filter(n => n.type === "gap" && !n.resolved);
    const trades = Object.values(graph.nodes).filter(n => n.type === "trade");

    console.log(JSON.stringify({
      totalConcepts: conceptNodes.length,
      conceptsTraded: traded.length,
      conceptsNeverTraded: neverTraded.length,
      topTradedConcepts: traded
        .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
        .slice(0, 10)
        .map(c => ({ id: c.id, name: c.name, usageCount: c.usageCount })),
      biggestBlindSpots: neverTraded
        .slice(0, 5)
        .map(c => ({ id: c.id, name: c.name, tier: c.tierName })),
      totalTrades: trades.length,
      totalLessons: lessons.length,
      unresolvedGaps: gaps.length,
    }, null, 2));
    return;
  }

  console.log(`Unknown mode: ${mode}. Use --help.`);
}

main();

// ── Module exports ──────────────────────────────────────────────
module.exports = {
  graphRagQuery,
  graphRagConcept,
  graphRagPrep,
  enrichConcept,
  tfidfQuery,
  loadRagIndex,
  loadGraph,
  formatGraphRagResult,
  summarizeExperience,
};
