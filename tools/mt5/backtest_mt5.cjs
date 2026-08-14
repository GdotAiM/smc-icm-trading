// MT5 Backtest Runner — tests the system's SMC/ICT strategies on historical
// MT5 data. Four modes (user-selectable):
//
//   signal    — engine scan only: per-day structure/bias/sweeps/PD arrays,
//               signal dates logged, no P&L. Fastest.
//   core      — engine + core decision logic (bias alignment, sweep, PD array
//               confluence, R:R, killzone) → simulated trades with P&L.
//   pipeline  — most faithful decision path: runs the real lib modules used by
//               run_pair.cjs (killzoneFor, resolveBias, drawTargets) on MT5 candles.
//   tick      — pipeline decisions + tick-level execution: SL/TP/partial fills
//               resolved on real MT5 tick data (copy_ticks) instead of candle
//               high/low — intrabar fills, no lookahead, closest to MT5 replay.
//
// Output is written to shared/backtest/batch/<start>_to_<end>/<PAIR>/ in the
// SAME format backtest_runner.cjs uses (journals/, daily_summaries/,
// engine_reports/, performance_summary.md) so backtest_distill.cjs and
// trade_graph.cjs consume it unchanged.
//
// Usage:
//   node tools/mt5/backtest_mt5.cjs --pair GBPUSD --start 2026-06-01 --end 2026-07-31 --mode core [--risk 100]
//   node tools/mt5/backtest_mt5.cjs --pair GBPUSD --start 2026-06-01 --end 2026-06-30 --mode tick [--risk 100]
const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");

const ROOT = process.env.WORKSPACE_ROOT || "C:\\Users\\cash\\smc-icm-trading";
const ENGINE_SRC = path.join(ROOT, "tools", "smc-engine", "src", "cli.ts");
const SYMBOL_MAP = JSON.parse(fs.readFileSync(path.join(ROOT, "_config", "mt5_symbols.json"), "utf8"));

const args = parseArgs();
const PAIR = args.pair || "GBPUSD";
const SYMBOL = SYMBOL_MAP[PAIR] || PAIR;
const MODE = args.mode || "core"; // signal | core | pipeline | tick
const START = args.start || "2026-06-01";
const END = args.end || "2026-06-30";
const RISK_USD = Number(args.risk || 100);
const ANALYZE_TFS = MODE === "signal" ? ["H1", "H4"] : MODE === "core" ? ["H1", "H4", "D1"] : ["H1", "H4", "D1"];
const LOOKBACK = MODE === "pipeline" ? "80d" : "60d";

function parseArgs() {
  const raw = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].startsWith("--")) out[raw[i].slice(2)] = raw[i + 1] && !raw[i + 1].startsWith("--") ? raw[i + 1] : "";
  }
  return out;
}

const ny = require(path.join(ROOT, "tools", "ny_time.cjs"));
const { killzoneFor } = require(path.join(ROOT, "tools", "lib", "killzone.cjs"));
const { resolveBias, confidenceFromConfluence } = require(path.join(ROOT, "tools", "lib", "narrative.cjs"));
const { drawTargets } = require(path.join(ROOT, "tools", "lib", "draw.cjs"));
const { calcATR } = require(path.join(ROOT, "tools", "lib", "metrics.cjs"));

// ── MT5 bridge child process ────────────────────────────────────────────
function Bridge() {
  const py = process.env.PYTHON || "python";
  const child = spawn(py, [path.join(ROOT, "tools", "mt5", "mt5_bridge.py")], { cwd: ROOT });
  let buf = "";
  const pending = [];
  child.stdout.on("data", (d) => {
    buf += d.toString("utf8");
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try { pending.shift()(JSON.parse(line)); } catch {}
    }
  });
  child.stderr.on("data", () => {});
  this.req = (cmd, payload = {}) => new Promise((resolve) => {
    pending.push(resolve);
    child.stdin.write(JSON.stringify({ cmd, args: payload }) + "\n");
  });
  this.close = () => { child.stdin.end(); };
}

