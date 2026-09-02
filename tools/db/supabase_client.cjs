// Supabase client — lazy init, graceful skip without keys.
// Configure in .env:
//   SUPABASE_URL=https://<project>.supabase.co
//   SUPABASE_SERVICE_KEY=<service_role key>   (server-side only; never expose)
//
// All callers must handle a null client (Supabase not configured) — the
// trading pipeline never blocks on a missing database.
const { createClient } = require("@supabase/supabase-js");

let client = null;
let inited = false;

function getClient() {
  if (inited) return client;
  inited = true;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  try {
    client = createClient(url, key, { auth: { persistSession: false } });
  } catch (e) {
    console.error(`[SUPABASE] init failed: ${e.message}`);
  }
  return client;
}

// Upsert rows in batches (Supabase REST caps ~1000 rows/request).
// onConflict: comma-separated columns for upsert resolution.
async function upsert(table, rows, onConflict = "id", batchSize = 500) {
  const c = getClient();
  if (!c || !Array.isArray(rows) || rows.length === 0) return { skipped: true };
  const all = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await c.from(table).upsert(chunk, { onConflict });
    if (error) all.push({ offset: i, error: error.message });
  }
  return { errors: all };
}

// Insert one pipeline event (decision / heartbeat / error / sync).
async function logEvent(eventType, pair, payload) {
  const c = getClient();
  if (!c) return;
  try {
    await c.from("pipeline_events").insert({ event_type: eventType, pair, payload: payload || {} });
  } catch {}
}

module.exports = { getClient, upsert, logEvent };