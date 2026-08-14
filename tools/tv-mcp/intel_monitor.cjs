// Tier 1+2 Intel Monitor — structural events + sweeps + session models
// + forecast tracking + HTF divergence + AMD zone breach + profile validation
//
// Usage: node tools/tv-mcp/intel_monitor.cjs

const CDP = require("chrome-remote-interface");
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const { getNYDate } = require("../ny_time.cjs");
// Broker-prefixed TV symbols — plain names resolve to wrong instruments
const TV_SYMBOLS = {
  EURUSD: "OANDA:EURUSD",
  GBPUSD: "OANDA:GBPUSD",
  XAUUSD: "OANDA:XAUUSD",
  GOLD: "OANDA:XAUUSD",
  NAS100: "CAPITALCOM:NAS100",
  DXY: "FX:USDOLLAR",
  USDOLLAR: "FX:USDOLLAR"
};
const ALL_PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"];

// ═══════════════ SESSION CONFIG ═══════════════
const SESSIONS = {
  ASIA:       { start: 20, end: 2,  label: "Asia",         weight: 0.8 },
  LONDON_KZ:  { start: 2,  end: 5,  label: "London KZ",    weight: 1.3 },
  LONDON_SB:  { start: 3,  end: 4,  label: "London SB",    weight: 1.5, model: "Silver Bullet" },
  NY_AM_KZ:   { start: 8,  end: 11, label: "NY AM KZ",     weight: 1.3 },
  NY_AM_SB:   { start: 10, end: 11, label: "NY AM SB",     weight: 1.5, model: "Silver Bullet" },
  NY_LUNCH:   { start: 11, end: 13, label: "NY Lunch",     weight: 0.4 },
  NY_PM:      { start: 13, end: 16, label: "NY PM",        weight: 1.0 },
  NY_PM_SB:   { start: 14, end: 15, label: "NY PM SB",     weight: 1.2, model: "Silver Bullet" },
};

const MODEL_TRIGGERS = {
  "Turtle Soup":   { need: ["SWEEP", "CHoCH"], dir: "counter" },
  "Silver Bullet": { need: ["SB_WINDOW", "CHoCH"], dir: "with_session" },
  "OTE + Inst OB": { need: ["CHoCH", "BOS"], dir: "with_htf" },
  "Judas Swing":   { need: ["LONDON_OPEN", "CHoCH"], dir: "counter" },
  "Breaker Block": { need: ["SWEEP", "BOS"], dir: "with_htf" },
};

// ═══════════════ DATA LOADING ═══════════════

function loadEngineData(pairs) {
  const data = {};
  const DATE = getNYDate();
  for (const pair of pairs) {
    try {
      const r1d = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, pair, "engine_1d.json"), "utf8"));
      const r4h = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, pair, "engine_4h.json"), "utf8"));
      const r1h = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, pair, "engine_1h.json"), "utf8"));

      data[pair] = {
        htfBias: r1d.structure.bias,
        bias4h: r4h.structure.bias,
        bias1h: r1h.structure.bias,
        htfSwingHigh: r1d.structure.lastSwingHigh || 0,
        htfSwingLow: r1d.structure.lastSwingLow || 0,
        bsLevels: (r4h.liquidity || []).filter(p => p.type === "BSL").map(p => ({ price: p.price, touches: p.strength, swept: p.swept })),
        ssLevels: (r4h.liquidity || []).filter(p => p.type === "SSL").map(p => ({ price: p.price, touches: p.strength, swept: p.swept })),
        fvgLevels: [...(r1d.fvgs || []), ...(r4h.fvgs || []), ...(r1h.fvgs || [])].slice(0, 8),
        drawTarget: r4h.draw || null,
      };
    } catch(e) {
      data[pair] = { htfBias: "neutral", bias4h: "neutral", bias1h: "neutral", bsLevels: [], ssLevels: [], fvgLevels: [], drawTarget: null };
    }
  }
  return data;
}

