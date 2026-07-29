// Deep scan TradingView order form
const CDP = require("./node_modules/chrome-remote-interface");

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Cancel any open, open fresh, select Limit, enable checkboxes
  await ev(`(function(){ var b=document.querySelector('[data-name="cancel-button"]'); if(b)b.click(); })()`);
  await sleep(1000);
  await ev(`(function(){ document.querySelector('[data-name="sell-order-button"]').click(); })()`);
  await sleep(1500);
  await ev(`(function(){ var bs=document.querySelectorAll("button"); for(var i=0;i<bs.length;i++){ if(bs[i].textContent.trim()==="Limit"){ bs[i].click(); } } })()`);
  await sleep(500);
  await ev(`(function(){ var cbs=document.querySelectorAll("input[type=checkbox]"); for(var i=0;i<cbs.length;i++){ var r=cbs[i].getBoundingClientRect(); if(r.y>250&&r.y<600&&!cbs[i].checked) cbs[i].click(); } })()`);
  await sleep(800);

  console.log("=== DEEP FORM SCAN (with SL/TP enabled) ===");
  const scan = await ev(`
    (function() {
      var results = [];
      var all = document.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var r = el.getBoundingClientRect();
        if (r.y > 180 && r.y < 700 && r.width > 30 && r.height > 12) {
          var tag = el.tagName.toLowerCase();
          var text = (el.textContent || "").trim();
          var aria = el.getAttribute("aria-label") || "";
          var dn = el.getAttribute("data-name") || "";
          var ph = el.placeholder || "";
          var val = el.value || "";
          var role = el.getAttribute("role") || "";
          var inputmode = el.getAttribute("inputmode") || "";

          var interesting = (tag === "input") || aria || dn || role || inputmode ||
            (text.length > 1 && text.length < 40 && ["button","label"].indexOf(tag) >= 0);

          if (interesting) {
            results.push({
              tag: tag,
              text: text.substring(0, 60),
              aria: aria.substring(0, 60),
              dataName: dn.substring(0, 40),
              placeholder: ph.substring(0, 30),
              value: val.substring(0, 25),
              role: role.substring(0, 30),
              inputmode: inputmode,
              y: Math.round(r.y), x: Math.round(r.x),
              w: Math.round(r.width), h: Math.round(r.height)
            });
          }
        }
        if (results.length > 50) break;
      }
      return results;
    })()
  `);
  console.log(JSON.stringify(scan, null, 2));

  // Also look specifically for elements with "limit", "stop", "take", "quantity" in their text/aria
  console.log("\n=== LABEL SEARCH ===");
  const labels = await ev(`
    (function() {
      var results = [];
      var all = document.querySelectorAll("*");
      var keywords = ["quantity", "limit", "stop", "take", "amount", "units", "price", "loss", "profit"];
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var text = (el.textContent || "").trim().toLowerCase();
        var aria = (el.getAttribute("aria-label") || "").toLowerCase();
        var r = el.getBoundingClientRect();
        if (r.y > 180 && r.y < 700 && r.width > 5 && r.height > 5) {
          for (var k = 0; k < keywords.length; k++) {
            if (text === keywords[k] || aria.indexOf(keywords[k]) >= 0) {
              results.push({
                tag: el.tagName,
                text: (el.textContent || "").trim().substring(0, 60),
                aria: (el.getAttribute("aria-label") || "").substring(0, 60),
                y: Math.round(r.y), x: Math.round(r.x),
                w: Math.round(r.width), h: Math.round(r.height)
              });
              break;
            }
          }
        }
      }
      return results;
    })()
  `);
  console.log(JSON.stringify(labels, null, 2));

  await client.close();
})().catch(e => { console.log("FATAL: " + e.message); process.exit(1); });
