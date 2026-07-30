// Place all SMC scalp trades with proper broker symbols and structural stops
const path = require("path");
const CDP = require(path.join(__dirname, "cdp_client.cjs"));
const fs = require("fs");
const path = require("path");

const TRADES = [
  { pair: "GBPUSD",   tv: "GBPUSD",   side: "SELL", sl: 1.32920, tp: 1.32720, qty: 10000 },
  { pair: "EURUSD",   tv: "EURUSD",   side: "SELL", sl: 1.13870, tp: 1.13750, qty: 10000 },
  { pair: "NAS100",   tv: "NAS100",   side: "SELL", sl: 27420,   tp: 27100,   qty: 1     },
];

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const ROOT = "C:/Users/cash/smc-icm-trading";
  const DATE = new Date().toISOString().split("T")[0];

  const results = [];

  for (const trade of TRADES) {
    console.log("\n========================================");
    console.log("  " + trade.pair + " — " + trade.side + " | SL: " + trade.sl + " | TP: " + trade.tp);
    console.log("========================================");

    // Switch symbol
    await ev('window.TradingViewApi._activeChartWidgetWV.value().setSymbol("' + trade.tv + '", {});');
    await sleep(3000);
    const resolved = await ev('window.TradingViewApi._activeChartWidgetWV.value().symbol();');
    console.log("  Resolved: " + resolved);

    // Cancel any open ticket
    await ev('(function(){ var b=document.querySelector(\'[data-name="cancel-button"]\'); if(b)b.click(); })()');
    await sleep(800);

    // Click Sell
    const sideBtn = trade.side === "SELL" ? "sell-order-button" : "buy-order-button";
    await ev('(function(){ document.querySelector(\'[data-name="' + sideBtn + '"]\').click(); })()');
    await sleep(1200);

    // Select Market
    await ev('(function(){ var bs=document.querySelectorAll("button"); for(var i=0;i<bs.length;i++){ if(bs[i].textContent.trim()==="Market"){ bs[i].click(); } } })()');
    await sleep(400);

    // Fill quantity via first pass
    await ev(`
      (function() {
        function setNativeValue(el, value) {
          var ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          ns.call(el, String(value));
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
        var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
        for (var i = 0; i < inputs.length; i++) {
          var ir = inputs[i].getBoundingClientRect();
          if (ir.y > 180 && ir.y < 350 && ir.width > 50) {
            var label = "";
            var all = document.querySelectorAll("label, span, button, p");
            var bestDist = 100;
            for (var j = 0; j < all.length; j++) {
              var lr = all[j].getBoundingClientRect();
              var txt = (all[j].textContent || "").trim();
              var dist = ir.y - (lr.y + lr.height);
              if (dist > 0 && dist < bestDist && txt.length > 0 && txt.length < 30) { bestDist = dist; label = txt; }
            }
            if (label === "Units" || label === "Quantity") {
              setNativeValue(inputs[i], "${trade.qty}");
            }
          }
        }
      })()
    `);

    // Enable SL + TP checkboxes
    await ev(`
      (function() {
        var cbs = document.querySelectorAll('input[type="checkbox"]');
        for (var k = 0; k < cbs.length; k++) {
          var cr = cbs[k].getBoundingClientRect();
          if (cr.y > 330 && cr.y < 550 && !cbs[k].checked) cbs[k].click();
        }
      })()
    `);
    await sleep(700);

    // Fill SL/TP after checkboxes enabled
    const filled = await ev(`
      (function() {
        function setNativeValue(el, value) {
          var ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          ns.call(el, String(value));
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
        var refs = [];
        var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
        for (var m = 0; m < inputs.length; m++) {
          var ir = inputs[m].getBoundingClientRect();
          if (ir.y > 350 && ir.y < 550 && ir.width > 50) refs.push({ el: inputs[m], y: ir.y });
        }
        refs.sort(function(a,b) { return a.y - b.y; });
        var log = [];
        if (refs.length >= 2) {
          setNativeValue(refs[0].el, "${trade.sl}");
          setNativeValue(refs[1].el, "${trade.tp}");
          log.push("SL=" + "${trade.sl}" + " TP=" + "${trade.tp}");
        } else {
          log.push("SL/TP inputs: " + refs.length);
        }
        return log;
      })()
    `);
    console.log("  Fill: " + JSON.stringify(filled));
    await sleep(500);

    // Verify
    const verify = await ev(`
      (function() {
        var btn = document.querySelector('[data-name="place-and-modify-button"]');
        var text = btn ? btn.textContent.trim().substring(0, 100) : "NOT FOUND";
        var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
        var vals = [];
        for (var i = 0; i < inputs.length; i++) {
          var ir = inputs[i].getBoundingClientRect();
          if (ir.y > 180 && ir.y < 650 && ir.width > 50) vals.push({ y: Math.round(ir.y), v: inputs[i].value.substring(0, 25) });
        }
        vals.sort(function(a,b) { return a.y - b.y; });
        return { button: text, inputs: vals };
      })()
    `);
    console.log("  Button: " + verify.button);
    console.log("  Values: " + JSON.stringify(verify.inputs));

    // Skip placing if button not found
    if (verify.button === "NOT FOUND") {
      results.push({ pair: trade.pair, status: "FAILED", reason: "no button" });
      continue;
    }

    // Place!
    const placed = await ev('(function(){ var b=document.querySelector(\'[data-name="place-and-modify-button"]\'); if(!b) return false; b.click(); return true; })()');
    console.log("  Placed: " + placed);
    await sleep(2000);

    results.push({
      pair: trade.pair,
      symbol: resolved,
      side: trade.side,
      sl: trade.sl,
      tp: trade.tp,
      qty: trade.qty,
      status: placed ? "PLACED" : "FAILED"
    });
  }

  // Final screenshot
  fs.mkdirSync(path.join(ROOT, "shared", "screenshots"), { recursive: true });
  const ss = await client.Page.captureScreenshot({ format: "png" });
  fs.writeFileSync(path.join(ROOT, "shared", "screenshots", "all_trades_" + DATE + ".png"), ss.data, "base64");

  console.log("\n\n========================================");
  console.log("  ALL TRADES PLACED");
  console.log("========================================");
  console.table(results);

  await client.close();
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
