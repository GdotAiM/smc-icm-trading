# Free Resources Report — smc-icm-trading

**Scope:** Recommendations drawn from the [free-for.dev](https://github.com/ripienaar/free-for-dev) catalogue (ripienaar/free-for-dev, checked Aug 2026), mapped one-to-one against the actual needs of this repo. Free tiers change frequently — verify the limits at each link before wiring anything in.

**Guiding principles for this project:**

1. **TradingView CDP stays the production data backbone.** Free-tier market-data APIs are fallbacks and sentiment/news enrichment — never the primary feed for a live session.
2. **The LLM layer is audit-only.** Adding observability around it (not bigger models) is the highest-leverage move.
3. **JSON-file persistence is the biggest scaling risk.** Moving trade graph / performance / candle archives to a free managed DB unlocks the web dashboard and nightly backtests.
4. **There is no CI/CD and no crash/uptime alerting today.** That is the biggest *reliability* gap for an autonomous system.

---

## 1. Current State (what is already free and working)

| Capability | Current implementation | Status |
|---|---|---|
| Market data | TradingView Desktop + CDP bridge (production), Binance/Yahoo (`data_fetcher.py`), ForexFactory XML (`economic_calendar.py`) | ✅ Working |
| LLM (audit + judge) | `tools/llm/llm_client.cjs` multi-provider: Gemini (default), Cerebras, Groq, OpenRouter, Fireworks, OpenAI | ✅ Working, 429-tolerant |
| Notifications | `discord_bot.cjs` (alerts to Discord channel) | ✅ Working |
| Scheduling | Windows `schtasks` → `start_auto.cjs` → `auto_scheduler.cjs` with `scheduler_guard.cjs` heartbeat lock | ✅ Working, local-only |
| Persistence | JSON/JSONL files under `shared/`, `stages/`, `data/` (`trade_graph.json`, `error_log.jsonl`, candle archives) | ⚠️ Fragile at scale |
| RAG | `ict_rag.cjs` local keyword/semantic index over 138 tutorials | ⚠️ No vector store |
| Web dashboard | `web/` React 19 + Vite 6 + Tailwind | ❌ Local-only, not deployed |
| CI/CD | None | ❌ Missing |
| Crash tracking | `logger.cjs` → `error_log.jsonl` (file only) | ⚠️ No alerting |
| Uptime/heartbeat | `scheduler_guard.cjs` heartbeat file (local only) | ⚠️ No remote alert |
| Backtest/eval | `backtest_runner.cjs`, `evaluation/` (31 regression tests) | ⚠️ No nightly automated run |

---

## 2. Recommended — by category

### 2.1 LLM Observability (highest leverage)

The audit layer (`setup_auditor.cjs` ReAct loop, `llm_judge.cjs`, `--edge` voting) currently runs blind — you cannot see tokens, tool-call traces, or provider errors after the fact. These fix that:

| Service | Free tier | Why it fits | Integration point |
|---|---|---|---|
| **Langfuse** | 50k observations/mo, all features | Open-source LLM tracing; log every `agentLoop` iteration, tool call, token count, verdict | Wrap `llm_client.cjs` chat completion; tag traces with pair/date/provider |
| **Portkey** | 10k requests/mo | AI gateway + logging + one API for all 6 providers; built-in failover | Point `llm_client.cjs` base URL at Portkey instead of juggling per-provider keys |
| **Arize AX** | 25k spans/mo, 1GB ingest | Evaluate judge/auditor outputs vs. ground truth | Optional; run after Langfuse proves valuable |

**Recommendation:** Langfuse (OSS, no lock-in) as the first adoption. It turns the audit layer into an auditable layer.

### 2.2 Database & Persistence

Replace the JSON-file sprawl for *queryable* data. The sibling `part-2-SMC` project already runs Supabase + Drizzle, so the team knows this stack.

| Service | Free tier | Why it fits | Integration point |
|---|---|---|---|
| **Supabase** | Postgres + Auth + Realtime + Storage | Full backend; `pgvector` extension for RAG; already familiar from `part-2-SMC` | Store `trade_graph.json`, performance ledger, candle archives, stage outputs → serve to the web dashboard live |
| **Turso** | 9GB, 1B row-reads/mo, 500 DBs, 3 regions | Edge SQLite, zero-ops | Low-latency local-first store for per-pair candle/level data |
| **Qdrant Cloud** | 1 node, 4GB disk | Managed vector DB | Replace local `ict_rag.cjs` keyword search with real embeddings over the 138 tutorials |
| **Upstash Redis** | 500K commands/mo, 256MB | Serverless Redis | Session state, rate-limit buckets for free-tier APIs, pub/sub for intel events |
| **Neo4j AuraDB** | 200k nodes / 400k relationships | True graph DB | If `trade_graph.json` grows past ~10k nodes, migrate the graph memory model |
| **InfluxDB Cloud** | 3MB/5min writes, 30MB/5min reads | Time-series | Historical price/level ticks for backtesting analytics (optional; CSV files may suffice early) |
| **Aiven** | 1 free Postgres/MySQL/Redis (1GB) | Managed OSS DB alternative | Supabase fallback / local dev parity |

**Recommendation:** Supabase Postgres + `pgvector` first (it also hosts the RAG vectors and the dashboard backend in one place). Turso only if the machine needs local-edge reads.

### 2.3 CI/CD + Scheduled Jobs

No pipeline exists. There is a 31-test regression suite that is never run automatically, plus backtests and forecast-evaluation that should run nightly.

| Service | Free tier | Why it fits | Integration point |
|---|---|---|---|
| **GitHub Actions** | ~300 min/mo (private repos), free for public | Run `npm test`, `evaluation/regression/suite.cjs`, nightly backtests, nightly forecast-eval via `schedule` cron | Push repo to GitHub; add `.github/workflows/{test,nightly-backtest}.yml` |
| **CircleCI** | 6,000 min/mo | Generous fallback if GitHub minutes run out | Same jobs as above |
| **Buildkite** | 5k job-min/mo, 3 users | If you need Windows runners for the CJS/CDP scripts | Marginal |
| **Trigger.dev** | $5 credits/mo, 10 schedules | Durable background jobs with retries | Optional for moving `auto_scheduler` logic off `schtasks` |

**Recommendation:** GitHub Actions scheduled workflows are the single best reliability upgrade for the money (none). Put the regression suite + a nightly `run_pair` dry-run + backtest in CI.

### 2.4 Hosting & Deployment (web dashboard + serverless glue)

| Service | Free tier | Why it fits | Integration point |
|---|---|---|---|
| **Cloudflare Pages** | 500 builds/mo, 100 domains, SSL, CDN | Deploy `web/` (Vite build) with `npm run build` | Connect GitHub repo; Pages auto-deploys on push |
| **Cloudflare Workers** | 100k req/day + **Cron Triggers** | Serverless API to expose stage outputs + scheduled jobs without a VM | Thin worker that reads Supabase/`shared/` and serves JSON to the dashboard |
| **Cloudflare D1** | 1GB, 5M row-reads/day | SQLite at the edge | If dashboards only need recent data, D1 beats Postgres |
| **Cloudflare R2** | 10GB, 1M Class A ops/mo | Object storage for candle archives, charts, backtest artifacts | Archive `data/` + screenshots off the local disk |
| **Vercel** | Free Hobby, SSL/CDN | Alternative to Pages (better if you add a Next.js API) | Fallback |
| **Render** | Free web services + Postgres | Host a small API/worker (e.g., a public status endpoint) | Optional |

**Recommendation:** Cloudflare Pages for the dashboard + Workers cron for serverless scheduled tasks + R2 for archives. This gets the whole observability story onto the public internet with zero cost.

### 2.5 Monitoring, Heartbeat & Crash Alerting (reliability)

The autonomous scheduler already has a *heartbeat pattern* (`scheduler_guard.cjs`) — perfect for remote heartbeat monitors. Today, if the machine dies or the session monitor stops, nothing alerts.

| Service | Free tier | Why it fits | Integration point |
|---|---|---|---|
| **healthchecks.io** | 20 checks, Discord/email/Slack alerts | Cron heartbeat. Each scheduler cycle pings; a missed ping = alert | Add a ping from `auto_scheduler.cjs` cycle and `session_monitor.cjs` tick; alert → existing Discord channel |
| **Sentry** | 5k errors/mo | Crash + exception tracking for every `.cjs` script; breadcrumbs, release tracking | Add Sentry SDK to `logger.cjs`; every `error_log.jsonl` write also → Sentry |
| **UptimeRobot** | 50 monitors, 5-min checks | Watch public endpoints (dashboard, worker) | After deployment in 2.4 |
| **Better Stack Uptime** | 10 monitors, 3-min checks, status page | Status page + incident management | Nice-to-have; shows session health publicly |
| **Grafana Cloud** | 10k metric series + 50GB Loki logs | Unified dashboards for bias accuracy, model win rates, pipeline latency | Optional long-term; export `performance_ledger` to Prometheus |
| **cronitor.io** | 5 monitors | Cron-specific monitoring w/ latency insights | Alternative to healthchecks.io |

**Recommendation:** healthchecks.io (fits the existing heartbeat pattern perfectly) + Sentry. This is the fastest path from "logs to a file" to "alerts when things break."

### 2.6 Log Management

| Service | Free tier | Why it fits | Integration point |
|---|---|---|---|
| **Axiom** | 0.5TB logs, 30-day retention, Discord notifiers | Very generous; query JSONL directly | Ship `shared/**/error_log.jsonl` + scheduler logs via HTTP ingest |
| **Logtail** | 1GB/mo, 3-day retention | ClickHouse-backed, SQL query | Simpler alternative |
| **Grafana Loki (via Grafana Cloud)** | 50GB, 14-day | Pairs with Grafana dashboards | If you adopt Grafana Cloud |

**Recommendation:** Axiom. Cheap, huge quota, native JSONL querying — matches the existing JSONL log format.

### 2.7 Market Data, News & Financial APIs (fallback + enrichment)

The free-for.dev list is *thin* on deep forex tick data (that is inherent — free tiers don't offer institutional FX). What it does offer:

| Service | Free tier | Why it fits | Integration point |
|---|---|---|---|
| **UniRateAPI** | 590+ currencies, unlimited free calls | Cross-rate sanity check for DXY/EURUSD/GBPUSD when TV CDP is down | `data_fetcher.py` fallback source |
| **CurrencyScoop** | 5,000 calls/mo | Real-time FX rates, stable | Fallback feed for `live_levels.cjs` freshness checks |
| **AlphaAI** | 20 req/min, 100 req/day; financial news + per-ticker impact + MCP | Sentiment feed for **Stage 00 macro context** | New `tools/news_sentiment.cjs` feeding `00_macro_context` |
| **News API** | 100 queries/day (24h delay) | General macro news for the morning brief | `morning_briefing.cjs` enrichment |
| **Earnings Feed** | 15 req/min (SEC filings, insider trades) | Equity event awareness for NAS100 | Stage 00 event list |
| **Financial Data** | 300 req/day (stocks) | NAS100 alternative data | Backtest auxiliary |
| **Market Data API** | 100 req/day (stocks/options) | NAS100 options flow | Optional |
| **CoinMarketCap** | 10K credits/mo | Only if you add crypto pairs | N/A today |

**Recommendation:** adopt UniRateAPI/CurrencyScoop as **offline fallbacks** in `data_fetcher.py`, and AlphaAI + News API for the macro/sentiment narrative. Do **not** let any of these become the live trading feed — the 5-pair TV CDP session loop stays primary.

### 2.8 Search / RAG

| Service | Free tier | Why it fits | Integration point |
|---|---|---|---|
| **Qdrant Cloud** | 4GB vector DB | Embeddings for the 138 ICT tutorials + trade-graph lessons | Upgrade `ict_rag.cjs` / `graph_rag.cjs` to vector similarity |
| **Algolia** | 1M docs, 10k searches/mo | Full-text + typo-tolerant search over the knowledge base | Dashboard search box |
| **Supabase pgvector** | (part of free Supabase) | If you adopt Supabase, store embeddings there instead | Same as Qdrant, one less service |

**Recommendation:** If Supabase is adopted (2.2), use `pgvector` and skip Qdrant. Otherwise Qdrant.

### 2.9 Notifications & Messaging

Discord already covers alerts. Only add if you want redundancy or mobile:

| Service | Free tier | Why it fits |
|---|---|---|
| **Novu** | 30k notifications/mo, 90-day retention | One API to route alerts to Discord/email/push/Slack; replaces hand-rolled channel logic |
| **Telegram Bot API** | Free | Zero-cost fallback alert channel |
| **ntfy** | Free (self-host or public) | Simple pub/sub push to phone for trade fills |

**Recommendation:** keep Discord; add **Telegram** as the one free fallback channel (5 lines of code in `discord_bot.cjs`).

### 2.10 Code Quality & Static Analysis

Most tools here are **open-source-only free** — and this repo is not public. Only two are useful for private repos:

| Service | Free tier | Why it fits |
|---|---|---|
| **CodeRabbit** | 200 files/hr, 3 reviews/hr, free OSS; limited private | AI PR review for the `.cjs` scripts |
| **DeepScan** | free for OSS only | ⚠️ Requires OSS — skip unless repo goes public |

**Recommendation:** skip static-analysis SaaS unless the repo is made public; instead rely on the existing `node --test` suite in CI (2.3). If the repo goes public later, add SonarCloud/DeepScan.

### 2.11 Storage / Backup

| Service | Free tier | Why it fits |
|---|---|---|
| **Backblaze B2** | 10GB free | Offsite backup of `data/`, `shared/`, `stages/` outputs |
| **borgbase** | 10GB, 2 repos | Encrypted incremental backups of the working tree + `.env` (encrypted) |

**Recommendation:** nightly B2 (or borgbase) backup via GitHub Actions cron — the repo *is* the business record (trade graph, journals, backtests).

---

## 3. Priority Roadmap

Ordered by impact-to-effort. Each phase is self-contained.

**Phase 1 — Make failures loud (this week)**
- healthchecks.io heartbeat pings from `auto_scheduler.cjs` + `session_monitor.cjs` → alerts to existing Discord channel
- Sentry SDK in `logger.cjs` (5k errors/mo)
- GitHub repo push + GitHub Actions running `npm test` + `evaluation/regression/suite.cjs` on every push and nightly

**Phase 2 — Persistent store + observability (next 1–2 weeks)**
- Supabase: migrate `trade_graph.json`, performance ledger, candle archives → Postgres; enable `pgvector`
- Upgrade `ict_rag.cjs` to `pgvector` embeddings
- Langfuse tracing on `setup_auditor.cjs` + `llm_judge.cjs`
- Axiom log shipping for all JSONL logs

**Phase 3 — Deployment (2–4 weeks)**
- Cloudflare Pages deploy of `web/` (Vite build, auto from GitHub)
- Cloudflare Workers + Cron Triggers for scheduled scans / nightly forecast-eval / backtests
- UptimeRobot monitors on the public endpoints
- Backblaze B2 nightly backup

**Phase 4 — Enrichment (ongoing)**
- AlphaAI + News API → Stage 00 macro narrative
- UniRateAPI / CurrencyScoop as `data_fetcher.py` fallbacks
- Telegram fallback alert channel
- Grafana Cloud dashboards for bias accuracy / model win rate / pipeline latency

---

## 4. Explicitly NOT recommended (and why)

| Resource | Why not |
|---|---|
| **CoinMarketCap / Codex** | Crypto-only; no crypto pairs in the current 5-pair set |
| **InfluxDB / Tinybird / CrateDB** | Timeseries/analytics DBs are overkill until the JSON-file store is actually the bottleneck; Supabase + CSV covers it |
| **Neo4j Aura** | Only after `trade_graph.json` outgrows ~10k nodes (Phase 2 re-check) |
| **Visual/UI testing (Percy, Cypress, Argos)** | The dashboard is a read-only viewer; no UI regression risk to manage yet |
| **Push-notification services (OneSignal, webpushr, Pocket Alert)** | Discord + Telegram cover alerting; no mobile app exists |
| **Scraping services (Apify, Browse AI, Firecrawl)** | TV CDP already scrapes; adding third-party scrapers raises ToS/licensing risk for no gain |
| **Screenshot/PDF APIs** | TV CDP captures charts natively |
| **Geo/IP/phone/email-validation APIs** | Irrelevant to a trading pipeline |
| **LLM model aggregators with trial-only credits** | Only **perpetual** free tiers belong in this stack; trials create scheduled breakage |
| **Aiven / CockroachDB / MongoDB Atlas** | Fine services, but Supabase already wins on familiarity (used in `part-2-SMC`) + pgvector |

---

## 5. Caveats

1. **Free-tier limits change.** The numbers above are from the free-for.dev list at check time (Aug 2026). Re-verify before hard dependency (e.g., put each quota in `_config/` with a budget monitor).
2. **Trading-legal reality:** every API here is a *developer infrastructure* free tier, not a market-data or signal product. They complement — never replace — the TV CDP loop, and none are guarantees of performance. Paper trading only.
3. **Don't add services faster than value.** The repo is already feature-rich; the recommendations in Phase 1 are the ones that change outcomes (alerts when things break). Phases 2–4 are scale and polish.
4. **Private repo means most "free for OSS" tools don't apply** (SonarCloud, DeepScan, Coveralls, many CI extras). Budget for the OSS-only caveat or plan to make the repo public.