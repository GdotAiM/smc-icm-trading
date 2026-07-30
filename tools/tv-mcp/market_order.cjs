// Quick market order on TV paper trading
// Usage: node market_order.cjs [PAIR] [SIDE] [SL] [TP] [QTY]
const CDP = require("./cdp_client.cjs");

const PAIR = process.argv[2] || "GBPUSD";
const SIDE = (process.argv[3] || "SELL").toUpperCase();
const STOP = process.argv[4] || "1.32875";
const TARGET = process.argv[5] || "1.32805";
const QTY = process.argv[6] || "10000";
const TV_SYMBOLS = { DXY: "USDOLLAR" };
const TV_SYM = TV_SYMBOLS[PAIR] || PAIR;
const SIDE_BTN = SIDE === "SELL" ? "sell-order-button" : "buy-order-button";

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const fs = require("fs");
  const path = require("path");
  const ROOT = "C:/Users/cash/smc-icm-trading";

  // Switch symbol first
  await ev(`window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${TV_SYM}", {});`);
  await sleep(3000);

  // Cancel any open ticket
  await ev(`(function(){ var b=document.querySelector('[data-name="cancel-button"]'); if(b)b.click(); })()`);
  await sleep(800);

  // Click Sell button to open ticket
  await ev(`(function(){ document.querySelector('[data-name="${SIDE_BTN}"]').click(); })()`);
  await sleep(1200);

  // Select Market (should already be default, but ensure it)
  await ev(`(function(){ var bs=document.querySelectorAll("button"); for(var i=0;i<bs.length;i++){ if(bs[i].textContent.trim()==="Market"){ bs[i].click(); } } })()`);
  await sleep(400);

  // Set quantity to 10000 via label-matching DOM approach
  const fillResult = await ev(`
    (function() {
      function setNativeValue(el, value) {
        var ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        ns.call(el, String(value));
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }

      var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      var log = [];
      for (var i = 0; i < inputs.length; i++) {
        var ir = inputs[i].getBoundingClientRect();
        if (ir.y > 180 && ir.y < 350 && ir.width > 50) {
          // Find nearest label above
          var label = "";
          var all = document.querySelectorAll("label, span, button, p");
          var bestDist = 100;
          for (var j = 0; j < all.length; j++) {
            var lr = all[j].getBoundingClientRect();
            var txt = (all[j].textContent || "").trim();
            var dist = ir.y - (lr.y + lr.height);
            if (dist > 0 && dist < bestDist && txt.length > 0 && txt.length < 30) { bestDist = dist; label = txt; }
          }
          log.push({ y: Math.round(ir.y), label: label, val: inputs[i].value.substring(0, 20) });
          if (label === "Units" || label === "Quantity") {
            setNativeValue(inputs[i], "${QTY}");
          }
        }
      }
      return log;
    })()
  `);
  console.log("Inputs found: " + JSON.stringify(fillResult));

  // Enable SL + TP checkboxes
  await ev(`(function(){ var cbs=document.querySelectorAll('input[type="checkbox"]'); for(var i=0;i<cbs.length;i++){ var r=cbs[i].getBoundingClientRect(); if(r.y>330&&r.y<550&&!cbs[i].checked) cbs[i].click(); } })()`);
  await sleep(500);

  // Fill SL/TP
  await ev(`
    (function() {
      function setNativeValue(el, value) {
        var ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        ns.call(el, String(value));
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      var refs = [];
      for (var i = 0; i < inputs.length; i++) {
        var ir = inputs[i].getBoundingClientRect();
        if (ir.y > 350 && ir.y < 550 && ir.width > 50) refs.push({ el: inputs[i], y: ir.y });
      }
      refs.sort(function(a,b) { return a.y - b.y; });
      if (refs.length >= 2) {
        setNativeValue(refs[0].el, "${TARGET}");
        setNativeValue(refs[1].el, "${STOP}");
      }
    })()
  `);
  await sleep(400);

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
  console.log("Button: " + verify.button);
  console.log("Values: " + JSON.stringify(verify.inputs));

  // Place!
  console.log("\n=== PLACING MARKET ORDER ===");
  const placed = await ev(`(function(){ var b=document.querySelector('[data-name="place-and-modify-button"]'); if(!b) return false; b.click(); return true; })()`);
  console.log("Placed: " + placed);
  await sleep(3000);

  // ═══ VERIFY ORDER APPEARED IN POSITIONS (with retries) ═══
  let verified = false;
  const MAX_RETRIES = 4;
  const RETRY_DELAY = 3000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await ev(`(function(){ var bs=document.querySelectorAll("button"); for(var i=0;i<bs.length;i++){ if(bs[i].textContent.trim()==="Positions"){ bs[i].click(); return; } } })()`);
      await sleep(1500);

      const check = await ev(`(function() {
        var tables = document.querySelectorAll("table");
        for (var i = 0; i < tables.length; i++) {
          var r = tables[i].getBoundingClientRect();
          if (r.y > 400 && r.width > 400) {
            var rows = tables[i].querySelectorAll("tr");
            for (var j = 1; j < Math.min(rows.length, 10); j++) {
              var txt = rows[j].textContent;
              if (txt.indexOf("${PAIR}") >= 0 && txt.indexOf("${SIDE === 'SELL' ? 'Short' : 'Long'}") >= 0) {
                return { found: true, row: txt.substring(0, 120) };
              }
            }
          }
        }
        return { found: false };
      })()`);

      if (check?.found) {
        verified = true;
        console.log("Verified in positions: ✅ (attempt " + attempt + ")");
        break;
      }
      if (attempt < MAX_RETRIES) {
        console.log("  Position not yet visible — retrying in " + (RETRY_DELAY/1000) + "s (attempt " + attempt + "/" + MAX_RETRIES + ")");
        await sleep(RETRY_DELAY);
      }
    } catch(e) {
      console.log("  Verify attempt " + attempt + " failed: " + e.message);
      await sleep(RETRY_DELAY);
    }
  }

  if (!verified) {
    console.error("🛑 ORDER MAY BE REJECTED — Not found in positions after " + MAX_RETRIES + " attempts");
    console.error("   Pair: " + PAIR + " | Side: " + SIDE + " | Verify manually on TV screen");
    const { logError } = require("./logger.cjs");
    logError("market_order", "ORDER_UNVERIFIED", new Error("Order not found in positions after " + MAX_RETRIES + " retries for " + PAIR + " " + SIDE));
  }

  fs.mkdirSync(path.join(ROOT, "shared", "screenshots"), { recursive: true });
  const ss = await client.Page.captureScreenshot({ format: "png" });
  const ssName = PAIR.toLowerCase() + "_market_" + SIDE.toLowerCase() + ".png";
  fs.writeFileSync(path.join(ROOT, "shared", "screenshots", ssName), ss.data, "base64");

  if (verified) {
    console.log("\n✅ MARKET " + SIDE + " " + PAIR + " " + QTY + " units | SL: " + STOP + " | TP: " + TARGET);
  } else {
    console.log("\n⚠️  UNVERIFIED — " + PAIR + " " + SIDE + " " + QTY + " not confirmed in positions after " + MAX_RETRIES + " attempts");
    console.log("   Check TV screen — order may have placed but verification timed out");
    console.log("   If trade IS visible on screen, verification has a timing issue (not a rejection)");
  }
  await client.close();
  if (!verified) process.exit(2); // exit 2 = unverified (not necessarily rejected)
})().catch(e => { console.log("FATAL: " + e.message); process.exit(1); });
