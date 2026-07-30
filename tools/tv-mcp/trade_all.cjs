// Place trades on all pairs — switches panel symbol between each
const CDP = require("./cdp_client.cjs");
const fs = require("fs");
const path = require("path");

const TRADES = [
  { pair: "NAS100", side: "SELL", sl: "27720", tp: "27100", qty: "1" },   // already placed but re-verify
  { pair: "XAUUSD", side: "BUY",  sl: "4018",  tp: "4045",  qty: "100" },
  { pair: "GBPUSD", side: "SELL", sl: "1.32920", tp: "1.32720", qty: "10000" },
  { pair: "EURUSD", side: "SELL", sl: "1.13870", tp: "1.13750", qty: "10000" },
];

const ROOT = "C:/Users/cash/smc-icm-trading";

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function switchPanelSymbol(targetPair) {
    // The account/symbol selector is in the bottom panel at y~610-645, x~70-180
    // It has garbled broker text but is consistently positioned
    const btn = await ev(`(function() {
      var btns = document.querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) {
        var r = btns[i].getBoundingClientRect();
        // Very specific position: panel header, left side, small height
        if (r.y > 608 && r.y < 650 && r.x > 60 && r.x < 200 && r.width > 90 && r.width < 180 && r.height > 20 && r.height < 40) {
          return { x: r.x + r.width/2, y: r.y + r.height/2, text: btns[i].textContent.trim().substring(0, 60), w: r.width };
        }
      }
      return null;
    })()`);

    if (!btn) {
      console.log("     Selector not found at y~610-645");
      return false;
    }

    console.log("     Clicking: '" + btn.text + "' at y=" + Math.round(btn.y));
    await client.Input.dispatchMouseEvent({ type: "mouseMoved", x: btn.x, y: btn.y });
    await sleep(150);
    await client.Input.dispatchMouseEvent({ type: "mousePressed", x: btn.x, y: btn.y, button: "left", clickCount: 1 });
    await client.Input.dispatchMouseEvent({ type: "mouseReleased", x: btn.x, y: btn.y, button: "left" });
    await sleep(1500);

    // Search for the pair in the dropdown
    const searchBox = await ev(`(function() {
      var inputs = document.querySelectorAll('input[type="text"], input[type="search"]');
      for (var i = 0; i < inputs.length; i++) {
        var r = inputs[i].getBoundingClientRect();
        if (r.y > 560 && r.width > 100) return { x: r.x+r.width/2, y: r.y+r.height/2 };
      }
      return null;
    })()`);

    if (searchBox) {
      await client.Input.dispatchMouseEvent({ type: "mouseMoved", x: searchBox.x, y: searchBox.y });
      await sleep(100);
      await client.Input.dispatchMouseEvent({ type: "mousePressed", x: searchBox.x, y: searchBox.y, button: "left", clickCount: 1 });
      await client.Input.dispatchMouseEvent({ type: "mouseReleased", x: searchBox.x, y: searchBox.y, button: "left" });
      await sleep(300);
      // Clear existing text
      await client.Input.dispatchKeyEvent({ type: "keyDown", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
      await client.Input.dispatchKeyEvent({ type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
      await sleep(100);
      await client.Input.insertText({ text: targetPair });
      await sleep(2000);
      // Press Enter to select first result
      await client.Input.dispatchKeyEvent({ type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await client.Input.dispatchKeyEvent({ type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await sleep(5000);
    } else {
      // No search box — try keyboard approach as fallback
      console.log("     No search, using chart keyboard switch...");
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
      await client.Input.insertText({ text: targetPair });
      await sleep(2000);
      await client.Input.dispatchKeyEvent({ type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await client.Input.dispatchKeyEvent({ type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await sleep(5000);
    }

    // Verify bar changed
    const bar = await ev(`(function(){ var b=document.querySelector('[data-name="buy-sell-buttons"]'); return b?b.textContent.trim().substring(0,60):"?"; })()`);
    console.log("     Bar after switch: " + bar);
    return true;
  }

  async function placeOne(trade) {
    const SIDE_BTN = trade.side === "SELL" ? "sell-order-button" : "buy-order-button";
    console.log("\n=== " + trade.side + " " + trade.pair + " | SL:" + trade.sl + " TP:" + trade.tp + " Qty:" + trade.qty + " ===");

    // Check current panel symbol
    const barText = await ev(`(function(){ var b=document.querySelector('[data-name="buy-sell-buttons"]'); return b?b.textContent.trim().substring(0,60):"?"; })()`);
    console.log("  Bar: " + barText);

    // Cancel any open ticket
    await ev(`(function(){ var b=document.querySelector('[data-name="cancel-button"]'); if(b)b.click(); })()`);
    await sleep(500);

    // Click Buy or Sell
    await ev(`(function(){ var b=document.querySelector('[data-name="${SIDE_BTN}"]'); if(b)b.click(); })()`);
    await sleep(2000);

    let placeText = await ev(`(function(){ var b=document.querySelector('[data-name="place-and-modify-button"]'); return b?b.textContent.trim().substring(0,80):"NONE"; })()`);
    console.log("  Ticket: " + placeText);

    if (placeText === "NONE") return { pair: trade.pair, status: "NO_TICKET" };

    // Select Market
    await ev(`(function(){ var bs=document.querySelectorAll("button"); for(var i=0;i<bs.length;i++){ if(bs[i].textContent.trim()==="Market"){ bs[i].click(); return; } } })()`);
    await sleep(400);

    // Set quantity
    await ev(`(function() {
      function setV(el,v){var ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;ns.call(el,String(v));el.dispatchEvent(new Event("input",{bubbles:true}));}
      var inputs=document.querySelectorAll('input[type="text"],input:not([type])');
      for(var i=0;i<inputs.length;i++){var ir=inputs[i].getBoundingClientRect();if(ir.y>250&&ir.y<320&&ir.width>50){setV(inputs[i],"${trade.qty}");return;}}
    })()`);
    await sleep(300);

    // Enable both checkboxes
    await ev(`(function(){var cbs=document.querySelectorAll('input[type="checkbox"]');for(var i=0;i<cbs.length;i++){var cr=cbs[i].getBoundingClientRect();if(cr.y>330&&cr.y<550&&!cbs[i].checked)cbs[i].click();}})()`);
    await sleep(700);

    // Fill TP (y~399) and SL (y~483) using label matching
    const filled = await ev(`(function() {
      function setV(el,v){var ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;ns.call(el,String(v));el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));}
      var inputs=document.querySelectorAll('input[type="text"],input:not([type])');
      var tpEl=null,slEl=null;

      for(var j=0;j<inputs.length;j++){
        var ir=inputs[j].getBoundingClientRect();
        if(ir.y>350&&ir.y<550&&ir.width>50&&!inputs[j].readOnly){
          var best="",bestD=50;
          var all=document.querySelectorAll("*");
          for(var k=0;k<all.length;k++){
            var lr=all[k].getBoundingClientRect();
            var txt=(all[k].textContent||"").trim().toLowerCase();
            var dist=ir.y-(lr.y+lr.height);
            if(dist>0&&dist<bestD&&txt.length>2&&txt.length<40){bestD=dist;best=txt;}
          }
          if(best.indexOf("take profit")>=0||best.indexOf("take")>=0)tpEl=inputs[j];
          else if(best.indexOf("stop loss")>=0||best.indexOf("stop")>=0)slEl=inputs[j];
        }
      }
      // Fallback: first ref (lower y) = TP, second (higher y) = SL
      if(!tpEl||!slEl){
        var refs=[];
        for(var m=0;m<inputs.length;m++){var ir2=inputs[m].getBoundingClientRect();if(ir2.y>350&&ir2.y<550&&ir2.width>50&&!inputs[m].readOnly)refs.push({el:inputs[m],y:ir2.y});}
        refs.sort(function(a,b){return a.y-b.y;});
        if(!tpEl&&refs.length>=1){tpEl=refs[0].el;}
        if(!slEl&&refs.length>=2){slEl=refs[1].el;}
      }

      var log={};
      if(tpEl){setV(tpEl,"${trade.tp}");log.tp=true;}
      if(slEl){setV(slEl,"${trade.sl}");log.sl=true;}
      return log;
    })()`);
    console.log("  Fill: " + JSON.stringify(filled));
    await sleep(500);

    // Verify & Place
    placeText = await ev(`(function(){ var b=document.querySelector('[data-name="place-and-modify-button"]'); return b?b.textContent.trim().substring(0,80):"NONE"; })()`);
    if (placeText === "NONE") return { pair: trade.pair, status: "TICKET_CLOSED" };

    await ev(`(function(){ var b=document.querySelector('[data-name="place-and-modify-button"]'); if(b)b.click(); })()`);
    await sleep(3000);

    const closed = await ev(`(function(){ var b=document.querySelector('[data-name="place-and-modify-button"]'); return !b||b.getBoundingClientRect().width===0; })()`);
    return { pair: trade.pair, status: closed ? "PLACED" : "UNCONFIRMED" };
  }

  const results = [];

  for (let i = 0; i < TRADES.length; i++) {
    const trade = TRADES[i];

    // Skip NAS100 — already placed
    if (i === 0) {
      console.log("\n=== SKIP NAS100 (already placed) ===");
      results.push({ pair: "NAS100", status: "ALREADY_PLACED" });
      continue;
    }

    // Switch panel to this pair
    console.log("\n--- Switching panel to " + trade.pair + " ---");
    await switchPanelSymbol(trade.pair);

    // Place
    const result = await placeOne(trade);
    results.push(result);
  }

  // Final screenshot
  fs.mkdirSync(path.join(ROOT, "shared", "screenshots"), { recursive: true });
  const ss = await client.Page.captureScreenshot({ format: "png" });
  fs.writeFileSync(path.join(ROOT, "shared", "screenshots", "all_trades_final.png"), ss.data, "base64");

  console.log("\n\n========================================");
  console.log("  RESULTS");
  console.log("========================================");
  console.table(results);

  await client.close();
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
