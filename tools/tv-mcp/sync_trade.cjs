// Properly sync chart + trading panel by using keyboard symbol search
// Then place the trade with verified values
const path = require("path");
const CDP = require(path.join(__dirname, "cdp_client.cjs"));
const fs = require("fs");
const path = require("path");

const TRADES = [
  { pair: "XAUUSD", side: "BUY",  sl: 4018,    tp: 4045,    qty: 100 },
  { pair: "GBPUSD", side: "SELL", sl: 1.32920, tp: 1.32720, qty: 10000 },
  { pair: "EURUSD", side: "SELL", sl: 1.13870, tp: 1.13750, qty: 10000 },
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

  for (const trade of TRADES) {
    const SIDE_BTN = trade.side === "SELL" ? "sell-order-button" : "buy-order-button";
    console.log("\n========================================");
    console.log("  " + trade.pair + " " + trade.side + " | SL: " + trade.sl + " | TP: " + trade.tp);
    console.log("========================================");

    // --- APPROACH: Use keyboard to type symbol into search ---
    // This properly syncs both chart AND trading panel

    // Click on the chart area first to ensure focus
    console.log("  Focusing chart...");
    await client.Input.dispatchMouseEvent({ type: "mouseMoved", x: 800, y: 400 });
    await sleep(200);
    await client.Input.dispatchMouseEvent({ type: "mousePressed", x: 800, y: 400, button: "left", clickCount: 1 });
    await client.Input.dispatchMouseEvent({ type: "mouseReleased", x: 800, y: 400, button: "left" });
    await sleep(500);

    // Open symbol search by typing the pair name
    console.log("  Typing symbol: " + trade.pair);
    // First clear any existing input by pressing Escape a few times
    for (let i = 0; i < 3; i++) {
      await client.Input.dispatchKeyEvent({ type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await client.Input.dispatchKeyEvent({ type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await sleep(100);
    }
    await sleep(300);

    // Now type the symbol — TradingView should open the symbol search automatically
    await client.Input.insertText({ text: trade.pair });
    await sleep(1500);

    // Screenshot to see the search dropdown
    const ss1 = await client.Page.captureScreenshot({ format: "png" });
    fs.writeFileSync(path.join(ROOT, "shared", "screenshots", "sync_" + trade.pair.toLowerCase() + "_search.png"), ss1.data, "base64");

    // Press Enter to select the first match
    await client.Input.dispatchKeyEvent({ type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await client.Input.dispatchKeyEvent({ type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    console.log("  Waiting for chart to load...");
    await sleep(5000); // Wait for chart + panel to fully sync

    // Verify what symbol is now showing
    const chartSymbol = await ev('window.TradingViewApi._activeChartWidgetWV.value().symbol();');
    const barText = await ev('(function(){ var b=document.querySelector("[data-name=\\"buy-sell-buttons\\"]"); return b?b.textContent.trim().substring(0,60):"no bar"; })()');
    console.log("  Chart: " + chartSymbol);
    console.log("  Bar: " + barText);

    const ss2 = await client.Page.captureScreenshot({ format: "png" });
    fs.writeFileSync(path.join(ROOT, "shared", "screenshots", "sync_" + trade.pair.toLowerCase() + "_loaded.png"), ss2.data, "base64");

    // Now place the order
    // Cancel any open ticket
    await ev('(function(){ var b=document.querySelector(\'[data-name="cancel-button"]\'); if(b)b.click(); })()');
    await sleep(800);

    // Click Buy/Sell
    await ev('(function(){ document.querySelector(\'[data-name="' + SIDE_BTN + '"]\').click(); })()');
    await sleep(1500);

    // Select Market
    await ev('(function(){ var bs=document.querySelectorAll("button"); for(var i=0;i<bs.length;i++){ if(bs[i].textContent.trim()==="Market"){ bs[i].click(); } } })()');
    await sleep(500);

    // Set quantity
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
    await sleep(400);

    // Enable SL and TP checkboxes
    await ev(`
      (function() {
        var cbs = document.querySelectorAll('input[type="checkbox"]');
        for (var k = 0; k < cbs.length; k++) {
          var cr = cbs[k].getBoundingClientRect();
          if (cr.y > 330 && cr.y < 550 && !cbs[k].checked) cbs[k].click();
        }
      })()
    `);
    await sleep(600);

    // Fill SL and TP
    const fillResult = await ev(`
      (function() {
        function setNativeValue(el, value) {
          var ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          ns.call(el, String(value));
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        var refs = [];
        var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
        for (var m = 0; m < inputs.length; m++) {
          var ir = inputs[m].getBoundingClientRect();
          if (ir.y > 350 && ir.y < 550 && ir.width > 50) refs.push({ el: inputs[m], y: ir.y, val: inputs[m].value });
        }
        refs.sort(function(a,b) { return a.y - b.y; });
        var log = [];
        if (refs.length >= 2) {
          setNativeValue(refs[0].el, "${trade.sl}");
          setNativeValue(refs[1].el, "${trade.tp}");
          log.push("SL=" + "${trade.sl}" + " (y=" + Math.round(refs[0].y) + ") TP=" + "${trade.tp}" + " (y=" + Math.round(refs[1].y) + ")");
        } else {
          log.push("Only " + refs.length + " refs: " + JSON.stringify(refs.map(function(r){ return {y:Math.round(r.y), v:r.val}; })));
        }
        return log;
      })()
    `);
    console.log("  Fill: " + JSON.stringify(fillResult));
    await sleep(400);

    // Verify and place
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
    console.log("  Verify: " + JSON.stringify(verify));

    if (verify.button === "NOT FOUND") {
      console.log("  ❌ SKIPPED — no place button");
      continue;
    }

    // Place
    await ev('(function(){ var b=document.querySelector(\'[data-name="place-and-modify-button"]\'); if(b)b.click(); })()');
    await sleep(2000);
    console.log("  ✅ PLACED");

    const ss3 = await client.Page.captureScreenshot({ format: "png" });
    fs.writeFileSync(path.join(ROOT, "shared", "screenshots", "sync_" + trade.pair.toLowerCase() + "_done.png"), ss3.data, "base64");
  }

  console.log("\n=== ALL DONE ===");
  await client.close();
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