// Fetch candles for a symbol+TF from MT5, cached per (symbol,tf).
const cache = {};
async function fetchCandles(bridge, symbol, tf, from, to) {
  const key = `${symbol}:${tf}`;
  if (cache[key]) return cache[key];
  const r = await bridge.req("copy_rates", { symbol, tf, from, to });
  if (!r.ok) throw new Error(`copy_rates ${symbol} ${tf}: ${r.error}`);
  cache[key] = r.result.candles;
  return cache[key];
}

// Fetch ticks for a symbol across the whole backtest window, cached once.
// Fetches per-day chunks to keep each bridge request bounded (a full 2-month
// tick range can be millions of ticks and exceed bridge/proxy timeouts).
const tickCache = {};
async function fetchTicks(bridge, symbol, from, to) {
  const key = `${symbol}:${from}:${to}`;
  if (tickCache[key]) return tickCache[key];

  const dates = [];
  let cur = new Date(from.slice(0, 10) + "T00:00:00Z");
  const last = new Date(to.slice(0, 10) + "T00:00:00Z");
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  let all = [];
  for (const d of dates) {
    const r = await bridge.req("copy_ticks", {
      symbol, from: d + "T00:00:00Z", to: (new Date(Date.parse(d + "T00:00:00Z") + 24 * 3600 * 1000)).toISOString(),
      flags: "all",
    });
    if (!r.ok) throw new Error(`copy_ticks ${symbol} ${d}: ${r.error}`);
    if (r.result.ticks && r.result.ticks.length) all = all.concat(r.result.ticks);
    console.error(`    [ticks] ${d}: ${r.result.count}`);
  }
  all.sort((a, b) => a.time - b.time);
  tickCache[key] = all;
  return tickCache[key];
}

// Slice candles up to (inclusive) a given ms timestamp.
function sliceUpTo(candles, endMs) {
  return candles.filter(c => c.time <= endMs);
}

// Run the SMC engine on a candle array for one TF; returns parsed report.
function runEngine(candles, tf) {
  const tmp = path.join(process.env.TEMP || "/tmp", `opencode`, `bt_${PAIR}_${tf}.json`);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(candles), "utf8");
  const out = execSync(`npx tsx "${ENGINE_SRC}" --pair ${PAIR} --tf ${tf} --input "${tmp}" --mode full`, {
    cwd: path.join(ROOT, "tools", "smc-engine"),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out);
}

// ── Decision helpers (shared by core/pipeline) ──────────────────────────
function dayEndMs(dateStr) {
  // Boundary between day D and D+1 = 00:00 UTC of the next calendar day.
  // Report sees bars with time < boundary (all of day D); first trade bar has time >= boundary.
  return Date.parse(dateStr.slice(0, 10) + "T00:00:00Z") + 24 * 3600 * 1000;
}

