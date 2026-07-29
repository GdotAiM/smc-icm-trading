// Fetch live structure for a pair and calculate proper SL levels
// Usage: node modify_sl.cjs PAIR
const CDP = require("./node_modules/chrome-remote-interface");

const PAIR = process.argv[2] || "EURUSD";
const TV_SYMBOLS = { DXY: "USDOLLAR" };
const TV_SYM = TV_SYMBOLS[PAIR] || PAIR;

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); try { return JSON.parse(res.result.value); } catch { return res.result.value; } };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Switch symbol, get 15m + 5m + 1m structure
  await ev('window.TradingViewApi._activeChartWidgetWV.value().setSymbol("' + TV_SYM + '", {});');
  await sleep(3000);

  const results = { pair: PAIR, time: new Date().toISOString() };

  for (const [tf, res] of [["15m", "15"], ["5m", "5"], ["1m", "1"]]) {
    await ev('window.TradingViewApi._activeChartWidgetWV.value().setResolution("' + res + '");');
    await sleep(2000);

    const data = await ev(`(function() { try { var api=window.TradingViewApi._activeChartWidgetWV.value(); var bars=api._chartWidget.model().mainSeries().bars(); var end=bars.lastIndex(),start=Math.max(bars.firstIndex(),end-20+1); var candles=[]; for(var i=start;i<=end;i++){ var v=bars.valueAt(i); if(v&&v.length>=6) candles.push({t:v[0]*1000,o:v[1],h:v[2],l:v[3],c:v[4]}); } return JSON.stringify({count:candles.length,candles:candles}); } catch(e) { return JSON.stringify({error:e.message}); } })()`);
    results[tf] = data;
  }

  await client.close();

  // Analyze structure for each TF
  for (const tf of ["15m", "5m", "1m"]) {
    const candles = results[tf]?.candles || [];
    if (candles.length < 3) continue;

    // Find swing highs and lows
    let swingHighs = [], swingLows = [];
    for (let i = 2; i < candles.length - 2; i++) {
      const c = candles[i];
      const prev1 = candles[i-1], prev2 = candles[i-2];
      const next1 = candles[i+1], next2 = candles[i+2];
      // Swing high: higher than 2 before and 2 after
      if (c.h > prev1.h && c.h > prev2.h && c.h > next1.h && c.h > next2.h) {
        swingHighs.push({ price: c.h, time: new Date(c.t).toISOString() });
      }
      // Swing low: lower than 2 before and 2 after
      if (c.l < prev1.l && c.l < prev2.l && c.l < next1.l && c.l < next2.l) {
        swingLows.push({ price: c.l, time: new Date(c.t).toISOString() });
      }
    }

    results[tf + "_swingHighs"] = swingHighs.slice(-3);
    results[tf + "_swingLows"] = swingLows.slice(-3);
  }

  // Get current price
  const last1m = results["1m"]?.candles;
  const currentPrice = last1m ? last1m[last1m.length-1].c : null;
  results.currentPrice = currentPrice;

  // Calculate ATR for proper SL buffer
  const m5Candles = results["5m"]?.candles || [];
  let atr5 = 0;
  if (m5Candles.length > 5) {
    let sum = 0;
    for (let i = m5Candles.length - 5; i < m5Candles.length; i++) {
      sum += m5Candles[i].h - m5Candles[i].l;
    }
    atr5 = sum / 5;
  }

  // Find nearest swing high above current price (for SHORT SL)
  let nearestSwingHigh = null;
  for (const tf of ["5m", "15m"]) {
    const sh = results[tf + "_swingHighs"] || [];
    for (const h of sh.reverse()) {
      if (h.price > currentPrice && (!nearestSwingHigh || h.price < nearestSwingHigh.price)) {
        nearestSwingHigh = { ...h, tf: tf };
      }
    }
  }

  // Proper SL = nearest swing high + 1 ATR buffer
  const atrBuffer = atr5 * 1.5;
  const properSL = nearestSwingHigh
    ? (nearestSwingHigh.price + atrBuffer).toFixed(5)
    : (currentPrice + atr5 * 3).toFixed(5);

  // Proper TP = look for nearest swing low below
  let nearestSwingLow = null;
  for (const tf of ["5m", "15m"]) {
    const sl = results[tf + "_swingLows"] || [];
    for (const l of sl.reverse()) {
      if (l.price < currentPrice && (!nearestSwingLow || l.price > nearestSwingLow.price)) {
        nearestSwingLow = { ...l, tf: tf };
      }
    }
  }

  results.atr5m = atr5.toFixed(5);
  results.atrBuffer = atrBuffer.toFixed(5);
  results.nearestSwingHigh = nearestSwingHigh;
  results.nearestSwingLow = nearestSwingLow;
  results.properSL = parseFloat(properSL);
  results.slPipsFromEntry = ((parseFloat(properSL) - currentPrice) * (PAIR.includes("XAU") ? 1 : 10000)).toFixed(1);

  console.log(JSON.stringify(results, null, 2));
})().catch(e => { console.log(JSON.stringify({error: e.message})); process.exit(1); });
