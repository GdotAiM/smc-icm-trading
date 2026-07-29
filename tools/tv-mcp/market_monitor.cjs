// Combined Monitor — active trade (NAS100) + market scan (all pairs)
// NAS100 checked every cycle (~14s). Other pairs rotate between NAS100 checks.
// Outputs structural events only. SL/TP alerts for traded pair.
//
// Usage:
//   node tools/tv-mcp/market_monitor.cjs --trade NAS100 --entry 27756 --sl 27820 --tp1 27455

const CDP = require("chrome-remote-interface");

const TV_SYMBOLS = { DXY: "USDOLLAR" };

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
      if (hh.time > ll.time) events.push({ type: "CHoCH", dir: "BULLISH", detail: `HH after LL`, from: ll.price, to: hh.price });
      if (ll.time > hh.time) events.push({ type: "CHoCH", dir: "BEARISH", detail: `LL after HH`, from: hh.price, to: ll.price });
    }
    if (hhs.length >= 2 && hhs[hhs.length - 1].price > hhs[hhs.length - 2].price)
      events.push({ type: "BOS", dir: "BULLISH", detail: `Broke above prior HH`, from: hhs[hhs.length - 2].price, to: hhs[hhs.length - 1].price });
    if (lls.length >= 2 && lls[lls.length - 1].price < lls[lls.length - 2].price)
      events.push({ type: "BOS", dir: "BEARISH", detail: `Broke below prior LL`, from: lls[lls.length - 2].price, to: lls[lls.length - 1].price });
  }
  return { events, swings };
}

(async () => {
  const a = parseArgs();
  const TRADE_PAIR = (a.trade || "NAS100").toUpperCase();
  const entry = parseFloat(a.entry) || null;
  const sl = parseFloat(a.sl) || null;
  const tp1 = parseFloat(a.tp1) || null;

  // Scan rotation: trade pair checked every cycle, others interleaved
  const SCAN_PAIRS = ["EURUSD", "GBPUSD", "XAUUSD"];
  const ROTATION = [];
  for (const p of SCAN_PAIRS) { ROTATION.push(TRADE_PAIR); ROTATION.push(p); }
  // Pattern: NAS100 → EURUSD → NAS100 → GBPUSD → NAS100 → XAUUSD → repeat

  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  const pairState = {};
  for (const p of [...SCAN_PAIRS, TRADE_PAIR]) {
    pairState[p] = { prevEventKeys: new Set(), lastPrice: null };
  }

  const activeMsg = entry ? ` | 🔻 ${TRADE_PAIR} SHORT @ ${entry} SL ${sl} TP1 ${tp1}` : "";
  console.error(`[MONITOR] ${TRADE_PAIR} active trade + ${SCAN_PAIRS.join(", ")} scan${activeMsg}`);
  console.error(`[MONITOR] Cycle: ${ROTATION.join(" → ")} → repeat (~14s per check)\n`);

  const checkPair = async (pair) => {
    try {
      const symbol = TV_SYMBOLS[pair] || pair;
      const state = pairState[pair];
      const isTrade = pair === TRADE_PAIR && entry && sl;

      await client.Runtime.evaluate({
        expression: `(function() {
          window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${symbol}", {});
          window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");
          return "ok";
        })()`,
        returnByValue: true
      });
      await new Promise(r => setTimeout(r, 3500));

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

      // ── Structural events ──
      const newEvents = events.filter(e => {
        const key = `${e.type}:${e.dir}:${e.to}`;
        if (state.prevEventKeys.has(key)) return false;
        state.prevEventKeys.add(key);
        return true;
      });

      for (const evt of newEvents) {
        const emoji = evt.dir === "BULLISH" ? "🟢" : "🔴";
        const against = (isTrade && sl > entry && evt.dir === "BULLISH") ? " ⚠️ AGAINST SHORT" : "";
        console.log(`\n[${pair}] ${emoji} ${evt.type} ${evt.dir}${against} — ${evt.detail}`);
      }

      // ── Trade checks (NAS100 only) ──
      if (isTrade) {
        const pnl = entry - price; // SHORT
        const slDist = sl - price;
        const pnlPct = ((Math.abs(pnl) / Math.abs(entry - sl)) * 100).toFixed(0);

        if (high >= sl) {
          console.log(`\n🛑 [${pair}] SL HIT! ${sl} breached. High: ${high}. Loss: ${(entry - sl).toFixed(0)} pts.`);
          return "STOPPED";
        }
        if (tp1 && low <= tp1) {
          console.log(`\n✅ [${pair}] TP1 HIT! ${tp1} reached. Profit: +${(entry - tp1).toFixed(0)} pts.`);
          return "TP1";
        }

        // Price summary (stderr — not in chat context)
        const sign = pnl >= 0 ? "+" : "";
        const dir = price > (state.lastPrice || price) ? "↑" : price < (state.lastPrice || price) ? "↓" : "→";
        process.stderr.write(`[${pair}] ${price} ${dir} | ${sign}${pnl.toFixed(0)}pts (${pnlPct}%) | SL: ${slDist.toFixed(0)}pts\n`);
      } else {
        const prev = state.lastPrice;
        if (prev) {
          const change = price - prev;
          const dir = change > 0 ? "↑" : change < 0 ? "↓" : "→";
          process.stderr.write(`[${pair}] ${price} ${dir}${Math.abs(change).toFixed(1)}\n`);
        }
      }

      state.lastPrice = price;
      if (state.prevEventKeys.size > 15) {
        const keys = [...state.prevEventKeys];
        state.prevEventKeys = new Set(keys.slice(-8));
      }

      return "OK";
    } catch(e) {
      process.stderr.write(`[${pair} ERROR] ${e.message}\n`);
      return "OK";
    }
  };

  let idx = 0;
  const cycle = async () => {
    const pair = ROTATION[idx % ROTATION.length];
    const result = await checkPair(pair);
    idx++;
    if (result === "STOPPED" || result === "TP1") {
      console.error(`\n[MONITOR] Trade ended: ${result}. Monitor stopping.`);
      await client.close();
      process.exit(0);
    }
    setTimeout(cycle, 1500);
  };

  await cycle();
  process.on("SIGINT", async () => { await client.close(); process.exit(0); });
})();
