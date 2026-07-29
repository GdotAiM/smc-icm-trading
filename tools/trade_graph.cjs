// Trade Graph — Unified Memory Layer
// Persistent, structured, queryable knowledge graph connecting trades, models,
// sessions, concepts, lessons, gaps, and playbook rules.
//
// The "graph engineering" piece: all memory silos wired together with typed edges
// so the agent can traverse relationships instead of reading 5+ separate files.
//
// Usage:
//   node tools/trade_graph.cjs --build                  Build/rebuild from all sources
//   node tools/trade_graph.cjs --query "pattern"         Find failure patterns
//   node tools/trade_graph.cjs --similar PAIR [MODEL]    Find similar past trades
//   node tools/trade_graph.cjs --lessons PAIR            Get active lessons for a pair
//   node tools/trade_graph.cjs --gaps                    List unresolved knowledge gaps
//   node tools/trade_graph.cjs --stats MODEL|SESSION     Performance stats for entity
//   node tools/trade_graph.cjs --context PAIR [MODEL]    Full injection context (for memory_injector)
//   node tools/trade_graph.cjs --add-trade JSON          Add/update a trade node
//   node tools/trade_graph.cjs --resolve-gap GAP_ID      Mark a gap as resolved

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const GRAPH_FILE = path.join(ROOT, "shared", "trade_graph.json");

// ══════════════════════════════════════════════════════════════════════════
// GRAPH DATA STRUCTURE
// ══════════════════════════════════════════════════════════════════════════

function createGraph() {
  return {
    version: 1,
    built: new Date().toISOString(),
    nodes: {},       // id → { id, type, ...properties }
    edges: [],       // [{ source, target, type, weight, metadata }]
    _edgeIndex: {},  // nodeId → [edgeIndex, ...] (built at load/query time)
  };
}

let G = null; // singleton loaded graph

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function cleanModelName(raw) {
  // "| Silver Bullet (8.8/9.9) |" → "Silver Bullet"
  // "Silver Bullet" → "Silver Bullet"
  let s = String(raw || "").replace(/^\|?\s*/, "").replace(/\s*\|?\s*$/, "");
  s = s.replace(/\s*\([\d.]+\/[\d.]+\)\s*$/, "").trim();
  return s || "Unknown";
}

function cleanSessionName(raw) {
  // "London (Killzone ✅)" → "London"
  // "| London (" → "London"
  // "NY AM (Killzone ✅) |" → "NY AM"
  let s = String(raw || "");
  // Strip leading/trailing pipes and whitespace
  s = s.replace(/^\|?\s*/, "").replace(/\s*\|?\s*$/, "");
  // Strip parenthetical annotations — both complete "(...)" and dangling "("
  s = s.replace(/\s*\([^)]*\)?\s*$/, "").trim();
  return s || "Unknown";
}

function ensureNode(graph, id, type, props = {}) {
  if (!graph.nodes[id]) {
    graph.nodes[id] = { id, type, ...props };
  } else {
    // Merge new properties (don't overwrite with null/undefined)
    for (const [k, v] of Object.entries(props)) {
      if (v !== null && v !== undefined && v !== "") {
        graph.nodes[id][k] = v;
      }
    }
  }
  return graph.nodes[id];
}

function addEdge(graph, source, target, type, weight = 1.0, metadata = {}) {
  if (!source || !target) return -1;
  const idx = graph.edges.length;
  graph.edges.push({ source, target, type, weight, metadata });
  // Update index
  if (!graph._edgeIndex[source]) graph._edgeIndex[source] = [];
  graph._edgeIndex[source].push(idx);
  if (!graph._edgeIndex[target]) graph._edgeIndex[target] = [];
  graph._edgeIndex[target].push(idx);
  // Auto-create target node if it doesn't exist (for pair/model/session references)
  autoCreateRefNode(graph, target);
  return idx;
}

