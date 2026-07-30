// Output positions as clean JSON for machine consumption
const path = require("path");
const CDP = require(path.join(__dirname, "cdp_client.cjs"));

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const t = await r.json();
  const c = t.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!c) { console.log("[]"); process.exit(0); }
  const cl = await CDP({ host: "127.0.0.1", port: 9222, target: c.id });
  await cl.Runtime.enable();
  const ev = async e => { const r = await cl.Runtime.evaluate({ expression: e, returnByValue: true }); return r.result.value; };
  const S = s => new Promise(r => setTimeout(r, s));

  await ev(`(function(){ var bs=document.querySelectorAll("button"); for(var i=0;i<bs.length;i++){ if(bs[i].textContent.trim()==="Positions"){ bs[i].click(); return; } } })()`);
  await S(1500);

  const data = await ev(`(function(){
    var ts=document.querySelectorAll("table");
    for(var i=0;i<ts.length;i++){
      var r=ts[i].getBoundingClientRect();
      if(r.y>400&&r.width>400){
        var rows=ts[i].querySelectorAll("tr");
        var result=[];
        for(var j=1;j<rows.length;j++){
          var cells=rows[j].querySelectorAll("td,th");
          var row=[];
          for(var k=0;k<cells.length;k++) row.push(cells[k].textContent.trim());
          result.push(row);
        }
        return JSON.stringify(result);
      }
    }
    return "[]";
  })()`);

  console.log(data || "[]");
  await cl.close();
})().catch(() => { console.log("[]"); });
