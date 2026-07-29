// Silent Monitor — writes to file, zero chat tokens.
// Set TV native alerts for SL/TP. Structural events logged to disk.
// Query with: node tools/tv-mcp/trade_status.cjs
//
// Usage:
//   node tools/tv-mcp/silent_monitor.cjs --trade NAS100 --entry 27756 --sl 27820 --tp1 27455

const CDP = require("chrome-remote-interface");
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const STATUS_DIR = path.join(ROOT, "shared", "monitor");
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
      if (hh.time > ll.time) events.push({ type: "CHoCH", dir: "BULLISH", from: ll.price, to: hh.price, time: new Date().toISOString() });
      if (ll.time > hh.time) events.push({ type: "CHoCH", dir: "BEARISH", from: hh.price, to: ll.price, time: new Date().toISOString() });
    }
    if (hhs.length >= 2 && hhs[hhs.length - 1].price > hhs[hhs.length - 2].price)
      events.push({ type: "BOS", dir: "BULLISH", from: hhs[hhs.length - 2].price, to: hhs[hhs.length - 1].price, time: new Date().toISOString() });
    if (lls.length >= 2 && lls[lls.length - 1].price < lls[lls.length - 2].price)
      events.push({ type: "BOS", dir: "BEARISH", from: lls[lls.length - 2].price, to: lls[lls.length - 1].price, time: new Date().toISOString() });
  }
  return { events, swings };
}