/** Auto-create reference nodes (pair, model, session) that edges point to */
function autoCreateRefNode(graph, nodeId) {
  if (graph.nodes[nodeId]) return;
  const parts = nodeId.split(":");
  const nodeType = parts[0];
  const name = parts.slice(1).join(":");
  if (["pair", "model", "session"].includes(nodeType) && name) {
    graph.nodes[nodeId] = {
      id: nodeId,
      type: nodeType,
      name: name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// QUERY METHODS
// ══════════════════════════════════════════════════════════════════════════

/** Get all edges from a node, optionally filtered by type */
function outgoing(graph, nodeId, edgeType) {
  const indices = graph._edgeIndex[nodeId] || [];
  return indices
    .map(i => graph.edges[i])
    .filter(e => e.source === nodeId && (!edgeType || e.type === edgeType));
}

/** Get all edges to a node, optionally filtered by type */
function incoming(graph, nodeId, edgeType) {
  const indices = graph._edgeIndex[nodeId] || [];
  return indices
    .map(i => graph.edges[i])
    .filter(e => e.target === nodeId && (!edgeType || e.type === edgeType));
}

/** Find trade nodes for a pair, sorted by date descending */
function findTradeNodes(graph, pair, model, session, limit = 20) {
  const pairId = `pair:${slugify(pair)}`;
  // ON_PAIR edges go Trade → Pair, so use incoming from the pair side
  const tradeEdges = incoming(graph, pairId, "ON_PAIR");
  let trades = tradeEdges
    .map(e => graph.nodes[e.source])
    .filter(Boolean);

  if (model) {
    const modelId = `model:${slugify(model)}`;
    const modelTradeIds = new Set(
      incoming(graph, modelId, "USED_MODEL").map(e => e.source)
    );
    trades = trades.filter(t => modelTradeIds.has(t.id));
  }
  if (session) {
    const sessionId = `session:${slugify(session)}`;
    const sessionTradeIds = new Set(
      incoming(graph, sessionId, "IN_SESSION").map(e => e.source)
    );
    trades = trades.filter(t => sessionTradeIds.has(t.id));
  }

  return trades
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, limit);
}

/** Find failure patterns: group losing trades by model+session */
function findFailurePatterns(graph, pair) {
  const tradeNodes = pair
    ? findTradeNodes(graph, pair, null, null, 100)
    : Object.values(graph.nodes).filter(n => n.type === "trade");

  const losers = tradeNodes.filter(t =>
    t.outcome === "loss" || (t.pnl !== undefined && t.pnl < 0)
  );

  const patterns = {};
  for (const t of losers) {
    const key = `${t.model || "?"} × ${t.session || "?"}`;
    if (!patterns[key]) {
      patterns[key] = { model: t.model, session: t.session, count: 0, totalPnl: 0, trades: [] };
    }
    patterns[key].count++;
    patterns[key].totalPnl += t.pnl || 0;
    patterns[key].trades.push(t.date);
  }

  return Object.values(patterns)
    .sort((a, b) => b.count - a.count)
    .map(p => ({
      ...p,
      avgLoss: p.count > 0 ? (p.totalPnl / p.count).toFixed(2) : "0",
      latestOccurrence: p.trades.sort().pop(),
    }));
}

/** Get active (non-stale) lessons for a pair */
function getActiveLessons(graph, pair, limit = 10) {
  const tradeNodes = findTradeNodes(graph, pair, null, null, 30);

  const lessons = [];
  for (const trade of tradeNodes) {
    const lessonEdges = outgoing(graph, trade.id, "GENERATED_LESSON");
    for (const e of lessonEdges) {
      const lesson = graph.nodes[e.target];
      if (lesson && lesson.active !== false) {
        lessons.push({ ...lesson, tradeDate: trade.date });
      }
    }
  }

  // Deduplicate by title similarity and sort by recency
  const seen = new Set();
  return lessons
    .filter(l => {
      const key = slugify(l.title || "").slice(0, 30);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.tradeDate || "").localeCompare(a.tradeDate || ""))
    .slice(0, limit);
}

/** Get unresolved knowledge gaps */
function getUnresolvedGaps(graph) {
  return Object.values(graph.nodes)
    .filter(n => n.type === "gap" && n.resolved !== true)
    .sort((a, b) => {
      const sev = { high: 0, medium: 1, low: 2 };
      return (sev[a.severity] || 1) - (sev[b.severity] || 1);
    });
}

/** Get performance stats for any entity (model/session/pair) by traversing edges */
function getEntityStats(graph, entityType, entityName) {
  const entityId = `${entityType}:${slugify(entityName)}`;
  const entity = graph.nodes[entityId];
  if (!entity) return null;

  const edgeType = entityType === "model" ? "USED_MODEL"
    : entityType === "session" ? "IN_SESSION"
    : "ON_PAIR";

  const tradeEdges = incoming(graph, entityId, edgeType);
  const trades = tradeEdges
    .map(e => graph.nodes[e.source])
    .filter(t => t && t.type === "trade");

  const wins = trades.filter(t => t.outcome === "win").length;
  const losses = trades.filter(t => t.outcome === "loss").length;
  const total = trades.length;
  const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);

  return {
    ...entity,
    totalTrades: total,
    wins,
    losses,
    winRate: total > 0 ? (wins / total) : 0,
    totalPnl,
    avgPnl: total > 0 ? totalPnl / total : 0,
    recent: trades.sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5),
  };
}

/** Build full injection context for memory_injector */
function buildInjectionContext(graph, pair, model) {
  const trades = findTradeNodes(graph, pair, model, null, 10);
  const lessons = getActiveLessons(graph, pair, 8);
  const gaps = getUnresolvedGaps(graph).filter(g => {
    // Filter gaps related to this pair or global
    const gapPair = g.pair || "";
    return !gapPair || gapPair.toUpperCase() === pair.toUpperCase();
  });
  const patterns = findFailurePatterns(graph, pair).slice(0, 5);

  // Model stats
  let modelStats = null;
  if (model) {
    modelStats = getEntityStats(graph, "model", model);
  }

  // Session clustering
  const sessionCounts = {};
  for (const t of trades) {
    if (t.session) {
      sessionCounts[t.session] = (sessionCounts[t.session] || 0) + 1;
    }
  }
  const topSession = Object.entries(sessionCounts)
    .sort((a, b) => b[1] - a[1])[0];

  return {
    pair: pair.toUpperCase(),
    model: model || "any",
    generated: new Date().toISOString(),
    tradesAnalyzed: trades.length,
    similarTrades: trades.slice(0, 5).map(t => ({
      date: t.date,
      direction: t.direction,
      model: t.model,
      session: t.session,
      outcome: t.outcome,
      pnl: t.pnl,
      coherence: t.coherence,
      decisionQuality: t.decisionQuality,
    })),
    activeLessons: lessons.map(l => ({
      title: l.title,
      detail: l.detail,
      category: l.category,
      tradeDate: l.tradeDate,
    })),
    unresolvedGaps: gaps.slice(0, 5).map(g => ({
      type: g.gapType,
      severity: g.severity,
      detail: g.detail,
    })),
    failurePatterns: patterns,
    modelPerformance: modelStats ? {
      totalTrades: modelStats.totalTrades,
      winRate: modelStats.winRate,
      avgPnl: modelStats.avgPnl,
    } : null,
    sessionCluster: topSession ? {
      session: topSession[0],
      count: topSession[1],
      pct: trades.length > 0 ? Math.round((topSession[1] / trades.length) * 100) : 0,
    } : null,
  };
}

