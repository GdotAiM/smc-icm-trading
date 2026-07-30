// Check form and click Place
const path = require("path");
const CDP = require(path.join(__dirname, "cdp_client.cjs"));
const fs = require("fs");

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Read current form state
  const state = await ev(`(function() {
    var btn = document.querySelector('[data-name="place-and-modify-button"]');
    if (!btn) return { error: "no place button" };
    var r = btn.getBoundingClientRect();
    var inputs = document.querySelectorAll("input[type=text], input:not([type])");
    var vals = [];
    for (var i = 0; i < inputs.length; i++) {
      var ir = inputs[i].getBoundingClientRect();
      if (ir.y > 180 && ir.y < 650 && ir.width > 50) {
        vals.push({ y: Math.round(ir.y), v: inputs[i].value.substring(0, 25), ro: inputs[i].readOnly });
      }
    }
    vals.sort(function(a,b) { return a.y - b.y; });
    return {
      buttonText: btn.textContent.trim().substring(0, 100),
      btnDisabled: btn.disabled,
      inputs: vals
    };
  })()`);
  console.log("Form state:");
  console.log(JSON.stringify(state, null, 2));

  if (state.error) {
    console.log("No place button found — ticket not open");
    process.exit(1);
  }

  // Check SL/TP values — are they right for this pair?
  const sltp = state.inputs.filter(i => i.y > 350);
  console.log("\nSL/TP fields: " + JSON.stringify(sltp));

  // Click the place button via JS
  console.log("\n=== CLICKING PLACE ===");
  await ev(`(function() {
    var btn = document.querySelector('[data-name="place-and-modify-button"]');
    if (btn) { btn.click(); return "clicked"; }
    return "not found";
  })()`);
  await sleep(3000);

  // Check what happened
  const after = await ev(`(function() {
    var btn = document.querySelector('[data-name="place-and-modify-button"]');
    var cancel = document.querySelector('[data-name="cancel-button"]');
    var msgs = [];
    var all = document.querySelectorAll('[class*="toast"], [class*="notification"], [role="alert"]');
    for (var i = 0; i < Math.min(all.length, 10); i++) {
      var t = (all[i].textContent || "").trim();
      if (t.length > 2 && t.length < 200) msgs.push(t.substring(0, 100));
    }
    return {
      ticketClosed: !btn || btn.getBoundingClientRect().width === 0 || !cancel || cancel.getBoundingClientRect().width === 0,
      messages: msgs
    };
  })()`);
  console.log(JSON.stringify(after, null, 2));

  const ss = await client.Page.captureScreenshot({ format: "png" });
  fs.writeFileSync("C:/Users/cash/smc-icm-trading/shared/screenshots/place_clicked.png", ss.data, "base64");

  if (after.ticketClosed) {
    console.log("\n✅ ORDER PLACED — ticket closed after submission");
  } else {
    console.log("\n⚠️  Ticket still open — order may have been rejected");
  }

  await client.close();
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