function loadForecasts(pairs) {
  const data = {};
  const DATE = getNYDate();
  for (const pair of pairs) {
    try {
      const f5m = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, pair, "forecast_5m.json"), "utf8"));
      const f1m = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, pair, "forecast_1m.json"), "utf8"));
      data[pair] = {
        f5m: {
          direction: f5m.direction,
          current: f5m.current_price,
          target: f5m.median_path ? f5m.median_path[f5m.median_path.length - 1] : null,
          high: f5m.high_path ? f5m.high_path[f5m.high_path.length - 1] : null,
          low: f5m.low_path ? f5m.low_path[f5m.low_path.length - 1] : null,
        },
        f1m: {
          direction: f1m.direction,
          current: f1m.current_price,
          target: f1m.median_path ? f1m.median_path[f1m.median_path.length - 1] : null,
        },
        agree: f5m.direction === f1m.direction,
      };
    } catch(e) {
      data[pair] = null;
    }
  }
  return data;
}

function loadIPDA(pairs) {
  const data = {};
  for (const pair of pairs) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(ROOT, "stages", "00_macro_context", "output", `${pair.toLowerCase()}_ipda.md`), "utf8")
        .match(/```json\n([\s\S]*?)\n```/) || ["", "{}"]);
      // IPDA output is markdown — try loading from engine EQs as fallback
      data[pair] = { eq: null, amd: null, draw: null };
    } catch(e) {
      data[pair] = { eq: null, amd: null, draw: null };
    }
  }
  return data;
}

// ═══════════════ STRUCTURE DETECTION ═══════════════

function detectStructure(bars) {
  if (bars.length < 6) return { events: [], swings: [] };
  const swings = [];
  for (let i = 2; i < bars.length - 1; i++) {
    const p2 = bars[i-2], p1 = bars[i-1], c = bars[i], n = bars[i+1];
    if (c.high > p1.high && c.high > p2.high && c.high > n.high)
      swings.push({ type: "HH", price: c.high, time: c.time });
    if (c.low < p1.low && c.low < p2.low && c.low < n.low)
      swings.push({ type: "LL", price: c.low, time: c.time });
  }
  const events = [];
  if (swings.length >= 2) {
    const recent = swings.slice(-4);
    const hhs = recent.filter(s => s.type === "HH"), lls = recent.filter(s => s.type === "LL");
    if (hhs.length >= 1 && lls.length >= 1) {
      const ll = lls[lls.length - 1], hh = hhs[hhs.length - 1];
      if (hh.time > ll.time) events.push({ type: "CHoCH", dir: "BULLISH", from: ll.price, to: hh.price });
      if (ll.time > hh.time) events.push({ type: "CHoCH", dir: "BEARISH", from: hh.price, to: ll.price });
    }
    if (hhs.length >= 2 && hhs[hhs.length - 1].price > hhs[hhs.length - 2].price)
      events.push({ type: "BOS", dir: "BULLISH", from: hhs[hhs.length - 2].price, to: hhs[hhs.length - 1].price });
    if (lls.length >= 2 && lls[lls.length - 1].price < lls[lls.length - 2].price)
      events.push({ type: "BOS", dir: "BEARISH", from: lls[lls.length - 2].price, to: lls[lls.length - 1].price });
  }
  return { events, swings };
}

// ═══════════════ TIER 1 ═══════════════

function getNYHour() {
  const now = new Date();
  const nyStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  return new Date(nyStr).getHours() + new Date(nyStr).getMinutes() / 60;
}

function getActiveSessions(nyHour) {
  const active = [];
  for (const [name, s] of Object.entries(SESSIONS)) {
    if (nyHour >= s.start && nyHour < s.end) active.push({ name, ...s });
  }
  return active;
}

function detectSweeps(high, low, pairData) {
  const sweeps = [];
  for (const bsl of pairData.bsLevels) {
    if (low <= bsl.price && high >= bsl.price && !bsl.swept) sweeps.push({ type: "BSL", price: bsl.price, touches: bsl.touches, direction: "UPSIDE" });
  }
  for (const ssl of pairData.ssLevels) {
    if (low <= ssl.price && high >= ssl.price && !ssl.swept) sweeps.push({ type: "SSL", price: ssl.price, touches: ssl.touches, direction: "DOWNSIDE" });
  }
  return sweeps;
}

