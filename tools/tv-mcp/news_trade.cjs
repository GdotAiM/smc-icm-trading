// News Event Trading System
// Positions in trend direction before high-impact events with wide stops and ambitious TPs
// Usage: node news_trade.cjs --event "FOMC" --time "14:00" [--pairs EURUSD,GBPUSD,XAUUSD,NAS100]

const CDP = require("./node_modules/chrome-remote-interface");
const fs = require("fs");
const path = require("path");

// ═══ CONFIG ═══
const ROOT = "C:/Users/cash/smc-icm-trading";
const CALENDAR_PATH = path.join(ROOT, "shared", "today_events.json");

// News trading parameters: wider stops, bigger targets
const NEWS_MULTIPLIERS = {
  sl: 2.5,    // 2.5x normal SL distance (survive whipsaw)
  tp: 3.5,    // 3.5x normal TP distance (capture big move)
  entryWindow: 5,  // minutes before event to place trades
  cooldown: 3,     // minutes after event before re-entry
};

const PAIRS = [
  { name: "EURUSD", tv: "EURUSD", type: "forex", baseQty: 10000, normalSlPips: 8,  normalTpPips: 15 },
  { name: "GBPUSD", tv: "GBPUSD", type: "forex", baseQty: 5000,  normalSlPips: 10, normalTpPips: 20 },
  { name: "XAUUSD", tv: "XAUUSD", type: "metal", baseQty: 100,   normalSlPts: 15,  normalTpPts: 25 },
  { name: "NAS100", tv: "NAS100", type: "index", baseQty: 1,     normalSlPts: 150, normalTpPts: 400 },
];

// ═══ HELPERS ═══
function loadCalendar() {
  try { return JSON.parse(fs.readFileSync(CALENDAR_PATH, "utf8")); } catch { return []; }
}

function findNextEvent(events) {
  const now = new Date();
  const upcoming = events
    .filter(e => e.impact === "High" || e.impact === "high")
    .filter(e => new Date(e.timestamp || e.date + "T" + e.time) > now)
    .sort((a, b) => new Date(a.timestamp || a.date + "T" + a.time) - new Date(b.timestamp || b.date + "T" + b.time));
  return upcoming[0] || null;
}

function minutesUntil(targetTime) {
  const now = new Date();
  const [h, m] = targetTime.split(":").map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  return (target - now) / 60000;
}

