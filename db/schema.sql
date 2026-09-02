-- SMC-ICM Trading — Supabase schema
-- Run once in the Supabase SQL Editor. Matches the JSON persistence in shared/
-- (trade_graph.json, trade_log.json) so the dashboard and backtests can query live.

create extension if not exists vector;

-- Trade graph nodes (concepts, trades, pairs, models, sessions, lessons, gaps)
create table if not exists graph_nodes (
  id text primary key,
  type text not null,
  name text,
  data jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

-- Trade graph edges
create table if not exists graph_edges (
  id bigserial primary key,
  source text not null references graph_nodes(id) on delete cascade,
  target text not null references graph_nodes(id) on delete cascade,
  type text not null,
  weight numeric not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  unique (source, target, type)
);
create index if not exists idx_graph_edges_source on graph_edges(source);
create index if not exists idx_graph_edges_target on graph_edges(target);

-- Trades (from shared/trade_log.json)
create table if not exists trades (
  id text primary key,
  pair text not null,
  direction text not null,
  pnl numeric,
  model text,
  session text,
  entry numeric,
  sl numeric,
  tp1 numeric,
  tp2 numeric,
  risk numeric,
  rr text,
  status text,
  trade_date date,
  notes text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);
create index if not exists idx_trades_pair on trades(pair);
create index if not exists idx_trades_date on trades(trade_date);

-- Performance stats (model / session / pair) — upserted by sync
create table if not exists performance (
  dimension text not null,  -- 'model' | 'session' | 'pair'
  key text not null,
  metric text not null,     -- e.g. win_rate, total_pnl, trades
  value numeric,
  detail jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (dimension, key, metric)
);

-- Pipeline / heartbeat events (append-only; powers the dashboard timeline)
create table if not exists pipeline_events (
  id bigserial primary key,
  event_type text not null,  -- decision | heartbeat | error | sync
  pair text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_pipeline_events_type on pipeline_events(event_type, created_at desc);

-- ICT knowledge chunks (RAG). Embedding dimension MUST match your embedding
-- model: OpenAI text-embedding-3-small=1536, bge-small=384, nomic-embed-text=768.
-- Populated by tools/db/embed_knowledge.cjs when a key is available.
create table if not exists knowledge_chunks (
  id text primary key,
  source text not null,  -- e.g. references/.../file.md
  title text,
  chunk text not null,
  embedding vector(768),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_knowledge_embedding on knowledge_chunks using hnsw (embedding vector_cosine_ops);