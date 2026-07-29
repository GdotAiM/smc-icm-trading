// Live Trade + Structure Monitor
// Polls TV CDP for real-time 1m candles and detects structural events
//
// Usage:
//   node tools/tv-mcp/trade_monitor.cjs --pair NAS100 --entry 27756 --sl 27820 --tp1 27455 --tp2 26771
//   node tools/tv-mcp/trade_monitor.cjs --pair NAS100  (watch only, no trade)
//
// Output: one JSON line per poll. Structural events emit "[EVENT]" lines.
// Pipe to a file and tail -f, or use Claude's Monitor tool.

const CDP = require("chrome-remote-interface");

const TV_SYMBOLS = { GBPUSD:"GBPUSD", EURUSD:"EURUSD", GOLD:"XAUUSD", XAUUSD:"XAUUSD", DXY:"USDOLLAR", NAS100:"NAS100" };

function parseArgs() {
  const args = {};
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].startsWith("--")) {
      const key = raw[i].slice(2);
      args[key] = raw[i+1] && !raw[i+1].startsWith("--") ? raw[++i] : "true";
    }
  }
  return args;
}

// ═══════════════ STRUCTURE DETECTION ═══════════════
// Lightweight swing-point + BOS/CHoCH detection on the last N bars

function detectStructure(bars) {
  if (bars.length < 6) return { events: [], swings: [] };

  // Find swing highs and lows (3-bar lookback)
  const swings = [];
  for (let i = 2; i < bars.length - 1; i++) {
    const prev2 = bars[i-2], prev1 = bars[i-1], curr = bars[i], next = bars[i+1];
    // Swing high: higher than both neighbors
    if (curr.high > prev1.high && curr.high > prev2.high && curr.high > next.high) {
      swings.push({ type: "HH", price: curr.high, time: curr.time, idx: i });
    }
    // Swing low: lower than both neighbors
    if (curr.low < prev1.low && curr.low < prev2.low && curr.low < next.low) {
      swings.push({ type: "LL", price: curr.low, time: curr.time, idx: i });
    }
  }

  // Detect BOS/CHoCH from last 2-3 swings
  const events = [];
  if (swings.length >= 2) {
    const recent = swings.slice(-4);
    const hhs = recent.filter(s => s.type === "HH");
    const lls = recent.filter(s => s.type === "LL");

    // Bullish CHoCH: new HH after a series of LLs
    if (hhs.length >= 1 && lls.length >= 1) {
      const lastLL = lls[lls.length - 1];
      const lastHH = hhs[hhs.length - 1];
      if (lastHH.idx > lastLL.idx) {
        events.push({
          type: "CHoCH",
          direction: "BULLISH",
          detail: `Higher high after lower low — structure shifting bullish`,
          from: lastLL.price,
          to: lastHH.price,
        });
      }
    }

    // Bearish CHoCH: new LL after HHs
    if (lls.length >= 1 && hhs.length >= 1) {
      const lastHH = hhs[hhs.length - 1];
      const lastLL = lls[lls.length - 1];
      if (lastLL.idx > lastHH.idx) {
        events.push({
          type: "CHoCH",
          direction: "BEARISH",
          detail: `Lower low after higher high — structure shifting bearish`,
          from: lastHH.price,
          to: lastLL.price,
        });
      }
    }

    // Bullish BOS: breaks above prior HH
    if (hhs.length >= 2) {
      const prev = hhs[hhs.length - 2];
      const curr = hhs[hhs.length - 1];
      if (curr.price > prev.price) {
        events.push({
          type: "BOS",
          direction: "BULLISH",
          detail: `Bullish BOS — broke above prior swing high ${prev.price}`,
          from: prev.price,
          to: curr.price,
        });
      }
    }

    // Bearish BOS: breaks below prior LL
    if (lls.length >= 2) {
      const prev = lls[lls.length - 2];
      const curr = lls[lls.length - 1];
      if (curr.price < prev.price) {
        events.push({
          type: "BOS",
          direction: "BEARISH",
          detail: `Bearish BOS — broke below prior swing low ${prev.price}`,
          from: prev.price,
          to: curr.price,
        });
      }
    }
  }

  return { events, swings: swings.slice(-5) };
}

// ═══════════════ MAIN ═══════════════

