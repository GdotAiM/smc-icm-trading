// Test a single createShape call with full error/return checking
const CDP = require("chrome-remote-interface");

async function run(client, expr) {
  const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
  if (r.exceptionDetails) {
    return { error: r.exceptionDetails.text || JSON.stringify(r.exceptionDetails) };
  }
  return { value: r.result.value };
}

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const api = "window.TradingViewApi._activeChartWidgetWV.value()";

  // Get time
  const timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = ${api}._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      return JSON.stringify({ tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  const { tEnd } = JSON.parse(timeRes.result.value);

  // Test 1: Check if createShape method exists
  console.log("Test 1: Method existence");
  const t1 = await run(client, `(function() {
    var a = ${api};
    return JSON.stringify({
      hasCreateShape: typeof a.createShape === 'function',
      hasGetShapes: typeof a.getShapes === 'function',
      hasRemoveAllShapes: typeof a.removeAllShapes === 'function',
      hasCreateMultipointShape: typeof a.createMultipointShape === 'function'
    });
  })()`);
  console.log(JSON.stringify(t1));

  // Test 2: getShapes before
  console.log("\nTest 2: getShapes() before drawing");
  const t2 = await run(client, `(function() {
    var a = ${api};
    var shapes = a.getShapes();
    return JSON.stringify({ count: shapes ? shapes.length : -1, isArray: Array.isArray(shapes) });
  })()`);
  console.log(JSON.stringify(t2));

  // Test 3: Actually call createShape and capture the return
  console.log("\nTest 3: createShape call with return");
  const t3 = await run(client, `(function() {
    try {
      var a = ${api};
      var result = a.createShape(
        { time: ${tEnd + 1000}, price: 1.33000 },
        { shape: "horizontal_line", text: "TEST-SINGLE", overrides: { "linecolor": "#FF0000", "linewidth": 2 } }
      );
      return JSON.stringify({ result: result, type: typeof result });
    } catch(e) {
      return JSON.stringify({ error: e.message, stack: e.stack ? e.stack.slice(0,200) : '' });
    }
  })()`);
  console.log(JSON.stringify(t3));

  // Test 4: getShapes after
  console.log("\nTest 4: getShapes() after drawing");
  const t4 = await run(client, `(function() {
    var a = ${api};
    var shapes = a.getShapes();
    return JSON.stringify({ count: shapes ? shapes.length : -1 });
  })()`);
  console.log(JSON.stringify(t4));

  // Test 5: Try different shape access patterns
  console.log("\nTest 5: Alternative shape access");
  const t5 = await run(client, `(function() {
    var a = ${api};
    var results = {};

    // Try entity store
    try {
      if (a._entityStore) {
        results.entityStoreKeys = Object.keys(a._entityStore).length;
      }
    } catch(e) {}

    // Try getAllShapes
    try {
      if (typeof a.getAllShapes === 'function') {
        var all = a.getAllShapes();
        results.getAllShapesCount = all ? all.length : -1;
      }
    } catch(e) { results.getAllShapesError = e.message; }

    // Try shapes() method
    try {
      if (typeof a.shapes === 'function') {
        results.shapesCount = a.shapes().length;
      }
    } catch(e) {}

    // Try to see what methods exist on the API object
    var methods = [];
    for (var k in a) {
      if (typeof a[k] === 'function' && (k.toLowerCase().indexOf('shape') >= 0 || k.toLowerCase().indexOf('draw') >= 0)) {
        methods.push(k);
      }
    }
    results.shapeMethods = methods;

    return JSON.stringify(results);
  })()`);
  console.log(JSON.stringify(t5));

  await client.close();
})();
