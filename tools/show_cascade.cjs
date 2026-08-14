// Quick cascade viewer for all pairs
const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"];
const DATE = require("./ny_time.cjs").getNYDate();

for (const pair of PAIRS) {
  try {
    const altPair = pair === "XAUUSD" ? "XAUUSD" : pair;
    const d = require(`../shared/${DATE}/${altPair}/decision.json`);
    const lc = d.registry?.liquidityCascade;
    const pc = d.registry?.poolContext;
    const bias = pc?.lockedDirection || d.registry?.direction || "neutral";

    console.log(`\n${"=".repeat(60)}`);
    console.log(`  ${pair} — ${d.registry?.verdict || 'N/A'} | ${d.registry?.primary || 'none'} | Bias: ${bias}`);
    console.log(`${"=".repeat(60)}`);

    if (!lc) { console.log("  No cascade data\n"); continue; }

    // Session triggers
    console.log(`\n  ┌─ SESSION TRIGGERS`);
    for (const t of (lc.session?.triggers || [])) {
      const icon = t.validRaid ? "🔒" : t.raided ? "⚡" : "○";
      const dir = t.expectedDirection || "?";
      console.log(`  │ ${icon} P${t.priority} ${t.label.padEnd(25)} H ${String(t.high||'?').padEnd(10)} L ${String(t.low||'?').padEnd(10)} → ${dir}`);
    }
    console.log(`  └─ ${lc.session?.detail || 'No data'}`);

    // Daily targets (filtered to bias direction)
    console.log(`\n  ┌─ DAILY TARGETS (TP1)`);
    const relevantDaily = (lc.daily?.targets || []).filter(t => {
      if (bias === "SELL" || bias === "bearish") return t.type === "SSL" && t.price < (d.entry?.price || 999);
      return t.type === "BSL" && t.price > (d.entry?.price || 0);
    });
    for (const t of relevantDaily.slice(0, 3)) {
      console.log(`  │ 🎯 ${t.label.padEnd(30)} ${t.type} @ ${t.price}`);
    }
    console.log(`  └─ ${lc.daily?.detail || 'No data'}`);

    // Weekly stretch
    console.log(`\n  ┌─ WEEKLY STRETCH (TP2)`);
    const relevantWeekly = (lc.weekly?.targets || []).filter(t => {
      const dailyPrice = relevantDaily[0]?.price;
      if (!dailyPrice) return false;
      if (bias === "SELL" || bias === "bearish") return t.price < dailyPrice;
      return t.price > dailyPrice;
    });
    for (const t of relevantWeekly.slice(0, 2)) {
      console.log(`  │ 🏁 ${t.label.padEnd(30)} @ ${t.price}`);
    }
    console.log(`  └─ ${lc.weekly?.detail || 'No data'}`);

    // Draw targets from cascade
    if (lc.drawTargets?.tp1) {
      console.log(`\n  ═══ CASCADE RESULT ═══`);
      console.log(`  TP1 → ${lc.drawTargets.tp1.label} @ ${lc.drawTargets.tp1.price}`);
      if (lc.drawTargets.tp2) console.log(`  TP2 → ${lc.drawTargets.tp2.label} @ ${lc.drawTargets.tp2.price}`);
    }

    console.log("");
  } catch(e) { console.log(`  Error: ${e.message}\n`); }
}
