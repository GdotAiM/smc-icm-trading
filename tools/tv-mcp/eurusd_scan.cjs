// Quick EURUSD live data + analysis
const CDP = require("./cdp_client.cjs");

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  async function ev(e) { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); try { return JSON.parse(res.result.value); } catch { return res.result.value; } }

  // Switch to EURUSD, 1m
  await ev('window.TradingViewApi._activeChartWidgetWV.value().setSymbol("EURUSD", {});');
  await new Promise(r => setTimeout(r, 3000));
  await ev('window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");');
  await new Promise(r => setTimeout(r, 2000));

  // Get live 1m
  const m1 = await ev(`(function() { try { var api=window.TradingViewApi._activeChartWidgetWV.value(); var bars=api._chartWidget.model().mainSeries().bars(); var end=bars.lastIndex(),start=Math.max(bars.firstIndex(),end-20+1); var candles=[]; for(var i=start;i<=end;i++){ var v=bars.valueAt(i); if(v&&v.length>=6) candles.push({t:v[0]*1000,o:v[1],h:v[2],l:v[3],c:v[4]}); } return JSON.stringify({count:candles.length,candles:candles,last:candles[candles.length-1]}); } catch(e) { return JSON.stringify({error:e.message}); } })()`);

  // 5m
  await ev('window.TradingViewApi._activeChartWidgetWV.value().setResolution("5");');
  await new Promise(r => setTimeout(r, 2000));
  const m5 = await ev(`(function() { try { var api=window.TradingViewApi._activeChartWidgetWV.value(); var bars=api._chartWidget.model().mainSeries().bars(); var end=bars.lastIndex(),start=Math.max(bars.firstIndex(),end-12+1); var candles=[]; for(var i=start;i<=end;i++){ var v=bars.valueAt(i); if(v&&v.length>=6) candles.push({t:v[0]*1000,o:v[1],h:v[2],l:v[3],c:v[4]}); } return JSON.stringify({count:candles.length,candles:candles}); } catch(e) { return JSON.stringify({error:e.message}); } })()`);

  await client.close();

  if (!m1.candles || m1.candles.length === 0) { console.log(JSON.stringify({error:"no data"})); process.exit(1); }

  const last = m1.candles[m1.candles.length-1];
  let h1 = -999, l1 = 999;
  for (const c of m1.candles) { if (c.h > h1) h1 = c.h; if (c.l < l1) l1 = c.l; }

  const last5 = m5.candles[m5.candles.length-1];
  const trend = last5.c < m5.candles[0].c ? "BEARISH" : "BULLISH";

  // Suggest levels based on ATR
  const atr = ((h1 - l1) * 3).toFixed(5);

  console.log(JSON.stringify({
    pair: "EURUSD",
    time: new Date().toISOString(),
    price: last.c,
    high1m: h1,
    low1m: l1,
    range1m: (h1-l1).toFixed(5),
    trend5m: trend,
    last5candles: m5.candles.slice(-4).map(c => `o:${c.o} c:${c.c}`),
    // Suggest SL above recent high, TP below recent low
    suggestedSL: (last.c + parseFloat(atr)).toFixed(5),
    suggestedTP: (last.c - parseFloat(atr) * 1.5).toFixed(5),
    liveCandles: m1.candles.slice(-6)
  }, null, 2));
})().catch(e => { console.log(JSON.stringify({error: e.message})); process.exit(1); });
