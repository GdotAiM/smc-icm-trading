// Final approach: keyboard switch + ensure panel open + click buy + fill form
const CDP = require("./node_modules/chrome-remote-interface");
const fs = require("fs");
const path = require("path");

const PAIR = process.argv[2] || "XAUUSD";
const SIDE = (process.argv[3] || "BUY").toUpperCase();
const STOP_PRICE = process.argv[4] || "4018";
const TARGET_PRICE = process.argv[5] || "4045";
const QTY = process.argv[6] || "100";
const SIDE_BTN = SIDE === "SELL" ? "sell-order-button" : "buy-order-button";
const ROOT = "C:/Users/cash/smc-icm-trading";

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  let ss = 0;
  async function shot(label) {
    ss++;
    const data = await client.Page.captureScreenshot({ format: "png" });
    fs.writeFileSync(path.join(ROOT, "shared", "screenshots", "final_" + String(ss).padStart(2,"0") + "_" + label + ".png"), data.data, "base64");
    console.log("  [SS] " + label);
  }

  // ═══ 1. KEYBOARD SYMBOL SWITCH ═══
  console.log("=== 1. Switch to " + PAIR + " via keyboard ===");
  await client.Input.dispatchMouseEvent({ type: "mouseMoved", x: 800, y: 400 });
  await sleep(200);
  await client.Input.dispatchMouseEvent({ type: "mousePressed", x: 800, y: 400, button: "left", clickCount: 1 });
  await client.Input.dispatchMouseEvent({ type: "mouseReleased", x: 800, y: 400, button: "left" });
  await sleep(300);

  // Escape to clear any dialogs
  for (let i = 0; i < 3; i++) {
    await client.Input.dispatchKeyEvent({ type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await client.Input.dispatchKeyEvent({ type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(100);
  }
  await sleep(300);

  // Type symbol
  await client.Input.insertText({ text: PAIR });
  await sleep(2000);
  // Press Enter to select
  await client.Input.dispatchKeyEvent({ type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await client.Input.dispatchKeyEvent({ type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(5000);

  const sym = await ev('window.TradingViewApi._activeChartWidgetWV.value().symbol();');
  console.log("  Chart: " + sym);
  await shot("01_chart");

  // ═══ 2. ENSURE BOTTOM PANEL IS OPEN ═══
  console.log("\n=== 2. Expand trading panel ===");
  let panelHeight = await ev('(function(){ var b=document.querySelector("[class*=\\"layout__area--bottom\\"]"); return b?b.offsetHeight:0; })()');
  console.log("  Panel height: " + panelHeight);

  if (panelHeight < 200) {
    console.log("  Panel collapsed — expanding...");
    // Click Paper Trading button to open account manager
    await ev('(function(){ var btns=document.querySelectorAll("button"); for(var i=0;i<btns.length;i++){ var t=btns[i].textContent.trim(); if((t.indexOf("Paper")>=0||t.indexOf("Trading")>=0)&&btns[i].getBoundingClientRect().y>700){ btns[i].click(); return "clicked"; } } return "no"; })()');
    await sleep(1500);
    panelHeight = await ev('(function(){ var b=document.querySelector("[class*=\\"layout__area--bottom\\"]"); return b?b.offsetHeight:0; })()');
    console.log("  Panel height now: " + panelHeight);
  }
  await shot("02_panel");

  // ═══ 3. CLICK BUY/SELL ═══
  console.log("\n=== 3. Click " + SIDE + " ===");
  // Cancel any existing ticket first
  await ev('(function(){ var b=document.querySelector(\'[data-name="cancel-button"]\'); if(b)b.click(); })()');
  await sleep(500);

  // Click the buy/sell button
  const btnInfo = await ev('(function(){ var b=document.querySelector(\'[data-name="' + SIDE_BTN + '"]\'); if(!b) return null; var r=b.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2, text:b.textContent.trim().substring(0,30), w:r.width, h:r.height}; })()');
  console.log("  Button: " + JSON.stringify(btnInfo));

  if (btnInfo) {
    await client.Input.dispatchMouseEvent({ type: "mouseMoved", x: btnInfo.x, y: btnInfo.y });
    await sleep(200);
    await client.Input.dispatchMouseEvent({ type: "mousePressed", x: btnInfo.x, y: btnInfo.y, button: "left", clickCount: 1 });
    await client.Input.dispatchMouseEvent({ type: "mouseReleased", x: btnInfo.x, y: btnInfo.y, button: "left" });
  }
  await sleep(2000);
  await shot("03_ticket");

  // ═══ 4. CHECK IF TICKET OPENED ═══
  console.log("\n=== 4. Check ticket ===");
  const ticketState = await ev(`
    (function() {
      var cancelBtn = document.querySelector('[data-name="cancel-button"]');
      var ticketOpen = !!(cancelBtn && cancelBtn.getBoundingClientRect().width > 0);
      var placeBtn = document.querySelector('[data-name="place-and-modify-button"]');
      var placeText = placeBtn ? placeBtn.textContent.trim().substring(0, 80) : "NONE";
      var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      var inputCount = 0;
      for (var i = 0; i < inputs.length; i++) {
        var ir = inputs[i].getBoundingClientRect();
        if (ir.y > 180 && ir.y < 650 && ir.width > 50) inputCount++;
      }
      return { ticketOpen: ticketOpen, placeButton: placeText, visibleInputs: inputCount };
    })()
  `);
  console.log("  " + JSON.stringify(ticketState));

  if (!ticketState.ticketOpen) {
    console.log("  ❌ Ticket didn't open!");
    // Try clicking the buy-sell bar itself
    await ev('(function(){ var bar=document.querySelector("[data-name=\\"buy-sell-buttons\\"]"); if(bar) bar.click(); })()');
    await sleep(1500);
    await shot("03b_retry");
  }

  // ═══ 5. SELECT MARKET ═══
  console.log("\n=== 5. Select Market ===");
  await ev('(function(){ var bs=document.querySelectorAll("button"); for(var i=0;i<bs.length;i++){ if(bs[i].textContent.trim()==="Market"){ bs[i].click(); } } })()');
  await sleep(500);

  // ═══ 6. FILL FORM ═══
  console.log("\n=== 6. Fill form ===");

  // Quantity
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
        if (ir.y > 250 && ir.y < 320 && ir.width > 50) {
          setNativeValue(inputs[i], "${QTY}");
        }
      }
    })()
  `);
  await sleep(300);

  // Enable checkboxes
  await ev('(function(){ var cbs=document.querySelectorAll("input[type=checkbox]"); for(var i=0;i<cbs.length;i++){ var r=cbs[i].getBoundingClientRect(); if(r.y>330&&r.y<550&&!cbs[i].checked) cbs[i].click(); } })()');
  await sleep(700);

  // Fill SL + TP by y-position
  const filled = await ev(`
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
        if (ir.y > 350 && ir.y < 550 && ir.width > 50) refs.push({ el: inputs[m], y: ir.y, val: inputs[m].value, ro: inputs[m].readOnly });
      }
      refs.sort(function(a,b) { return a.y - b.y; });
      var log = { count: refs.length, refs: refs.map(function(r){ return {y:Math.round(r.y), v:r.val, ro:r.ro}; }) };
      if (refs.length >= 2) {
        setNativeValue(refs[0].el, "${STOP_PRICE}");
        setNativeValue(refs[1].el, "${TARGET_PRICE}");
        log.filled = true;
      }
      return log;
    })()
  `);
  console.log("  Fill: " + JSON.stringify(filled));
  await shot("04_filled");

  // ═══ 7. VERIFY AND PLACE ═══
  console.log("\n=== 7. Verify & Place ===");
  const verify = await ev(`
    (function() {
      var btn = document.querySelector('[data-name="place-and-modify-button"]');
      var text = btn ? btn.textContent.trim().substring(0, 120) : "NONE";
      var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      var vals = [];
      for (var i = 0; i < inputs.length; i++) {
        var ir = inputs[i].getBoundingClientRect();
        if (ir.y > 180 && ir.y < 650 && ir.width > 50) {
          vals.push({ y: Math.round(ir.y), v: inputs[i].value.substring(0, 30) });
        }
      }
      vals.sort(function(a,b) { return a.y - b.y; });

      // Check for errors
      var errors = [];
      var errEls = document.querySelectorAll('[class*="error"], [class*="Error"], [class*="invalid"]');
      for (var e = 0; e < Math.min(errEls.length, 10); e++) {
        var et = (errEls[e].textContent || "").trim();
        if (et.length > 2 && et.length < 150) errors.push(et);
      }

      return { button: text, inputs: vals, errors: errors };
    })()
  `);
  console.log(JSON.stringify(verify, null, 2));
  await shot("05_verify");

  if (verify.button === "NONE") {
    console.log("❌ FAILED — no place button");
    await client.close();
    process.exit(1);
  }

  // Place!
  await ev('(function(){ var b=document.querySelector(\'[data-name="place-and-modify-button"]\'); if(b)b.click(); })()');
  await sleep(2500);
  await shot("06_placed");

  // Check for post-placement errors
  const after = await ev(`
    (function() {
      var msgs = [];
      var all = document.querySelectorAll('[class*="toast"], [class*="notification"], [class*="error"], [role="alert"]');
      for (var i = 0; i < Math.min(all.length, 10); i++) {
        var t = (all[i].textContent || "").trim();
        if (t.length > 3 && t.length < 200) msgs.push(t.substring(0, 120));
      }
      var ticketStillOpen = !!document.querySelector('[data-name="cancel-button"]');
      return { messages: msgs, ticketStillOpen: ticketStillOpen };
    })()
  `);
  console.log("  After: " + JSON.stringify(after));

  console.log("\n✅ " + SIDE + " " + PAIR + " | SL: " + STOP_PRICE + " | TP: " + TARGET_PRICE);
  await client.close();
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