function scoreEntry(pair, events, sweeps, pairData, sessions) {
  let score = 0;
  const reasons = [];
  const htfBias = pairData.htfBias;

  if (htfBias !== "neutral") { score += 2; reasons.push(`HTF:${htfBias.toUpperCase()}`); }

  const lastEvent = events[events.length - 1];
  if (lastEvent) {
    const aligned = (htfBias === "bearish" && lastEvent.dir === "BEARISH") || (htfBias === "bullish" && lastEvent.dir === "BULLISH");
    if (aligned) { score += 2; reasons.push(`1m aligned (${lastEvent.type})`); }
    else if (lastEvent.type === "CHoCH") { score += 1; reasons.push("1m counter-CHoCH"); }
  }

  if (sweeps.length > 0) { score += 2; reasons.push(`${sweeps.length} sweep(s)`); }

  const inKZ = sessions.some(s => s.label.includes("KZ") || s.label.includes("SB"));
  if (inKZ) { score += 1; reasons.push("KZ active"); }

  for (const [model, trigger] of Object.entries(MODEL_TRIGGERS)) {
    const hasSweep = sweeps.length > 0, hasCHoCH = events.some(e => e.type === "CHoCH");
    const hasBOS = events.some(e => e.type === "BOS"), inSB = sessions.some(s => s.model === "Silver Bullet");
    const isLondonOpen = sessions.some(s => s.name === "LONDON_KZ");
    let match = true;
    for (const req of trigger.need) {
      if (req === "SWEEP" && !hasSweep) match = false;
      if (req === "CHoCH" && !hasCHoCH) match = false;
      if (req === "BOS" && !hasBOS) match = false;
      if (req === "SB_WINDOW" && !inSB) match = false;
      if (req === "LONDON_OPEN" && !isLondonOpen) match = false;
    }
    if (match) { reasons.push(`Model:${model}`); score += 2; break; }
  }

  return { score: Math.min(score, 10), reasons, verdict: score >= 7 ? "🔥" : score >= 4 ? "👀" : "⏳" };
}

// ═══════════════ TIER 2 ═══════════════

function checkForecast(pair, price, forecasts) {
  const fc = forecasts[pair];
  if (!fc || !fc.f5m) return null;

  const alerts = [];

  // 5m forecast tracking
  if (fc.f5m.target) {
    const f5mDist = fc.f5m.direction === "bearish" ? fc.f5m.current - fc.f5m.target : fc.f5m.target - fc.f5m.current;
    const priceDist = fc.f5m.direction === "bearish" ? fc.f5m.current - price : price - fc.f5m.current;
    const progress = f5mDist > 0 ? Math.min(100, Math.max(0, (priceDist / f5mDist) * 100)) : 0;

    if (progress >= 50 && progress < 55) {
      alerts.push(`🎯 5m forecast 50% complete — ${fc.f5m.direction} to ${fc.f5m.target} (${progress.toFixed(0)}%)`);
    }
    if (progress >= 90 && progress < 95) {
      alerts.push(`🎯 5m forecast 90% complete — approaching target ${fc.f5m.target}`);
    }
  }

  // Forecast agreement
  if (fc.agree && fc.f5m.target && fc.f1m.target) {
    const targetStr = fc.f5m.direction === "bearish" ? `↓${fc.f5m.target}` : `↑${fc.f5m.target}`;
    alerts.push(`📈 Forecasts ALIGNED ${fc.f5m.direction} ${targetStr} | Both TFs agree`);
  }

  return alerts.length > 0 ? alerts : null;
}

