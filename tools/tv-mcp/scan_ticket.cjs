// Scan current order ticket to find the RIGHT inputs
const CDP = require("./node_modules/chrome-remote-interface");

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const ev = async (e) => { const res = await client.Runtime.evaluate({ expression: e, returnByValue: true }); return res.result.value; };

  // Deep scan: find EVERY element in the order ticket area with labels
  const scan = await ev(`(function() {
    var results = [];
    // Find all inputs
    var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
    for (var i = 0; i < inputs.length; i++) {
      var ir = inputs[i].getBoundingClientRect();
      if (ir.y > 180 && ir.y < 650 && ir.width > 50 && ir.height > 15) {
        // Find the nearest label/text ABOVE this input
        var labelCandidates = [];
        var all = document.querySelectorAll("*");
        for (var j = 0; j < all.length; j++) {
          var lr = all[j].getBoundingClientRect();
          var txt = (all[j].textContent || "").trim();
          var dist = ir.y - (lr.y + lr.height);
          if (dist > 0 && dist < 80 && txt.length > 0 && txt.length < 40 && lr.x > ir.x - 50 && lr.x < ir.x + ir.width + 50) {
            labelCandidates.push({ text: txt, dist: Math.round(dist), tag: all[j].tagName });
          }
        }
        labelCandidates.sort(function(a,b) { return a.dist - b.dist; });
        var bestLabel = labelCandidates.length > 0 ? labelCandidates[0].text : "?";

        results.push({
          y: Math.round(ir.y),
          x: Math.round(ir.x),
          w: Math.round(ir.width),
          value: inputs[i].value.substring(0, 30),
          placeholder: (inputs[i].placeholder || "").substring(0, 30),
          readonly: inputs[i].readOnly,
          disabled: inputs[i].disabled,
          inputmode: inputs[i].getAttribute("inputmode") || "",
          type: inputs[i].type || "text",
          label: bestLabel,
          allLabels: labelCandidates.slice(0, 3).map(function(l) { return l.text; })
        });
      }
    }
    results.sort(function(a,b) { return a.y - b.y; });

    // Also find checkboxes
    var cbs = document.querySelectorAll('input[type="checkbox"]');
    for (var k = 0; k < cbs.length; k++) {
      var cr = cbs[k].getBoundingClientRect();
      if (cr.y > 330 && cr.y < 550 && cr.width > 10) {
        results.push({
          y: Math.round(cr.y), x: Math.round(cr.x),
          type: "CHECKBOX",
          checked: cbs[k].checked,
          value: cbs[k].checked ? "ON" : "OFF"
        });
      }
    }

    // Find the place button
    var placeBtn = document.querySelector('[data-name="place-and-modify-button"]');
    if (placeBtn) {
      var pr = placeBtn.getBoundingClientRect();
      results.push({
        y: Math.round(pr.y),
        type: "PLACE_BUTTON",
        value: placeBtn.textContent.trim().substring(0, 100),
        disabled: placeBtn.disabled
      });
    }

    return results;
  })()`);

  console.log(JSON.stringify(scan, null, 2));
  await client.close();
})().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
