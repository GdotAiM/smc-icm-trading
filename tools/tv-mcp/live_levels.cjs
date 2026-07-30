// Get live prices + calculate SL/TP for all pairs
const CDP = require("./cdp_client.cjs");

const PAIRS = [
  { name: "EURUSD", tv: "EURUSD", type: "forex", slPips: 8, tpPips: 15, qty: 10000 },
  { name: "GBPUSD", tv: "GBPUSD", type: "forex", slPips: 10, tpPips: 20, qty: 5000 },
  { name: "XAUUSD", tv: "XAUUSD", type: "metal", slPts: 15, tpPts: 25, qty: 100 },
  { name: "NAS100", tv: "NAS100", type: "index", slPts: 150, tpPts: 400, qty: 1 },
];

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); try { return JSON.parse(res.result.value); } catch { return res.result.value; } };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const results = [];

  for (const pair of PAIRS) {
    process.stderr.write(pair.name + "... ");
    await ev('window.TradingViewApi._activeChartWidgetWV.value().setSymbol("' + pair.tv + '", {});');
    await sleep(3000);
    await ev('window.TradingViewApi._activeChartWidgetWV.value().setResolution("5");');
    await sleep(1500);

    const raw = await ev('(function() { try { var api=window.TradingViewApi._activeChartWidgetWV.value(); var bars=api._chartWidget.model().mainSeries().bars(); var end=bars.lastIndex(),start=Math.max(bars.firstIndex(),end-15+1); var c=[]; for(var i=start;i<=end;i++){ var v=bars.valueAt(i); if(v&&v.length>=6) c.push({o:v[1],h:v[2],l:v[3],c:v[4]}); } return JSON.stringify(c); } catch(e) { return JSON.stringify({error:e.message}); } })()');

    let candles = [];
    try { candles = JSON.parse(raw); } catch(e) { candles = raw; }
    if (!Array.isArray(candles) || candles.length < 3) {
      results.push({ pair: pair.name, error: "no data" });
      continue;
    }

    // ═══ FRESHNESS CHECK — reject stale data ═══
    const lastCandle = candles[candles.length - 1];
    const candleAgeMs = Date.now() - lastCandle.t;
    const candleAgeMin = Math.round(candleAgeMs / 60000);
    const STALE_THRESHOLD_MIN = 5;

    if (candleAgeMin > STALE_THRESHOLD_MIN) {
      results.push({
        pair: pair.name,
        error: "stale_data",
        price: lastCandle.c,
        candleAgeMinutes: candleAgeMin,
        warning: "Last candle is " + candleAgeMin + " min old — data may not reflect current market. Re-run session_start.cjs to refresh."
      });
      continue;
    }

    const current = candles[candles.length - 1].c;
    let atr = 0;
    for (let i = Math.max(0, candles.length - 10); i < candles.length; i++) {
      atr += candles[i].h - candles[i].l;
    }
    atr = atr / Math.min(10, candles.length);

    const firstPrice = candles[Math.max(0, candles.length - 6)].c;
    const trend = current < firstPrice ? "BEARISH" : "BULLISH";
    const side = trend === "BEARISH" ? "SELL" : "BUY";

    const decimals = pair.type === "forex" ? 5 : (pair.type === "metal" ? 2 : 1);
    const pipSize = pair.type === "forex" ? 0.0001 : 1;
    const slAmt = pair.slPips || pair.slPts;
    const tpAmt = pair.tpPips || pair.tpPts;

    let sl, tp;
    if (side === "SELL") {
      sl = (current + slAmt * pipSize).toFixed(decimals);
      tp = (current - tpAmt * pipSize).toFixed(decimals);
    } else {
      sl = (current - slAmt * pipSize).toFixed(decimals);
      tp = (current + tpAmt * pipSize).toFixed(decimals);
    }

    results.push({
      pair: pair.name,
      qty: pair.qty,
      price: Number(current.toFixed(decimals)),
      trend, side,
      atr: Number(atr.toFixed(decimals)),
      sl, tp
    });
  }

  await client.close();
  console.log(JSON.stringify(results, null, 2));
})().catch(e => { console.log(JSON.stringify({error: e.message})); process.exit(1); });
