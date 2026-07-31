// Single source of truth: position existence + live price in one call
// NEVER trusts DOM table prices — cross-references with chart CDP
const path = require("path");
const CDP = require(path.join(__dirname, "cdp_client.cjs"));

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const t = await r.json();
  const c = t.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!c) { console.log(JSON.stringify({ error: "no_chart" })); process.exit(1); }
  const cl = await CDP({ host: "127.0.0.1", port: 9222, target: c.id });
  await cl.Runtime.enable();
  const ev = async e => { const r = await cl.Runtime.evaluate({ expression: e, returnByValue: true }); return r.result.value; };
  const S = s => new Promise(r => setTimeout(r, s));

  // STEP 1: Get positions from Positions tab (reliable for existence)
  await ev(`(function(){ var bs=document.querySelectorAll("button"); for(var i=0;i<bs.length;i++){ if(bs[i].textContent.trim()==="Positions"){ bs[i].click(); return; } } })()`);
  await S(1500);

  const posData = await ev(`(function(){
    var ts=document.querySelectorAll("table");
    for(var i=0;i<ts.length;i++){
      var r=ts[i].getBoundingClientRect();
      if(r.y>400&&r.width>400){
        var rows=ts[i].querySelectorAll("tr");
        var result=[];
        for(var j=1;j<rows.length;j++){
          var cells=rows[j].querySelectorAll("td,th");
          var row=[];
          for(var k=0;k<cells.length;k++) row.push(cells[k].textContent.trim());
          result.push(row);
        }
        return JSON.stringify(result);
      }
    }
    return "[]";
  })()`);

  let positions = [];
  try { positions = JSON.parse(posData); } catch(e) {}

  // STEP 2: Get live chart prices for all open positions
  const livePrices = {};
  for (const pos of positions) {
    if (pos.length < 7) continue;
    const symbol = pos[0] || "";
    const pairMatch = symbol.match(/(OANDA|CAPITALCOM):(\w+)/);
    if (!pairMatch) continue;
    const pair = pairMatch[2];

    await ev(`window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${pair}",{});`);
    await S(2000);

    const px = await ev(`(function(){
      var api=window.TradingViewApi._activeChartWidgetWV.value();
      var bars=api._chartWidget.model().mainSeries().bars();
      var v=bars.valueAt(bars.lastIndex());
      if(v&&v.length>=6) return JSON.stringify({price:v[4],high:v[2],low:v[3],time:v[0]*1000});
      return null;
    })()`);

    try {
      const priceData = JSON.parse(px);
      if (priceData) {
        const tablePrice = parseFloat((pos[6] || "").replace(/,/g, ""));
        const chartPrice = priceData.price;
        const stale = Math.abs(tablePrice - chartPrice) > (pair === "XAUUSD" ? 2 : pair === "NAS100" ? 20 : 0.0005);

        livePrices[pair] = {
          tablePrice: tablePrice,
          chartPrice: chartPrice,
          chartHigh: priceData.high,
          chartLow: priceData.low,
          chartTime: new Date(priceData.time).toISOString(),
          stale: stale,
          diff: Math.abs(tablePrice - chartPrice)
        };
      }
    } catch(e) {}
  }

  // STEP 3: Parse positions with live price cross-reference
  const result = [];
  for (const pos of positions) {
    if (pos.length < 8) continue;
    const symbol = pos[0] || "";
    const brokerMatch = symbol.match(/(OANDA|CAPITALCOM):(\w+)/);
    if (!brokerMatch) continue;

    const pair = brokerMatch[2];
    const side = (pos[1] || "") === "Short" ? "SELL" : (pos[1] || "") === "Long" ? "BUY" : null;
    if (!side) continue;

    const entry = parseFloat((pos[3] || "").replace(/,/g, ""));
    const tp = parseFloat((pos[4] || "").replace(/,/g, ""));
    const sl = parseFloat((pos[5] || "").replace(/,/g, ""));
    const current = livePrices[pair] ? livePrices[pair].chartPrice : parseFloat((pos[6] || "").replace(/,/g, ""));
    const pnl = (pos[7] || "").replace(/USD/i, "");
    const staleFlag = livePrices[pair] ? livePrices[pair].stale : true;

    result.push({
      pair, direction: side,
      qty: (pos[2] || "").replace(/,/g, ""),
      entry, tp, sl,
      current: current,
      pnl: pnl,
      stale: staleFlag,
      livePriceVerified: !!livePrices[pair]
    });
  }

  await cl.close();
  console.log(JSON.stringify({ positions: result, positionCount: result.length, liveCheck: Object.keys(livePrices).length > 0 }, null, 2));
})().catch(e => { console.log(JSON.stringify({ error: e.message })); process.exit(1); });
