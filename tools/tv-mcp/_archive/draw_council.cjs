const CDP = require("chrome-remote-interface");
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];

async function run(client, expr) {
  await client.Runtime.evaluate({ expression: expr, returnByValue: true });
}

function loadCouncilVote(pair) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "stages", "00b_council_vote", "output", `${pair}_vote.json`), "utf8"));
  } catch { return null; }
}

// Load all council results from the output JSON
function loadVotes() {
  const pairs = [
    { name: "EURUSD", tv: "EURUSD", label: "EURUSD" },
    { name: "GBPUSD", tv: "GBPUSD", label: "GBPUSD" },
    { name: "GOLD", tv: "XAUUSD", label: "GOLD" },
    { name: "NAS100", tv: "US100", label: "NAS100" },
    { name: "DXY", tv: "USDOLLAR", label: "DXY" },
  ];

  const results = [];
  for (const p of pairs) {
    // Read the council JSON output from earlier runs
    const jsonFile = path.join(ROOT, "stages", "00b_council_vote", "output", `${p.name.toLowerCase()}_vote.json`);
    const mdFile = path.join(ROOT, "stages", "00b_council_vote", "output", `${p.name.toLowerCase()}_vote.md`);
    try {
      if (fs.existsSync(jsonFile)) {
        results.push({ ...p, vote: JSON.parse(fs.readFileSync(jsonFile, "utf8")) });
      } else if (fs.existsSync(mdFile)) {
        // Parse from markdown
        const md = fs.readFileSync(mdFile, "utf8");
        const verdictMatch = md.match(/Verdict: \*\*(.+?)\*\*/);
        const confMatch = md.match(/Confidence\*\*: (\d+)%/);
        const dirMatch = md.match(/\| (?:🟢|🔴|⚪) Position Trader.*?\*\*(BULLISH|BEARISH|NEUTRAL)\*\*/);
        results.push({
          ...p,
          vote: {
            verdict: verdictMatch?.[1] || "UNKNOWN",
            confidencePct: confMatch ? parseInt(confMatch[1]) : 0,
            direction: dirMatch?.[1]?.toLowerCase() || "neutral",
          }
        });
      }
    } catch(e) { /* skip */ }
  }
  return results;
}

