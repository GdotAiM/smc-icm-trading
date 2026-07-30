// Check both Positions AND Orders tabs
const CDP = require("./cdp_client.cjs");

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function readTable() {
    return await ev(`(function() {
      var tables = document.querySelectorAll("table");
      for (var i = 0; i < tables.length; i++) {
        var r = tables[i].getBoundingClientRect();
        if (r.y > 400 && r.width > 400) {
          var rows = tables[i].querySelectorAll("tr");
          var data = [];
          for (var j = 1; j < Math.min(rows.length, 10); j++) {
            data.push(rows[j].textContent.trim().substring(0, 160));
          }
          return data;
        }
      }
      return [];
    })()`);
  }

  // Check Positions
  console.log("=== POSITIONS ===");
  await ev(`(function(){ var bs=document.querySelectorAll("button"); for(var i=0;i<bs.length;i++){ if(bs[i].textContent.trim()==="Positions"){ bs[i].click(); } } })()`);
  await sleep(1500);
  const pos = await readTable();
  console.log(pos.length + " positions:");
  pos.forEach(p => console.log("  " + p));

  // Check Orders
  console.log("\n=== ORDERS ===");
  await ev(`(function(){ var bs=document.querySelectorAll("button"); for(var i=0;i<bs.length;i++){ if(bs[i].textContent.trim()==="Orders"){ bs[i].click(); } } })()`);
  await sleep(1500);
  const ord = await readTable();
  console.log(ord.length + " orders:");
  ord.forEach(o => console.log("  " + o));

  await client.close();
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
