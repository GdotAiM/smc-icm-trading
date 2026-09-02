# 🔍 SMC-ICM Trading — Full System Audit

**Date**: 2026-07-29
**Scope**: `C:\Users\cash\smc-icm-trading` (30,137 lines of source code)
**Reviewer**: Claude Code

---

## Executive Summary

The SMC-ICM Trading workspace is a sophisticated trading analysis platform built around Smart Money Concepts (SMC) and Inner Circle Trader (ICT) methodology. It consists of ~30K lines across TypeScript, CommonJS, Python, and React. The architecture is well-conceived with a clear multi-stage pipeline, but has significant operational risks: no version control, exposed credentials, broken MCP auto-connect, hardcoded paths preventing portability, and zero test coverage.

**Overall Health**: 🟡 **C- (Needs Attention)** — 2 critical, 7 high, 12 medium, 9 low findings.

---

## Findings by Severity

### 🔴 CRITICAL (2)

#### 1. Discord Bot Token Exposed in `.env`
- **File**: `.env:1`
- **Issue**: A live Discord bot token is stored in plaintext in the project root. This token grants full control of the Discord bot — anyone with this token can impersonate the bot, read all messages in channels the bot has access to, and execute slash commands.
- **Evidence**: `DISCORD_TOKEN=MTUzMTk2Mzc3...` (real token, partially redacted for this report)
- **Fix**:
  1. **Immediately rotate this token** at https://discord.com/developers/applications
  2. Add `.env` to `.gitignore` (create one)
  3. Use `DISCORD_TOKEN=${DISCORD_TOKEN}` in any deployment configs instead
  4. Consider using Windows Credential Manager or environment variables set at the system level
- **Auto-fix**: No — requires manual token rotation at Discord

#### 2. No Version Control (No Git Repository)
- **Issue**: The entire project is not tracked by any version control system. There is no `.gitignore`, no commits, no remote. A single `rm -rf` or disk failure loses everything.
- **Fix**:
  1. `git init`
  2. Create `.gitignore` (template below)
  3. `git add . && git commit -m "Initial commit"`
  4. Push to a private GitHub repository
- **Auto-fix**: No — requires manual setup and user credentials

---

### 🔴 HIGH (7)

#### 3. MCP Server Auto-Connect Never Fires (Async Bug)
- **File**: `tools/tv-mcp/src/index.ts:64`
- **Issue**: `isConnected()` is an `async` function returning `Promise<boolean>`. The code calls `if (!isConnected())` — a Promise object is always truthy, so `!Promise` is always `false`. Auto-connect **never triggers**, meaning tools fail silently when TV Desktop isn't already connected.
- **Code**:
  ```typescript
  // Line 64 — BROKEN
  if (!isConnected()) {   // isConnected is async, always truthy
  ```
- **Fix**: Add `await`:
  ```typescript
  if (!(await isConnected())) {
  ```
- **Auto-fix**: Yes

#### 4. MCP Server Config Points to Wrong Script
- **File**: `.claude/settings.json:21-23`
- **Issue**: The tv-mcp server is configured to run `tools/tv-mcp/draw_sb_setup.cjs` — a drawing script — instead of the actual MCP server entry point `tools/tv-mcp/src/index.ts` (or its compiled dist equivalent). This means the 74-tool MCP server is never actually running; instead a single draw script is being treated as the MCP server.
- **Fix**: Either:
  - Point to compiled: `"args": ["tools/tv-mcp/dist/index.js"]` (requires build step)
  - Point to source with tsx: `"command": "npx", "args": ["tsx", "tools/tv-mcp/src/index.ts"]`
- **Auto-fix**: No

#### 5. TV-MCP Has TypeScript Strict Mode Disabled
- **File**: `tools/tv-mcp/tsconfig.json:12-14`
- **Issue**: Unlike `smc-engine` which uses `"strict": true`, the tv-mcp uses `"strict": false` with `"noImplicitAny": false` and `"strictNullChecks": false`. This is especially dangerous for CDP communication where null/undefined errors can crash the connection or produce silent failures.
- **Fix**: Enable `"strict": true` and fix resulting type errors
- **Auto-fix**: No

