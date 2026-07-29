// Scan all pairs for live tradeable setups
const CDP = require("./node_modules/chrome-remote-interface");

const PAIRS = [
  { name: "EURUSD", tv: "EURUSD" },
  { name: "GBPUSD", tv: "GBPUSD" },
  { name: "XAUUSD", tv: "XAUUSD" },
  { name: "NAS100", tv: "NAS100" },
  { name: "DXY",    tv: "USDOLLAR" },
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
    console.error("Scanning " + pair.name + "...");
    await ev('window.TradingViewApi._activeChartWidgetWV.value().setSymbol("' + pair.tv + '", {});');
    await sleep(3000);

    const resolved = await ev('window.TradingViewApi._activeChartWidgetWV.value().symbol();');

    // Get 15m, 5m, 1m data
    const data = {};
    for (const [tf, res] of [["15m", "15"], ["5m", "5"], ["1m", "1"]]) {
      await ev('window.TradingViewApi._activeChartWidgetWV.value().setResolution("' + res + '");');
      await sleep(1500);
      const candles = await ev('(function() { try { var api=window.TradingViewApi._activeChartWidgetWV.value(); var bars=api._chartWidget.model().mainSeries().bars(); var end=bars.lastIndex(),start=Math.max(bars.firstIndex(),end-25+1); var c=[]; for(var i=start;i<=end;i++){ var v=bars.valueAt(i); if(v&&v.length>=6) c.push({t:v[0]*1000,o:v[1],h:v[2],l:v[3],c:v[4]}); } return JSON.stringify({count:c.length,candles:c}); } catch(e) { return JSON.stringify({error:e.message}); } })()');
      data[tf] = candles;
    }

    // Analyze: find swing points, bias, ATR, trend
    const m5 = (data["5m"]?.candles || []);
    const m1 = (data["1m"]?.candles || []);
    const m15 = (data["15m"]?.candles || []);

    if (m5.length < 5) { results.push({ pair: pair.name, error: "no data" }); continue; }

    const current = m5[m5.length - 1].c;
    const m5First = m5[0].c;
    const trend5m = current < m5First ? "BEARISH" : "BULLISH";

    // ATR
    let atrSum = 0;
    for (let i = Math.max(0, m5.length - 10); i < m5.length; i++) { atrSum += m5[i].h - m5[i].l; }
    const atr = atrSum / Math.min(10, m5.length);

    // Find swing highs/lows on 5m
    let swingHighs = [], swingLows = [];
    for (let i = 2; i < m5.length - 2; i++) {
      if (m5[i].h > m5[i-1].h && m5[i].h > m5[i-2].h && m5[i].h > m5[i+1].h && m5[i].h > m5[i+2].h) swingHighs.push(m5[i].h);
      if (m5[i].l < m5[i-1].l && m5[i].l < m5[i-2].l && m5[i].l < m5[i+1].l && m5[i].l < m5[i+2].l) swingLows.push(m5[i].l);
    }

    const nearestSH = swingHighs.filter(h => h > current).sort((a,b) => a-b)[0] || null;
    const nearestSL = swingLows.filter(l => l < current).sort((a,b) => b-a)[0] || null;

    // For SHORT: SL above nearest swing high + 1.5 ATR
    const shortSL = nearestSH ? (nearestSH + atr * 1.5) : (current + atr * 3);
    const shortTP = nearestSL || (current - atr * 2);

    // For LONG: SL below nearest swing low - 1.5 ATR
    const longSL = nearestSL ? (nearestSL - atr * 1.5) : (current - atr * 3);
    const longTP = nearestSH || (current + atr * 2);

    // LTF alignment
    const m15trend = m15.length > 0 ? (m15[m15.length-1].c < m15[0].c ? "BEARISH" : "BULLISH") : "?";
    const m1trend = m1.length > 0 ? (m1[m1.length-1].c < m1[0].c ? "BEARISH" : "BULLISH") : "?";

    // Check for recent momentum (last 3 candles)
    const last3 = m5.slice(-3);
    const momentum = last3[2].c < last3[0].c ? "BEARISH" : "BULLISH";
    const strongMove = Math.abs(last3[2].c - last3[0].c) > atr * 1.5;

    // Score the setup
    let score = 0;
    if (trend5m === "BEARISH" && m15trend === "BEARISH") score += 3; // HTF alignment
    if (momentum === "BEARISH") score += 2; // Momentum
    if (strongMove) score += 2; // Strong move
    if (nearestSH && (nearestSH - current) < atr * 3) score += 1; // Nearby SL reference
    if (nearestSL) score += 1; // Clear target

    const direction = score >= 5 ? "SHORT" : "LONG";

    results.push({
      pair: pair.name,
      symbol: resolved,
      price: Number(current.toFixed(pair.name === "XAUUSD" ? 2 : 5)),
      trend15m: m15trend,
      trend5m: trend5m,
      trend1m: m1trend,
      momentum: momentum,
      strongMove: strongMove,
      atr5m: Number(atr.toFixed(pair.name === "XAUUSD" ? 2 : 5)),
      nearestSwingHigh: nearestSH ? Number(nearestSH.toFixed(pair.name === "XAUUSD" ? 2 : 5)) : null,
      nearestSwingLow: nearestSL ? Number(nearestSL.toFixed(pair.name === "XAUUSD" ? 2 : 5)) : null,
      direction: direction,
      score: score,
      suggestedSL: Number((direction === "SHORT" ? shortSL : longSL).toFixed(pair.name === "XAUUSD" ? 2 : 5)),
      suggestedTP: Number((direction === "SHORT" ? shortTP : longTP).toFixed(pair.name === "XAUUSD" ? 2 : 5)),
      slDistance: Number((direction === "SHORT" ? shortSL - current : current - longSL).toFixed(pair.name === "XAUUSD" ? 2 : 5)),
      tpDistance: Number((direction === "SHORT" ? current - shortTP : longTP - current).toFixed(pair.name === "XAUUSD" ? 2 : 5)),
    });
  }

  // Sort by score
  results.sort((a, b) => b.score - a.score);

  await client.close();
  console.log(JSON.stringify(results, null, 2));
})().catch(e => { console.log(JSON.stringify({error: e.message})); process.exit(1); });