/** Format injection context as markdown for agent consumption */
function formatContextMarkdown(ctx) {
  let md = "";

  if (ctx.similarTrades.length > 0) {
    md += `\n## Ghost of Trades Past (Graph Memory)\n\n`;
    md += `**Last ${ctx.similarTrades.length} similar setups (${ctx.pair}${ctx.model !== "any" ? ", " + ctx.model : ""})**:\n\n`;
    for (const t of ctx.similarTrades) {
      const icon = t.direction === "SHORT" ? "🔴" : t.direction === "LONG" ? "🟢" : "⚪";
      const outcomeIcon = t.outcome === "win" ? "✅" : t.outcome === "loss" ? "❌" : "➖";
      md += `- **${t.date}**: ${icon} ${t.direction || "N/A"} | ${t.model} | ${t.session} | Outcome: ${outcomeIcon} | PnL: $${t.pnl || 0} | Quality: ${t.decisionQuality || "?"}/5\n`;
    }

    if (ctx.sessionCluster && ctx.sessionCluster.count >= 2) {
      md += `\n**Session cluster**: ${ctx.sessionCluster.count}/${ctx.tradesAnalyzed} trades (${ctx.sessionCluster.pct}%) in **${ctx.sessionCluster.session}** session.\n`;
    }
  }

  if (ctx.modelPerformance && ctx.modelPerformance.totalTrades >= 3) {
    md += `\n**Model track record (${ctx.model})**: ${ctx.modelPerformance.totalTrades} trades, ${Math.round(ctx.modelPerformance.winRate * 100)}% WR, avg PnL $${ctx.modelPerformance.avgPnl.toFixed(2)}\n`;
  }

  if (ctx.failurePatterns.length > 0) {
    md += `\n### ⚠️ Failure Patterns\n\n`;
    for (const fp of ctx.failurePatterns.slice(0, 3)) {
      md += `- **${fp.model} × ${fp.session}**: ${fp.count} losses, avg -$${Math.abs(fp.avgLoss)}, latest: ${fp.latestOccurrence}\n`;
    }
  }

  if (ctx.activeLessons.length > 0) {
    md += `\n### 📚 Active Lessons (Graph-Traced)\n\n`;
    for (const l of ctx.activeLessons.slice(0, 5)) {
      md += `- **[${l.category}]** ${l.title}: ${l.detail.slice(0, 120)} (${l.tradeDate})\n`;
    }
  }

  if (ctx.unresolvedGaps.length > 0) {
    md += `\n### 🔴 Unresolved Gaps\n\n`;
    for (const g of ctx.unresolvedGaps.slice(0, 3)) {
      const icon = g.severity === "high" ? "🔴" : g.severity === "medium" ? "🟡" : "🔵";
      md += `- ${icon} [${g.type}] ${g.detail.slice(0, 100)}\n`;
    }
  }

  return md;
}

// ══════════════════════════════════════════════════════════════════════════
// GRAPH BUILDER — Populate from all existing data sources
// ══════════════════════════════════════════════════════════════════════════

