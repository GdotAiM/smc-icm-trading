// Test different click methods
const CDP = require("./cdp_client.cjs");
const fs = require("fs");

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function checkTicket() {
    return await ev(`(function() {
      var cancel = document.querySelector('[data-name="cancel-button"]');
      var place = document.querySelector('[data-name="place-and-modify-button"]');
      return {
        cancelVisible: !!(cancel && cancel.getBoundingClientRect().width > 0),
        placeText: place ? place.textContent.trim().substring(0, 80) : "NONE"
      };
    })()`);
  }

  // Method 1: JS .click()
  console.log("=== Method 1: JS .click() ===");
  await ev(`(function() {
    var btn = document.querySelector('[data-name="buy-order-button"]');
    if (btn) btn.click();
  })()`);
  await sleep(2000);
  console.log(JSON.stringify(await checkTicket()));

  // Method 2: dispatchEvent
  console.log("\n=== Method 2: dispatchEvent ===");
  await ev(`(function() {
    var btn = document.querySelector('[data-name="buy-order-button"]');
    if (!btn) return;
    var r = btn.getBoundingClientRect();
    var opts = { bubbles: true, cancelable: true, view: window, clientX: r.x+r.width/2, clientY: r.y+r.height/2 };
    btn.dispatchEvent(new MouseEvent("mousedown", opts));
    btn.dispatchEvent(new MouseEvent("mouseup", opts));
    btn.dispatchEvent(new MouseEvent("click", opts));
  })()`);
  await sleep(2000);
  console.log(JSON.stringify(await checkTicket()));

  // Method 3: Click parent bar
  console.log("\n=== Method 3: Click buy-sell-buttons ===");
  await ev(`(function() {
    var bar = document.querySelector('[data-name="buy-sell-buttons"]');
    if (bar) bar.click();
  })()`);
  await sleep(2000);
  console.log(JSON.stringify(await checkTicket()));

  // Method 4: Click the sell button instead (maybe buy is broken?)
  console.log("\n=== Method 4: Click sell-order-button ===");
  await ev(`(function() {
    var btn = document.querySelector('[data-name="sell-order-button"]');
    if (btn) btn.click();
  })()`);
  await sleep(2000);
  console.log(JSON.stringify(await checkTicket()));

  // Method 5: Use React internal fiber to find click handler
  console.log("\n=== Method 5: React fiber click ===");
  await ev(`(function() {
    var btn = document.querySelector('[data-name="buy-order-button"]');
    if (!btn) return "no btn";
    // Walk up to find React fiber
    var fiberKey = Object.keys(btn).find(function(k) { return k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"); });
    if (!fiberKey) return "no fiber";
    var fiber = btn[fiberKey];
    // Try to find onClick handler in props
    while (fiber) {
      if (fiber.memoizedProps && fiber.memoizedProps.onClick) {
        fiber.memoizedProps.onClick({ stopPropagation: function(){}, preventDefault: function(){} });
        return "clicked via fiber";
      }
      if (fiber.memoizedProps && fiber.memoizedProps.onMouseDown) {
        fiber.memoizedProps.onMouseDown({ stopPropagation: function(){}, preventDefault: function(){} });
        return "mousedown via fiber";
      }
      fiber = fiber.return;
    }
    return "no handler found";
  })()`);
  await sleep(2000);
  console.log(JSON.stringify(await checkTicket()));

  const ss = await client.Page.captureScreenshot({ format: "png" });
  fs.writeFileSync("C:/Users/cash/smc-icm-trading/shared/screenshots/click_test.png", ss.data, "base64");
  console.log("\nScreenshot saved");

  await client.close();
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
