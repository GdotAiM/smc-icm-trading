// Step-by-step order placement with screenshots at each stage
const CDP = require("./cdp_client.cjs");
const fs = require("fs");
const path = require("path");

const PAIR = process.argv[2] || "XAUUSD";
const SIDE = (process.argv[3] || "BUY").toUpperCase();
const STOP_PRICE = process.argv[4] || "4018";
const TARGET_PRICE = process.argv[5] || "4045";
const QTY = process.argv[6] || "100";
const SIDE_BTN = SIDE === "SELL" ? "sell-order-button" : "buy-order-button";
const ROOT = "C:/Users/cash/smc-icm-trading";
const SS_DIR = path.join(ROOT, "shared", "screenshots");

let ssNum = 0;
async function screenshot(client, label) {
  ssNum++;
  const ss = await client.Page.captureScreenshot({ format: "png" });
  const name = "debug_" + String(ssNum).padStart(2, "0") + "_" + label + ".png";
  fs.writeFileSync(path.join(SS_DIR, name), ss.data, "base64");
  console.log("  [SS] " + name);
}

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  fs.mkdirSync(SS_DIR, { recursive: true });

  // ═══════════════════════════════════════════
  // STEP 1: Switch symbol and take baseline screenshot
  // ═══════════════════════════════════════════
  console.log("=== STEP 1: Switch to " + PAIR + " ===");
  await ev('window.TradingViewApi._activeChartWidgetWV.value().setSymbol("' + PAIR + '", {});');
  await sleep(3000);
  const sym = await ev('window.TradingViewApi._activeChartWidgetWV.value().symbol();');
  console.log("  Symbol: " + sym);
  await screenshot(client, "01_chart_" + PAIR.toLowerCase());

  // ═══════════════════════════════════════════
  // STEP 2: SYNC TRADING PANEL SYMBOL WITH CHART
  // ═══════════════════════════════════════════
  console.log("\n=== STEP 2: Sync trading panel to " + PAIR + " ===");

  // First check what symbol the buy-sell bar shows
  const barSymbol = await ev(`
    (function() {
      var bar = document.querySelector('[data-name="buy-sell-buttons"]');
      if (!bar) return "no bar";
      return bar.textContent.trim().substring(0, 40);
    })()
  `);
  console.log("  Buy-sell bar: " + barSymbol);

  // The trading panel has its own symbol selector - find and click it
  // Look for the account/broker selector button in the bottom panel
  const panelBtn = await ev(`
    (function() {
      // Find button in bottom panel that contains broker/exchange/symbol info
      var btns = document.querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) {
        var r = btns[i].getBoundingClientRect();
        var t = btns[i].textContent.trim();
        // The account selector is typically in the bottom panel header area
        if (r.y > 590 && r.y < 660 && r.width > 80 && r.width < 180 && t.length > 5) {
          return { text: t.substring(0, 50), y: Math.round(r.y), x: Math.round(r.x), w: Math.round(r.width) };
        }
      }
      return null;
    })()
  `);
  console.log("  Panel selector: " + JSON.stringify(panelBtn));

  // Click the account selector to open dropdown
  if (panelBtn) {
    await ev('(function(){ var btns=document.querySelectorAll("button"); for(var i=0;i<btns.length;i++){ var r=btns[i].getBoundingClientRect(); if(r.y>590&&r.y<660&&r.width>80&&r.width<180&&btns[i].textContent.trim().length>5){ btns[i].click(); return "clicked"; } } return "not found"; })()');
    await sleep(1000);
    await screenshot(client, "02a_symbol_dropdown");

    // Look for the search input or pair list
    const ddState = await ev(`
      (function() {
        // Look for search input in dropdown
        var inputs = document.querySelectorAll('input[type="text"], input[type="search"]');
        for (var i = 0; i < inputs.length; i++) {
          var r = inputs[i].getBoundingClientRect();
          if (r.y > 550 && r.y < 750 && r.width > 100) {
            return { searchInput: true, y: Math.round(r.y), x: Math.round(r.x), w: Math.round(r.width), placeholder: inputs[i].placeholder };
          }
        }
        // Look for menu items with pair names
        var items = document.querySelectorAll('[role="menuitem"], [role="option"], [class*="menu"] button');
        var pairItems = [];
        for (var j = 0; j < Math.min(items.length, 20); j++) {
          var t = items[j].textContent.trim();
          if (t.length > 0 && t.length < 20) pairItems.push(t);
        }
        return { searchInput: false, menuItems: pairItems };
      })()
    `);
    console.log("  Dropdown: " + JSON.stringify(ddState));

    // If search input, type the pair name
    if (ddState.searchInput) {
      await client.Input.dispatchMouseEvent({ type: "mouseMoved", x: ddState.x + ddState.w/2, y: ddState.y });
      await sleep(100);
      await client.Input.dispatchMouseEvent({ type: "mousePressed", x: ddState.x + ddState.w/2, y: ddState.y, button: "left", clickCount: 1 });
      await client.Input.dispatchMouseEvent({ type: "mouseReleased", x: ddState.x + ddState.w/2, y: ddState.y, button: "left" });
      await sleep(300);
      await client.Input.dispatchKeyEvent({ type: "keyDown", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
      await client.Input.dispatchKeyEvent({ type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
      await sleep(100);
      await client.Input.insertText({ text: PAIR });
      await sleep(800);
      await screenshot(client, "02b_search_typed");

      // Press Enter to select first result
      await client.Input.dispatchKeyEvent({ type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await client.Input.dispatchKeyEvent({ type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await sleep(1500);
    }
  }

  await screenshot(client, "02c_panel_synced");

  // Verify the bar now shows correct symbol
  const barAfter = await ev('(function(){ var bar=document.querySelector("[data-name=\\"buy-sell-buttons\\"]"); return bar?bar.textContent.trim().substring(0,40):"no bar"; })()');
  console.log("  Bar after sync: " + barAfter);

  // ═══════════════════════════════════════════
  // STEP 3: Cancel any open ticket, then click Buy/Sell
  // ═══════════════════════════════════════════
  console.log("\n=== STEP 3: Open " + SIDE + " ticket ===");
  await ev('(function(){ var b=document.querySelector(\'[data-name="cancel-button"]\'); if(b)b.click(); })()');
  await sleep(800);

  // Click the buy/sell button in the quick bar
  const btnClicked = await ev('(function(){ var b=document.querySelector(\'[data-name="' + SIDE_BTN + '"]\'); if(!b) return {found:false}; var r=b.getBoundingClientRect(); b.click(); return {found:true, x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height), text:b.textContent.trim().substring(0,30)}; })()');
  console.log("  Button: " + JSON.stringify(btnClicked));
  await sleep(1500);
  await screenshot(client, "03_ticket_open");

  // ═══════════════════════════════════════════
  // STEP 3: Select Market order type
  // ═══════════════════════════════════════════
  console.log("\n=== STEP 3: Select Market ===");
  await ev('(function(){ var bs=document.querySelectorAll("button"); for(var i=0;i<bs.length;i++){ if(bs[i].textContent.trim()==="Market"){ bs[i].click(); } } })()');
  await sleep(500);
  await screenshot(client, "03_market_selected");

  // ═══════════════════════════════════════════
  // STEP 4: Set quantity
  // ═══════════════════════════════════════════
  console.log("\n=== STEP 4: Set quantity to " + QTY + " ===");
  const qtyResult = await ev(`
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
            setNativeValue(inputs[i], "${QTY}");
            return { set: true, label: label, y: Math.round(ir.y), oldVal: inputs[i].value };
          }
        }
      }
      return { set: false };
    })()
  `);
  console.log("  Qty: " + JSON.stringify(qtyResult));
  await sleep(400);
  await screenshot(client, "04_quantity_set");

  // ═══════════════════════════════════════════
  // STEP 5: Click Exits to expand SL/TP section (if collapsed)
  // ═══════════════════════════════════════════
  console.log("\n=== STEP 5: Ensure Exits expanded ===");
  const exitsCheck = await ev(`
    (function() {
      // Are SL/TP checkboxes visible?
      var cbs = document.querySelectorAll('input[type="checkbox"]');
      var visible = [];
      for (var i = 0; i < cbs.length; i++) {
        var r = cbs[i].getBoundingClientRect();
        if (r.y > 330 && r.y < 550) visible.push({ y: Math.round(r.y), checked: cbs[i].checked });
      }
      if (visible.length >= 2) return { status: "already_visible", checkboxes: visible };

      // Need to click Exits
      var btns = document.querySelectorAll("button");
      for (var j = 0; j < btns.length; j++) {
        if (btns[j].textContent.trim() === "Exits") {
          btns[j].click();
          return { status: "clicked_exits" };
        }
      }
      return { status: "exits_button_not_found" };
    })()
  `);
  console.log("  Exits: " + JSON.stringify(exitsCheck));
  await sleep(600);
  await screenshot(client, "05_exits_expanded");

  // ═══════════════════════════════════════════
  // STEP 6: Read ALL inputs and checkboxes BEFORE enabling
  // ═══════════════════════════════════════════
  console.log("\n=== STEP 6: Scan form state ===");
  const preState = await ev(`
    (function() {
      var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      var inputInfo = [];
      for (var i = 0; i < inputs.length; i++) {
        var ir = inputs[i].getBoundingClientRect();
        if (ir.y > 180 && ir.y < 650 && ir.width > 50) {
          inputInfo.push({ y: Math.round(ir.y), value: inputs[i].value.substring(0, 30), readonly: inputs[i].readOnly, disabled: inputs[i].disabled });
        }
      }
      var cbs = document.querySelectorAll('input[type="checkbox"]');
      var cbInfo = [];
      for (var k = 0; k < cbs.length; k++) {
        var cr = cbs[k].getBoundingClientRect();
        if (cr.y > 330 && cr.y < 550) cbInfo.push({ y: Math.round(cr.y), checked: cbs[k].checked });
      }
      return { inputs: inputInfo, checkboxes: cbInfo };
    })()
  `);
  console.log("  " + JSON.stringify(preState, null, 2));

  // ═══════════════════════════════════════════
  // STEP 7: Enable SL checkbox, screenshot
  // ═══════════════════════════════════════════
  console.log("\n=== STEP 7: Enable Stop Loss ===");
  const slEnabled = await ev(`
    (function() {
      var cbs = document.querySelectorAll('input[type="checkbox"]');
      for (var i = 0; i < cbs.length; i++) {
        var r = cbs[i].getBoundingClientRect();
        if (r.y > 350 && r.y < 420 && !cbs[i].checked) {
          cbs[i].click();
          return { clicked: true, y: Math.round(r.y) };
        }
      }
      return { clicked: false, reason: "already checked or not found" };
    })()
  `);
  console.log("  SL: " + JSON.stringify(slEnabled));
  await sleep(600);
  await screenshot(client, "07_sl_enabled");

  // ═══════════════════════════════════════════
  // STEP 8: Enable TP checkbox, screenshot
  // ═══════════════════════════════════════════
  console.log("\n=== STEP 8: Enable Take Profit ===");
  const tpEnabled = await ev(`
    (function() {
      var cbs = document.querySelectorAll('input[type="checkbox"]');
      for (var i = 0; i < cbs.length; i++) {
        var r = cbs[i].getBoundingClientRect();
        if (r.y > 430 && r.y < 500 && !cbs[i].checked) {
          cbs[i].click();
          return { clicked: true, y: Math.round(r.y) };
        }
      }
      return { clicked: false, reason: "already checked or not found" };
    })()
  `);
  console.log("  TP: " + JSON.stringify(tpEnabled));
  await sleep(600);
  await screenshot(client, "08_tp_enabled");

  // ═══════════════════════════════════════════
  // STEP 9: Scan ALL inputs after enabling SL/TP
  // ═══════════════════════════════════════════
  console.log("\n=== STEP 9: Post-enable scan ===");
  const postState = await ev(`
    (function() {
      var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      var inputInfo = [];
      for (var i = 0; i < inputs.length; i++) {
        var ir = inputs[i].getBoundingClientRect();
        if (ir.y > 180 && ir.y < 650 && ir.width > 50) {
          // Try to find the label above this input
          var label = "";
          var all = document.querySelectorAll("label, span, button, p, div");
          var bestDist = 100;
          for (var j = 0; j < all.length; j++) {
            var lr = all[j].getBoundingClientRect();
            var txt = (all[j].textContent || "").trim();
            var dist = ir.y - (lr.y + lr.height);
            if (dist > 0 && dist < bestDist && txt.length > 0 && txt.length < 30) { bestDist = dist; label = txt; }
          }
          inputInfo.push({
            y: Math.round(ir.y),
            value: inputs[i].value.substring(0, 30),
            label: label,
            inputmode: inputs[i].getAttribute("inputmode") || "",
            placeholder: (inputs[i].placeholder || "").substring(0, 30)
          });
        }
      }
      inputInfo.sort(function(a,b) { return a.y - b.y; });
      return inputInfo;
    })()
  `);
  console.log("  " + JSON.stringify(postState, null, 2));

  // ═══════════════════════════════════════════
  // STEP 10: Set SL value
  // ═══════════════════════════════════════════
  console.log("\n=== STEP 10: Fill SL = " + STOP_PRICE + " ===");
  const slFill = await ev(`
    (function() {
      function setNativeValue(el, value) {
        var ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        ns.call(el, String(value));
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));
      }

      // Find SL input: it's the one after enabling SL checkbox (y ~390-410)
      // but NOT the quantity or limit price
      var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      var candidates = [];
      for (var i = 0; i < inputs.length; i++) {
        var ir = inputs[i].getBoundingClientRect();
        if (ir.y > 380 && ir.y < 430 && ir.width > 50) {
          candidates.push({ el: inputs[i], y: ir.y, val: inputs[i].value });
        }
      }
      candidates.sort(function(a,b) { return a.y - b.y; });
      if (candidates.length > 0) {
        setNativeValue(candidates[0].el, "${STOP_PRICE}");
        return { set: true, y: Math.round(candidates[0].y), oldVal: candidates[0].val };
      }
      return { set: false, candidates: candidates.length };
    })()
  `);
  console.log("  SL fill: " + JSON.stringify(slFill));
  await sleep(500);
  await screenshot(client, "10_sl_filled");

  // ═══════════════════════════════════════════
  // STEP 11: Set TP value
  // ═══════════════════════════════════════════
  console.log("\n=== STEP 11: Fill TP = " + TARGET_PRICE + " ===");
  const tpFill = await ev(`
    (function() {
      function setNativeValue(el, value) {
        var ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        ns.call(el, String(value));
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));
      }

      var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      var candidates = [];
      for (var i = 0; i < inputs.length; i++) {
        var ir = inputs[i].getBoundingClientRect();
        if (ir.y > 460 && ir.y < 520 && ir.width > 50) {
          candidates.push({ el: inputs[i], y: ir.y, val: inputs[i].value });
        }
      }
      candidates.sort(function(a,b) { return a.y - b.y; });
      if (candidates.length > 0) {
        setNativeValue(candidates[0].el, "${TARGET_PRICE}");
        return { set: true, y: Math.round(candidates[0].y), oldVal: candidates[0].val };
      }
      return { set: false, candidates: candidates.length };
    })()
  `);
  console.log("  TP fill: " + JSON.stringify(tpFill));
  await sleep(500);
  await screenshot(client, "11_tp_filled");

  // ═══════════════════════════════════════════
  // STEP 12: Final verification — read ALL values and look for error messages
  // ═══════════════════════════════════════════
  console.log("\n=== STEP 12: Final verification ===");
  const final = await ev(`
    (function() {
      var btn = document.querySelector('[data-name="place-and-modify-button"]');
      var btnText = btn ? btn.textContent.trim().substring(0, 120) : "NOT FOUND";
      var btnDisabled = btn ? btn.disabled : null;

      // Read all inputs
      var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      var vals = [];
      for (var i = 0; i < inputs.length; i++) {
        var ir = inputs[i].getBoundingClientRect();
        if (ir.y > 180 && ir.y < 650 && ir.width > 50) {
          vals.push({ y: Math.round(ir.y), v: inputs[i].value.substring(0, 30), readonly: inputs[i].readOnly });
        }
      }
      vals.sort(function(a,b) { return a.y - b.y; });

      // Look for ANY error/warning messages on the page
      var errors = [];
      var all = document.querySelectorAll('[class*="error"], [class*="warning"], [class*="invalid"], [role="alert"], [class*="toast"]');
      for (var k = 0; k < Math.min(all.length, 15); k++) {
        var t = (all[k].textContent || "").trim();
        if (t.length > 2 && t.length < 200) errors.push(t.substring(0, 100));
      }

      // Check for red borders or validation indicators on inputs
      var invalidFields = [];
      var allInputs = document.querySelectorAll('input');
      for (var m = 0; m < allInputs.length; m++) {
        var r2 = allInputs[m].getBoundingClientRect();
        if (r2.y > 180 && r2.y < 650) {
          var borderColor = window.getComputedStyle(allInputs[m]).borderColor;
          var hasError = allInputs[m].classList.toString().indexOf('error') >= 0 ||
                         borderColor.indexOf('255, 0, 0') >= 0 ||
                         borderColor.indexOf('red') >= 0;
          if (hasError) invalidFields.push({ y: Math.round(r2.y), borderColor: borderColor });
        }
      }

      return {
        button: btnText,
        buttonDisabled: btnDisabled,
        inputs: vals,
        errors: errors,
        invalidFields: invalidFields
      };
    })()
  `);
  console.log(JSON.stringify(final, null, 2));
  await screenshot(client, "12_final_before_place");

  // ═══════════════════════════════════════════
  // STEP 13: Place order and capture result
  // ═══════════════════════════════════════════
  console.log("\n=== STEP 13: Click Place ===");
  const placed = await ev('(function(){ var b=document.querySelector(\'[data-name="place-and-modify-button"]\'); if(!b) return {error:"no button"}; b.click(); return {clicked:true}; })()');
  console.log("  " + JSON.stringify(placed));
  await sleep(2000);
  await screenshot(client, "13_after_place");

  // Check for post-place errors/notifications
  const postPlace = await ev(`
    (function() {
      var errors = [];
      var all = document.querySelectorAll('[class*="error"], [class*="warning"], [role="alert"], [class*="toast"], [class*="notification"]');
      for (var k = 0; k < Math.min(all.length, 15); k++) {
        var t = (all[k].textContent || "").trim();
        if (t.length > 3 && t.length < 200 && t.indexOf("1") === -1) errors.push(t.substring(0, 120));
      }
      // Also check for the order ticket still being open (= order didn't go through)
      var cancelBtn = document.querySelector('[data-name="cancel-button"]');
      var ticketOpen = !!(cancelBtn && cancelBtn.getBoundingClientRect().width > 0);

      return { errors: errors, ticketStillOpen: ticketOpen };
    })()
  `);
  console.log("  Post-place: " + JSON.stringify(postPlace));

  await client.close();
  console.log("\n=== DONE — " + ssNum + " screenshots saved to shared/screenshots/ ===");
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