(async () => {
  const a = parseArgs();
  const PAIR = (a.pair || "NAS100").toUpperCase();
  const symbol = TV_SYMBOLS[PAIR] || PAIR;
  const entry = parseFloat(a.entry) || null;
  const sl = parseFloat(a.sl) || null;
  const tp1 = parseFloat(a.tp1) || null;
  const tp2 = parseFloat(a.tp2) || null;
  const interval = parseInt(a.interval) || 5; // poll interval in seconds

  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log(JSON.stringify({ error: "No chart" })); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  // Switch to pair and 1m
  await client.Runtime.evaluate({
    expression: `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${symbol}", {});
      window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");
      return "ok";
    })()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 4000));

  console.error(`[MONITOR] ${PAIR} | Entry: ${entry || 'N/A'} | SL: ${sl || 'N/A'} | Poll: ${interval}s`);
  console.error(`[MONITOR] Watching for CHoCH, BOS, MSS, SL/TP breaches\n`);

  let prevEvents = new Set(); // track what we've already reported

  // ── Poll loop ──
  const poll = async () => {
    try {
      const result = await client.Runtime.evaluate({
        expression: `(function() {
          try {
            var chart = window.TradingViewApi._activeChartWidgetWV.value();
            var model = chart._chartWidget.model();
            var bars = model.mainSeries().bars();
            var first = bars.firstIndex();
            var last = bars.lastIndex();
            var all = [];
            // Get last 50 bars for structure detection
            for (var i = Math.max(first, last - 50); i <= last; i++) {
              var bar = bars.valueAt(i);
              if (bar) all.push({ time: bar[0], open: bar[1], high: bar[2], low: bar[3], close: bar[4] });
            }
            return JSON.stringify({ bars: all, count: all.length, lastIdx: last });
          } catch(e) { return JSON.stringify({ error: e.message }); }
        })()`,
        returnByValue: true
      });

      const data = JSON.parse(result.result.value);
      if (data.error) { console.log(JSON.stringify({ error: data.error })); return; }

      const bars = data.bars;
      if (!bars.length) return;

      const lastBar = bars[bars.length - 1];
      const currentPrice = lastBar.close;
      const currentHigh = lastBar.high;
      const currentLow = lastBar.low;

      // ── Detect structure ──
      const { events, swings } = detectStructure(bars);

      // Check for new events
      const newEvents = events.filter(e => {
        const key = `${e.type}:${e.direction}:${e.to}`;
        if (prevEvents.has(key)) return false;
        prevEvents.add(key);
        return true;
      });

      for (const evt of newEvents) {
        const emoji = evt.direction === "BULLISH" ? "🟢" : "🔴";
        console.log(`\n[EVENT] ${emoji} ${evt.type} ${evt.direction} — ${evt.detail}`);
        if (evt.type === "CHoCH") {
          console.log(`[EVENT] ⚠️ STRUCTURE SHIFT — ${evt.direction === "BULLISH" ? "Consider tightening SL or closing shorts" : "Consider tightening SL or closing longs"}`);
        }
      }

      // ── Trade check ──
      if (entry && sl) {
        const isShort = sl > entry;
        const pnl = isShort ? (entry - currentPrice) : (currentPrice - entry);
        const pnlPct = ((pnl / Math.abs(entry - sl)) * 100).toFixed(1);
        const slDist = isShort ? (sl - currentPrice) : (currentPrice - sl);
        const slDistPct = ((slDist / Math.abs(entry - sl)) * 100).toFixed(1);

        let status = "ACTIVE";
        let alert = "";

        if (isShort && currentHigh >= sl) {
          status = "🛑 STOPPED";
          alert = `SL HIT at ${sl}! High was ${currentHigh}`;
        } else if (!isShort && currentLow <= sl) {
          status = "🛑 STOPPED";
          alert = `SL HIT at ${sl}! Low was ${currentLow}`;
        } else if (tp1 && isShort && currentLow <= tp1) {
          status = "✅ TP1 HIT";
          alert = `TP1 reached at ${tp1}! Low was ${currentLow}`;
        } else if (tp1 && !isShort && currentHigh >= tp1) {
          status = "✅ TP1 HIT";
          alert = `TP1 reached at ${tp1}! High was ${currentHigh}`;
        } else if (tp2 && isShort && currentLow <= tp2) {
          status = "✅ TP2 HIT";
          alert = `TP2 reached at ${tp2}!`;
        } else if (tp2 && !isShort && currentHigh >= tp2) {
          status = "✅ TP2 HIT";
          alert = `TP2 reached at ${tp2}!`;
        }

        const dir = isShort ? "SHORT" : "LONG";
        const pnlSign = pnl >= 0 ? "+" : "";

        // Detect structural invalidation: bullish CHoCH/BOS on a short trade
        const bullEvent = events.find(e => e.direction === "BULLISH" && (e.type === "CHoCH" || e.type === "BOS"));
        const bearEvent = events.find(e => e.direction === "BEARISH" && (e.type === "CHoCH" || e.type === "BOS"));
        const structWarning = (isShort && bullEvent) ? `⚠️ MICRO FLIPPED BULLISH: ${bullEvent.type}` :
                              (!isShort && bearEvent) ? `⚠️ MICRO FLIPPED BEARISH: ${bearEvent.type}` : "";

        const statusLine = {
          time: new Date().toISOString(),
          pair: PAIR,
          price: currentPrice,
          dir: dir,
          pnl: `${pnlSign}${pnl.toFixed(1)} pts (${pnlSign}${pnlPct}% of risk)`,
          sl: sl,
          slDist: `${slDist.toFixed(1)} pts (${slDistPct}% of risk)`,
          status: status,
          alert: alert,
          structWarning: structWarning,
          swings: swings.map(s => `${s.type} @ ${s.price}`),
          recentBars: bars.slice(-3).map(b => `${b.open}→${b.close} (H:${b.high} L:${b.low})`),
        };

        console.log(JSON.stringify(statusLine));

        if (alert) console.log(`\n[ALERT] ${alert}`);
        if (structWarning) console.log(`\n[WARNING] ${structWarning}`);

        return status; // return for the polling loop
      } else {
        // Watch-only mode
        console.log(JSON.stringify({
          time: new Date().toISOString(),
          pair: PAIR,
          price: currentPrice,
          swings: swings.map(s => `${s.type} @ ${s.price}`),
          events: events.map(e => `${e.type} ${e.direction}`),
        }));
      }
    } catch(e) {
      console.log(JSON.stringify({ error: e.message }));
    }
    return "ACTIVE";
  };

  // Initial poll
  let tradeStatus = await poll();

  // Continuous polling
  const timer = setInterval(async () => {
    tradeStatus = await poll();
    if (tradeStatus && tradeStatus.startsWith("🛑") || tradeStatus && tradeStatus.startsWith("✅")) {
      console.error(`\n[MONITOR] Trade ended: ${tradeStatus}. Exiting monitor.`);
      clearInterval(timer);
      await client.close();
      process.exit(0);
    }
  }, interval * 1000);

  // Keep alive
  process.on("SIGINT", async () => { clearInterval(timer); await client.close(); process.exit(0); });
})();