function buildGraph() {
  const graph = createGraph();

  // ── Load ICT taxonomy for concept nodes ──────────────────────────────
  const taxonomyFile = path.join(ROOT, "references", "ict_knowledge", "taxonomy.json");
  let taxonomy = {};
  if (fs.existsSync(taxonomyFile)) {
    try { taxonomy = JSON.parse(fs.readFileSync(taxonomyFile, "utf8")); } catch (e) {}
  }

  for (const [conceptId, concept] of Object.entries(taxonomy)) {
    ensureNode(graph, `concept:${conceptId}`, "concept", {
      name: concept.title || conceptId,
      tier: concept.tier,
      tierName: concept.tierName,
      category: concept.category,
    });
  }

  // ── Load journal metadata → Trade nodes ─────────────────────────────
  const journalDir = path.join(ROOT, "stages", "07_journal_review", "output");
  if (fs.existsSync(journalDir)) {
    const metaFiles = fs.readdirSync(journalDir).filter(f => f.endsWith("_meta.json"));
    for (const mf of metaFiles) {
      let meta;
      try { meta = JSON.parse(fs.readFileSync(path.join(journalDir, mf), "utf8")); } catch (e) { continue; }

      const pair = (meta.pair || mf.replace("_meta.json", "")).toUpperCase();
      const date = meta.date || "unknown";
      const modelName = cleanModelName(meta.model);
      const sessionName = cleanSessionName(meta.session);
      const direction = (meta.direction || "").toUpperCase().trim() || null;
      const coherence = parseFloat(meta.coherence) || 0;
      const lessonsCount = parseInt(meta.lessons) || 0;

      const tradeId = `trade:${slugify(pair)}:${date}`;
      ensureNode(graph, tradeId, "trade", {
        date,
        pair,
        direction,
        model: modelName,
        session: sessionName,
        coherence,
        lessonsCount,
        source: "journal_meta",
      });

      // Edges: pair, model, session
      addEdge(graph, tradeId, `pair:${slugify(pair)}`, "ON_PAIR");
      if (modelName && modelName !== "Unknown") {
        ensureNode(graph, `model:${slugify(modelName)}`, "model", { name: modelName });
        addEdge(graph, tradeId, `model:${slugify(modelName)}`, "USED_MODEL");
      }
      if (sessionName && sessionName !== "Unknown") {
        ensureNode(graph, `session:${slugify(sessionName)}`, "session", { name: sessionName });
        addEdge(graph, tradeId, `session:${slugify(sessionName)}`, "IN_SESSION");
      }
    }
  }

  // ── Fallback: parse *_review.md for trades missing meta.json ──────────
  // Some journal review stages write the .md but skip the _meta.json.
  // Extract pair/date/direction/model/session from the markdown frontmatter.
  const reviewFiles = fs.readdirSync(journalDir).filter(f => f.endsWith("_review.md") && !f.startsWith("dxy_") && !f.startsWith("review."));
  for (const rf of reviewFiles) {
    try {
      const md = fs.readFileSync(path.join(journalDir, rf), "utf8");

      // Extract pair from title using flexible separator matching
      // Format: "# Session Review — EURUSD — 2026-07-27"
      const titleMatch = md.match(/# Session Review\W+\s*(\w+)\s*\W+\s*(\d{4}-\d{2}-\d{2})/i);
      if (!titleMatch) continue;
      const rawPair = titleMatch[1].toUpperCase();
      const date = titleMatch[2];

      // Normalize pair names (GOLD → XAUUSD)
      const pairMap = { GOLD: "XAUUSD", XAUUSD: "XAUUSD", GBPUSD: "GBPUSD", EURUSD: "EURUSD", NAS100: "NAS100", DXY: "DXY" };
      const pair = pairMap[rawPair] || rawPair;
      const tradeId = `trade:${slugify(pair)}:${date}`;

      // Skip if already found via meta.json
      if (graph.nodes[tradeId]) continue;

      // Extract Setup Summary table
      const directionMatch = md.match(/\*\*Direction\*\*\s*\|\s*(\w+)/i);
      const modelMatch = md.match(/\*\*Model\*\*\s*\|\s*(.+)/i);
      const sessionMatch = md.match(/\*\*Session\*\*\s*\|\s*(.+)/i);
      const qualityMatch = md.match(/\*\*Overall\*\*\s*\|\s*\*?([\d.]+)/i);

      const direction = directionMatch ? directionMatch[1].toUpperCase().trim() : null;
      const modelName = cleanModelName(modelMatch ? modelMatch[1] : "");
      const sessionName = cleanSessionName(sessionMatch ? sessionMatch[1] : "");
      const coherence = qualityMatch ? parseFloat(qualityMatch[1]) : 0;

      ensureNode(graph, tradeId, "trade", {
        date,
        pair,
        direction,
        model: modelName,
        session: sessionName,
        coherence,
        source: "review_md_fallback",
      });

      addEdge(graph, tradeId, `pair:${slugify(pair)}`, "ON_PAIR");
      if (modelName && modelName !== "Unknown") {
        ensureNode(graph, `model:${slugify(modelName)}`, "model", { name: modelName });
        addEdge(graph, tradeId, `model:${slugify(modelName)}`, "USED_MODEL");
      }
      if (sessionName && sessionName !== "Unknown") {
        ensureNode(graph, `session:${slugify(sessionName)}`, "session", { name: sessionName });
        addEdge(graph, tradeId, `session:${slugify(sessionName)}`, "IN_SESSION");
      }
    } catch (e) { /* skip unparseable review */ }
  }

  // ── Load performance lessons → Lesson, Gap nodes + outcome data ─────
  const perfDir = path.join(ROOT, "shared", "performance");
  if (fs.existsSync(perfDir)) {
    const lessonFiles = fs.readdirSync(perfDir).filter(f => f.startsWith("lessons_") && f.endsWith(".json"));
    for (const lf of lessonFiles) {
      let data;
      try { data = JSON.parse(fs.readFileSync(path.join(perfDir, lf), "utf8")); } catch (e) { continue; }

      const pair = (data.pair || "").toUpperCase();
      const date = data.date || "unknown";
      const tradeId = `trade:${slugify(pair)}:${date}`;

      // Update trade node with outcome data
      if (graph.nodes[tradeId] && graph.nodes[tradeId].type === "trade") {
        const t = graph.nodes[tradeId];
        if (data.trade) {
          t.pnl = data.trade.pnl || 0;
          t.entries = data.trade.entries || 0;
          t.blocked = data.trade.blocked || 0;
          t.outcome = data.trade.pnl > 0 ? "win"
            : data.trade.pnl < 0 ? "loss"
            : data.trade.blocked > 0 ? "blocked"
            : "no_trade";
          t.decisionQuality = data.decisionQuality || null;
        }
      }

      // Ensure trade node exists even if no journal meta
      if (!graph.nodes[tradeId]) {
        ensureNode(graph, tradeId, "trade", {
          date, pair,
          pnl: data.trade?.pnl || 0,
          outcome: data.trade?.pnl > 0 ? "win" : data.trade?.pnl < 0 ? "loss" : "no_trade",
          decisionQuality: data.decisionQuality || null,
          entries: data.trade?.entries || 0,
          blocked: data.trade?.blocked || 0,
          source: "performance",
        });
        addEdge(graph, tradeId, `pair:${slugify(pair)}`, "ON_PAIR");
      }

      // Add lesson nodes
      if (Array.isArray(data.lessons)) {
        for (let i = 0; i < data.lessons.length; i++) {
          const lesson = data.lessons[i];
          const lessonId = `lesson:${slugify(pair)}:${date}:${i}`;
          ensureNode(graph, lessonId, "lesson", {
            title: lesson.title,
            detail: lesson.detail,
            category: classifyCategory(lesson),
            source: lesson.source || "journal",
            pair,
            date,
            active: true,
          });
          addEdge(graph, tradeId, lessonId, "GENERATED_LESSON");

          // Link lesson to concepts by keyword matching
          const conceptIds = matchConceptsToLesson(lesson, taxonomy);
          for (const cid of conceptIds) {
            addEdge(graph, lessonId, `concept:${cid}`, "LESSON_RELATES_TO", 0.8);
          }
        }
      }

      // Link trade model to concepts (e.g. "Silver Bullet" → concept:silver-bullet)
      const tradeNode = graph.nodes[tradeId];
      if (tradeNode && tradeNode.model) {
        const modelConceptMatches = matchModelToConcepts(tradeNode.model, taxonomy);
        for (const cid of modelConceptMatches) {
          addEdge(graph, tradeId, `concept:${cid}`, "USED_CONCEPT", 0.9);
          // Update usage count
          const cn = graph.nodes[`concept:${cid}`];
          if (cn) cn.usageCount = (cn.usageCount || 0) + 1;
        }
      }

      // Add gap nodes
      if (Array.isArray(data.gaps)) {
        for (let i = 0; i < data.gaps.length; i++) {
          const gap = data.gaps[i];
          const gapId = `gap:${slugify(pair)}:${date}:${i}`;
          ensureNode(graph, gapId, "gap", {
            gapType: gap.type,
            severity: gap.severity || "medium",
            detail: gap.detail || "",
            recommendation: gap.recommendation || "",
            pair,
            date,
            resolved: false,
          });
          addEdge(graph, tradeId, gapId, "HAS_GAP");

          // Link gap to concepts to review
          if (Array.isArray(gap.conceptsToReview)) {
            for (const cid of gap.conceptsToReview) {
              addEdge(graph, gapId, `concept:${cid}`, "GAP_BLOCKS_CONCEPT", 0.9);
            }
          }
        }
      }

      // Link concepts used to trade
      if (Array.isArray(data.conceptsUsed)) {
        for (const c of data.conceptsUsed) {
          const cid = slugify(c);
          if (taxonomy[c] || taxonomy[cid]) {
            const actualId = taxonomy[c] ? c : cid;
            addEdge(graph, tradeId, `concept:${actualId}`, "USED_CONCEPT");
            // Update concept usage count
            const cn = graph.nodes[`concept:${actualId}`];
            if (cn) cn.usageCount = (cn.usageCount || 0) + 1;
          }
        }
      }
    }
  }

  // ── Load trade_log.json for additional trades ───────────────────────
  const tradeLogFile = path.join(ROOT, "shared", "trade_log.json");
  if (fs.existsSync(tradeLogFile)) {
    let tradeLog;
    try { tradeLog = JSON.parse(fs.readFileSync(tradeLogFile, "utf8")); } catch (e) { tradeLog = []; }
    for (const t of (Array.isArray(tradeLog) ? tradeLog : [])) {
      const pair = (t.pair || "").toUpperCase();
      const date = t.date || "unknown";
      const tradeId = `trade:${slugify(pair)}:${date}`;

      if (!graph.nodes[tradeId]) {
        const modelName = cleanModelName(t.model);
        ensureNode(graph, tradeId, "trade", {
          date, pair,
          direction: t.direction || null,
          model: modelName,
          session: t.session || null,
          outcome: t.result || "unknown",
          pnl: t.pnl || 0,
          rr: t.rr || 0,
          source: "trade_log",
        });
        addEdge(graph, tradeId, `pair:${slugify(pair)}`, "ON_PAIR");
        if (modelName) {
          ensureNode(graph, `model:${slugify(modelName)}`, "model", { name: modelName });
          addEdge(graph, tradeId, `model:${slugify(modelName)}`, "USED_MODEL");
        }
        if (t.session) {
          ensureNode(graph, `session:${slugify(t.session)}`, "session", { name: t.session });
          addEdge(graph, tradeId, `session:${slugify(t.session)}`, "IN_SESSION");
        }
      }
    }
  }

  // ── Load playbook rules ──────────────────────────────────────────────
  const playbookFile = path.join(ROOT, "references", "playbook", "current.md");
  if (fs.existsSync(playbookFile)) {
    const pb = fs.readFileSync(playbookFile, "utf8");
    const ruleMatches = pb.matchAll(/### (.+?)\n- \*\*Type\*\*: (.+?)\n- \*\*Rule\*\*: (.+?)\n- \*\*Source\*\*: (.+?)\n- \*\*Added\*\*: (.+?)\n/g);
    for (const m of ruleMatches) {
      const ruleId = `playbook_rule:${slugify(m[1])}`;
      ensureNode(graph, ruleId, "playbook_rule", {
        title: m[1].trim(),
        category: m[2].trim(),
        rule: m[3].trim(),
        source: m[4].trim(),
        added: m[5].trim(),
      });
    }
  }

  // ── Link all trade models to ICT concepts ──────────────────────────
  // Run after all trades are loaded so every trade gets concept links
  const allTradeNodes = Object.values(graph.nodes).filter(n => n.type === "trade");
  for (const trade of allTradeNodes) {
    if (trade.model) {
      const modelMatches = matchModelToConcepts(trade.model, taxonomy);
      for (const cid of modelMatches) {
        // Don't duplicate edges
        const existing = graph.edges.filter(e =>
          e.source === trade.id && e.target === `concept:${cid}` && e.type === "USED_CONCEPT"
        );
        if (existing.length === 0) {
          addEdge(graph, trade.id, `concept:${cid}`, "USED_CONCEPT", 0.9);
          const cn = graph.nodes[`concept:${cid}`];
          if (cn) cn.usageCount = (cn.usageCount || 0) + 1;
        }
      }
    }
  }

  // ── Compute aggregate stats on model/session/pair nodes ─────────────
  computeAggregateStats(graph);

  // ── Add SIMILAR_TO edges between trades sharing model+session ───────
  addSimilarityEdges(graph);

  graph.built = new Date().toISOString();
  return graph;
}

/** Classify a lesson into a category based on its content */
function classifyCategory(lesson) {
  const t = ((lesson.title || "") + " " + (lesson.detail || "")).toLowerCase();
  if (/guard|block|invalidation|stop|exit|risk/.test(t)) return "risk-management";
  if (/entry|trigger|fvg|mss|choch|pullback|displacement/.test(t)) return "entry-execution";
  if (/bias|structure|trend|htf|direction/.test(t)) return "directional-bias";
  if (/session|time|window|killzone|sb|lunch|judas/.test(t)) return "session-timing";
  if (/forecast|predict|projection/.test(t)) return "forecast-usage";
  if (/psychology|patience|discipline|emotion|force/.test(t)) return "psychology";
  return "general";
}

/** Match a lesson to ICT concepts by keyword overlap */
// Common ICT abbreviations → concept ID fragments for matching
const ABBREVIATION_MAP = {
  "sb": "silver-bullet",
  "fvg": "fair-value-gap",
  "ifvg": "inversion-fair-value-gap",
  "ob": "order-block",
  "mss": "market-structure-shift",
  "choch": "change-of-character",
  "bos": "break-of-structure",
  "bsl": "buy-side-liquidity",
  "ssl": "sell-side-liquidity",
  "smt": "smt-divergence",
  "mmxm": "mmxm",
  "ote": "optimal-trade-entry",
  "cisd": "cisd",
  "ipda": "interbank-price-delivery-algorithm",
  "po3": "power-of-3",
  "amd": "accumulation-manipulation-distribution",
  "bpr": "balanced-price-range",
  "nwog": "new-week-opening-gap",
  "ndog": "new-day-opening-gap",
  "cbdr": "central-bank-dealers-range",
  "dxy": "us-dollar-index",
};

function matchConceptsToLesson(lesson, taxonomy) {
  const text = ((lesson.title || "") + " " + (lesson.detail || "")).toLowerCase();
  const matches = [];
  const words = new Set(text.split(/\s+/));

  for (const [conceptId, concept] of Object.entries(taxonomy)) {
    // Generate keywords: concept ID parts, title, and abbreviation expansions
    const idParts = conceptId.replace(/^ict-/, "").replace(/-/g, " ");
    const keywords = [idParts, concept.title || ""];

    // Also try individual significant words from the concept name
    const sigWords = idParts.split(" ").filter(w => w.length > 4);
    keywords.push(...sigWords);

    const kwSet = new Set(keywords.filter(Boolean).map(k => k.toLowerCase()));

    let matched = false;

    // Direct match: any keyword appears in text
    for (const kw of kwSet) {
      if (kw.length >= 3 && text.includes(kw)) {
        matched = true;
        break;
      }
    }

    // Abbreviation match: text uses a known abbreviation that maps to this concept
    if (!matched) {
      for (const [abbr, target] of Object.entries(ABBREVIATION_MAP)) {
        if (conceptId.includes(target) || target.includes(conceptId.replace(/^ict-/, ""))) {
          // Check if the abbreviation appears as a standalone word in the text
          if (words.has(abbr) || text.includes(" " + abbr + " ") || text.startsWith(abbr + " ") || text.endsWith(" " + abbr)) {
            matched = true;
            break;
          }
        }
      }
    }

    if (matched) {
      matches.push(conceptId);
    }
  }

  return [...new Set(matches)].slice(0, 8);
}

/** Match a model name (e.g. "Silver Bullet", "Breaker Block") to ICT concept IDs */
function matchModelToConcepts(modelName, taxonomy) {
  if (!modelName) return [];
  const name = modelName.toLowerCase();
  const matches = [];

  // Direct mapping for common model names → taxonomy concept IDs
  const modelConceptMap = {
    "silver bullet": "silver-bullet",
    "breaker block": "breaker-block",
    "turtle soup": "turtle-soup-pattern",
    "judas swing": "judas-swing",
    "unicorn": "unicorn-model",
    "ote": "optimal-trade-entry-ote-pattern",
    "2022": "ict-trading-strategy-2022",
    "mmxm": "ict-trading-strategy-2022",
    "institutional ob": "order-block",
    "order block": "order-block",
    "fvg": "fair-value-gap",
    "ifvg": "inversion-fair-value-gap",
  };

  for (const [modelKey, conceptId] of Object.entries(modelConceptMap)) {
    if (name.includes(modelKey) && taxonomy[conceptId]) {
      matches.push(conceptId);
    }
  }

  // Fallback: search taxonomy titles
  if (matches.length === 0) {
    for (const [conceptId, concept] of Object.entries(taxonomy)) {
      const title = (concept.title || "").toLowerCase();
      if (title.length > 3 && name.includes(title)) {
        matches.push(conceptId);
      }
      if (title.length > 3 && title.includes(name)) {
        matches.push(conceptId);
      }
    }
  }

  return [...new Set(matches)].slice(0, 5);
}

/** Compute win rate, total PnL, etc. on aggregate nodes */
function computeAggregateStats(graph) {
  const aggregates = {}; // entityId → { wins, losses, total, totalPnl }

  for (const edge of graph.edges) {
    if (!["USED_MODEL", "IN_SESSION", "ON_PAIR"].includes(edge.type)) continue;
    const trade = graph.nodes[edge.source];
    if (!trade || trade.type !== "trade") continue;

    const entityId = edge.target;
    if (!aggregates[entityId]) aggregates[entityId] = { wins: 0, losses: 0, total: 0, totalPnl: 0 };
    aggregates[entityId].total++;
    if (trade.outcome === "win") aggregates[entityId].wins++;
    if (trade.outcome === "loss") aggregates[entityId].losses++;
    aggregates[entityId].totalPnl += trade.pnl || 0;
  }

  for (const [entityId, agg] of Object.entries(aggregates)) {
    const node = graph.nodes[entityId];
    if (!node) continue;
    node.totalTrades = agg.total;
    node.winRate = agg.total > 0 ? agg.wins / agg.total : 0;
    node.totalPnl = agg.totalPnl;
    node.avgPnl = agg.total > 0 ? agg.totalPnl / agg.total : 0;
  }
}

/** Add SIMILAR_TO edges between trades sharing model+session, weighted by proximity */
function addSimilarityEdges(graph) {
  const tradeNodes = Object.values(graph.nodes).filter(n => n.type === "trade");
  // Group by model
  const byModel = {};
  for (const t of tradeNodes) {
    const key = t.model || "unknown";
    if (!byModel[key]) byModel[key] = [];
    byModel[key].push(t);
  }

  for (const [, trades] of Object.entries(byModel)) {
    for (let i = 0; i < trades.length; i++) {
      for (let j = i + 1; j < trades.length; j++) {
        let weight = 0.5; // same model

        if (trades[i].session && trades[i].session === trades[j].session) {
          weight += 0.3; // same session
        }
        if (trades[i].direction && trades[i].direction === trades[j].direction) {
          weight += 0.2; // same direction
        }

        addEdge(graph, trades[i].id, trades[j].id, "SIMILAR_TO", weight);
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// INCREMENTAL UPDATES
// ══════════════════════════════════════════════════════════════════════════

/** Add or update a trade from a JSON string */
function addTrade(graph, jsonStr) {
  let data;
  try { data = JSON.parse(jsonStr); } catch (e) { return { error: "Invalid JSON: " + e.message }; }

  const pair = (data.pair || "GBPUSD").toUpperCase();
  const date = data.date || new Date().toISOString().split("T")[0];
  const tradeId = `trade:${slugify(pair)}:${date}`;

  const node = ensureNode(graph, tradeId, "trade", {
    date,
    pair,
    direction: data.direction || null,
    model: cleanModelName(data.model),
    session: cleanSessionName(data.session),
    outcome: data.outcome || data.result || null,
    pnl: data.pnl || 0,
    rr: data.rr || 0,
    coherence: data.coherence || null,
    decisionQuality: data.decisionQuality || null,
    entries: data.entries || 0,
    blocked: data.blocked || 0,
    source: "manual",
  });

  // Ensure edges exist
  addEdge(graph, tradeId, `pair:${slugify(pair)}`, "ON_PAIR");
  if (node.model && node.model !== "Unknown") {
    ensureNode(graph, `model:${slugify(node.model)}`, "model", { name: node.model });
    addEdge(graph, tradeId, `model:${slugify(node.model)}`, "USED_MODEL");
  }
  if (node.session && node.session !== "Unknown") {
    ensureNode(graph, `session:${slugify(node.session)}`, "session", { name: node.session });
    addEdge(graph, tradeId, `session:${slugify(node.session)}`, "IN_SESSION");
  }

  return { added: tradeId, node };
}

/** Mark a gap as resolved */
function resolveGap(graph, gapId) {
  const node = graph.nodes[gapId];
  if (!node || node.type !== "gap") return { error: `Gap not found: ${gapId}` };
  node.resolved = true;
  node.resolvedAt = new Date().toISOString();
  return { resolved: gapId };
}

// ══════════════════════════════════════════════════════════════════════════
// PERSISTENCE
// ══════════════════════════════════════════════════════════════════════════

function saveGraph(graph) {
  const dir = path.dirname(GRAPH_FILE);
  fs.mkdirSync(dir, { recursive: true });

  // Strip runtime index before saving (it's rebuilt on load)
  const toSave = {
    version: graph.version,
    built: graph.built,
    nodes: graph.nodes,
    edges: graph.edges,
  };
  fs.writeFileSync(GRAPH_FILE, JSON.stringify(toSave, null, 2), "utf8");
}

function loadGraph() {
  if (!fs.existsSync(GRAPH_FILE)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(GRAPH_FILE, "utf8"));
    // Rebuild edge index
    raw._edgeIndex = {};
    for (let i = 0; i < raw.edges.length; i++) {
      const e = raw.edges[i];
      if (!raw._edgeIndex[e.source]) raw._edgeIndex[e.source] = [];
      raw._edgeIndex[e.source].push(i);
      if (!raw._edgeIndex[e.target]) raw._edgeIndex[e.target] = [];
      raw._edgeIndex[e.target].push(i);
    }
    return raw;
  } catch (e) {
    return null;
  }
}

function ensureLoaded() {
  if (!G) G = loadGraph();
  if (!G) {
    // First run: build from scratch
    G = buildGraph();
    saveGraph(G);
  }
  return G;
}

// ══════════════════════════════════════════════════════════════════════════
// CLI
// ══════════════════════════════════════════════════════════════════════════

function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (!mode || mode === "--help") {
    console.log(`
Trade Graph — Unified Memory Layer
Usage:
  node tools/trade_graph.cjs --build                     Rebuild graph from all sources
  node tools/trade_graph.cjs --query "pattern"            Find failure patterns
  node tools/trade_graph.cjs --similar PAIR [MODEL]       Find similar past trades
  node tools/trade_graph.cjs --lessons PAIR               Get active lessons for a pair
  node tools/trade_graph.cjs --gaps                       List unresolved knowledge gaps
  node tools/trade_graph.cjs --stats MODEL|SESSION|PAIR NAME  Performance stats
  node tools/trade_graph.cjs --context PAIR [MODEL]       Full injection context (JSON)
  node tools/trade_graph.cjs --context-md PAIR [MODEL]    Full injection context (Markdown)
  node tools/trade_graph.cjs --add-trade '{"pair":"GBPUSD",...}'  Add/update a trade
  node tools/trade_graph.cjs --resolve-gap GAP_ID         Mark a gap as resolved
  node tools/trade_graph.cjs --summary                    Graph summary + node counts
  node tools/trade_graph.cjs --rebuild                    Force rebuild from scratch

Examples:
  node tools/trade_graph.cjs --build
  node tools/trade_graph.cjs --similar GBPUSD "Silver Bullet"
  node tools/trade_graph.cjs --context-md GBPUSD "Silver Bullet"
  node tools/trade_graph.cjs --gaps
`);
    return;
  }

  const graph = mode === "--rebuild" ? buildGraph() : ensureLoaded();

  // ── Build / Rebuild ────────────────────────────────────────────────
  if (mode === "--build" || mode === "--rebuild") {
    const g = buildGraph();
    saveGraph(g);
    G = g;
    const counts = {
      trades: Object.values(g.nodes).filter(n => n.type === "trade").length,
      models: Object.values(g.nodes).filter(n => n.type === "model").length,
      sessions: Object.values(g.nodes).filter(n => n.type === "session").length,
      lessons: Object.values(g.nodes).filter(n => n.type === "lesson").length,
      gaps: Object.values(g.nodes).filter(n => n.type === "gap").length,
      concepts: Object.values(g.nodes).filter(n => n.type === "concept").length,
      edges: g.edges.length,
    };
    console.log(JSON.stringify({ built: g.built, ...counts }, null, 2));
    return;
  }

  // ── Summary ────────────────────────────────────────────────────────
  if (mode === "--summary") {
    const counts = {
      trades: Object.values(graph.nodes).filter(n => n.type === "trade").length,
      models: Object.values(graph.nodes).filter(n => n.type === "model").length,
      sessions: Object.values(graph.nodes).filter(n => n.type === "session").length,
      pairs: Object.values(graph.nodes).filter(n => n.type === "pair").length,
      lessons: Object.values(graph.nodes).filter(n => n.type === "lesson").length,
      gaps: Object.values(graph.nodes).filter(n => n.type === "gap").length,
      unresolvedGaps: Object.values(graph.nodes).filter(n => n.type === "gap" && !n.resolved).length,
      concepts: Object.values(graph.nodes).filter(n => n.type === "concept").length,
      playbookRules: Object.values(graph.nodes).filter(n => n.type === "playbook_rule").length,
      edges: graph.edges.length,
    };

    // Edge type breakdown
    const edgeTypes = {};
    for (const e of graph.edges) {
      edgeTypes[e.type] = (edgeTypes[e.type] || 0) + 1;
    }

    console.log(JSON.stringify({ built: graph.built, nodes: counts, edgeTypes }, null, 2));
    return;
  }

  // ── Similar trades ─────────────────────────────────────────────────
  if (mode === "--similar") {
    const pair = args[1] || "GBPUSD";
    const model = args[2] || null;
    const trades = findTradeNodes(graph, pair, model, null, 10);
    const output = trades.map(t => ({
      date: t.date,
      pair: t.pair,
      direction: t.direction,
      model: t.model,
      session: t.session,
      outcome: t.outcome,
      pnl: t.pnl,
      decisionQuality: t.decisionQuality,
    }));
    console.log(JSON.stringify({ pair, model, count: output.length, trades: output }, null, 2));
    return;
  }

  // ── Failure patterns ───────────────────────────────────────────────
  if (mode === "--query") {
    const pair = args[1] || null;
    const patterns = findFailurePatterns(graph, pair);
    console.log(JSON.stringify({ query: "failure_patterns", pair, patterns }, null, 2));
    return;
  }

  // ── Active lessons ─────────────────────────────────────────────────
  if (mode === "--lessons") {
    const pair = args[1] || "GBPUSD";
    const lessons = getActiveLessons(graph, pair, 15);
    const output = lessons.map(l => ({
      title: l.title,
      detail: l.detail,
      category: l.category,
      tradeDate: l.tradeDate,
    }));
    console.log(JSON.stringify({ pair, count: output.length, lessons: output }, null, 2));
    return;
  }

  // ── Unresolved gaps ────────────────────────────────────────────────
  if (mode === "--gaps") {
    const gaps = getUnresolvedGaps(graph);
    const output = gaps.map(g => ({
      id: g.id,
      type: g.gapType,
      severity: g.severity,
      detail: g.detail,
      recommendation: g.recommendation,
      pair: g.pair,
      date: g.date,
    }));
    console.log(JSON.stringify({ count: output.length, gaps: output }, null, 2));
    return;
  }

  // ── Entity stats ───────────────────────────────────────────────────
  if (mode === "--stats") {
    const entityType = args[1]; // model, session, or pair
    const entityName = args[2];
    if (!entityType || !entityName) {
      console.log(JSON.stringify({ error: "Usage: --stats model|session|pair NAME" }));
      return;
    }
    const stats = getEntityStats(graph, entityType, entityName);
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  // ── Full context (JSON) ────────────────────────────────────────────
  if (mode === "--context") {
    const pair = args[1] || "GBPUSD";
    const model = args[2] || null;
    const ctx = buildInjectionContext(graph, pair, model);
    console.log(JSON.stringify(ctx, null, 2));
    return;
  }

  // ── Full context (Markdown) ────────────────────────────────────────
  if (mode === "--context-md") {
    const pair = args[1] || "GBPUSD";
    const model = args[2] || null;
    const ctx = buildInjectionContext(graph, pair, model);
    const md = formatContextMarkdown(ctx);
    console.log(md || "(No prior trade data available for this pair/model)");

    // Also write to the memory injector output location
    const outFile = path.join(ROOT, "stages", "00_macro_context", "output", `${pair.toLowerCase()}_memory.md`);
    const outDir = path.dirname(outFile);
    fs.mkdirSync(outDir, { recursive: true });
    if (md) {
      fs.writeFileSync(outFile, md, "utf8");
      console.log(`\n[Written to ${outFile}]`);
    }
    return;
  }

  // ── Add trade ──────────────────────────────────────────────────────
  if (mode === "--add-trade") {
    const jsonStr = args[1];
    if (!jsonStr) {
      console.log(JSON.stringify({ error: "Usage: --add-trade '{\"pair\":\"GBPUSD\",...}'" }));
      return;
    }
    const result = addTrade(graph, jsonStr);
    if (result.error) {
      console.log(JSON.stringify(result));
      return;
    }
    saveGraph(graph);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // ── Resolve gap ────────────────────────────────────────────────────
  if (mode === "--resolve-gap") {
    const gapId = args[1];
    if (!gapId) {
      console.log(JSON.stringify({ error: "Usage: --resolve-gap GAP_ID" }));
      return;
    }
    const result = resolveGap(graph, gapId);
    if (result.error) {
      console.log(JSON.stringify(result));
      return;
    }
    saveGraph(graph);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Unknown mode: ${mode}. Use --help.`);
}

// Only run CLI if executed directly (not required as module)
if (require.main === module) {
  main();
}

// ── Module exports for programmatic use ──────────────────────────────
module.exports = {
  // Core operations
  ensureLoaded,
  buildGraph,
  saveGraph,
  loadGraph,

  // Queries
  findTradeNodes,
  findFailurePatterns,
  getActiveLessons,
  getUnresolvedGaps,
  getEntityStats,
  buildInjectionContext,
  formatContextMarkdown,

  // Incremental updates
  addTrade,
  resolveGap,

  // Graph manipulation
  ensureNode,
  addEdge,
  outgoing,
  incoming,

  // Helpers
  slugify,
  cleanModelName,
  cleanSessionName,
  classifyCategory,
};