function checkHTFDivergence(pair, events, pairData) {
  const alerts = [];
  const htfBias = pairData.htfBias;
  const bias4h = pairData.bias4h;
  const bias1h = pairData.bias1h;

  const lastBull = events.filter(e => e.dir === "BULLISH").slice(-3);
  const lastBear = events.filter(e => e.dir === "BEARISH").slice(-3);

  // 1m flipping against 4H + 1H alignment
  if (htfBias === "bearish" && lastBull.length >= 2 && lastBull.some(e => e.type === "BOS")) {
    alerts.push(`⚠️ 1m BULLISH BOS vs BEARISH HTF (1D:${htfBias} 4H:${bias4h} 1H:${bias1h}) — potential pullback or reversal`);
  }
  if (htfBias === "bullish" && lastBear.length >= 2 && lastBear.some(e => e.type === "BOS")) {
    alerts.push(`⚠️ 1m BEARISH BOS vs BULLISH HTF (1D:${htfBias} 4H:${bias4h} 1H:${bias1h}) — potential pullback or reversal`);
  }

  // 4H/1H divergence from 1D
  if (htfBias === "bearish" && bias4h === "bullish") {
    alerts.push(`🔀 HTF DIVERGENCE: 1D BEARISH but 4H BULLISH — compression active`);
  }
  if (htfBias === "bullish" && bias4h === "bearish") {
    alerts.push(`🔀 HTF DIVERGENCE: 1D BULLISH but 4H BEARISH — compression active`);
  }

  return alerts.length > 0 ? alerts : null;
}

function checkProfileValidation(pair, events, pairData) {
  const htfBias = pairData.htfBias;
  if (htfBias === "neutral") return null;

  const recent = events.slice(-5);
  const alignedCount = recent.filter(e => e.dir.toLowerCase() === htfBias).length;
  const counterCount = recent.filter(e => e.dir.toLowerCase() !== htfBias).length;

  if (alignedCount >= 3 && counterCount === 0) {
    return [`✅ Profile CONFIRMING: ${htfBias.toUpperCase()} — ${alignedCount}/${recent.length} events aligned`];
  }
  if (counterCount >= 3 && alignedCount <= 1) {
    return [`❌ Profile INVALIDATING: expected ${htfBias.toUpperCase()} but got ${counterCount}/${recent.length} counter events`];
  }
  return null;
}

function checkDrawTargets(pair, price, pairData) {
  const alerts = [];
  const dt = pairData.drawTarget;
  if (!dt) return null;

  if (dt.side && dt.price) {
    const dist = dt.side === "DOWN" ? price - dt.price : dt.price - price;
    const distPct = price > 0 ? ((Math.abs(dist) / price) * 100).toFixed(2) : "0";
    if (Math.abs(dist) < (pair === "XAUUSD" ? 50 : pair === "NAS100" ? 200 : 0.0005)) {
      alerts.push(`🎯 Draw target NEAR: ${dt.side} @ ${dt.price} — ${dt.reason || ''}`);
    }
  }
  return alerts.length > 0 ? alerts : null;
}

// ═══════════════ CROSS-PAIR ═══════════════

function analyzeRegime(pairStates, recentMs = 60000) {
  const now = Date.now();
  const forexBull = [], forexBear = [];
  let goldDir = null, nasDir = null;

  for (const [pair, state] of Object.entries(pairStates)) {
    const recent = (state.events || []).filter(e => e.time > now - recentMs);
    const last = recent[recent.length - 1];
    if (!last) continue;
    if (pair === "EURUSD" || pair === "GBPUSD") {
      if (last.dir === "BULLISH") forexBull.push(pair); else forexBear.push(pair);
    }
    if (pair === "XAUUSD") goldDir = last.dir;
    if (pair === "NAS100") nasDir = last.dir;
  }

  const regimes = [];
  if (forexBear.length >= 2 && goldDir === "BEARISH") regimes.push("🌐 USD BID — forex↓ gold↓");
  else if (forexBear.length >= 2) regimes.push("🌐 USD STRENGTH — forex bearish");
  else if (forexBull.length >= 2) regimes.push("🌐 USD WEAKNESS — forex bullish");
  if (nasDir === "BEARISH" && forexBear.length >= 2) regimes.push("📉 RISK-OFF — equities+forex selling");
  if (forexBear.length >= 2 && goldDir === "BULLISH") regimes.push("⚠️ GOLD DIVERGENCE — hedging?");
  if (forexBull.length >= 2 && goldDir === "BEARISH") regimes.push("⚠️ UNUSUAL — forex up, gold down");

  return regimes;
}

// ═══════════════ MAIN ═══════════════

