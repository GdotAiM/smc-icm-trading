// Place paper trade on TV — clicks Exits to reveal SL/TP, fills, places
const CDP = require("./node_modules/chrome-remote-interface");
const fs = require("fs");
const path = require("path");

const PAIR = process.argv[2] || "GBPUSD";
const SIDE = (process.argv[3] || "SELL").toUpperCase();
const ENTRY = parseFloat(process.argv[4] || "1.32845");
const STOP = parseFloat(process.argv[5] || "1.32875");
const TARGET = parseFloat(process.argv[6] || "1.32805");
const QTY = process.argv[7] || "10000";
const SIDE_BTN = SIDE === "SELL" ? "sell-order-button" : "buy-order-button";

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const ROOT = "C:/Users/cash/smc-icm-trading";

  // ═══ STEP 1: Cancel any open, open fresh ticket ═══
  console.log("=== STEP 1: Fresh ticket ===");
  await ev(`(function(){ var b=document.querySelector('[data-name="cancel-button"]'); if(b)b.click(); })()`);
  await sleep(1000);
  await ev(`(function(){ document.querySelector('[data-name="${SIDE_BTN}"]').click(); })()`);
  await sleep(1500);

  // ═══ STEP 2: Select Limit ═══
  console.log("=== STEP 2: Limit order ===");
  await ev(`(function(){ var bs=document.querySelectorAll("button"); for(var i=0;i<bs.length;i++){ if(bs[i].textContent.trim()==="Limit"){ bs[i].click(); } } })()`);
  await sleep(500);

  // ═══ STEP 3: Check if Exits is collapsed, expand if needed ═══
  console.log("=== STEP 3: Ensure Exits is expanded ===");
  const exitsState = await ev(`
    (function() {
      // Check for checkboxes in the SL/TP area (y 350-500)
      var cbs = document.querySelectorAll('input[type="checkbox"]');
      var visibleCbs = [];
      for (var i = 0; i < cbs.length; i++) {
        var r = cbs[i].getBoundingClientRect();
        if (r.y > 330 && r.y < 550) {
          visibleCbs.push({ y: Math.round(r.y), checked: cbs[i].checked });
        }
      }
      // If no checkboxes visible, Exits is collapsed - click to expand
      if (visibleCbs.length === 0) {
        var all = document.querySelectorAll("button");
        for (var j = 0; j < all.length; j++) {
          if (all[j].textContent.trim() === "Exits") {
            all[j].click();
            return { action: "expanded", visibleCheckboxes: 0 };
          }
        }
      }
      return { action: visibleCbs.length > 0 ? "already_open" : "no_exits_btn", checkboxes: visibleCbs };
    })()
  `);
  console.log("  Exits: " + JSON.stringify(exitsState));
  await sleep(600);

  // ═══ STEP 4: Find ALL inputs with precise labeling ═══
  console.log("=== STEP 4: Map all form inputs ===");
  const allInputs = await ev(`
    (function() {
      function setNativeValue(el, value) {
        var ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        ns.call(el, String(value));
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }

      var results = [];
      // Find all text inputs in the order form area
      var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      for (var i = 0; i < inputs.length; i++) {
        var ir = inputs[i].getBoundingClientRect();
        if (ir.y > 180 && ir.y < 650 && ir.width > 50 && ir.height > 15) {
          // Find the label above this input
          var label = "";
          var allEls = document.querySelectorAll("label, span, button, p");
          var bestDist = 100;
          for (var j = 0; j < allEls.length; j++) {
            var lr = allEls[j].getBoundingClientRect();
            var text = (allEls[j].textContent || "").trim();
            var dist = ir.y - (lr.y + lr.height);
            if (dist > 0 && dist < bestDist && text.length > 0 && text.length < 30) {
              bestDist = dist; label = text;
            }
          }
          results.push({
            y: Math.round(ir.y), value: inputs[i].value.substring(0, 20),
            label: label, inputmode: inputs[i].getAttribute("inputmode") || ""
          });
        }
      }

      // Fill what we already know: Price and Units
      for (var k = 0; k < inputs.length; k++) {
        var r2 = inputs[k].getBoundingClientRect();
        if (r2.y > 180 && r2.y < 650 && r2.width > 50) {
          var lbl = "";
          var all2 = document.querySelectorAll("label, span, button, p");
          var bd2 = 100;
          for (var m = 0; m < all2.length; m++) {
            var lr2 = all2[m].getBoundingClientRect();
            var txt2 = (all2[m].textContent || "").trim();
            var d2 = r2.y - (lr2.y + lr2.height);
            if (d2 > 0 && d2 < bd2 && txt2.length > 0 && txt2.length < 30) { bd2 = d2; lbl = txt2; }
          }
          if (lbl === "Price") { setNativeValue(inputs[k], "${ENTRY.toFixed(5)}"); }
          if (lbl === "Units") { setNativeValue(inputs[k], "${QTY}"); }
        }
      }

      return results;
    })()
  `);
  console.log("  Inputs: " + JSON.stringify(allInputs, null, 2));

  // ═══ STEP 5: Handle SL/TP checkboxes and fill prices ═══
  console.log("=== STEP 5: SL + TP ===");
  const sltpResult = await ev(`
    (function() {
      function setNativeValue(el, value) {
        var ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        ns.call(el, String(value));
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }

      var log = [];

      // Find and click SL/TP checkboxes
      var cbs = document.querySelectorAll('input[type="checkbox"]');
      var cbInfo = [];
      for (var i = 0; i < cbs.length; i++) {
        var r = cbs[i].getBoundingClientRect();
        if (r.y > 300 && r.y < 600) {
          cbInfo.push({ y: Math.round(r.y), checked: cbs[i].checked });
          if (!cbs[i].checked) {
            cbs[i].click();
            log.push("Clicked checkbox at y=" + Math.round(r.y));
          }
        }
      }
      log.push("Checkboxes: " + JSON.stringify(cbInfo));

      // Wait a bit for inputs to appear after checkbox clicks
      return log;
    })()
  `);
  console.log("  " + sltpResult.join("\n  "));
  await sleep(600);

  // Now find and fill SL/TP price inputs
  const sltpFill = await ev(`
    (function() {
      function setNativeValue(el, value) {
        var ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        ns.call(el, String(value));
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }

      var log = [];
      var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      var orderInputs = [];

      for (var i = 0; i < inputs.length; i++) {
        var ir = inputs[i].getBoundingClientRect();
        if (ir.y > 300 && ir.y < 550 && ir.width > 50 && ir.height > 15) {
          // Find label above
          var label = "";
          var all = document.querySelectorAll("label, span, button, p");
          var bestDist = 100;
          for (var j = 0; j < all.length; j++) {
            var lr = all[j].getBoundingClientRect();
            var txt = (all[j].textContent || "").trim();
            var dist = ir.y - (lr.y + lr.height);
            if (dist > 0 && dist < bestDist && txt.length > 0 && txt.length < 30) { bestDist = dist; label = txt; }
          }
          orderInputs.push({ y: Math.round(ir.y), value: inputs[i].value.substring(0, 20), label: label });
        }
      }

      // Sort by y
      orderInputs.sort(function(a,b) { return a.y - b.y; });
      log.push("SL/TP inputs: " + JSON.stringify(orderInputs));

      // The SL input should be first (lower y), TP second (higher y)
      // TradingView shows: Stop Loss checkbox + input, then Take Profit checkbox + input
      // The inputs near checkboxes: y~372=SL checkbox, y~456=TP checkbox
      // Inputs: y~400 area = SL price, y~485 area = TP price

      // Get references to the actual input elements
      var inputRefs = [];
      for (var k = 0; k < inputs.length; k++) {
        var ir2 = inputs[k].getBoundingClientRect();
        if (ir2.y > 300 && ir2.y < 550 && ir2.width > 50 && ir2.height > 15) {
          inputRefs.push({ el: inputs[k], y: ir2.y });
        }
      }
      inputRefs.sort(function(a,b) { return a.y - b.y; });

      if (inputRefs.length >= 2) {
        setNativeValue(inputRefs[0].el, "${STOP.toFixed(5)}");
        log.push("SL -> " + "${STOP.toFixed(5)}" + " (input at y~" + Math.round(inputRefs[0].y) + ")");
        setNativeValue(inputRefs[1].el, "${TARGET.toFixed(5)}");
        log.push("TP -> " + "${TARGET.toFixed(5)}" + " (input at y~" + Math.round(inputRefs[1].y) + ")");
      } else if (inputRefs.length === 1) {
        setNativeValue(inputRefs[0].el, "${STOP.toFixed(5)}");
        log.push("Only 1 SL/TP input found, set SL -> " + "${STOP.toFixed(5)}");
      } else {
        log.push("WARNING: No SL/TP inputs found after enabling checkboxes");
      }

      return log;
    })()
  `);
  console.log("  " + sltpFill.join("\n  "));
  await sleep(500);

  // ═══ STEP 6: Verify ═══
  console.log("=== STEP 6: Verify before placing ===");
  const verify = await ev(`
    (function() {
      var btn = document.querySelector('[data-name="place-and-modify-button"]');
      var btnText = btn ? btn.textContent.trim().substring(0, 120) : "NOT FOUND";

      var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      var vals = [];
      for (var i = 0; i < inputs.length; i++) {
        var ir = inputs[i].getBoundingClientRect();
        if (ir.y > 180 && ir.y < 650 && ir.width > 50) {
          vals.push({ y: Math.round(ir.y), val: inputs[i].value.substring(0, 25) });
        }
      }
      vals.sort(function(a,b) { return a.y - b.y; });
      return { button: btnText, inputs: vals };
    })()
  `);
  console.log("  Button: " + verify.button);
  console.log("  Values: " + JSON.stringify(verify.inputs));

  fs.mkdirSync(path.join(ROOT, "shared", "screenshots"), { recursive: true });
  const ss = await client.Page.captureScreenshot({ format: "png" });
  fs.writeFileSync(path.join(ROOT, "shared", "screenshots", "gbpusd_final_verify.png"), ss.data, "base64");

  // ═══ STEP 7: Place ═══
  if (verify.button === "NOT FOUND") {
    console.log("\n❌ Place button missing — aborting");
    process.exit(1);
  }

  console.log("\n=== STEP 7: PLACE ORDER ===");
  const placed = await ev(`(function(){ var b=document.querySelector('[data-name="place-and-modify-button"]'); if(!b) return false; b.click(); return true; })()`);
  console.log("  Placed: " + placed);
  await sleep(2000);

  const ss2 = await client.Page.captureScreenshot({ format: "png" });
  fs.writeFileSync(path.join(ROOT, "shared", "screenshots", "gbpusd_order_final.png"), ss2.data, "base64");

  console.log("\n✅ ORDER PLACED: " + SIDE + " " + PAIR + " @ " + ENTRY.toFixed(5));
  console.log("   SL: " + STOP.toFixed(5) + " | TP: " + TARGET.toFixed(5) + " | Qty: " + QTY);

  await client.close();
})().catch(e => { console.log("FATAL: " + e.message); process.exit(1); });
