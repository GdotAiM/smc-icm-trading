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
      try {
        var coll = window._exposed_chartWidgetCollection;
        var w = coll.activeChartWidget._value;
        var src = w._paneWidgets._value[0]._legendWidget._mainSeriesViewModel._source;

        var shapes = ${api}.getShapes ? ${api}.getShapes() : [];
        var lines = [];
        for (var i = 0; i < shapes.length; i++) {
          var s = shapes[i];
          var name = '';
          try { name = s.getName(); } catch(e) { name = '?'; }
          var text = '';
          try { text = s.getText(); } catch(e) { text = ''; }
          var price = '';
          try { var pts = s.getPoints(); price = pts && pts.length > 0 ? pts[0].price : '?'; } catch(e) { price = '?'; }
          lines.push(name + ' | ' + (text || '').slice(0,50) + ' | $' + price);
        }

        return shapes.length + ' shapes\\n' + lines.join('\\n');
      } catch(e) { return 'ERROR: ' + e.message; }
    })()`,
    returnByValue: true
  });

  console.log(result.result.value);
  await client.close();
})();
