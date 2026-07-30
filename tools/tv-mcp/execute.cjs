// ONE end-to-end trade: switch → open → fill → place → verify
const CDP = require("./cdp_client.cjs");
const fs = require("fs");
const path = require("path");

// Usage: node execute.cjs PAIR SIDE SL TP QTY
const PAIR = process.argv[2] || "XAUUSD";
const SIDE = (process.argv[3] || "BUY").toUpperCase();
const STOP_PRICE = process.argv[4];
const TARGET_PRICE = process.argv[5];
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

  console.log("=== " + SIDE + " " + PAIR + " | SL: " + (STOP_PRICE || "auto") + " | TP: " + (TARGET_PRICE || "auto") + " | Qty: " + QTY + " ===\n");

  // ═══ 1. Switch symbol via keyboard (syncs chart + bar) ═══
  console.log("1. Switching to " + PAIR + "...");
  await client.Input.dispatchMouseEvent({ type: "mouseMoved", x: 800, y: 400 });
  await sleep(200);
  await client.Input.dispatchMouseEvent({ type: "mousePressed", x: 800, y: 400, button: "left", clickCount: 1 });
  await client.Input.dispatchMouseEvent({ type: "mouseReleased", x: 800, y: 400, button: "left" });
  await sleep(300);

  for (let i = 0; i < 3; i++) {
    await client.Input.dispatchKeyEvent({ type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await client.Input.dispatchKeyEvent({ type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(100);
  }
  await sleep(300);
  await client.Input.insertText({ text: PAIR });
  await sleep(2000);
  await client.Input.dispatchKeyEvent({ type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await client.Input.dispatchKeyEvent({ type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(5000);

  const chartSym = await ev(`window.TradingViewApi._activeChartWidgetWV.value().symbol();`);
  const barText = await ev(`(function(){ var b=document.querySelector('[data-name="buy-sell-buttons"]'); return b?b.textContent.trim().substring(0,60):"?"; })()`);
  console.log("   Chart: " + chartSym + " | Bar: " + barText);

  // ═══ 2. Ensure bottom panel expanded ═══
  console.log("2. Panel...");
  let pH = await ev(`(function(){ var b=document.querySelector('[class*="layout__area--bottom"]'); return b?b.offsetHeight:0; })()`);
  if (pH < 200) {
    await ev(`(function(){ var btns=document.querySelectorAll("button"); for(var i=0;i<btns.length;i++){ if(btns[i].textContent.trim().indexOf("Paper")>=0){ btns[i].click(); return; } } })()`);
    await sleep(1500);
  }
  pH = await ev(`(function(){ var b=document.querySelector('[class*="layout__area--bottom"]'); return b?b.offsetHeight:0; })()`);
  console.log("   Height: " + pH);

  // ═══ 3. Open ticket ═══
  console.log("3. Opening ticket...");
  await ev(`(function(){ var b=document.querySelector('[data-name="cancel-button"]'); if(b)b.click(); })()`);
  await sleep(500);
  await ev(`(function(){ var b=document.querySelector('[data-name="${SIDE_BTN}"]'); if(b)b.click(); })()`);
  await sleep(2000);

  let placeBtn = await ev(`(function(){ var b=document.querySelector('[data-name="place-and-modify-button"]'); return b?b.textContent.trim().substring(0,80):"NONE"; })()`);
  console.log("   Place btn: " + placeBtn);
  if (placeBtn === "NONE") { console.log("FAILED"); process.exit(1); }

  // ═══ 4. Select Market ═══
  await ev(`(function(){ var bs=document.querySelectorAll("button"); for(var i=0;i<bs.length;i++){ if(bs[i].textContent.trim()==="Market"){ bs[i].click(); return; } } })()`);
  await sleep(400);

  // ═══ 5. Fill Quantity ═══
  await ev(`(function() {
    function setV(el,v){var ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;ns.call(el,String(v));el.dispatchEvent(new Event("input",{bubbles:true}));}
    var inputs=document.querySelectorAll('input[type="text"],input:not([type])');
    for(var i=0;i<inputs.length;i++){var ir=inputs[i].getBoundingClientRect();if(ir.y>250&&ir.y<320&&ir.width>50){setV(inputs[i],"${QTY}");return;}}
  })()`);
  await sleep(300);

  // ═══ 6. Enable SL + TP ═══
  await ev(`(function(){var cbs=document.querySelectorAll('input[type="checkbox"]');for(var i=0;i<cbs.length;i++){var cr=cbs[i].getBoundingClientRect();if(cr.y>330&&cr.y<550&&!cbs[i].checked)cbs[i].click();}})()`);
  await sleep(700);

  // ═══ 7. Find SL/TP inputs by reading their LABELS ═══
  // TradingView order: TP checkbox first (y~367), SL checkbox second (y~451)
  // TP input at y~399, SL input at y~483
  // We identify them by finding the label text near each input
  const sltpInfo = await ev(`(function() {
    function setV(el,v){var ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;ns.call(el,String(v));el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));}

    var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
    var tpInput = null, slInput = null;

    for (var j = 0; j < inputs.length; j++) {
      var ir = inputs[j].getBoundingClientRect();
      if (ir.y > 350 && ir.y < 550 && ir.width > 50 && !inputs[j].readOnly) {
        // Find nearest label text ABOVE this input
        var bestText = "";
        var bestDist = 50;
        var all = document.querySelectorAll("*");
        for (var k = 0; k < all.length; k++) {
          var lr = all[k].getBoundingClientRect();
          var txt = (all[k].textContent || "").trim();
          var dist = ir.y - (lr.y + lr.height);
          if (dist > 0 && dist < bestDist && txt.length > 2 && txt.length < 40) {
            bestDist = dist; bestText = txt;
          }
        }
        var lower = bestText.toLowerCase();
        if (lower.indexOf("take profit") >= 0 || lower.indexOf("take") >= 0) tpInput = inputs[j];
        else if (lower.indexOf("stop loss") >= 0 || lower.indexOf("stop") >= 0) slInput = inputs[j];
      }
    }

    var log = {};
    if (tpInput) { setV(tpInput, "${TARGET_PRICE}"); log.tpSet = true; log.tpY = Math.round(tpInput.getBoundingClientRect().y); }
    if (slInput) { setV(slInput, "${STOP_PRICE}"); log.slSet = true; log.slY = Math.round(slInput.getBoundingClientRect().y); }

    // Fallback: if labels not found, use position (TP=y~399, SL=y~483)
    if (!tpInput || !slInput) {
      var refs = [];
      for (var m = 0; m < inputs.length; m++) {
        var ir2 = inputs[m].getBoundingClientRect();
        if (ir2.y > 350 && ir2.y < 550 && ir2.width > 50 && !inputs[m].readOnly) {
          refs.push({ el: inputs[m], y: ir2.y });
        }
      }
      refs.sort(function(a,b){ return a.y - b.y; });
      if (refs.length >= 2) {
        if (!tpInput) { setV(refs[0].el, "${TARGET_PRICE}"); log.tpSet = true; log.tpY = Math.round(refs[0].y); log.tpFallback = true; }
        if (!slInput) { setV(refs[1].el, "${STOP_PRICE}"); log.slSet = true; log.slY = Math.round(refs[1].y); log.slFallback = true; }
      }
    }

    return log;
  })()`);
  console.log("   SL/TP: " + JSON.stringify(sltpInfo));
  await sleep(500);

  // ═══ 8. Final check and PLACE ═══
  placeBtn = await ev(`(function(){ var b=document.querySelector('[data-name="place-and-modify-button"]'); return b?b.textContent.trim().substring(0,80):"NONE"; })()`);
  console.log("   Final btn: " + placeBtn);

  if (placeBtn === "NONE") { console.log("Ticket closed during fill"); process.exit(1); }

  // PLACE
  console.log("\n>>> CLICKING PLACE <<<");
  await ev(`(function(){ var b=document.querySelector('[data-name="place-and-modify-button"]'); if(b)b.click(); })()`);
  await sleep(3000);

  // Screenshot
  fs.mkdirSync(path.join(ROOT, "shared", "screenshots"), { recursive: true });
  const ss = await client.Page.captureScreenshot({ format: "png" });
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(ROOT, "shared", "screenshots", "trade_" + PAIR.toLowerCase() + "_" + now + ".png"), ss.data, "base64");

  // Check if ticket closed (= success)
  const closed = await ev(`(function(){ var b=document.querySelector('[data-name="place-and-modify-button"]'); return !b||b.getBoundingClientRect().width===0; })()`);
  console.log("\n" + (closed ? "✅ ORDER PLACED: " : "⚠️  Ticket still open — ") + SIDE + " " + PAIR + " " + QTY + " | SL: " + STOP_PRICE + " | TP: " + TARGET_PRICE);

  await client.close();
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
