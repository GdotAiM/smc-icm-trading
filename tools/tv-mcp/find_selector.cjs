// Find the trading panel symbol selector button
const CDP = require("./node_modules/chrome-remote-interface");

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };

  // Cancel any ticket first so the panel is clean
  await ev(`(function(){ var b=document.querySelector('[data-name="cancel-button"]'); if(b)b.click(); })()`);
  await new Promise(r => setTimeout(r, 500));

  // Scan ALL elements in the panel header area (y 590-660)
  const scan = await ev(`(function() {
    var results = [];
    var all = document.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var r = el.getBoundingClientRect();
      if (r.y > 590 && r.y < 660 && r.width > 30 && r.height > 15) {
        var tag = el.tagName.toLowerCase();
        var text = (el.textContent || "").trim();
        var aria = (el.getAttribute("aria-label") || "").substring(0, 60);
        var dn = (el.getAttribute("data-name") || "").substring(0, 40);
        var cls = (el.className || "").substring(0, 50);
        var role = el.getAttribute("role") || "";
        var tabindex = el.getAttribute("tabindex") || "";
        var onclick = el.onclick ? "has onclick" : "";

        results.push({
          tag: tag, y: Math.round(r.y), x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height),
          text: text.substring(0, 50), aria: aria, dn: dn, role: role, tabindex: tabindex, onclick: onclick
        });
      }
      if (results.length > 30) break;
    }
    return results;
  })()`);

  console.log(JSON.stringify(scan, null, 2));
  await client.close();
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