function addDays(dateStr, n) {
  const d = new Date(Date.parse(dateStr.slice(0, 10) + "T00:00:00Z"));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

// Slice candles strictly before (not including) a given ms timestamp.
function sliceUpTo(candles, endMs) {
  return candles.filter(c => c.time < endMs);
}

function detectSetup(reports) {
  // reports: { H1, H4, D1 } engine reports
  const h4 = reports.H4, h1 = reports.H1, d1 = reports.D1;
  const h4Bias = h4?.structure?.bias || "neutral";
  const h1Bias = h1?.structure?.bias || "neutral";
  const d1Bias = d1?.structure?.bias || "neutral";
  const sweptH4 = (h4?.liquidity || []).filter(p => p.swept).length;
  const sweptH1 = (h1?.liquidity || []).filter(p => p.swept).length;
  const obs = (h1?.orderBlocks || []).length + (h4?.orderBlocks || []).length;
  const fvgs = (h1?.fvgs || []).length + (h4?.fvgs || []).length;
  const pdArray = obs + fvgs;

  let bias = h4Bias;
  if (h4Bias === "neutral" && h1Bias !== "neutral") bias = h1Bias;
  const aligned =
    (bias === "bullish" && h1Bias !== "bearish") ||
    (bias === "bearish" && h1Bias !== "bullish");

  const signal = aligned && sweptH4 + sweptH1 > 0 && pdArray > 0;
  return {
    bias, aligned, signal,
    swept: sweptH4 + sweptH1, pdArray, obs, fvgs,
    d1Bias, h4Bias, h1Bias,
  };
}

function planTrade(reports, setup, price, h1Candles) {
  // Entry/SL/TP from real draw engine. Long: TP at next BSL above. Short: next SSL.
  const liquidityMap = [...(reports.H4?.liquidity || []), ...(reports.H1?.liquidity || [])];
  const direction = setup.bias === "bullish" ? "long" : setup.bias === "bearish" ? "short" : null;
  if (!direction) return null;

  // ATR buffer on SL: use H1 ATR, 1.0x beyond the last swing.
  const atr = calcATR(h1Candles || [], 14) || 0.0;
  const last = price;
  const swing = direction === "long"
    ? Math.min(...(h1Candles || []).slice(-10).map(c => c.low))
    : Math.max(...(h1Candles || []).slice(-10).map(c => c.high));

  const sl = direction === "long" ? swing - atr : swing + atr;
  const draw = drawTargets({ direction, price: last, liquidityMap });
  if (!draw || !draw.tp1) return null;
  const tp = draw.tp1.price;

  const risk = Math.abs(last - sl);
  const reward = Math.abs(tp - last);
  if (risk <= 0) return null;
  const rr = reward / risk;
  if (rr < 1) return null;

  // SL must be on the correct side of entry (structural invalidation).
  if (direction === "long" && !(sl < last)) return null;
  if (direction === "short" && !(sl > last)) return null;

  return { direction, entry: last, sl, tp, rr, atr, drawType: draw.tp1.type, tpPrice: draw.tp1.price };
}

// ── Execution simulation (core/pipeline) ────────────────────────────────
function simulate(candles, trade, entryIdx) {
  // Walk forward on H1; SL/TP hit determination by subsequent high/low.
  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    if (trade.direction === "long") {
      if (c.low <= trade.sl) return { exit: "SL", idx: i, price: trade.sl, pnlR: -1 };
      if (c.high >= trade.tp) return { exit: "TP", idx: i, price: trade.tp, pnlR: trade.rr };
    } else {
      if (c.high >= trade.sl) return { exit: "SL", idx: i, price: trade.sl, pnlR: -1 };
      if (c.low <= trade.tp) return { exit: "TP", idx: i, price: trade.tp, pnlR: trade.rr };
    }
  }
  return { exit: "OPEN", idx: candles.length - 1, price: candles[candles.length - 1].close, pnlR: null };
}

// ── Tick-level execution (tick mode) ────────────────────────────────────
// Resolves SL/TP on real MT5 ticks instead of candle high/low. Buy fills at
// ask, sell at bid. Checks each tick in time order: SL before TP wins (no
// lookahead — the trade exits at the first tick that triggers a level).
function simulateTicks(ticks, trade, entryTimeMs) {
  const entry = trade.entry;
  for (let i = 0; i < ticks.length; i++) {
    const t = ticks[i];
    if (t.time < entryTimeMs) continue;
    const bid = t.bid > 0 ? t.bid : t.last;
    const ask = t.ask > 0 ? t.ask : t.last;
    const px = trade.direction === "long" ? bid : ask; // exit price for fills
    if (trade.direction === "long") {
      if (bid > 0 && bid <= trade.sl) return { exit: "SL", idx: i, price: trade.sl, pnlR: -1 };
      if (ask > 0 && ask >= trade.tp) return { exit: "TP", idx: i, price: trade.tp, pnlR: trade.rr };
    } else {
      if (ask > 0 && ask >= trade.sl) return { exit: "SL", idx: i, price: trade.sl, pnlR: -1 };
      if (bid > 0 && bid <= trade.tp) return { exit: "TP", idx: i, price: trade.tp, pnlR: trade.rr };
    }
  }
  return { exit: "OPEN", idx: ticks.length - 1, price: ticks[ticks.length - 1]?.bid || ticks[ticks.length - 1]?.last || 0, pnlR: null };
}

// ── Output ──────────────────────────────────────────────────────────────
const batchDir = path.join(ROOT, "shared", "backtest", "batch", `${START}_to_${END}`, PAIR);
const journalsDir = path.join(batchDir, "journals");
const summariesDir = path.join(batchDir, "daily_summaries");
const engineDir = path.join(batchDir, "engine_reports");
const tradesDir = path.join(batchDir, "trades");
fs.mkdirSync(journalsDir, { recursive: true });
fs.mkdirSync(summariesDir, { recursive: true });
fs.mkdirSync(engineDir, { recursive: true });
fs.mkdirSync(tradesDir, { recursive: true });

