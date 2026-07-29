// Get live price + 1m swing high from TradingView
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
        var api = window.TradingViewApi._activeChartWidgetWV.value();
        var coll = window._exposed_chartWidgetCollection;
        var w = coll.activeChartWidget._value;
        var src = w._paneWidgets._value[0]._legendWidget._mainSeriesViewModel._source;

        var bars = api._chartWidget.model().mainSeries().bars();
        var lastIdx = bars.lastIndex();
        var firstIdx = bars.firstIndex();

        // Current price (last close)
        var lastBar = bars.valueAt(lastIdx);
        var currentPrice = lastBar[4];

        // Find 1m swing high — last 20 bars
        var swingHigh = 0, swingLow = Infinity;
        var hiIdx = 0, loIdx = 0;
        var lookback = Math.max(lastIdx - 30, firstIdx);
        for (var i = lookback; i <= lastIdx; i++) {
          var b = bars.valueAt(i);
          if (b) {
            if (b[2] > swingHigh) { swingHigh = b[2]; hiIdx = i; }
            if (b[3] < swingLow) { swingLow = b[3]; loIdx = i; }
          }
        }

        // Also get the last 5 bars for context
        var last5 = [];
        for (var j = Math.max(lastIdx - 5, firstIdx); j <= lastIdx; j++) {
          var bar = bars.valueAt(j);
          if (bar) last5.push({ o: bar[1], h: bar[2], l: bar[3], c: bar[4] });
        }

        return JSON.stringify({
          symbol: src.symbol(),
          interval: src.interval(),
          currentPrice: currentPrice,
          swingHigh1m: swingHigh,
          swingHighAge: lastIdx - hiIdx + ' bars ago',
          swingLow1m: swingLow,
          swingLowAge: lastIdx - loIdx + ' bars ago',
          last5Bars: last5
        });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    })()`,
    returnByValue: true
  });

  const data = JSON.parse(result.result.value);
  console.log(JSON.stringify(data, null, 2));
  await client.close();
})();
