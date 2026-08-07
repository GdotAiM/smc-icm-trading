// Quick live price fetcher from TV CDP
const path = require("path");
const CDP = require(path.join(__dirname, "tv-mcp", "cdp_client.cjs"));

const PAIR = process.argv[2] || "XAUUSD";
const TV_SYMBOLS = {
  EURUSD: "OANDA:EURUSD",
  GBPUSD: "OANDA:GBPUSD",
  XAUUSD: "OANDA:XAUUSD",
  GOLD: "OANDA:XAUUSD",
  NAS100: "CAPITALCOM:NAS100",
};
const TV_SYM = TV_SYMBOLS[PAIR] || PAIR;

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log(JSON.stringify({ error: "NO_CHART" })); process.exit(1); }
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  await ev('window.TradingViewApi._activeChartWidgetWV.value().setSymbol("' + TV_SYM + '", {});');
  await sleep(3000);

  // Get 1m candle data for recent price action
  await ev('window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");');
  await sleep(1500);

  const raw = await ev('(function(){ try { var api=window.TradingViewApi._activeChartWidgetWV.value(); var bars=api._chartWidget.model().mainSeries().bars(); var end=bars.lastIndex(), start=Math.max(bars.firstIndex(), end-5); var c=[]; for(var i=start;i<=end;i++){ var v=bars.valueAt(i); if(v&&v.length>=6) c.push({t:new Date(v[0]*1000).toISOString(),o:v[1],h:v[2],l:v[3],c:v[4]}); } return JSON.stringify(c); } catch(e) { return JSON.stringify({error:e.message}); } })()');

  try {
    const candles = JSON.parse(raw);
    if (Array.isArray(candles) && candles.length > 0) {
      const last = candles[candles.length - 1];

      // Calculate ATR on 5m
      await ev('window.TradingViewApi._activeChartWidgetWV.value().setResolution("5");');
      await sleep(1500);
      const raw5 = await ev('(function(){ try { var api=window.TradingViewApi._activeChartWidgetWV.value(); var bars=api._chartWidget.model().mainSeries().bars(); var end=bars.lastIndex(), start=Math.max(bars.firstIndex(), end-14); var sum=0,c=0; for(var i=start;i<=end;i++){ var v=bars.valueAt(i); if(v&&v.length>=6){ sum+=v[2]-v[3]; c++; } } return JSON.stringify({atr: c>0?sum/c:0, n:c}); } catch(e) { return JSON.stringify({error:e.message}); } })()');

      let atr = 4; // default
      try { const d = JSON.parse(raw5); if (d.atr > 0) atr = d.atr; } catch {}

      console.log(JSON.stringify({
        pair: PAIR,
        price: last.c,
        time: last.t,
        atr5: Number(atr.toFixed(4)),
        candles: candles.length
      }));
    } else {
      console.log(JSON.stringify({ error: "NO_CANDLES", raw: String(raw).slice(0,100) }));
    }
  } catch(e) {
    console.log(JSON.stringify({ error: "PARSE", raw: String(raw).slice(0,100) }));
  }

  await client.close();
})().catch(e => { console.log(JSON.stringify({ error: e.message })); process.exit(1); });
