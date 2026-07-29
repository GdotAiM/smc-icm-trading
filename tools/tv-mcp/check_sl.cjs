// SL Monitor — checks if stop loss was breached during a time window
// Usage: node tools/tv-mcp/check_sl.cjs --pair GOLD --sl 4036 --from "11:00" --to "13:53"
//        node tools/tv-mcp/check_sl.cjs --pair GOLD --trades '[{"entry":4043.90,"sl":4055.60,"id":"E1"},{"entry":4028.50,"sl":4036.00,"id":"E2"}]'

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

async function evalExpr(client, expr) {
  const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
  try { return JSON.parse(r.result.value); } catch { return r.result.value; }
}

(async () => {
  const a = parseArgs();
  const PAIR = (a.pair || "GOLD").toUpperCase();
  let trades = [];

  if (a.trades) {
    try { trades = JSON.parse(a.trades); } catch(e) {}
  } else if (a.sl) {
    trades = [{ id: "T1", entry: parseFloat(a.entry || "0"), sl: parseFloat(a.sl) }];
  } else {
    console.log(JSON.stringify({ error: "Provide --trades JSON or --sl + --entry" }));
    process.exit(1);
  }

  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log(JSON.stringify({ error: "No chart" })); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  const symbol = TV_SYMBOLS[PAIR] || PAIR;
  await evalExpr(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${symbol}", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 4000));

  // Get all 1m bars from the session
  const barsResult = await evalExpr(client, `
    (function() {
      try {
        var chart = window.TradingViewApi._activeChartWidgetWV.value();
        var model = chart._chartWidget.model();
        var bars = model.mainSeries().bars();
        var firstIdx = bars.firstIndex();
        var lastIdx = bars.lastIndex();
        var all = [];
        for (var i = Math.max(firstIdx, lastIdx - 300); i <= lastIdx; i++) {
          var bar = bars.valueAt(i);
          if (bar) all.push({ time: bar[0], open: bar[1], high: bar[2], low: bar[3], close: bar[4] });
        }
        return JSON.stringify(all);
      } catch(e) { return JSON.stringify({ error: e.message }); }
    })()
  `);

  const bars = barsResult.error ? [] : barsResult;

  const results = [];
  for (const trade of trades) {
    const sl = trade.sl;
    const isShort = sl > trade.entry;

    let hitBar = null;
    let hitTime = null;
    let maxAdverse = isShort ? -Infinity : Infinity;

    for (const bar of bars) {
      if (isShort && bar.high >= sl) {
        if (!hitBar) { hitBar = bar; hitTime = bar.time; }
      }
      if (!isShort && bar.low <= sl) {
        if (!hitBar) { hitBar = bar; hitTime = bar.time; }
      }
      if (isShort) maxAdverse = Math.max(maxAdverse, bar.high);
      else maxAdverse = Math.min(maxAdverse, bar.low);
    }

    const pctThroughSl = isShort
      ? ((maxAdverse - sl) / (sl - trade.entry) * 100).toFixed(1)
      : ((sl - maxAdverse) / (trade.entry - sl) * 100).toFixed(1);

    const result = {
      id: trade.id,
      entry: trade.entry,
      sl: sl,
      direction: isShort ? "SHORT" : "LONG",
      status: hitBar ? "STOPPED" : "ACTIVE",
      hitTime: hitTime ? new Date(hitTime * 1000).toISOString() : null,
      hitPrice: hitBar ? hitBar.high : null,
      maxAdverse: maxAdverse,
      breachPct: hitBar ? parseFloat(pctThroughSl) : 0,
    };

    if (hitBar) {
      // After SL hit, what happened next?
      const hitIdx = bars.indexOf(hitBar);
      const afterBars = bars.slice(hitIdx + 1);
      if (afterBars.length > 0) {
        const afterHi = Math.max(...afterBars.map(b => b.high));
        const afterLo = Math.min(...afterBars.map(b => b.low));
        const afterLast = afterBars[afterBars.length - 1].close;
        result.afterHit = {
          continuedTo: afterHi,
          droppedTo: afterLo,
          currentPrice: afterLast,
          wouldBePnl: isShort ? (trade.entry - afterLast) : (afterLast - trade.entry),
          verdict: isShort && afterLast < trade.entry ? "Direction was right — stopped by spike" :
                   !isShort && afterLast > trade.entry ? "Direction was right — stopped by spike" :
                   "Stopped out, move continued against"
        };
      }
    }

    results.push(result);
  }

  await client.close();
  console.log(JSON.stringify(results, null, 2));
})();