#### 6. Zero Test Coverage Across 30K Lines
- **Issue**: No test files exist anywhere in the project (searched for `*.test.*` and `*.spec.*`). Despite `smc-engine/package.json` having vitest configured, no tests were written. The SMC engine's deterministic algorithms (structure detection, liquidity clustering, FVG identification) are prime candidates for unit testing against known candle patterns.
- **Fix**: Write tests at minimum for:
  - SMC Engine: `analyzeStructure()`, `analyzeLiquidity()`, `analyzeFVG()`, `analyzeOrderBlocks()`
  - Config validation: `sessionForTime()`, instrument configurations
- **Auto-fix**: No

#### 7. Hardcoded Absolute Paths in Every Tool
- **Files**: `session_start.cjs`, `run_pair.cjs`, `run_all_stages.cjs`, `discord_bot.cjs`, and ~20 others
- **Issue**: Every tool hardcodes `const ROOT = "C:\\Users\\cash\\smc-icm-trading"`. The project cannot be cloned or moved to another machine or directory without breaking everything.
- **Fix**: Replace with `const ROOT = path.resolve(__dirname, "..")` or `process.cwd()` consistently
- **Auto-fix**: Partially — requires systematic replacement across all files

#### 8. `zodToJsonSchema` in MCP Server is a Fragile Custom Parser
- **File**: `tools/tv-mcp/src/index.ts:74-111`
- **Issue**: The function manually reads `_def` (Zod internal API) and has a hardcoded type map (`ZodString → "string"`, etc.). This is fragile — Zod internal APIs can change without notice, and complex types (unions, refinements, transforms) will produce incorrect schemas.
- **Severity**: High because this generates incorrect MCP tool schemas that Claude Code consumes, leading to malformed tool calls.
- **Fix**: Use `zod-to-json-schema` package or Zod's built-in `.toJSONSchema()` (available since zod 3.23+)
- **Auto-fix**: No

#### 9. `.env` Contains Client ID and Guild ID Alongside Token
- **File**: `.env:2-3`
- **Issue**: `DISCORD_CLIENT_ID=1531963773726883860` and `DISCORD_GUILD_ID=1531969417347596429` are exposed alongside the token. While less critical than the token, these IDs allow anyone to target the specific Discord application and server.
- **Fix**: Same as #1 — rotate exposed IDs, never commit `.env`

---

### 🟡 MEDIUM (12)

#### 10. No `.gitignore` — Risk of Committing Secrets and Bloat
- **Issue**: If git is initialized, `node_modules/` (~14K files), `.env`, and `dist/` would all be staged by default.
- **Fix**: Create `.gitignore` containing at minimum:
  ```gitignore
  node_modules/
  .env
  dist/
  *.log
  shared/*/20*/
  .claude/
  ```

#### 11. Massive Monolithic Script: `run_pair.cjs` (867 Lines)
- **File**: `tools/run_pair.cjs`
- **Issue**: This single file does: graph memory rebuild, macro context generation, live structure checking, SL monitoring, forecast generation, all 7 pipeline stages, model conflict detection with mutual exclusivity logic, cycle-weighted scoring, Po3 phase filtering, risk management with position sizing, journal writing, and continuous learning sync. It has deeply nested try/catch blocks (up to 5 levels) and ~30 `execSync` calls.
- **Fix**: Split into stage-specific modules that `run_pair.cjs` orchestrates, or at minimum extract the model scoring and conflict detection logic into separate files.

#### 12. Duplicate Pipeline Logic Between `run_pair.cjs` and `run_all_stages.cjs`
- **Files**: `tools/run_pair.cjs`, `tools/run_all_stages.cjs`
- **Issue**: Both files implement the same 7-stage pipeline with nearly identical markdown generation, model scoring, and SL/TP calculation logic. `run_pair.cjs` is more advanced (cycle weights, conflict detection, Po3 filtering, memory injection), while `run_all_stages.cjs` is simpler. Changes must be made in two places.
- **Fix**: Extract shared pipeline logic into a `pipeline_runner.cjs` module; have both files call into it.

