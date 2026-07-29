// Lean Trade Monitor — structural events + SL/TP alerts only. No per-poll spam.
// Polls every 5s but ONLY outputs when something changes.
//
// Usage:
//   node tools/tv-mcp/trade_monitor_lean.cjs --pair NAS100 --entry 27756 --sl 27820 --tp1 27455

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

function detectStructure(bars) {
  if (bars.length < 6) return { events: [], swings: [] };
  const swings = [];
  for (let i = 2; i < bars.length - 1; i++) {
    const p2 = bars[i-2], p1 = bars[i-1], c = bars[i], n = bars[i+1];
    if (c.high > p1.high && c.high > p2.high && c.high > n.high)
      swings.push({ type: "HH", price: c.high, time: c.time, idx: i });
    if (c.low < p1.low && c.low < p2.low && c.low < n.low)
      swings.push({ type: "LL", price: c.low, time: c.time, idx: i });
  }

  const events = [];
  if (swings.length >= 2) {
    const recent = swings.slice(-4);
    const hhs = recent.filter(s => s.type === "HH");
    const lls = recent.filter(s => s.type === "LL");

    if (hhs.length >= 1 && lls.length >= 1) {
      const lastLL = lls[lls.length - 1], lastHH = hhs[hhs.length - 1];
      if (lastHH.idx > lastLL.idx)
        events.push({ type: "CHoCH", dir: "BULLISH", detail: `Higher high after lower low`, from: lastLL.price, to: lastHH.price });
      if (lastLL.idx > lastHH.idx)
        events.push({ type: "CHoCH", dir: "BEARISH", detail: `Lower low after higher high`, from: lastHH.price, to: lastLL.price });
    }
    if (hhs.length >= 2) {
      const prev = hhs[hhs.length - 2], curr = hhs[hhs.length - 1];
      if (curr.price > prev.price)
        events.push({ type: "BOS", dir: "BULLISH", detail: `Broke above prior HH ${prev.price}`, from: prev.price, to: curr.price });
    }
    if (lls.length >= 2) {
      const prev = lls[lls.length - 2], curr = lls[lls.length - 1];
      if (curr.price < prev.price)
        events.push({ type: "BOS", dir: "BEARISH", detail: `Broke below prior LL ${prev.price}`, from: prev.price, to: curr.price });
    }
  }
  return { events, swings: swings.slice(-3) };
}