(async () => {
  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  // Gather council data from markdown output files
  const pairs = [
    { name: "eurusd", tv: "EURUSD", label: "EURUSD", tf: "240" },
    { name: "gbpusd", tv: "GBPUSD", label: "GBPUSD", tf: "240" },
    { name: "gold", tv: "XAUUSD", label: "GOLD", tf: "240" },
    { name: "nas100", tv: "US100", label: "NAS100", tf: "240" },
    { name: "dxy", tv: "USDOLLAR", label: "DXY", tf: "240" },
  ];

  const councilData = [];
  for (const p of pairs) {
    const mdFile = path.join(ROOT, "stages", "00b_council_vote", "output", `${p.name}_vote.md`);
    try {
      if (fs.existsSync(mdFile)) {
        const md = fs.readFileSync(mdFile, "utf8");
        const verdictMatch = md.match(/Verdict: \*\*(.+?)\*\*/);
        const confMatch = md.match(/Confidence\*\*: (\d+)%/);
        const actionMatch = md.match(/Action\*\*: (.+)/);
        const posMatch = md.match(/\| (?:🟢|🔴|⚪) Position Trader.*?\*\*(BULLISH|BEARISH|NEUTRAL)\*\*/);
        const swgMatch = md.match(/\| (?:🟢|🔴|⚪) Swing Trader.*?\*\*(BULLISH|BEARISH|NEUTRAL)\*\*/);
        const dayMatch = md.match(/\| (?:🟢|🔴|⚪) Day Trader.*?\*\*(BULLISH|BEARISH|NEUTRAL)\*\*/);
        const scpMatch = md.match(/\| (?:🟢|🔴|⚪) Scalper.*?\*\*(BULLISH|BEARISH|NEUTRAL)\*\*/);
        const bullMatch = md.match(/Bullish\*\*: (\d+)\/4/);
        const bearMatch = md.match(/Bearish\*\*: (\d+)\/4/);
        councilData.push({
          ...p,
          verdict: verdictMatch?.[1] || "UNKNOWN",
          confidence: confMatch ? parseInt(confMatch[1]) : 0,
          action: actionMatch?.[1] || "",
          pos: posMatch?.[1] || "?",
          swg: swgMatch?.[1] || "?",
          day: dayMatch?.[1] || "?",
          scp: scpMatch?.[1] || "?",
          bullish: bullMatch ? parseInt(bullMatch[1]) : 0,
          bearish: bearMatch ? parseInt(bearMatch[1]) : 0,
        });
      }
    } catch(e) { /* skip */ }
  }

  // Draw each pair
  for (const p of councilData) {
    console.error(`\n=== ${p.label} — ${p.verdict} (${p.confidence}%) ===`);

    // Switch
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${p.tv}", {});
      return "ok";
    })()`);
    await new Promise(r => setTimeout(r, 3500));
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().setResolution("${p.tf}");
      return "ok";
    })()`);
    await new Promise(r => setTimeout(r, 2500));

    // Clear
    await run(client, `(function() {
      try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
      return "ok";
    })()`);
    await new Promise(r => setTimeout(r, 400));

    // Get anchor time
    const timeRes = await client.Runtime.evaluate({
      expression: `(function() {
        var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
        var mid = Math.max(bars.firstIndex(), bars.lastIndex() - 60);
        return JSON.stringify({ t: bars.valueAt(mid)[0], tEnd: bars.valueAt(bars.lastIndex())[0] });
      })()`,
      returnByValue: true
    });
    const { t } = JSON.parse(timeRes.result.value);

    // Draw Council vote banner at top
    const confColor = p.confidence >= 70 ? "#00E676" : p.confidence >= 40 ? "#FFD740" : "#FF5252";
    const verdictShort = p.verdict.length > 50 ? p.verdict.slice(0, 47) + "..." : p.verdict;

    // Council verdict box
    await run(client, `(function() {
      try {
        var api = window.TradingViewApi._activeChartWidgetWV.value();
        api.createShape(
          { time: ${t + 86400*2} },
          { time: ${t + 86400*8}, price: 0 },
          { shape: "text", text: "${p.label}: ${verdictShort} | ${p.confidence}% | P:${p.pos[0]} S:${p.swg[0]} D:${p.day[0]} Sc:${p.scp[0]} | ${p.bullish}B/${p.bearish}Be" }
        );
      } catch(e) {}
      return "ok";
    })()`);

    // Archetype vote bars (4 colored dots showing each vote)
    const archetypes = [
      { label: "POS", vote: p.pos, y: 1 },
      { label: "SWG", vote: p.swg, y: 2 },
      { label: "DAY", vote: p.day, y: 3 },
      { label: "SCP", vote: p.scp, y: 4 },
    ];
    for (const a of archetypes) {
      const color = a.vote === "BULLISH" ? "#4CAF50" : a.vote === "BEARISH" ? "#F44336" : "#9E9E9E";
      await run(client, `(function() {
        try {
          var api = window.TradingViewApi._activeChartWidgetWV.value();
          api.createShape(
            { time: ${t + 86400*3} },
            { time: ${t + 86400*6}, price: 0 },
            { shape: "text", text: "${a.label}: ${a.vote}" }
          );
        } catch(e) {}
        return "ok";
      })()`);
    }

    // Key levels from engine
    const engineFile = path.join(ROOT, "shared", DATE, p.label === "GOLD" ? "GOLD" : p.label === "NAS100" ? "NAS100" : p.label === "DXY" ? "DXY" : p.label, "engine_4h.json");
    try {
      if (fs.existsSync(engineFile)) {
        const eng = JSON.parse(fs.readFileSync(engineFile, "utf8"));
        const price = eng.price;
        const swHi = eng.structure.lastSwingHigh;
        const swLo = eng.structure.lastSwingLow;
        const draw = eng.draw;
        const alt = eng.alt;

        // Draw swing levels
        if (swHi) {
          await run(client, `(function() {
            window.TradingViewApi._activeChartWidgetWV.value().createShape(
              { time: ${t}, price: ${swHi} },
              { shape: "horizontal_line", text: "Swing H", overrides: { "linecolor": "#FF9800", "linewidth": 1, "linestyle": 2, "showLabel": true } }
            );
            return "ok";
          })()`);
        }
        if (swLo) {
          await run(client, `(function() {
            window.TradingViewApi._activeChartWidgetWV.value().createShape(
              { time: ${t}, price: ${swLo} },
              { shape: "horizontal_line", text: "Swing L", overrides: { "linecolor": "#FF9800", "linewidth": 1, "linestyle": 2, "showLabel": true } }
            );
            return "ok";
          })()`);
        }
        // Council confidence zone
        const zoneColor = p.bearish >= 3 ? "#F4433622" : p.bullish >= 3 ? "#4CAF5022" : "#FFD74022";
        if (swHi && swLo) {
          await run(client, `(function() {
            window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
              [{ time: ${t - 86400*3}, price: ${swHi} }, { time: ${t + 86400*10}, price: ${swLo} }],
              { shape: "rectangle", text: "${p.verdict.split('—')[0].trim()} ${p.confidence}%", overrides: { "backgroundColor": "${zoneColor}", "borderColor": "${zoneColor.replace('22','44')}", "linewidth": 1 } }
            );
            return "ok";
          })()`);
        }
      }
    } catch(e) { /* skip levels */ }

    console.error(`  Drawn: ${p.verdict.slice(0, 50)}`);
  }

  // Switch back to GBPUSD for final view
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("GBPUSD", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("240");
    return "ok";
  })()`);

  await client.close();
  console.log(JSON.stringify(councilData.map(p => ({
    pair: p.label,
    verdict: p.verdict.split("—")[0].trim(),
    confidence: p.confidence,
    votes: `P:${p.pos[0]} S:${p.swg[0]} D:${p.day[0]} Sc:${p.scp[0]}`,
    bulls: p.bullish,
    bears: p.bearish,
  }))));
})();