function dateRange(start, end) {
  const dates = [];
  let cur = new Date(start + "T00:00:00Z");
  const last = new Date(end + "T00:00:00Z");
  while (cur <= last) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

async function main() {
  console.error(`[backtest] ${PAIR} (${SYMBOL}) | ${MODE} | ${START} → ${END} | risk $${RISK_USD}`);
  const bridge = new Bridge();
  await new Promise(r => setTimeout(r, 1500));

  const lookbackStart = new Date(new Date(START + "T00:00:00Z").getTime() - parseLookbackMs(LOOKBACK)).toISOString().split("T")[0];
  const fetchEnd = addDays(END, 1); // +1 day so the last day has a next bar

  // Pre-fetch all needed TFs once.
  const candles = {};
  for (const tf of ANALYZE_TFS) {
    candles[tf] = await fetchCandles(bridge, SYMBOL, tf, lookbackStart, fetchEnd);
    console.error(`  [fetch] ${SYMBOL} ${tf}: ${candles[tf].length} candles`);
  }
  const H1 = candles.H1;

  // Tick mode: fetch full tick history for the window once.
  let TICKS = [];
  if (MODE === "tick") {
    TICKS = await fetchTicks(bridge, SYMBOL, START + "T00:00:00Z", addDays(END, 1) + "T00:00:00Z");
    console.error(`  [fetch] ${SYMBOL} ticks: ${TICKS.length}`);
  }

  const dates = dateRange(START, END);
  const results = [];
  const trades = [];

  for (const date of dates) {
    const endMs = dayEndMs(date);
    const reports = {};
    for (const tf of ANALYZE_TFS) {
      const slice = sliceUpTo(candles[tf], endMs);
      if (slice.length < 20) { reports[tf] = null; continue; }
      try { reports[tf] = runEngine(slice, tf); }
      catch (e) { reports[tf] = null; }
      fs.writeFileSync(path.join(engineDir, `${date}_${tf}.json`), JSON.stringify(reports[tf]), "utf8");
    }

    const setup = reports.H1 || reports.H4 ? detectSetup(reports) : null;
    const price = H1.find(c => c.time >= endMs)?.open ?? H1[H1.length - 1]?.close ?? 0;

    let trade = null;
    if (setup?.signal && MODE !== "signal") {
      const h1Slice = sliceUpTo(candles.H1, endMs);
      const plan = planTrade(reports, setup, price, h1Slice);
      if (plan) {
        const entryIdx = H1.findIndex(c => c.time >= endMs);
        const entryBar = H1[entryIdx];
        // Skip weekend/holiday days: no bar within 48h of the boundary means
        // the next bar belongs to a later session (would double-count the trade).
        const gapHours = entryBar ? (entryBar.time - endMs) / 3600000 : Infinity;
        // pipeline mode: the signal itself (last event = CHoCH/BOS/etc.) must have
        // formed inside an ICT killzone — the same event-time gate run_pair applies
        // (lib/killzone.cjs grades WHEN a sweep/event happened, not the fill bar).
        let inKillzone = true;
        if (MODE === "pipeline") {
          const h1Report = reports.H1;
          const evtTime = h1Report?.structure?.lastEventTime;
          const nyHour = evtTime ? ny.getNYHourFor(evtTime) : ny.getNYHourFor(entryBar?.time || endMs);
          inKillzone = killzoneFor(nyHour).inKillzone;
        }
        if (entryIdx >= 0 && gapHours <= 48 && inKillzone) {
          let res;
          if (MODE === "tick") {
            // Entry fills at the first tick at/after the next bar's open time
            // (market order). SL/TP then resolved tick-by-tick.
            const entryBar = H1[entryIdx];
            const entryBarTime = entryBar?.time ?? endMs;
            res = simulateTicks(TICKS, plan, entryBarTime);
          } else {
            res = simulate(H1, plan, entryIdx);
          }
          trade = { ...plan, date, ...res, pnlUsd: res.pnlR != null ? res.pnlR * RISK_USD : 0 };
          trades.push(trade);
        }
      }
    }

    results.push({ date, setup: setup || {}, trade, mode: MODE });

    // ── Daily summary (matches backtest_runner format) ────────────────
    let summary = `# Daily Summary — ${PAIR} — ${date}\n\n`;
    summary += `---\nmode: backtest\ntype: batch\nsimulated_date: ${date}\npair: ${PAIR}\n---\n\n`;
    summary += `## Mode: ${MODE.toUpperCase()}${MODE === "tick" ? " (tick-level execution)" : ""} | Symbol: ${SYMBOL}\n`;
    if (!setup) {
      summary += "Insufficient engine data.\n";
    } else {
      summary += `## Structure\n- Bias: **${setup.bias?.toUpperCase() || "NEUTRAL"}** | H4: ${setup.h4Bias} | H1: ${setup.h1Bias} | D1: ${setup.d1Bias}\n`;
      summary += `- Swept: ${setup.swept} | PD arrays: ${setup.pdArray} (OB ${setup.obs} / FVG ${setup.fvgs})\n`;
      summary += `- Aligned: ${setup.aligned} | **SIGNAL: ${setup.signal ? "YES" : "NO"}**\n\n`;
      if (trade) {
        summary += `## Trade Decision: **${trade.direction.toUpperCase()}**\n`;
        summary += `- Entry: ${trade.entry} | SL: ${trade.sl} | TP: ${trade.tp}\n`;
        summary += `- R:R: ${trade.rr.toFixed(2)} | Draw: ${trade.drawType} @ ${trade.tpPrice}\n`;
        summary += `- Result: **${trade.exit}** | PnL: ${trade.pnlR != null ? `${trade.pnlR.toFixed(2)}R ($${trade.pnlUsd.toFixed(2)})` : "open"}\n`;
      } else if (setup.signal && MODE !== "signal") {
        summary += `## Trade Decision: **NO TRADE**\n- Signal detected but no valid R:R ≥ 1 draw in direction.\n`;
      } else if (MODE === "signal" && setup.signal) {
        summary += `## Trade Decision: SIGNAL (signal mode — no execution)\n`;
      } else {
        summary += `## Trade Decision: **NO TRADE**\n- Insufficient signals.\n`;
      }
    }
    fs.writeFileSync(path.join(summariesDir, `${date}.md`), summary, "utf8");

    // ── Journal (matches backtest_distill.cjs regexes) ────────────────
    const journal = `# Backtest Journal — ${PAIR} — ${date}

---
mode: backtest
type: batch
simulated_date: ${date}
pair: ${PAIR}
analysis_level: ${MODE === "signal" ? "lite" : MODE === "tick" ? "tick" : "full"}
---

## Simulated Trade Day
- Data source: MT5 (${SYMBOL}) ${ANALYZE_TFS.join("/")}${MODE === "tick" ? " + ticks" : ""}
- Analysis: ${MODE.toUpperCase()} mode${MODE === "tick" ? " (tick-level fills)" : ""}

## Decision
${setup ? (setup.bias !== "neutral" ? `Bias was ${setup.bias.toUpperCase()}. ${setup.swept > 0 ? "Sweep detected — trade signal active." : "No sweep — signal uncertain."}` : "Neutral bias — no trade.") : "No engine data — no analysis."}
${setup?.signal ? `SIGNAL ${setup.bias.toUpperCase()}: ${setup.swept} swept, ${setup.pdArray} PD arrays aligned.` : "NO SIGNAL"}

## Execution
${trade ? `Entry ${trade.entry} | SL ${trade.sl} | TP ${trade.tp} | ${trade.exit} ${trade.pnlR != null ? trade.pnlR.toFixed(2) + "R" : ""}` : "No execution."}

## Lessons
- Backtest data point (${MODE} mode). Review for patterns across multiple days.
- ${setup?.swept > 0 ? "Sweep WAS present — manipulation phase likely." : "No sweep — accumulation or distribution phase."}

---
*Backtest journal — for statistical use only.*
`;
    fs.writeFileSync(path.join(journalsDir, `${date}.md`), journal, "utf8");
    console.error(`  ${date}: bias ${setup?.bias || '?'} | swept ${setup?.swept ?? 0} | signal ${setup?.signal ? 'YES' : 'no'}${trade ? ` | ${trade.exit} ${trade.pnlR != null ? trade.pnlR.toFixed(2) + "R" : ""}` : ""}`);
  }

  fs.writeFileSync(path.join(tradesDir, "trades.json"), JSON.stringify(trades, null, 2), "utf8");

  // ── Performance summary ───────────────────────────────────────────────
  const signalDays = results.filter(r => r.setup?.signal);
  const closed = trades.filter(t => t.pnlR != null);
  const wins = closed.filter(t => t.pnlR > 0);
  const winRate = closed.length ? wins.length / closed.length : 0;
  const totalPnl = closed.reduce((s, t) => s + t.pnlUsd, 0);
  const rrAvg = closed.length ? closed.reduce((s, t) => s + t.rr, 0) / closed.length : 0;
  const expectancy = closed.length ? closed.reduce((s, t) => s + t.pnlR, 0) / closed.length : 0;

  const summaryMd = `# Batch Backtest Summary — ${PAIR}
## Period: ${START} → ${END} (${dates.length} days) | Mode: ${MODE.toUpperCase()}${MODE === "tick" ? " (tick-level)" : ""} | Source: MT5 ${SYMBOL}

## Signal Statistics
- **Days with signals**: ${signalDays.length}/${dates.length} (${((signalDays.length / dates.length) * 100).toFixed(1)}%)
- Bias distribution: Bearish ${results.filter(r => r.setup?.bias === "bearish").length} | Bullish ${results.filter(r => r.setup?.bias === "bullish").length} | Neutral ${results.filter(r => r.setup?.bias === "neutral").length}

## Trade Results (${MODE !== "signal" ? `${closed.length} closed / ${trades.length} total` : "signal mode — no execution"})
${MODE !== "signal" ? `- **Win rate**: ${(winRate * 100).toFixed(1)}% (${wins.length}/${closed.length})
- **Expectancy**: ${expectancy.toFixed(2)}R per trade
- **Avg R:R**: ${rrAvg.toFixed(2)}
- **Total PnL (risk $${RISK_USD}/trade)**: ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}

## Trades
${trades.map(t => `- ${t.date}: ${t.direction.toUpperCase()} ${t.entry} → ${t.exit} @ ${t.price} | ${t.pnlR != null ? t.pnlR.toFixed(2) + "R" : "OPEN"} | R:R ${t.rr.toFixed(2)}`).join("\n")}` : ""}

---
*Generated: ${new Date().toISOString()} | MT5 backtest | Feed into Playbook with: node tools/backtest_distill.cjs ${PAIR}*
`;
  fs.writeFileSync(path.join(batchDir, "performance_summary.md"), summaryMd, "utf8");

  // Master log
  const logFile = path.join(ROOT, "shared", "backtest", "meta", "backtest_log.md");
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const entry = `\n## ${PAIR} — ${START} to ${END} (MT5, ${MODE}${MODE === "tick" ? " tick-level" : ""})\n- **Date**: ${new Date().toISOString()}\n- **Days**: ${dates.length} | Signals: ${signalDays.length}${MODE !== "signal" ? ` | Closed: ${closed.length} | Win: ${(winRate * 100).toFixed(1)}% | Expectancy: ${expectancy.toFixed(2)}R` : ""}\n- **Output**: ${batchDir}\n`;
  fs.appendFileSync(logFile, entry, "utf8");

  bridge.close();
  console.log(JSON.stringify({
    pair: PAIR, symbol: SYMBOL,     mode: MODE,
    period: `${START} → ${END}`, days: dates.length,
    signals: signalDays.length,
    ...(MODE !== "signal" ? { closed: closed.length, wins: wins.length, winRate: +(winRate * 100).toFixed(1), expectancy: +expectancy.toFixed(2), totalPnlUsd: +totalPnl.toFixed(2) } : {}),
    output: batchDir,
  }, null, 2));
}

function parseLookbackMs(v) {
  const m = /^(\d+)([dh])$/.exec(String(v || "60d"));
  if (!m) return 60 * 24 * 3600 * 1000;
  return Number(m[1]) * (m[2] === "d" ? 24 : 1) * 3600 * 1000;
}

main().catch(e => { console.error("[backtest] crashed:", e); process.exit(1); });
