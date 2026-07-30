// Pull complete order history for today's trades
const CDP = require("./cdp_client.cjs");

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Click Order history tab
  console.log("=== ORDER HISTORY ===");
  await ev(`(function() {
    var btns = document.querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent.trim() === "Order history") { btns[i].click(); return; }
    }
  })()`);
  await sleep(1500);

  const history = await ev(`(function() {
    var tables = document.querySelectorAll("table");
    for (var i = 0; i < tables.length; i++) {
      var r = tables[i].getBoundingClientRect();
      if (r.y > 550 && r.width > 400) {
        var rows = tables[i].querySelectorAll("tr");
        var data = [];
        for (var j = 1; j < Math.min(rows.length, 15); j++) {
          data.push(rows[j].textContent.trim().substring(0, 200));
        }
        return { total: rows.length - 1, rows: data };
      }
    }
    return { error: "no table" };
  })()`);
  console.log(JSON.stringify(history, null, 2));

  // Also check Positions one more time
  console.log("\n=== POSITIONS ===");
  await ev(`(function() {
    var btns = document.querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent.trim() === "Positions") { btns[i].click(); return; }
    }
  })()`);
  await sleep(1500);

  const positions = await ev(`(function() {
    var tables = document.querySelectorAll("table");
    for (var i = 0; i < tables.length; i++) {
      var r = tables[i].getBoundingClientRect();
      if (r.y > 550 && r.width > 400) {
        var rows = tables[i].querySelectorAll("tr");
        var data = [];
        for (var j = 1; j < Math.min(rows.length, 10); j++) {
          data.push(rows[j].textContent.trim().substring(0, 200));
        }
        return data;
      }
    }
    return [];
  })()`);
  console.log(positions.length + " open positions:");
  positions.forEach(p => console.log("  " + p));

  await client.close();
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
