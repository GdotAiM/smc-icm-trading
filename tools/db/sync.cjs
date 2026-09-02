// DB Sync — push local JSON persistence into Supabase.
//
//   node tools/db/sync.cjs                     full sync (graph + trades)
//   node tools/db/sync.cjs --graph-only
//   node tools/db/sync.cjs --trades-only
//
// Sources:
//   shared/trade_graph.json  → graph_nodes + graph_edges
//   shared/trade_log.json    → trades
//
// Graceful: without SUPABASE_URL / SUPABASE_SERVICE_KEY in .env it reports
// "SKIPPED (Supabase not configured)" and exits 0 — never breaks the pipeline.
const path = require("path");
const fs = require("fs");
const { loadProjectEnv } = require("../llm/load_env.cjs");
const db = require("./supabase_client.cjs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..", "..");
loadProjectEnv(ROOT);

async function syncGraph() {
  const graphPath = path.join(ROOT, "shared", "trade_graph.json");
  if (!fs.existsSync(graphPath)) return { nodes: 0, edges: 0 };
  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));

  const nodes = Object.values(graph.nodes || {}).map(n => ({
    id: n.id,
    type: n.type || "node",
    name: n.name || null,
    data: n,
  }));
  const edges = (graph.edges || []).map(e => ({
    source: e.source,
    target: e.target,
    type: e.type,
    weight: e.weight ?? 1,
    metadata: e.metadata || {},
  }));

  const nRes = await db.upsert("graph_nodes", nodes, "id");
  const eRes = await db.upsert("graph_edges", edges, "source,target,type");
  return { nodes: nodes.length, edges: edges.length, nodeErrors: nRes.errors, edgeErrors: eRes.errors };
}

async function syncTrades() {
  const tradesPath = path.join(ROOT, "shared", "trade_log.json");
  if (!fs.existsSync(tradesPath)) return { trades: 0 };
  const trades = JSON.parse(fs.readFileSync(tradesPath, "utf8"));
  const rows = (Array.isArray(trades) ? trades : []).map(t => ({
    id: `${(t.pair || "?").toLowerCase()}-${t.date || "?"}`,
    pair: t.pair,
    direction: t.direction,
    pnl: t.pnl ?? null,
    model: t.model,
    session: t.session,
    entry: t.entry ?? null,
    sl: t.sl ?? null,
    tp1: t.tp1 ?? null,
    tp2: t.tp2 ?? null,
    risk: t.risk ?? null,
    rr: t.rr,
    status: t.status,
    trade_date: t.date || null,
    notes: t.notes,
    raw: t,
  }));
  const res = await db.upsert("trades", rows, "id");
  return { trades: rows.length, errors: res.errors };
}

async function main() {
  const onlyGraph = process.argv.includes("--graph-only");
  const onlyTrades = process.argv.includes("--trades-only");

  if (!db.getClient()) {
    console.log("DB SYNC SKIPPED (Supabase not configured — set SUPABASE_URL + SUPABASE_SERVICE_KEY in .env)");
    return;
  }

  const summary = {};
  if (!onlyTrades) summary.graph = await syncGraph();
  if (!onlyGraph) summary.trades = await syncTrades();

  await db.logEvent("sync", null, summary);
  console.log("DB SYNC OK", JSON.stringify(summary, null, 2));
}

main().catch(e => {
  console.error("[DB SYNC] failed:", e.message);
  process.exitCode = 1;
});