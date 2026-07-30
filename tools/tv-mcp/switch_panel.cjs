// Switch trading panel symbol to match chart
const CDP = require("./cdp_client.cjs");
const fs = require("fs");

(async () => {
  const TARGET = process.argv[2] || "XAUUSD";

  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Close any open ticket
  await ev(`(function(){ var b=document.querySelector('[data-name="cancel-button"]'); if(b)b.click(); })()`);
  await sleep(500);

  // Find the symbol/account selector in the trading panel
  console.log("=== Find panel selector ===");
  const selector = await ev(`(function() {
    var btns = document.querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      var r = btns[i].getBoundingClientRect();
      var t = btns[i].textContent.trim();
      if (r.y > 600 && r.y < 670 && r.width > 80 && r.width < 200 && t.length > 3) {
        return { text: t.substring(0,50), x: r.x+r.width/2, y: r.y+r.height/2, w: r.width };
      }
    }
    return null;
  })()`);
  console.log("Selector: " + JSON.stringify(selector));

  if (!selector) { console.log("Not found"); process.exit(1); }

  // Click it with CDP mouse
  await client.Input.dispatchMouseEvent({ type: "mouseMoved", x: selector.x, y: selector.y });
  await sleep(100);
  await client.Input.dispatchMouseEvent({ type: "mousePressed", x: selector.x, y: selector.y, button: "left", clickCount: 1 });
  await client.Input.dispatchMouseEvent({ type: "mouseReleased", x: selector.x, y: selector.y, button: "left" });
  await sleep(1200);

  const ss1 = await client.Page.captureScreenshot({ format: "png" });
  fs.writeFileSync("C:/Users/cash/smc-icm-trading/shared/screenshots/panel_dropdown.png", ss1.data, "base64");

  // Find search input in the dropdown
  const searchBox = await ev(`(function() {
    var inputs = document.querySelectorAll('input[type="text"], input[type="search"]');
    for (var i = 0; i < inputs.length; i++) {
      var r = inputs[i].getBoundingClientRect();
      if (r.y > 550 && r.width > 100) return { x: r.x+r.width/2, y: r.y+r.height/2 };
    }
    return null;
  })()`);
  console.log("Search: " + JSON.stringify(searchBox));

  if (searchBox) {
    // Click into search
    await client.Input.dispatchMouseEvent({ type: "mouseMoved", x: searchBox.x, y: searchBox.y });
    await sleep(100);
    await client.Input.dispatchMouseEvent({ type: "mousePressed", x: searchBox.x, y: searchBox.y, button: "left", clickCount: 1 });
    await client.Input.dispatchMouseEvent({ type: "mouseReleased", x: searchBox.x, y: searchBox.y, button: "left" });
    await sleep(300);

    // Select all and type
    await client.Input.dispatchKeyEvent({ type: "keyDown", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
    await client.Input.dispatchKeyEvent({ type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
    await sleep(100);
    await client.Input.insertText({ text: TARGET });
    await sleep(1500);

    const ss2 = await client.Page.captureScreenshot({ format: "png" });
    fs.writeFileSync("C:/Users/cash/smc-icm-trading/shared/screenshots/panel_typed.png", ss2.data, "base64");

    // Enter
    await client.Input.dispatchKeyEvent({ type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await client.Input.dispatchKeyEvent({ type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await sleep(3000);
  } else {
    // No search — look for menu items and click the matching one
    const items = await ev(`(function() {
      var items = document.querySelectorAll('[role="menuitem"], [role="option"]');
      var results = [];
      for (var i = 0; i < Math.min(items.length, 20); i++) {
        var t = items[i].textContent.trim();
        var r = items[i].getBoundingClientRect();
        if (t.length > 0 && t.length < 30) results.push({ text: t, x: r.x+r.width/2, y: r.y+r.height/2 });
      }
      return results;
    })()`);
    console.log("Menu items: " + JSON.stringify(items));

    const match = items.find(i => i.text.toUpperCase().indexOf(TARGET) >= 0);
    if (match) {
      await client.Input.dispatchMouseEvent({ type: "mouseMoved", x: match.x, y: match.y });
      await sleep(100);
      await client.Input.dispatchMouseEvent({ type: "mousePressed", x: match.x, y: match.y, button: "left", clickCount: 1 });
      await client.Input.dispatchMouseEvent({ type: "mouseReleased", x: match.x, y: match.y, button: "left" });
      await sleep(2000);
    }
  }

  // Verify
  const barText = await ev(`(function() {
    var b = document.querySelector('[data-name="buy-sell-buttons"]');
    return b ? b.textContent.trim().substring(0, 60) : "no bar";
  })()`);
  console.log("\nBar now: " + barText);

  const ss3 = await client.Page.captureScreenshot({ format: "png" });
  fs.writeFileSync("C:/Users/cash/smc-icm-trading/shared/screenshots/panel_switched.png", ss3.data, "base64");

  await client.close();
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
