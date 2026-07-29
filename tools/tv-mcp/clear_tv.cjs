const CDP = require("chrome-remote-interface");

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  // Clear ALL shapes
  let res = await client.Runtime.evaluate({
    expression: `(function() {
      try {
        var api = window.TradingViewApi._activeChartWidgetWV.value();
        api.removeAllShapes();
        return "cleared";
      } catch(e) { return "error: " + e.message; }
    })()`,
    returnByValue: true,
  });
  console.log("Clear:", res.result.value);

  // Also remove all indicators
  res = await client.Runtime.evaluate({
    expression: `(function() {
      try {
        var api = window.TradingViewApi._activeChartWidgetWV.value();
        var chart = api._chartWidget;
        // Remove all studies/indicators
        try {
          var studies = chart.getAllShapes ? chart.getAllShapes() : [];
          for (var i = studies.length - 1; i >= 0; i--) {
            try { chart.removeShape(studies[i].entityId || studies[i].id); } catch(e) {}
          }
        } catch(e) {}
        // Try removeAllStudies
        try { chart.removeAllStudies(); } catch(e) {}
        return "cleaned indicators too";
      } catch(e) { return "indicator error: " + e.message; }
    })()`,
    returnByValue: true,
  });
  console.log("Indicators:", res.result.value);

  await client.close();
  console.log("Done — chart should be clean now");
})();
