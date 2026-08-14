// Live Position Monitor — CDP-based real-time P&L + pyramid tracking
// Shows open positions, IOFED pyramid levels, SL/TP progress, next action.
// Usage: node tools/position_monitor.cjs

const CDP = require("./tv-mcp/cdp_client.cjs");
const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();

const POSITIONS = [
  { pair: "NAS100", tv: "CAPITALCOM:NAS100", entry: 28642.2, sl: 28168.7, tp: 28989.9, qty: 1, side: "BUY", time: "10:55 AM" },
];

(async () => {
  const r = await (await fetch("http://127.0.0.1:9222/json/list")).json();
  const chart = r.find(t => t.type === "page" && /tradingview/i.test(t.url || ""));
  if (!chart) { console.log("❌ TV not connected"); return; }
  const cl = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await cl.Runtime.enable();

  console.log(`\n📊 POSITION MONITOR — ${new Date().toLocaleTimeString("en-US",{timeZone:"America/New_York",hour12:false})} NY\n`);

  for (const pos of POSITIONS) {
    await cl.Runtime.evaluate({ expression: `window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${pos.tv}", {})`, returnByValue: true });
    await new Promise(r => setTimeout(r, 2000));

    const v = await cl.Runtime.evaluate({ expression: '(function(){var a=window.TradingViewApi._activeChartWidgetWV.value();var b=a._chartWidget.model().mainSeries().bars();var i=b.lastIndex();var x=b.valueAt(i);return JSON.stringify({price:x[4],high:x[2],low:x[3]});})()', returnByValue: true });
    const d = JSON.parse(v.result.value);
    const current = d.price;
    const pnl = (current - pos.entry) * (pos.side === "BUY" ? 1 : -1);
    const slDist = Math.abs(pos.entry - pos.sl);
    const tpDist = Math.abs(pos.tp - pos.entry);
    const tpProgress = ((current - pos.entry) / tpDist * 100).toFixed(0);
    const slBuffer = ((current - pos.sl) / slDist * 100).toFixed(0);
    const rr = (tpDist / slDist).toFixed(1);

    console.log(`  ${pos.pair} ${pos.side} ${pos.qty} @ ${pos.entry.toFixed(1)} | Now: ${current.toFixed(1)} | P&L: ${pnl > 0 ? '+' : ''}$${pnl.toFixed(0)}`);
    console.log(`  SL: ${pos.sl.toFixed(1)} (${Math.abs(current-pos.sl).toFixed(0)}pts buffer, ${slBuffer}%) | TP: ${pos.tp.toFixed(1)} (${tpProgress}% progress) | R:R ${rr}:1`);

    // Pyramid levels
    const range = pos.tp - pos.sl;
    if (range > 0) {
      const pyramidLevels = [
        { label: "🥉 Far Edge", price: pos.sl + range * 0.25, size: "25%" },
        { label: "🥈 CE 50%", price: pos.sl + range * 0.50, size: "35%" },
        { label: "🥇 IOFED Edge", price: pos.sl + range * 0.75, size: "40%" },
      ];
      console.log(`  Pyramid add levels:`);
      for (const pl of pyramidLevels) {
        const dist = current - pl.price;
        const reached = dist > 0;
        console.log(`    ${pl.label} @ ${pl.price.toFixed(1)} (${Math.abs(dist).toFixed(0)}pts ${reached ? '✅ REACHED' : 'below'}) — add ${pl.size}`);
      }
    }

    // Next action
    if (tpProgress >= 50) {
      console.log(`  ⚡ ACTION: Move SL to breakeven (${pos.entry.toFixed(1)})`);
    } else if (pnl > slDist * 0.5) {
      console.log(`  🔒 ACTION: Trail SL to ${(current - slDist * 0.3).toFixed(1)}`);
    } else if (pnl < -slDist * 0.3) {
      console.log(`  ⚠️ WARNING: ${Math.abs(pnl/slDist*100).toFixed(0)}% of SL consumed`);
    } else {
      console.log(`  ✅ HOLD — no action needed`);
    }
  }

  // Quick trade scan
  console.log(`\n  --- Quick Scan ---`);
  const { execSync } = require("child_process");
  try {
    const scan = execSync(`node "${path.join(ROOT, "tools", "trade_ready.cjs")}"`, { encoding: "utf8", timeout: 600000, stdio: ["ignore","pipe","ignore"] });
    console.log(scan.split("\n").filter(l => l.includes("✅") || l.includes("⏳")).join("\n"));
  } catch {}

  await cl.close();
})();
