// ONE-SHOT trade: click, fill, place without pauses that dismiss the ticket
const CDP = require("./node_modules/chrome-remote-interface");
const fs = require("fs");

(async () => {
  const PAIR = process.argv[2] || "XAUUSD";
  const SIDE = (process.argv[3] || "BUY").toUpperCase();
  const STOP_PRICE = process.argv[4] || "4018";
  const TARGET_PRICE = process.argv[5] || "4045";
  const QTY = process.argv[6] || "100";
  const SIDE_BTN = SIDE === "SELL" ? "sell-order-button" : "buy-order-button";

  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // === 1. Click Buy/Sell button (one JS click to open ticket) ===
  console.log("1. Clicking " + SIDE + "...");
  await ev(`(function() {
    var btn = document.querySelector('[data-name="${SIDE_BTN}"]');
    if (btn) btn.click();
  })()`);
  await sleep(2000);

  // === 2. Verify ticket opened ===
  let placeText = await ev(`(function() {
    var btn = document.querySelector('[data-name="place-and-modify-button"]');
    return btn ? btn.textContent.trim().substring(0,80) : "NONE";
  })()`);
  console.log("2. Place button: " + placeText);

  if (placeText === "NONE") {
    console.log("FAILED - ticket did not open");
    await client.close();
    process.exit(1);
  }

  // === 3. Select Market ===
  await ev(`(function() {
    var bs = document.querySelectorAll("button");
    for (var i = 0; i < bs.length; i++) {
      if (bs[i].textContent.trim() === "Market") { bs[i].click(); return; }
    }
  })()`);
  await sleep(400);

  // === 4. Fill Quantity ===
  await ev(`(function() {
    function setVal(el, v) {
      var ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      ns.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
    for (var i = 0; i < inputs.length; i++) {
      var ir = inputs[i].getBoundingClientRect();
      if (ir.y > 250 && ir.y < 320 && ir.width > 50) { setVal(inputs[i], "${QTY}"); return; }
    }
  })()`);
  await sleep(300);

  // === 5. Enable SL + TP checkboxes ===
  await ev(`(function() {
    var cbs = document.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < cbs.length; i++) {
      var cr = cbs[i].getBoundingClientRect();
      if (cr.y > 330 && cr.y < 550 && !cbs[i].checked) cbs[i].click();
    }
  })()`);
  await sleep(600);

  // === 6. Fill SL + TP ===
  const fillResult = await ev(`(function() {
    function setVal(el, v) {
      var ns = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      ns.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    var refs = [];
    var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
    for (var i = 0; i < inputs.length; i++) {
      var ir = inputs[i].getBoundingClientRect();
      if (ir.y > 350 && ir.y < 550 && ir.width > 50) refs.push({ el: inputs[i], y: ir.y, val: inputs[i].value.substring(0,20), ro: inputs[i].readOnly });
    }
    refs.sort(function(a,b) { return a.y - b.y; });
    var log = { count: refs.length, fields: refs.map(function(r){ return {y:Math.round(r.y), v:r.val, ro:r.ro}; }) };
    if (refs.length >= 2 && !refs[0].ro && !refs[1].ro) {
      setVal(refs[0].el, "${STOP_PRICE}");
      setVal(refs[1].el, "${TARGET_PRICE}");
      log.filled = true;
    }
    return log;
  })()`);
  console.log("6. SL/TP: " + JSON.stringify(fillResult));
  await sleep(400);

  // === 7. Final place button check + click ===
  placeText = await ev(`(function() {
    var btn = document.querySelector('[data-name="place-and-modify-button"]');
    if (!btn) return "NONE";
    return btn.textContent.trim().substring(0, 100);
  })()`);
  console.log("7. Button: " + placeText);

  if (placeText === "NONE") {
    console.log("FAILED - ticket closed during fill");
    await client.close();
    process.exit(1);
  }

  // CLICK PLACE
  await ev(`(function() {
    var btn = document.querySelector('[data-name="place-and-modify-button"]');
    if (btn) btn.click();
  })()`);
  await sleep(2500);

  // Screenshot
  const ss = await client.Page.captureScreenshot({ format: "png" });
  fs.writeFileSync("C:/Users/cash/smc-icm-trading/shared/screenshots/quick_trade_done.png", ss.data, "base64");

  // Check result
  const result = await ev(`(function() {
    var btn = document.querySelector('[data-name="place-and-modify-button"]');
    var msgs = [];
    var all = document.querySelectorAll('[class*="toast"], [class*="notification"]');
    for (var i = 0; i < Math.min(all.length, 8); i++) {
      var t = (all[i].textContent || "").trim();
      if (t.length > 2 && t.length < 200) msgs.push(t.substring(0, 100));
    }
    return { ticketGone: !btn || btn.getBoundingClientRect().width === 0, messages: msgs };
  })()`);
  console.log("8. Result: " + JSON.stringify(result));

  if (result.ticketGone) {
    console.log("\n✅ " + SIDE + " " + PAIR + " " + QTY + " | SL: " + STOP_PRICE + " | TP: " + TARGET_PRICE);
  } else {
    console.log("\n⚠️  Ticket still open — check screenshot for errors");
  }

  await client.close();
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
