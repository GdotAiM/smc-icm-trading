// Verify XAUUSD position WITHOUT switching symbols
const path = require("path");
const CDP = require(path.join(__dirname, "cdp_client.cjs"));
const fs = require("fs");

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // DON'T switch chart. Just check what's in the trading panel.

  // Click Positions tab
  console.log("Checking Positions...");
  await ev(`(function() {
    var btns = document.querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent.trim() === "Positions") { btns[i].click(); return; }
    }
  })()`);
  await sleep(1500);

  // Read positions table
  const positions = await ev(`(function() {
    var tables = document.querySelectorAll("table");
    for (var i = 0; i < tables.length; i++) {
      var r = tables[i].getBoundingClientRect();
      if (r.y > 550 && r.width > 400) {
        var rows = tables[i].querySelectorAll("tr");
        if (rows.length <= 1) return { empty: true };
        var data = [];
        for (var j = 1; j < Math.min(rows.length, 8); j++) {
          data.push(rows[j].textContent.trim().substring(0, 150));
        }
        return { count: data.length, positions: data };
      }
    }
    return { error: "no table found" };
  })()`);
  console.log(JSON.stringify(positions, null, 2));

  // Also check buy-sell bar
  const bar = await ev(`(function() {
    var b = document.querySelector('[data-name="buy-sell-buttons"]');
    return b ? b.textContent.trim().substring(0, 60) : "no bar";
  })()`);
  console.log("\nBuy/Sell bar: " + bar);

  // Chart symbol
  const sym = await ev(`window.TradingViewApi._activeChartWidgetWV.value().symbol();`);
  console.log("Chart: " + sym);

  // Screenshot
  const ss = await client.Page.captureScreenshot({ format: "png" });
  fs.writeFileSync("C:/Users/cash/smc-icm-trading/shared/screenshots/verify_positions.png", ss.data, "base64");

  await client.close();
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