(async () => {
  const args = {};
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].startsWith("--")) {
      const key = raw[i].slice(2);
      args[key] = raw[i+1] && !raw[i+1].startsWith("--") ? raw[++i] : "true";
    }
  }
  const PAIRS = args.pairs ? args.pairs.split(",").map(p => p.trim().toUpperCase()) : ALL_PAIRS;

  // Load all data
  console.error("[INTEL] Loading engine data...");
  const engineData = loadEngineData(PAIRS);
  for (const [p, d] of Object.entries(engineData)) {
    console.error(`  ${p}: HTF ${d.htfBias.toUpperCase()} | 4H ${d.bias4h} | 1H ${d.bias1h} | BSL:${d.bsLevels.length} SSL:${d.ssLevels.length}`);
  }

  console.error("[INTEL] Loading forecasts...");
  const forecasts = loadForecasts(PAIRS);
  for (const [p, f] of Object.entries(forecasts)) {
    if (f) console.error(`  ${p}: 5m ${f.f5m.direction} → ${f.f5m.target} | 1m ${f.f1m.direction} → ${f.f1m.target} | ${f.agree ? 'ALIGNED' : 'DIVERGENT'}`);
  }

  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.error("No chart"); process.exit(1); }

  // WP-15: mutable client + reconnect logic for CDP resilience
  let client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  async function reconnectCDP() {
    try {
      if (client) { try { await client.close(); } catch {} }
      const resp = await fetch("http://127.0.0.1:9222/json/list");
      const targets = await resp.json();
      const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
      if (!chart) { console.error("[INTEL] CDP reconnect failed — no chart tab"); return false; }
      client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
      await client.Runtime.enable();
      console.error("[INTEL] ✅ CDP reconnected");
      return true;
    } catch(e) {
      console.error(`[INTEL] CDP reconnect failed: ${e.message}`);
      return false;
    }
  }

  // WP-15: periodic data refresh — engine data and forecasts reloaded every 5 min
  let dataRefreshCounter = 0;
  const DATA_REFRESH_INTERVAL = 150; // ~5 min at 2s/cycle
  function refreshEngineData() {
    try {
      console.error("[INTEL] Refreshing engine data...");
      const fresh = loadEngineData(PAIRS);
      for (const [p, d] of Object.entries(fresh)) {
        if (d) engineData[p] = d;
      }
      const freshForecasts = loadForecasts(PAIRS);
      for (const [p, f] of Object.entries(freshForecasts)) {
        if (f) forecasts[p] = f;
      }
      console.error("[INTEL] Engine data refreshed");
    } catch(e) {
      console.error(`[INTEL] Data refresh failed: ${e.message}`);
    }
  }

  const pairState = {};
  for (const p of PAIRS) {
    pairState[p] = {
      prevEventKeys: new Set(),
      events: [],
      lastPrice: null, lastHigh: null, lastLow: null,
      trendCount: { BULLISH: 0, BEARISH: 0 },
      sweepsReported: new Set(),
      forecastAlertsReported: new Set(),
      divergenceAlertsReported: new Set(),
      profileReported: false,
    };
  }

  let regimeCheckCount = 0;

  console.error(`\n[INTEL] Live — Tier 1+2 | ${PAIRS.join(", ")}\n`);

  const checkPair = async (pair) => {
    try {
      const symbol = TV_SYMBOLS[pair] || pair;
      const state = pairState[pair];
      const ed = engineData[pair];
      const fc = forecasts[pair];

      await client.Runtime.evaluate({
        expression: `(function() {
          window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${symbol}", {});
          window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");
          return "ok";
        })()`,
        returnByValue: true
      });
      await new Promise(r => setTimeout(r, 3000));

      const result = await client.Runtime.evaluate({
        expression: `(function() {
          var chart = window.TradingViewApi._activeChartWidgetWV.value();
          var bars = chart._chartWidget.model().mainSeries().bars();
          var first = bars.firstIndex(), last = bars.lastIndex();
          var all = [];
          for (var i = Math.max(first, last - 60); i <= last; i++) {
            var bar = bars.valueAt(i);
            if (bar) all.push({ time: bar[0], open: bar[1], high: bar[2], low: bar[3], close: bar[4] });
          }
          return JSON.stringify({ bars: all });
        })()`,
        returnByValue: true
      });

      const data = JSON.parse(result.result.value);
      if (!data.bars || !data.bars.length) return;

      const bars = data.bars;
      const lastBar = bars[bars.length - 1];
      const price = lastBar.close;
      const high = lastBar.high;
      const low = lastBar.low;
      const { events } = detectStructure(bars);

      state.lastPrice = price; state.lastHigh = high; state.lastLow = low;

      // New events
      const now = Date.now();
      const newEvents = events.filter(e => {
        const key = `${e.type}:${e.dir}:${e.to}`;
        if (state.prevEventKeys.has(key)) return false;
        state.prevEventKeys.add(key);
        return true;
      });

      const stamped = newEvents.map(e => ({ ...e, time: now, pair }));
      state.events.push(...stamped);
      if (state.events.length > 30) state.events = state.events.slice(-30);

      for (const e of newEvents) {
        state.trendCount[e.dir] = (state.trendCount[e.dir] || 0) + 1;
        if (e.dir === "BULLISH") state.trendCount.BEARISH = Math.max(0, (state.trendCount.BEARISH || 0) - 1);
        else state.trendCount.BULLISH = Math.max(0, (state.trendCount.BULLISH || 0) - 1);
      }

      // ── TIER 1: Sweeps ──
      const sweeps = detectSweeps(high, low, ed);
      const newSweeps = sweeps.filter(s => {
        const key = `${s.type}:${s.price}`;
        if (state.sweepsReported.has(key)) return false;
        state.sweepsReported.add(key);
        return true;
      });
      for (const sw of newSweeps) {
        console.log(`\n[${pair}] 🔵 SWEEP — ${sw.type} @ ${sw.price} (${sw.touches} touches)`);
      }

      // ── TIER 1: Sessions ──
      const nyHour = getNYHour();
      const sessions = getActiveSessions(nyHour);

      // ── TIER 2: Forecast tracking ──
      const fcAlerts = checkForecast(pair, price, forecasts);
      if (fcAlerts) {
        const newFc = fcAlerts.filter(a => {
          const key = a.slice(0, 30);
          if (state.forecastAlertsReported.has(key)) return false;
          state.forecastAlertsReported.add(key);
          return true;
        });
        for (const a of newFc) process.stderr.write(`[${pair}] ${a}\n`);
      }

      // ── TIER 2: HTF divergence ──
      const divAlerts = checkHTFDivergence(pair, [...state.events.slice(-8)], ed);
      if (divAlerts) {
        const newDiv = divAlerts.filter(a => {
          const key = a.slice(0, 40);
          if (state.divergenceAlertsReported.has(key)) return false;
          state.divergenceAlertsReported.add(key);
          return true;
        });
        for (const a of newDiv) console.log(`[${pair}] ${a}`);
      }

      // ── TIER 2: Profile validation (first time per pair) ──
      if (!state.profileReported && state.events.length >= 6) {
        const pvAlerts = checkProfileValidation(pair, [...state.events.slice(-6)], ed);
        if (pvAlerts) {
          for (const a of pvAlerts) process.stderr.write(`[${pair}] ${a}\n`);
          state.profileReported = true;
        }
      }

      // ── TIER 2: Draw targets ──
      const drawAlerts = checkDrawTargets(pair, price, ed);
      if (drawAlerts) {
        for (const a of drawAlerts) process.stderr.write(`[${pair}] ${a}\n`);
      }

      // ── Entry scoring ──
      const entryScore = scoreEntry(pair, [...state.events.slice(-8)], sweeps, ed, sessions);

      // ── Output structural events ──
      for (const evt of newEvents) {
        const emoji = evt.dir === "BULLISH" ? "🟢" : "🔴";
        const htfNote = ed.htfBias !== "neutral" && evt.dir.toLowerCase() !== ed.htfBias ? ` ⚡vs${ed.htfBias.toUpperCase()}` : "";
        const sbActive = sessions.some(s => s.model === "Silver Bullet");
        const sessionTag = sbActive ? " [SB]" : "";
        const foresight = fc ? ` | fcst:${fc.f5m.direction}` : "";

        console.log(`[${pair}] ${emoji} ${evt.type} ${evt.dir}${htfNote}${sessionTag} — ${evt.type === "CHoCH" ? `${evt.from}→${evt.to}` : `broke ${evt.from}`}${foresight}`);
      }

      if (entryScore.score >= 4 && newEvents.length > 0) {
        console.log(`  ↳ ${entryScore.score}/10 ${entryScore.verdict} | ${entryScore.reasons.join(" | ")}`);
        // Write high-score setups to bridge file for Discord alerts
        if (entryScore.score >= 7) {
          try {
            const bridgeDir = path.join(ROOT, "shared", "monitor");
            fs.mkdirSync(bridgeDir, { recursive: true });
            const setup = {
              time: new Date().toISOString(),
              pair, score: entryScore.score, verdict: entryScore.verdict,
              htfBias: ed.htfBias, reasons: entryScore.reasons,
              price: price,
              lastEvent: newEvents.length > 0 ? newEvents[newEvents.length - 1].type + " " + newEvents[newEvents.length - 1].dir : "",
            };
            fs.appendFileSync(path.join(bridgeDir, "setups.jsonl"), JSON.stringify(setup) + "\n");
          } catch(e) {}
        }
      }

      for (const dir of ["BEARISH", "BULLISH"]) {
        if (state.trendCount[dir] >= 3 && newEvents.some(e => e.dir === dir)) {
          console.log(`  ↳ 📊 ${dir} TREND (${state.trendCount[dir]} consecutive)`);
        }
      }

      // ── Cross-pair regime (every 8 checks to avoid spam) ──
      regimeCheckCount++;
      if (regimeCheckCount % 8 === 0) {
        const regimes = analyzeRegime(pairState);
        if (regimes.length > 0) {
          process.stderr.write(`[REGIME] ${regimes.join(" | ")}\n`);
        }
      }

      // Prune
      if (state.prevEventKeys.size > 20) state.prevEventKeys = new Set([...state.prevEventKeys].slice(-10));
      if (state.sweepsReported.size > 20) state.sweepsReported = new Set([...state.sweepsReported].slice(-10));
      if (state.forecastAlertsReported.size > 10) state.forecastAlertsReported = new Set([...state.forecastAlertsReported].slice(-5));
      if (state.divergenceAlertsReported.size > 10) state.divergenceAlertsReported = new Set([...state.divergenceAlertsReported].slice(-5));

    } catch(e) {
      process.stderr.write(`[${pair} ERR] ${e.message}\n`);
    }
  };

  // ═══ PROCESS LIFECYCLE — prevent silent death ═══
  process.on("uncaughtException", (err) => {
    console.error("[INTEL:FATAL]", err.message);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[INTEL:FATAL] Unhandled rejection:", reason?.message || reason);
  });
  process.on("SIGINT", async () => {
    console.error("[INTEL] SIGINT — closing CDP");
    try { await client.close(); } catch {}
    process.exit(0);
  });

  let idx = 0;
  let consecutiveErrors = 0;
  const cycle = async () => {
    try {
      await checkPair(PAIRS[idx % PAIRS.length]);
      consecutiveErrors = 0; // reset on success
    } catch(e) {
      console.error("[INTEL:CYCLE_ERR]", e.message);
      consecutiveErrors++;
      // WP-15: CDP reconnect after 3 consecutive failures
      if (consecutiveErrors >= 3) {
        console.error("[INTEL] 3 consecutive errors — attempting CDP reconnect...");
        const reconnected = await reconnectCDP();
        consecutiveErrors = reconnected ? 0 : consecutiveErrors;
      }
    }
    // WP-15: periodic data refresh
    dataRefreshCounter++;
    if (dataRefreshCounter >= DATA_REFRESH_INTERVAL) {
      await refreshEngineData();
      dataRefreshCounter = 0;
    }
    idx++;
    setTimeout(cycle, 2000);
  };
  await cycle();
})();
