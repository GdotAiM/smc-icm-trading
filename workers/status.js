// SMC-ICM Trading — Cloudflare Worker
// Public status + pipeline API backed by Supabase (PostgREST). Zero deps.
//
// Routes:
//   GET /            → service health
//   GET /events      → latest pipeline_events (decision | heartbeat | error | sync)
//   GET /graph/stats → graph_nodes / graph_edges counts
//
// Env (secrets): SUPABASE_URL, SUPABASE_SERVICE_KEY
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Minimal PostgREST client — no @supabase/supabase-js needed on Workers.
function supabase(env) {
  const base = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY || "",
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY || ""}`,
    "Content-Type": "application/json",
  };
  return {
    from: (table) => ({
      async select(cols, opts = {}) {
        let url = `${base}/rest/v1/${table}?select=${encodeURIComponent(cols)}`;
        if (opts.order) url += `&order=${encodeURIComponent(opts.order)}`;
        if (opts.limit) url += `&limit=${opts.limit}`;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`PostgREST ${res.status}`);
        if (opts.head) {
          const range = res.headers.get("content-range") || "";
          return { count: parseInt(range.split("/")[1] || "0", 10) };
        }
        return res.json();
      },
      async insert(rows) {
        const res = await fetch(`${base}/rest/v1/${table}`, {
          method: "POST",
          headers,
          body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
        });
        if (!res.ok) throw new Error(`PostgREST insert ${res.status}`);
        return res.json();
      },
    }),
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    try {
      const path = url.pathname;
      if (path === "/" || path === "/health") {
        return json({ ok: true, service: "smc-icm-trading", time: new Date().toISOString() });
      }
      if (path === "/events") {
        const db = supabase(env);
        const events = await db.from("pipeline_events")
          .select("event_type,pair,payload,created_at")
          .order("created_at desc")
          .limit(parseInt(url.searchParams.get("limit") || "50", 10));
        return json({ ok: true, events });
      }
      if (path === "/graph/stats") {
        const db = supabase(env);
        const nodes = await db.from("graph_nodes").select("id", { head: true });
        const edges = await db.from("graph_edges").select("id", { head: true });
        return json({ ok: true, nodes: nodes.count, edges: edges.count });
      }
      return json({ ok: false, error: "not found" }, 404);
    } catch (e) {
      return json({ ok: false, error: e.message }, 500);
    }
  },

  // Cron trigger: public edge heartbeat into pipeline_events.
  async scheduled(_, env) {
    try {
      await supabase(env).from("pipeline_events").insert({
        event_type: "heartbeat",
        payload: { source: "cloudflare-cron", time: new Date().toISOString() },
      });
    } catch {}
  },
};