(async () => {
  const a = parseArgs();
  const PAIR = (a.pair || "NAS100").toUpperCase();
  const symbol = TV_SYMBOLS[PAIR] || PAIR;
  const entry = parseFloat(a.entry) || null;
  const sl = parseFloat(a.sl) || null;
  const tp1 = parseFloat(a.tp1) || null;
  const tp2 = parseFloat(a.tp2) || null;

  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  await client.Runtime.evaluate({
    expression: `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${symbol}", {});
      window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");
      return "ok";
    })()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 4000));

  console.error(`[MONITOR] ${PAIR} SHORT | Entry ${entry} | SL ${sl} | TP1 ${tp1} | Events+Alerts only\n`);

  let prevEventKeys = new Set();
  let lastPnl = null;
  let lastPrice = null;
  let lastStructWarning = null;

  const poll = async () => {
    try {
      const result = await client.Runtime.evaluate({
        expression: `(function() {
          var chart = window.TradingViewApi._activeChartWidgetWV.value();
          var bars = chart._chartWidget.model().mainSeries().bars();
          var first = bars.firstIndex(), last = bars.lastIndex();
          var all = [];
          for (var i = Math.max(first, last - 50); i <= last; i++) {
            var bar = bars.valueAt(i);
            if (bar) all.push({ time: bar[0], open: bar[1], high: bar[2], low: bar[3], close: bar[4] });
          }
          return JSON.stringify({ bars: all });
        })()`,
        returnByValue: true
      });

      const data = JSON.parse(result.result.value);
      if (!data.bars || !data.bars.length) return "ACTIVE";
      const bars = data.bars;
      const lastBar = bars[bars.length - 1];
      const price = lastBar.close;
      const high = lastBar.high;
      const low = lastBar.low;

      const { events } = detectStructure(bars);
      const isShort = sl > entry;
      const pnl = isShort ? entry - price : price - entry;

      // ── Structural events (only emit NEW ones) ──
      const newEvents = events.filter(e => {
        const key = `${e.type}:${e.dir}:${e.to}`;
        if (prevEventKeys.has(key)) return false;
        prevEventKeys.add(key);
        return true;
      });

      for (const evt of newEvents) {
        const emoji = evt.dir === "BULLISH" ? "🟢" : "🔴";
        const flip = (isShort && evt.dir === "BULLISH") ? " ⚠️ AGAINST SHORT" : "";
        console.log(`\n[${evt.type}] ${emoji} ${evt.dir}${flip} — ${evt.detail}`);
        if (flip) console.log(`[WARNING] 1m flipped ${evt.dir} against your SHORT. SL: ${sl} (${(sl - price).toFixed(0)} pts away)`);
      }

      // ── SL/TP alerts ──
      if (isShort && high >= sl) {
        console.log(`\n🛑 [SL HIT] SL ${sl} breached! High was ${high}. P&L: ${(entry - sl).toFixed(0)} pts loss.`);
        return "STOPPED";
      }
      if (!isShort && low <= sl) {
        console.log(`\n🛑 [SL HIT] SL ${sl} breached! Low was ${low}. P&L: ${(sl - entry).toFixed(0)} pts loss.`);
        return "STOPPED";
      }
      if (tp1 && isShort && low <= tp1) {
        console.log(`\n✅ [TP1 HIT] ${tp1} reached! +${(entry - tp1).toFixed(0)} pts profit.`);
        return "TP1_HIT";
      }
      if (tp1 && !isShort && high >= tp1) {
        console.log(`\n✅ [TP1 HIT] ${tp1} reached! +${(tp1 - entry).toFixed(0)} pts profit.`);
        return "TP1_HIT";
      }
      if (tp2 && isShort && low <= tp2) {
        console.log(`\n✅ [TP2 HIT] ${tp2} reached! +${(entry - tp2).toFixed(0)} pts profit.`);
        return "TP2_HIT";
      }
      if (tp2 && !isShort && high >= tp2) {
        console.log(`\n✅ [TP2 HIT] ${tp2} reached! +${(tp2 - entry).toFixed(0)} pts profit.`);
        return "TP2_HIT";
      }

      // ── Summary line every 60s (12 polls) or on significant P&L change (>10 pts) ──
      const pnlChange = lastPnl !== null ? Math.abs(pnl - lastPnl) : 0;
      const priceChange = lastPrice !== null ? Math.abs(price - lastPrice) : 0;
      if (pnlChange >= 10 || !lastPnl || priceChange >= 10) {
        const sign = pnl >= 0 ? "+" : "";
        const pnlPct = ((Math.abs(pnl) / Math.abs(entry - sl)) * 100).toFixed(0);
        const slDist = (isShort ? sl - price : price - sl).toFixed(0);
        const slPct = ((slDist / Math.abs(entry - sl)) * 100).toFixed(0);

        // Structural warning if 1m flipped against the trade
        const bullFlip = events.find(e => e.dir === "BULLISH" && (e.type === "CHoCH" || e.type === "BOS"));
        const bearFlip = events.find(e => e.dir === "BEARISH" && (e.type === "CHoCH" || e.type === "BOS"));
        const structWarn = (isShort && bullFlip) ? ` ⚠️1m:BULLISH` : (!isShort && bearFlip) ? ` ⚠️1m:BEARISH` : "";

        process.stderr.write(`[${new Date().toLocaleTimeString()}] ${PAIR} ${price} | P&L: ${sign}${pnl.toFixed(0)}pts (${pnlPct}%) | SL: ${slDist}pts away (${slPct}%)${structWarn}\n`);
        lastPnl = pnl;
        lastPrice = price;
      }

      lastStructWarning = newEvents.filter(e => (isShort && e.dir === "BULLISH") || (!isShort && e.dir === "BEARISH")).length > 0;
      return "ACTIVE";
    } catch(e) {
      process.stderr.write(`[MONITOR ERROR] ${e.message}\n`);
      return "ACTIVE";
    }
  };

  // Initial poll
  let status = await poll();

  // Keep polling
  const timer = setInterval(async () => {
    status = await poll();
    if (status === "STOPPED" || status.startsWith("TP")) {
      console.error(`\n[MONITOR] Trade ended: ${status}`);
      clearInterval(timer);
      await client.close();
      process.exit(0);
    }
  }, 5000);

  process.on("SIGINT", async () => { clearInterval(timer); await client.close(); process.exit(0); });
})();