#### 13. Weekly Briefing File Hardcoded with Date
- **File**: `tools/discord_bot.cjs:510`
- **Issue**: `path.join(ROOT, "shared", "WEEKLY_BRIEFING_2026-07-27.md")` — the briefing filename has a hardcoded date. This will break on any other week.
- **Fix**: Compute the most recent Monday or use glob to find the latest briefing file.

#### 14. `accountBalance` Hardcoded at $10,000
- **Files**: `tools/run_pair.cjs:747`, `tools/run_all_stages.cjs:428`
- **Issue**: Account balance is hardcoded in two files. If the user's actual balance differs, all position sizing calculations are wrong.
- **Fix**: Read from a config file (`_config/account.json`) or environment variable.

#### 15. Large Amount of Output Data Mixed with Source Code
- **Issue**: The `shared/` directory contains ~200 JSON and markdown files (candles, engine reports, forecasts, backtests, performance data) from July 26-29. This is runtime output data that shouldn't be tracked alongside source code.
- **Fix**: Add `shared/*/20*/` to `.gitignore`. Keep only the schema/structure directories under `shared/`.

#### 16. Draw Script Bloat (24+ Scripts in `tools/tv-mcp/`)
- **Files**: 24 `draw_*.cjs` scripts + 16 archived in `_archive/`
- **Issue**: Each pair/timeframe has its own draw script (`draw_eurusd_1m.cjs`, `draw_gbpusd_1m.cjs`, `draw_gold_drop.cjs`, etc.). These are likely near-identical except for the pair name. The system's own audit tool (`system_audit.cjs`) flags this as a medium-severity issue but hasn't been acted on.
- **Fix**: Consolidate into one parameterized `draw_setup.cjs --pair EURUSD --tf 1m` script.

#### 17. No Package Scripts in Root `package.json`
- **File**: `package.json`
- **Issue**: The root package.json only has `discord.js` as a dependency with no scripts defined. All tool execution relies on knowing exact file paths and command syntax.
- **Fix**: Add npm scripts for common operations: `npm run start-session`, `npm run analyze`, `npm run audit`, etc.

#### 18. Python/CJS/TS Hybrid Requires Three Runtimes
- **Issue**: The project requires Node.js, Python, and TypeScript (tsx/tsc) to function. The Python scripts (`forecast.py`, `data_fetcher.py`, `economic_calendar.py`, `chronos_forecast.py`, `kronos_forecast.py`) have no dependency tracking — no `requirements.txt` or `pyproject.toml`.
- **Fix**: Add `requirements.txt` for Python dependencies. Document required runtime versions in CLAUDE.md.

#### 19. ExecSync Error Suppression Hides Failures
- **Pattern**: Throughout the codebase, `execSync` is called with `stdio: ["ignore", "pipe", "ignore"]` inside try/catch blocks that often silently continue (`} catch(e) { console.log(\`...unavailable\`); }`). When a tool fails, the pipeline continues with partial data rather than failing fast.
- **Files**: `run_pair.cjs` (~30 instances), `session_start.cjs` (~15 instances), `discord_bot.cjs` (~10 instances)
- **Fix**: Implement a result wrapper that distinguishes "tool unavailable" (expected, continue) from "tool crashed" (unexpected, escalate).

#### 20. `session_start.cjs` Kills TV Desktop Process Unconditionally
- **File**: `tools/session_start.cjs:76`
- **Issue**: `Get-Process -Name 'TradingView' | Stop-Process -Force` — kills ALL TradingView processes without warning. If the user has unsaved chart layouts, they're lost.
- **Fix**: Check if the existing process has `--remote-debugging-port` flag before killing. Warn the user first.

