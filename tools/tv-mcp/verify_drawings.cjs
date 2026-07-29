// Verify drawings using getAllShapes() — the correct method
const CDP = require("chrome-remote-interface");

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const api = "window.TradingViewApi._activeChartWidgetWV.value()";

  const result = await client.Runtime.evaluate({
    expression: `(function() {
      var a = ${api};
      var shapes = a.getAllShapes ? a.getAllShapes() : [];
      var lines = [];
      for (var i = 0; i < shapes.length; i++) {
        try {
          var s = shapes[i];
          var name = s.getName ? s.getName() : '?';
          var text = s.getText ? s.getText() : '';
          lines.push(name + ' | ' + text.slice(0,70));
        } catch(e) { lines.push('error: ' + e.message); }
      }
      return shapes.length + '\\n' + lines.join('\\n');
    })()`,
    returnByValue: true
  });

  console.log(result.result.value);
  await client.close();
})();