// ═══ MAIN ═══
(async () => {
  const args = process.argv.slice(2);
  const eventName = args[args.indexOf("--event") + 1] || "News Event";
  const eventTime = args[args.indexOf("--time") + 1] || null;
  const pairFilter = args.includes("--pairs") ? args[args.indexOf("--pairs") + 1].split(",") : null;

  // Load calendar or use manual event
  const calendar = loadCalendar();
  const nextEvent = eventTime
    ? { name: eventName, time: eventTime, impact: "High" }
    : findNextEvent(calendar);

  if (!nextEvent) {
    console.log(JSON.stringify({ error: "No upcoming high-impact event found. Use --event and --time for manual entry." }));
    process.exit(1);
  }

  const minsUntil = eventTime ? minutesUntil(eventTime) : minutesUntil(nextEvent.time);
  console.log("=== NEWS TRADING SYSTEM ===");
  console.log("Event: " + (nextEvent.title || nextEvent.name) + " @ " + (nextEvent.time || eventTime));
  console.log("Minutes until event: " + minsUntil.toFixed(1));
  console.log("Impact: " + (nextEvent.impact || "High"));

  if (minsUntil < 0) {
    console.log("\n⚠️  Event already passed. Use for post-news analysis only.");
  } else if (minsUntil > NEWS_MULTIPLIERS.entryWindow) {
    console.log("\n⏳ Too early — waiting until " + NEWS_MULTIPLIERS.entryWindow + " min before event");
    console.log("   Re-run at " + new Date(Date.now() + (minsUntil - NEWS_MULTIPLIERS.entryWindow) * 60000).toLocaleTimeString());
    process.exit(0);
  }

  // Connect to TV
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No TV chart"); process.exit(1); }
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); try { return JSON.parse(res.result.value); } catch { return res.result.value; } };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Scan each pair for trend + calculate news levels
  console.log("\n=== SCANNING PAIRS FOR NEWS SETUPS ===");
  const setups = [];

  for (const pair of PAIRS) {
    if (pairFilter && !pairFilter.includes(pair.name)) continue;

    process.stderr.write(pair.name + "... ");
    await ev('window.TradingViewApi._activeChartWidgetWV.value().setSymbol("' + pair.tv + '", {});');
    await sleep(3000);
    await ev('window.TradingViewApi._activeChartWidgetWV.value().setResolution("5");');
    await sleep(1500);

    const raw = await ev('(function() { try { var api=window.TradingViewApi._activeChartWidgetWV.value(); var bars=api._chartWidget.model().mainSeries().bars(); var end=bars.lastIndex(),start=Math.max(bars.firstIndex(),end-20+1); var c=[]; for(var i=start;i<=end;i++){ var v=bars.valueAt(i); if(v&&v.length>=6) c.push({o:v[1],h:v[2],l:v[3],c:v[4]}); } return JSON.stringify(c); } catch(e) { return JSON.stringify({error:e.message}); } })()');
    let candles = [];
    try { candles = JSON.parse(raw); } catch(e) { candles = raw; }
    if (!Array.isArray(candles) || candles.length < 5) continue;

    const current = candles[candles.length - 1].c;
    let atr = 0;
    for (let i = Math.max(0, candles.length - 10); i < candles.length; i++) atr += candles[i].h - candles[i].l;
    atr /= Math.min(10, candles.length);

    // Trend strength: check 15m, 5m, 1m alignment
    await ev('window.TradingViewApi._activeChartWidgetWV.value().setResolution("15");');
    await sleep(1000);
    const raw15 = await ev('(function() { try { var api=window.TradingViewApi._activeChartWidgetWV.value(); var bars=api._chartWidget.model().mainSeries().bars(); var end=bars.lastIndex(); var v= bars.valueAt(end); var v0=bars.valueAt(Math.max(bars.firstIndex(),end-8)); if(v&&v0&&v.length>=6) return JSON.stringify({c:v[4], prevC:v0[4]}); return null; } catch(e) { return null; } })()');
    let trend15 = "?";
    try { const d = JSON.parse(raw15); if (d) trend15 = d.c < d.prevC ? "BEARISH" : "BULLISH"; } catch {}

    await ev('window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");');
    await sleep(1000);
    const raw1 = await ev('(function() { try { var api=window.TradingViewApi._activeChartWidgetWV.value(); var bars=api._chartWidget.model().mainSeries().bars(); var end=bars.lastIndex(); var v=bars.valueAt(end); var v0=bars.valueAt(Math.max(bars.firstIndex(),end-8)); if(v&&v0&&v.length>=6) return JSON.stringify({c:v[4], prevC:v0[4]}); return null; } catch(e) { return null; } })()');
    let trend1 = "?";
    try { const d = JSON.parse(raw1); if (d) trend1 = d.c < d.prevC ? "BEARISH" : "BULLISH"; } catch {}

    const trend5m = current < candles[Math.max(0, candles.length - 6)].c ? "BEARISH" : "BULLISH";
    const trendAlignment = (trend15 === trend5m && trend5m === trend1) ? "ALL_ALIGNED" :
                          (trend15 === trend5m || trend5m === trend1) ? "PARTIAL" : "MIXED";

    const side = trend5m === "BEARISH" ? "SELL" : "BUY";
    const pipSize = pair.type === "forex" ? 0.0001 : 1;
    const normalSl = (pair.normalSlPips || pair.normalSlPts) * pipSize;
    const normalTp = (pair.normalTpPips || pair.normalTpPts) * pipSize;

    // News SL = 2.5x wider, News TP = 3.5x bigger
    const slAmt = normalSl * NEWS_MULTIPLIERS.sl;
    const tpAmt = normalTp * NEWS_MULTIPLIERS.tp;
    const decimals = pair.type === "forex" ? 5 : (pair.type === "metal" ? 2 : 1);

    let sl, tp;
    if (side === "SELL") {
      sl = (current + slAmt).toFixed(decimals);
      tp = (current - tpAmt).toFixed(decimals);
    } else {
      sl = (current - slAmt).toFixed(decimals);
      tp = (current + tpAmt).toFixed(decimals);
    }

    // Score: only trade if trend is clear
    const score = trendAlignment === "ALL_ALIGNED" ? 3 : trendAlignment === "PARTIAL" ? 1 : 0;
    const tradeable = score >= 1;

    setups.push({
      pair: pair.name, qty: pair.baseQty, price: Number(current.toFixed(decimals)),
      trend15m: trend15, trend5m: trend5m, trend1m: trend1m,
      alignment: trendAlignment, atr: Number(atr.toFixed(decimals)),
      side, sl, tp,
      slDist: (side === "SELL" ? sl - current : current - sl).toFixed(decimals),
      tpDist: (side === "SELL" ? current - tp : tp - current).toFixed(decimals),
      rr: (Math.abs(tp - current) / Math.abs(sl - current)).toFixed(1),
      score, tradeable
    });
  }
  process.stderr.write("\n");

  // Filter to tradeable setups
  const trades = setups.filter(s => s.tradeable).sort((a, b) => b.score - a.score);

  console.log("\n=== NEWS TRADE PLAN ===");
  console.log("Event: " + (nextEvent.title || nextEvent.name));
  console.log("Strategy: Position WITH dominant trend, wide stops, big targets\n");

  if (trades.length === 0) {
    console.log("No tradeable setups — all pairs have mixed trends.");
    process.exit(0);
  }

  console.log("TRADEABLE SETUPS:");
  console.log("─".repeat(80));
  for (const t of trades) {
    console.log(t.pair.padEnd(8) + " " + t.side.padEnd(5) + " Qty:" + String(t.qty).padEnd(6) +
                " | " + t.trend15m.padEnd(8) + t.trend5m.padEnd(8) + t.trend1m.padEnd(8) +
                " | SL:" + t.sl.padEnd(12) + "TP:" + t.tp.padEnd(12) +
                "R:R 1:" + t.rr + " | Score:" + t.score + "/3");
  }
  console.log("─".repeat(80));

  // ═══ PLACE TRADES ═══
  console.log("\n=== PLACING NEWS TRADES ===");
  const results = [];

  for (const trade of trades) {
    console.log("\n" + trade.pair + " " + trade.side + "...");
    await ev('window.TradingViewApi._activeChartWidgetWV.value().setSymbol("' + trade.pair + '", {});');
    await sleep(3000);

    const SIDE_BTN = trade.side === "SELL" ? "sell-order-button" : "buy-order-button";

    // Cancel any open ticket
    await ev('(function(){ var b=document.querySelector(\'[data-name="cancel-button"]\'); if(b)b.click(); })()');
    await sleep(500);
    await ev('(function(){ document.querySelector(\'[data-name="' + SIDE_BTN + '"]\').click(); })()');
    await sleep(1500);
    await ev('(function(){ var bs=document.querySelectorAll("button"); for(var i=0;i<bs.length;i++){ if(bs[i].textContent.trim()==="Market"){ bs[i].click(); return; } } })()');
    await sleep(400);

    // Fill quantity
    await ev(`(function() {
      function setV(el,v){var ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;ns.call(el,String(v));el.dispatchEvent(new Event("input",{bubbles:true}));}
      var inputs=document.querySelectorAll('input[type="text"],input:not([type])');
      for(var i=0;i<inputs.length;i++){var ir=inputs[i].getBoundingClientRect();if(ir.y>250&&ir.y<320&&ir.width>50){setV(inputs[i],"${trade.qty}");return;}}
    })()`);
    await sleep(300);

    // Enable checkboxes
    await ev('(function(){var cbs=document.querySelectorAll(\'input[type="checkbox"]\');for(var i=0;i<cbs.length;i++){var cr=cbs[i].getBoundingClientRect();if(cr.y>330&&cr.y<550&&!cbs[i].checked)cbs[i].click();}})()');
    await sleep(600);

    // Fill TP (y~399) and SL (y~483)
    await ev(`(function() {
      function setV(el,v){var ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;ns.call(el,String(v));el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));}
      var refs=[];
      var inputs=document.querySelectorAll('input[type="text"],input:not([type])');
      for(var i=0;i<inputs.length;i++){var ir=inputs[i].getBoundingClientRect();if(ir.y>350&&ir.y<550&&ir.width>50&&!inputs[i].readOnly)refs.push({el:inputs[i],y:ir.y});}
      refs.sort(function(a,b){return a.y-b.y;});
      if(refs.length>=2){setV(refs[0].el,"${trade.tp}");setV(refs[1].el,"${trade.sl}");}
    })()`);
    await sleep(400);

    // Place
    const placeText = await ev('(function(){ var b=document.querySelector(\'[data-name="place-and-modify-button"]\'); return b?b.textContent.trim().substring(0,80):"NONE"; })()');
    if (placeText === "NONE") { results.push({ pair: trade.pair, status: "NO_TICKET" }); continue; }

    await ev('(function(){ var b=document.querySelector(\'[data-name="place-and-modify-button"]\'); if(b)b.click(); })()');
    await sleep(2500);

    const closed = await ev('(function(){ var b=document.querySelector(\'[data-name="place-and-modify-button"]\'); return !b||b.getBoundingClientRect().width===0; })()');
    results.push({ pair: trade.pair, side: trade.side, sl: trade.sl, tp: trade.tp, qty: trade.qty, status: closed ? "PLACED" : "UNCONFIRMED" });
    console.log("  " + (closed ? "✅" : "⚠️"));
  }

  // ═══ SAVE PLAN ═══
  const DATE = new Date().toISOString().split("T")[0];
  const plan = {
    event: nextEvent.title || nextEvent.name,
    time: nextEvent.time || eventTime,
    placed: new Date().toISOString(),
    strategy: "Position with dominant trend, 2.5x SL, 3.5x TP",
    trades: results,
    allSetups: setups
  };
  fs.writeFileSync(path.join(ROOT, "shared", DATE, "news_trade_plan.json"), JSON.stringify(plan, null, 2));

  // ═══ SUMMARY ═══
  console.log("\n========================================");
  console.log("  NEWS TRADES PLACED");
  console.log("========================================");
  console.table(results);
  console.log("\nPlan saved: shared/" + DATE + "/news_trade_plan.json");
  console.log("Monitor with: node tools/tv-mcp/check_orders.cjs");
  console.log("Journal with: node tools/ict_continuous_learn.cjs --run");

  await client.close();
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
