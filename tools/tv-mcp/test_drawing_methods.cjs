// Deep API exploration — find ALL create/draw/add methods on every TV object
const CDP = require("chrome-remote-interface");

async function evalExpr(client, expr) {
  const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
  try { return JSON.parse(r.result.value); } catch { return r.result.value; }
}

(async () => {
  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.error("No chart tab found"); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  // Find ALL methods containing 'create' or 'add' on ALL reachable TV objects
  const results = await evalExpr(client, `(function() {
    var findings = [];

    function explore(name, obj, depth) {
      if (!obj || depth > 2) return;
      if (typeof obj !== 'object' && typeof obj !== 'function') return;

      var methods = [];
      try {
        for (var key in obj) {
          if (typeof obj[key] === 'function') {
            var kl = key.toLowerCase();
            if (kl.indexOf('create') >= 0 || kl.indexOf('add') >= 0 ||
                kl.indexOf('draw') >= 0 || kl.indexOf('set') >= 0 ||
                kl.indexOf('apply') >= 0 || kl.indexOf('execute') >= 0) {
              methods.push(key);
            }
          }
        }
      } catch(e) {}

      if (methods.length > 0) {
        findings.push({ path: name, methodCount: methods.length, methods: methods.slice(0,25) });
      }
    }

    // Top-level APIs
    explore('window', window, 0);
    explore('ChartApiInstance', window.ChartApiInstance, 1);

    // _exposed objects
    var coll = window._exposed_chartWidgetCollection;
    if (coll) {
      explore('chartWidgetCollection', coll, 0);
      var w = coll.activeChartWidget._value;
      if (w) {
        explore('activeChartWidget', w, 1);
        explore('chartWidget', w._chartWidget, 1);
        if (w._chartWidget) {
          explore('chartWidget.model', w._chartWidget.model(), 1);
        }
        var pane = w._paneWidgets._value[0];
        if (pane) explore('paneWidget', pane, 1);
      }
    }

    // Session _chartApi
    var api = window.ChartApiInstance;
    if (api && api._sessions) {
      var sessions = Object.keys(api._sessions);
      var sid = sessions.find(function(s) { return s.startsWith("cs_"); }) || sessions[0];
      var session = api._sessions[sid];
      if (session) {
        explore('session', session, 1);
        if (session._chartApi) explore('session._chartApi', session._chartApi, 1);
      }
    }

    // Any window property that looks chart-related
    var windowKeys = Object.keys(window).filter(function(k) {
      var kl = k.toLowerCase();
      return kl.indexOf('chart') >= 0 || kl.indexOf('widget') >= 0 ||
             kl.indexOf('api') >= 0 || kl.indexOf('tv') >= 0;
    });
    for (var i = 0; i < windowKeys.length; i++) {
      var val = window[windowKeys[i]];
      if (val && typeof val === 'object') {
        explore('window.' + windowKeys[i], val, 0);
      }
    }

    return JSON.stringify(findings);
  })()`);

  // Print everything
  for (const f of (results || [])) {
    console.error(`\n=== ${f.path} (${f.methodCount} methods) ===`);
    console.log(f.path + ': ' + f.methods.join(', '));
  }

  // ── NOW: actually try one more createStudy and check IMMEDIATELY ──
  console.error("\n\n=== Immediate check after createStudy ===");
  const test = await evalExpr(client, `(function() {
    var api = window.ChartApiInstance;
    var sessions = Object.keys(api._sessions || {});
    var sid = sessions.find(function(s) { return s.startsWith("cs_"); }) || sessions[0];

    // Call createStudy
    var r = api.createStudy(sid, "hl_0", "Horizontal Line", false, false, [1.33150], null, {
      text: "FINAL-TEST",
      color: "#FF00FF",
      linewidth: 3
    });

    // Now check every possible storage location
    var check = {
      createStudyReturned: r,
      modifyStudyMapSize: Object.keys(api._modifyStudyMap || {}).length,
      modifyStudyMapSample: Object.keys(api._modifyStudyMap || {}).slice(0,5)
    };

    return JSON.stringify(check);
  })()`);
  console.log(JSON.stringify(test, null, 2));

  await client.close();
})();
