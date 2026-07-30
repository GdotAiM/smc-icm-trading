// Clean slate: clear drawings, cancel all orders, reset
const CDP = require("./cdp_client.cjs");

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  console.log("=== 1. Clear all drawings ===");
  const cleared = await ev(`
    (function() {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      try {
        api.removeAllShapes();
        return { cleared: true };
      } catch(e) {
        return { cleared: false, error: e.message };
      }
    })()
  `);
  console.log("  " + JSON.stringify(cleared));

  // Verify
  const count = await ev(`(function(){ var s=window.TradingViewApi._activeChartWidgetWV.value().getAllShapes(); return s?s.length:0; })()`);
  console.log("  Remaining shapes: " + count);

  console.log("\n=== 2. Cancel all open orders ===");
  // Strategy: for each pair, switch symbol, open order ticket, look for cancel/modify buttons

  // First, click Positions tab to see all open
  const posTab = await ev(`
    (function() {
      var btns = document.querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].textContent.trim() === "Positions") {
          btns[i].click();
          return "clicked";
        }
      }
      return "not found";
    })()
  `);
  console.log("  Positions tab: " + posTab);
  await sleep(1000);

  // Look for close buttons on all open positions
  const closeResult = await ev(`
    (function() {
      var all = document.querySelectorAll('[data-name*="close"], [aria-label*="Close"], [aria-label*="close position"]');
      var results = [];
      for (var i = 0; i < all.length; i++) {
        var r = all[i].getBoundingClientRect();
        if (r.width > 10 && r.height > 10) {
          results.push({
            tag: all[i].tagName,
            dataName: all[i].getAttribute("data-name") || "",
            ariaLabel: (all[i].getAttribute("aria-label") || "").substring(0, 60),
            text: (all[i].textContent || "").trim().substring(0, 30),
            y: Math.round(r.y), x: Math.round(r.x)
          });
          // Click close buttons
          if (r.y > 550) {
            all[i].click();
          }
        }
      }
      return results;
    })()
  `);
  console.log("  Close buttons: " + JSON.stringify(closeResult));

  // Also try clicking "Close" text buttons
  await ev(`
    (function() {
      var btns = document.querySelectorAll("button");
      var count = 0;
      for (var i = 0; i < btns.length; i++) {
        var t = btns[i].textContent.trim();
        var r = btns[i].getBoundingClientRect();
        if ((t === "Close" || t === "X" || t === "×") && r.y > 550 && r.width < 80) {
          btns[i].click();
          count++;
        }
      }
      return count;
    })()
  `);
  await sleep(1500);

  // Switch to Orders tab and cancel pending orders too
  const ordersTab = await ev(`
    (function() {
      var btns = document.querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].textContent.trim() === "Orders") {
          btns[i].click();
          return "clicked";
        }
      }
      return "not found";
    })()
  `);
  console.log("  Orders tab: " + ordersTab);
  await sleep(1000);

  // Cancel all pending orders
  const cancelled = await ev(`
    (function() {
      var btns = document.querySelectorAll("button");
      var count = 0;
      for (var i = 0; i < btns.length; i++) {
        var t = btns[i].textContent.trim();
        var r = btns[i].getBoundingClientRect();
        if ((t === "Cancel" || t === "X" || t === "×" || t === "Cancel order") && r.y > 550 && r.width < 120) {
          btns[i].click();
          count++;
        }
      }
      return { cancelled: count };
    })()
  `);
  console.log("  Cancelled: " + JSON.stringify(cancelled));
  await sleep(1500);

  // Final check: what's still open?
  console.log("\n=== 3. Verify clean slate ===");
  await ev(`(function() {
    var btns = document.querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent.trim() === "Positions") { btns[i].click(); }
    }
  })()`);
  await sleep(1000);

  const remainder = await ev(`
    (function() {
      var tables = document.querySelectorAll("table");
      for (var i = 0; i < tables.length; i++) {
        var r = tables[i].getBoundingClientRect();
        if (r.y > 550 && r.width > 200) {
          var rows = tables[i].querySelectorAll("tr");
          if (rows.length <= 1) return { positions: 0, note: "table empty" };
          var data = [];
          for (var j = 1; j < Math.min(rows.length, 6); j++) {
            data.push(rows[j].textContent.trim().substring(0, 100));
          }
          return { positions: data.length, rows: data };
        }
      }
      return { positions: 0, note: "no tables" };
    })()
  `);
  console.log("  Remaining: " + JSON.stringify(remainder));

  console.log("\n✅ Clean slate ready.");
  await client.close();
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
