// Diagnose symbol/order mismatch
const CDP = require("./cdp_client.cjs");

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  console.log("=== DIAGNOSTIC: Symbol & Order Issues ===");

  // 1. Current chart symbol
  const sym1 = await ev('window.TradingViewApi._activeChartWidgetWV.value().symbol();');
  console.log("1. Current chart symbol:", sym1);

  // 2. What does setSymbol("NAS100") resolve to?
  await ev('window.TradingViewApi._activeChartWidgetWV.value().setSymbol("NAS100", {});');
  await sleep(3000);
  const sym2 = await ev('window.TradingViewApi._activeChartWidgetWV.value().symbol();');
  console.log("2. After setSymbol(NAS100):", sym2);

  // 3. Check if it differs
  console.log("3. Mismatch?", sym1 !== sym2 ? "YES - ORDERS WENT TO WRONG SYMBOL" : "no");

  // 4. Check all 3 pairs
  for (const pair of ["GBPUSD", "EURUSD", "NAS100"]) {
    await ev('window.TradingViewApi._activeChartWidgetWV.value().setSymbol("' + pair + '", {});');
    await sleep(2500);
    const resolved = await ev('window.TradingViewApi._activeChartWidgetWV.value().symbol();');
    console.log("4. " + pair + " -> " + resolved + (pair !== resolved && !resolved.includes(pair) ? " ⚠️ MISMATCH" : ""));
  }

  // 5. What brokers does the paper trading account use?
  const orderBtn = await ev(`
    (function() {
      var sell = document.querySelector('[data-name="sell-order-button"]');
      if (!sell) return "no sell btn";
      var txt = sell.textContent.trim();
      return txt;
    })()
  `);
  console.log("5. Sell button text:", orderBtn);

  // 6. Check if there are open orders on mismatched symbols
  const ordersTab = await ev(`
    (function() {
      // Click Orders tab
      var btns = document.querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].textContent.trim() === "Orders") { btns[i].click(); return "clicked"; }
      }
      return "not found";
    })()
  `);
  console.log("6. Orders tab:", ordersTab);
  await sleep(1000);

  // Try to read order rows
  const orderData = await ev(`
    (function() {
      var tables = document.querySelectorAll("table");
      for (var i = 0; i < tables.length; i++) {
        var r = tables[i].getBoundingClientRect();
        if (r.y > 550 && r.width > 200) {
          var rows = tables[i].querySelectorAll("tr");
          var data = [];
          for (var j = 0; j < Math.min(rows.length, 8); j++) {
            data.push(rows[j].textContent.trim().substring(0, 150));
          }
          return { y: Math.round(r.y), rows: data };
        }
      }
      return { error: "no visible tables" };
    })()
  `);
  console.log("7. Order rows:", JSON.stringify(orderData, null, 2));

  await client.close();
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