(async () => {
  const a = parseArgs();
  const TRADE_PAIR = (a.trade || "NAS100").toUpperCase();
  const entry = parseFloat(a.entry) || null;
  const sl = parseFloat(a.sl) || null;
  const tp1 = parseFloat(a.tp1) || null;
  const SCAN_PAIRS = (a.scan || "EURUSD,GBPUSD,XAUUSD").split(",").map(p => p.trim().toUpperCase());
  const ALL_PAIRS = [TRADE_PAIR, ...SCAN_PAIRS.filter(p => p !== TRADE_PAIR)];

  fs.mkdirSync(STATUS_DIR, { recursive: true });

  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.error("No chart"); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  // ── Set TV native alerts for SL and TP ──
  if (entry && sl) {
    console.error(`Setting TV alerts: SL @ ${sl}, TP1 @ ${tp1 || 'N/A'}`);
    try {
      // SL alert
      await client.Runtime.evaluate({
        expression: `(function() {
          var sym = window._exposed_chartWidgetCollection.activeChartWidget._value
            ._paneWidgets._value[0]._legendWidget._mainSeriesViewModel._source.symbol();
          var payload = {
            conditions: [{ type: 'cross', frequency: 'on_first_fire',
              series: [{ type: 'barset' }, { type: 'value', value: ${sl} }], resolution: '1' }],
            symbol: '={"symbol":"' + sym + '"}', resolution: '1',
            message: '🛑 NAS100 SL HIT ${sl}',
            popup: true, mobile_push: true, auto_deactivate: true, active: true,
            expiration: new Date(Date.now() + 24*3600*1000).toISOString()
          };
          var x = new XMLHttpRequest();
          x.open('POST', 'https://pricealerts.tradingview.com/create_alert', false);
          x.withCredentials = true;
          x.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
          x.send(JSON.stringify({ payload }));
          return x.responseText;
        })()`,
        returnByValue: true
      });
    } catch(e) { console.error("SL alert failed:", e.message); }

    if (tp1) {
      try {
        await client.Runtime.evaluate({
          expression: `(function() {
            var sym = window._exposed_chartWidgetCollection.activeChartWidget._value
              ._paneWidgets._value[0]._legendWidget._mainSeriesViewModel._source.symbol();
            var payload = {
              conditions: [{ type: 'cross', frequency: 'on_first_fire',
                series: [{ type: 'barset' }, { type: 'value', value: ${tp1} }], resolution: '1' }],
              symbol: '={"symbol":"' + sym + '"}', resolution: '1',
              message: '✅ NAS100 TP1 HIT ${tp1}',
              popup: true, mobile_push: true, auto_deactivate: true, active: true,
              expiration: new Date(Date.now() + 24*3600*1000).toISOString()
            };
            var x = new XMLHttpRequest();
            x.open('POST', 'https://pricealerts.tradingview.com/create_alert', false);
            x.withCredentials = true;
            x.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
            x.send(JSON.stringify({ payload }));
            return x.responseText;
          })()`,
          returnByValue: true
        });
      } catch(e) { console.error("TP alert failed:", e.message); }
    }
    console.error("TV alerts set — SL/TP will fire in Desktop with sound+popup\n");
  }

  // ── State tracking ──
  const pairState = {};
  for (const p of ALL_PAIRS) {
    pairState[p] = { prevEventKeys: new Set(), lastPrice: null, events: [] };
  }

  // Build rotation: trade pair checked every cycle, scan pairs interleaved
  const ROTATION = [];
  for (const p of SCAN_PAIRS.filter(p => p !== TRADE_PAIR)) {
    ROTATION.push(TRADE_PAIR);
    ROTATION.push(p);
  }

  // Write initial status file
  const writeStatus = (pair, price, pnl, slDist, events) => {
    const statusFile = path.join(STATUS_DIR, `status.json`);
    const tradeFile = path.join(STATUS_DIR, `${TRADE_PAIR.toLowerCase()}_trade.json`);
    const eventsFile = path.join(STATUS_DIR, `events.jsonl`);

    // Overall status
    const status = {
      updated: new Date().toISOString(),
      pairs: {}
    };
    for (const p of ALL_PAIRS) {
      status.pairs[p] = {
        price: pairState[p].lastPrice,
        events: pairState[p].events.slice(-5)
      };
    }
    fs.writeFileSync(statusFile, JSON.stringify(status, null, 2));

    // Trade-specific
    if (entry && sl) {
      const tradeStatus = {
        pair: TRADE_PAIR,
        entry, sl, tp1,
        currentPrice: price,
        pnl: pnl,
        pnlPct: ((Math.abs(pnl) / Math.abs(entry - sl)) * 100).toFixed(1),
        slDist: slDist,
        slDistPct: ((slDist / Math.abs(entry - sl)) * 100).toFixed(1),
        updated: new Date().toISOString()
      };
      fs.writeFileSync(tradeFile, JSON.stringify(tradeStatus, null, 2));
    }

    // Append events
    if (events.length > 0) {
      fs.appendFileSync(eventsFile, events.map(e => JSON.stringify(e)).join("\n") + "\n");
    }
  };

  console.error(`[SILENT MONITOR] Writing to ${STATUS_DIR}/`);
  console.error(`[SILENT MONITOR] TV alerts set for SL/TP — will fire in Desktop\n`);

  let idx = 0;
  const cycle = async () => {
    const pair = ROTATION[idx % ROTATION.length];
    const isTrade = pair === TRADE_PAIR && entry && sl;
    const state = pairState[pair];
    const symbol = TV_SYMBOLS[pair] || pair;

    try {
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
      if (!data.bars || !data.bars.length) { idx++; setTimeout(cycle, 1500); return; }

      const bars = data.bars;
      const lastBar = bars[bars.length - 1];
      const price = lastBar.close;
      const high = lastBar.high;
      const low = lastBar.low;
      const { events } = detectStructure(bars);

      // Filter new events
      const newEvents = events.filter(e => {
        const key = `${e.type}:${e.dir}:${e.to}`;
        if (state.prevEventKeys.has(key)) return false;
        state.prevEventKeys.add(key);
        return true;
      });

      // Store events
      if (newEvents.length > 0) {
        const stampedEvents = newEvents.map(e => ({ ...e, pair }));
        state.events.push(...stampedEvents);
        if (state.events.length > 20) state.events = state.events.slice(-20);
        process.stderr.write(`[${pair}] ${newEvents.map(e => `${e.type} ${e.dir}`).join(", ")}\n`);
      }

      state.lastPrice = price;

      // Trade checks
      if (isTrade) {
        const pnl = entry - price;
        const slDist = sl - price;
        writeStatus(pair, price, pnl, slDist, newEvents);

        // SL breach → exit with code to notify
        if (high >= sl) {
          const msg = `🛑 SL HIT! ${sl} breached. Loss: ${(entry-sl).toFixed(0)} pts`;
          console.error(msg);
          console.log(msg); // stdout → triggers notification
          await client.close();
          process.exit(1);
        }
        if (tp1 && low <= tp1) {
          const msg = `✅ TP1 HIT! ${tp1} reached. Profit: +${(entry-tp1).toFixed(0)} pts`;
          console.error(msg);
          console.log(msg);
          await client.close();
          process.exit(0);
        }
      } else {
        writeStatus(pair, price, 0, 0, newEvents);
      }

      // Prune event keys
      if (state.prevEventKeys.size > 15) {
        const keys = [...state.prevEventKeys];
        state.prevEventKeys = new Set(keys.slice(-8));
      }

    } catch(e) {
      process.stderr.write(`[${pair} ERROR] ${e.message}\n`);
    }

    idx++;
    setTimeout(cycle, 1500);
  };

  await cycle();
  process.on("SIGINT", async () => { await client.close(); process.exit(0); });
})();