#### 21. Data Files Use Inconsistent Symbol Names
- **Issue**: The `shared/` data uses both `GOLD` and `XAUUSD` as directory names for the same instrument (gold). July 26 uses `GOLD/`, July 27-28 use `GOLD/`, July 29 uses `XAUUSD/`. This makes historical data queries inconsistent.
- **Fix**: Standardize on `XAUUSD` for gold throughout (matching TradingView's symbol).

---

### 🔵 LOW (9)

#### 22. `system_audit.cjs` Only Has 14 Checks
- **File**: `tools/system_audit.cjs`
- **Issue**: The built-in audit tool misses many of the issues in this report. It's a good start but needs expansion.

#### 23. Web Dashboard Only Supports EURUSD Bias Hardcoded
- **File**: `web/src/App.tsx:26-31`
- **Issue**: The `loadStage` function hardcodes `bias.md` as the file to fetch, meaning it only works for EURUSD (or whichever pair's bias.md is most recent). The dashboard doesn't allow pair selection.

#### 24. No TypeScript Build Step Automated for tv-mcp
- **File**: `tools/tv-mcp/`
- **Issue**: The tv-mcp has a tsconfig.json but no build script and the MCP config doesn't reference the compiled output. It would need `npx tsc` run manually before use.

#### 25. Inconsistent UTC/NY Time Usage
- **Files**: `tools/run_pair.cjs`, `tools/run_all_stages.cjs`, `tools/ny_time.cjs`
- **Issue**: `run_pair.cjs` and `run_all_stages.cjs` use UTC hours directly for session detection, while `discord_bot.cjs` imports `ny_time.cjs` for NY-local time. Some session windows (Silver Bullet, Killzones) are ICT-defined in NY local time, so UTC-based detection is 4-5 hours off depending on DST.

#### 26. `smc-engine` Pivots Module Not in Barrel Export
- **File**: `tools/smc-engine/src/index.ts`
- **Issue**: `findPivots` is exported from `./pivots` and used by `structure.ts` and `liquidity.ts`, but the barrel export in `index.ts` doesn't include `./pivots`. External consumers can't access it.

#### 27. `run_pair.cjs` Has Duplicate `require("child_process")` Imports
- **File**: `tools/run_pair.cjs`
- **Issue**: `execSync` from `child_process` is required with a local `require` inside multiple nested try/catch blocks instead of once at the top. Not a bug, but indicates copy-paste growth.

#### 28. `CLAUDE_ICT_KNOWLEDGE.md` is 72KB
- **File**: `CLAUDE_ICT_KNOWLEDGE.md`
- **Issue**: This file is loaded into every Claude Code session context. At 72KB, it consumes significant context window space before any work begins. Consider trimming or making it a reference document that's consulted on-demand.

#### 29. No Rate Limiting on Discord Alerts
- **File**: `tools/discord_bot.cjs:628-696`
- **Issue**: The alert system fires every 60 seconds. The `alertOnce` dedup per session prevents duplicates, but if the bot restarts, it will re-fire all alerts. Additionally, the setup alerts from `setups.jsonl` have no rate limit — if many setups accumulate, the bot could hit Discord's rate limits.

#### 30. TV CDP Fetch Uses `window.TradingViewApi._activeChartWidgetWV` (Private API)
- **Files**: `tools/session_start.cjs:123-152`, `tools/discord_bot.cjs:144-167`
- **Issue**: All TV data fetching relies on accessing `window.TradingViewApi._activeChartWidgetWV` and `._chartWidget.model().mainSeries().bars()` — these are private/internal TradingView APIs that could break with any TV Desktop update.
- **Fix**: Document this risk. The `chrome-remote-interface` approach is the best available, but be aware it's fragile.

---

## Architecture Assessment

### Strengths

| Area | Rating | Notes |
|------|--------|-------|
| **SMC Engine Design** | ⭐⭐⭐⭐ | Clean TypeScript, well-separated modules, barrel exports, strict mode, good config centralization |
| **Stage Pipeline Concept** | ⭐⭐⭐⭐ | 7-stage HTF→Entry→Risk→Journal workflow is sound ICT methodology |
| **ICT Knowledge Base** | ⭐⭐⭐⭐ | RAG index, curriculum tiers, continuous learning, trade graph — impressive for a non-production system |
| **Discord Bot** | ⭐⭐⭐ | Comprehensive slash commands, alert scheduling, embed builders — good UX |
| **System Audit Tool** | ⭐⭐⭐ | Self-auditing is rare and valuable; needs more checks |
| **Config Centralization** | ⭐⭐⭐ | `SMC_CONFIG` in smc-engine, `_config/` directory for trading rules |

### Weaknesses

| Area | Rating | Notes |
|------|--------|-------|
| **Operational Safety** | ⭐ | No git, exposed secrets, hardcoded paths, no tests |
| **Code Organization** | ⭐⭐ | Monolithic scripts, duplicated logic, mixed module systems |
| **Error Handling** | ⭐⭐ | Silent failures, no circuit breakers, no retry logic |
| **Portability** | ⭐ | Hardcoded absolute paths everywhere |
| **Dependency Management** | ⭐⭐ | No Python requirements.txt, missing build scripts |

---

## File Size & Complexity Map

| File | Lines | Complexity | Issues |
|------|-------|------------|--------|
| `tools/run_pair.cjs` | 867 | **Very High** | Monolith, nested try/catch, duplicate requires |
| `tools/discord_bot.cjs` | 715 | **High** | Hardcoded paths, token exposure path, duplicate helpers |
| `tools/run_all_stages.cjs` | 575 | **Medium** | Duplicate logic with run_pair.cjs |
| `tools/session_start.cjs` | 246 | **Medium** | Kills TV process unconditionally |
| `tools/system_audit.cjs` | 463 | **Low** | Well-structured, needs more checks |
| `tools/smc-engine/src/structure.ts` | 117 | **Low** | Clean state machine |
| `tools/smc-engine/src/liquidity.ts` | 202 | **Medium** | Good clustering algorithm |
| `tools/tv-mcp/src/index.ts` | 155 | **Medium** | Async bug, fragile Zod parsing |
| `tools/tv-mcp/src/core/connection.ts` | 309 | **Medium** | Well-designed CDP layer |
| `web/src/App.tsx` | 104 | **Low** | Basic dashboard, single-pair only |

---

## Top Recommended Actions (Priority Order)

1. **🔴 Rotate Discord token immediately** — the exposed token in `.env` is a live credential
2. **🔴 Initialize git** — `git init`, create `.gitignore`, make first commit
3. **🔴 Fix MCP auto-connect bug** — add `await` before `isConnected()` in `index.ts:64`
4. **🔴 Fix MCP server config** — point settings.json to the actual MCP server, not a draw script
5. **🟡 Replace hardcoded `ROOT` paths** — use `path.resolve(__dirname, "..")` across all tools
6. **🟡 Enable `strict: true` in tv-mcp tsconfig** — fix resulting type errors
7. **🟡 Write core SMC engine tests** — structure, liquidity, FVG, order blocks
8. **🟡 Extract shared pipeline logic** — deduplicate `run_pair.cjs` and `run_all_stages.cjs`
9. **🟡 Add Python `requirements.txt`** — document all Python dependencies
10. **🔵 Consolidate draw scripts** — merge 24 scripts into 1 parameterized script

---

## `.gitignore` Template

```gitignore
# Dependencies
node_modules/

# Secrets
.env
*.pem
*.key

# Build output
dist/
*.tsbuildinfo

# Runtime data (daily candles, engine reports, forecasts)
shared/*/20*/
shared/backtest/batch/
shared/monitor/
shared/performance/

# Editor
.vscode/
.idea/

# OS
Thumbs.db
Desktop.ini

# Logs
*.log

# Python
__pycache__/
*.pyc
.venv/
venv/

# Claude
.claude/
```

---

## Total Lines of Code by Language

| Language | Lines | % |
|----------|-------|---|
| TypeScript (.ts/.tsx) | ~1,500 | 5% |
| CommonJS (.cjs) | ~27,500 | 91% |
| Python (.py) | ~800 | 3% |
| Config (.json/.js) | ~337 | 1% |
| **Total** | **~30,137** | 100% |

---

*Generated by Claude Code audit on 2026-07-29. Re-run `node tools/system_audit.cjs --audit` for the built-in lightweight check.*
