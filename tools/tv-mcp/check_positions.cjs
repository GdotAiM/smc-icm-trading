// Check open positions on TV paper trading
const CDP = require("./cdp_client.cjs");

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Click Positions
  await ev(`(function(){ var btns=document.querySelectorAll("button"); for(var i=0;i<btns.length;i++){ if(btns[i].textContent.trim()==="Positions"){ btns[i].click(); } } })()`);
  await sleep(1500);

  const data = await ev(`
    (function() {
      var tables = document.querySelectorAll("table");
      for (var i = 0; i < tables.length; i++) {
        var r = tables[i].getBoundingClientRect();
        if (r.y > 550 && r.width > 400) {
          var rows = tables[i].querySelectorAll("tr");
          if (rows.length <= 1) return { empty: true, header: rows[0] ? rows[0].textContent.trim().substring(0, 120) : "none" };
          var results = [];
          for (var j = 1; j < Math.min(rows.length, 8); j++) {
            results.push(rows[j].textContent.trim().substring(0, 150));
          }
          return { count: results.length, positions: results };
        }
      }
      return { error: "no positions table found" };
    })()
  `);
  console.log(JSON.stringify(data, null, 2));

  await client.close();
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
