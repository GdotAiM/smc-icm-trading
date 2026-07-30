// Draw trading setup on TV — parameterized, individual error-checked calls
// Usage: node tools/tv-mcp/draw_setup.cjs PAIR RESOLUTION
// Reads entry plan from stages/05_entry_refinement/output/{pair}_entry_plan.md
// Falls back to engine data for levels

const CDP = require("./cdp_client.cjs");
const fs = require("fs");
const path = require("path");

const ROOT = "C:/Users/cash/smc-icm-trading";
const PAIR = process.argv[2] || "GBPUSD";
const RES = process.argv[3] || "15";
const TV_SYMBOLS = { DXY: "USDOLLAR" };
const TV_SYM = TV_SYMBOLS[PAIR] || PAIR;

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No TV chart"); process.exit(1); }
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const api = "window.TradingViewApi._activeChartWidgetWV.value()";

  async function ev(e) {
    const r = await client.Runtime.evaluate({ expression: e, returnByValue: true });
    return r.result.value;
  }

  // Clear + switch
  await ev("(function(){ try { " + api + ".removeAllShapes(); } catch(e) {} return \"ok\"; })()");
  await ev("(function(){ " + api + ".setSymbol(\"" + TV_SYM + "\", {}); " + api + ".setResolution(\"" + RES + "\"); return \"ok\"; })()");
  await new Promise(r => setTimeout(r, 4000));

  const sym = await ev("(function(){ return " + api + ".symbol(); })()");
  console.log("Symbol:", sym);

  // Get visible range
  const tr = await ev("(function(){ var bars=" + api + "._chartWidget.model().mainSeries().bars(); var e=bars.lastIndex(),s=Math.max(bars.firstIndex(),e-80); var v=bars.valueAt(e); return JSON.stringify({ts:bars.valueAt(s)[0],te:v[0],px:v[4]}); })()");
  const t = JSON.parse(tr);
  console.log("Price:", t.px);

  // Load engine data for structure levels
  const DATE = new Date().toISOString().split("T")[0];
  let r1d = null, r4h = null, r1h = null;
  try { r1d = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, PAIR, "engine_1d.json"), "utf8")); } catch(e) {}
  try { r4h = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, PAIR, "engine_4h.json"), "utf8")); } catch(e) {}
  try { r1h = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, PAIR, "engine_1h.json"), "utf8")); } catch(e) {}

  // Try to read entry plan for SL/TP
  let entryPlan = null;
  try {
    const epPath = path.join(ROOT, "stages", "05_entry_refinement", "output", PAIR.toLowerCase() + "_entry_plan.md");
    entryPlan = fs.readFileSync(epPath, "utf8");
  } catch(e) {}

  // Parse SL/TP from entry plan markdown
  function parseMd(regex) {
    if (!entryPlan) return null;
    const m = entryPlan.match(regex);
    return m ? parseFloat(m[1]) : null;
  }
  const sl = parseMd(/\|\s*SL\s*\|\s*([\d.]+)\s*\|/) || (r4h?.structure?.lastSwingHigh ? r4h.structure.lastSwingHigh + 0.001 : null);
  const tp1 = parseMd(/\|\s*TP1\s*\|\s*([\d.]+)\s*\|/) || null;
  const tp2 = parseMd(/\|\s*TP2\s*\|\s*([\d.]+)\s*\|/) || null;

  // Build shape list
  const bias1d = r1d?.structure?.bias || "neutral";
  const bias4h = r4h?.structure?.bias || "neutral";
  const biasEmoji = (b) => b === "bearish" ? "BEARISH" : b === "bullish" ? "BULLISH" : "NEUTRAL";
  const biasColor = (b) => b === "bearish" ? "#FF1744" : b === "bullish" ? "#00E676" : "#9E9E9E";

  const shapes = [];

  // Structure levels
  if (r1d?.structure?.lastSwingHigh && r1d.structure.lastSwingLow) {
    shapes.push({ t: t.ts + 100,  p: r1d.structure.lastSwingHigh, color: "#FF1744", w: 2, s: 2, text: "1D Swing High " + r1d.structure.lastSwingHigh.toFixed(5) });
    shapes.push({ t: t.ts + 100,  p: r1d.structure.lastSwingLow,  color: "#00E676", w: 2, s: 2, text: "1D Swing Low " + r1d.structure.lastSwingLow.toFixed(5) });
  }
  if (r4h?.structure?.lastEvent && r4h.structure.lastEventPrice) {
    shapes.push({ t: t.ts + 250,  p: r4h.structure.lastEventPrice, color: biasColor(bias4h), w: 2, s: 2, text: "4H " + r4h.structure.lastEvent + " " + biasEmoji(bias4h) + " " + r4h.structure.lastEventPrice.toFixed(5) });
  }

  // Liquidity pools
  const pools = (r4h?.liquidity || []).sort((a, b) => b.score - a.score).slice(0, 4);
  for (const pool of pools) {
    shapes.push({ t: t.ts + 400, p: pool.price, color: pool.type === "BSL" ? "#FF1744" : "#00E676", w: 1, s: 2, text: pool.type + " " + pool.price.toFixed(5) + (pool.swept ? " SWEPT" : "") });
  }

  // Entry zone
  if (sl && tp1) {
    const entry = parseMd(/\|\s*Entry\s*\|\s*([\d.]+)\s*\|/) || t.px;
    shapes.push({ t: t.te + 500, p: entry, color: "#FFD740", w: 3, s: 0, text: "ENTRY " + entry.toFixed(5) });
    shapes.push({ t: t.te + 500, p: sl, color: "#FF1744", w: 2, s: 1, text: "SL " + sl.toFixed(5) });
    shapes.push({ t: t.te + 500, p: tp1, color: "#00E676", w: 2, s: 0, text: "TP1 " + tp1.toFixed(5) });
    if (tp2) shapes.push({ t: t.te + 500, p: tp2, color: "#00C853", w: 2, s: 3, text: "TP2 " + tp2.toFixed(5) });
  } else {
    // Just draw live price
    shapes.push({ t: t.te + 500, p: t.px, color: "#FFD740", w: 4, s: 0, text: "LIVE " + t.px.toFixed(5) });
  }

  // Current price
  shapes.push({ t: t.te + 500, p: t.px, color: "#FFFFFF", w: 2, s: 0, text: "NOW " + t.px.toFixed(5) });

  // Draw all shapes individually
  console.log("Drawing " + shapes.length + " levels...");
  for (const s of shapes) {
    const result = await ev("(function(){ try { var a=" + api + "; a.createShape({ time: " + s.t + ", price: " + s.p + " }, { shape: \"horizontal_line\", text: \"" + s.text + "\", overrides: { linecolor: \"" + s.color + "\", linewidth: " + s.w + ", linestyle: " + s.s + ", showLabel: true, textColor: \"" + s.color + "\" } }); return \"ok\"; } catch(e) { return \"ERR: \" + e.message; } })()");
    console.log("  " + s.text.slice(0, 40).padEnd(42), result === "ok" ? "✓" : result);
  }

  // Verify
  const count = await ev("(function(){ var s=" + api + ".getAllShapes(); return s?s.length:0; })()");
  console.log("\nTotal: " + count + " shapes on " + sym);

  // Screenshot
  fs.mkdirSync(path.join(ROOT, "shared", "screenshots"), { recursive: true });
  const ss = await client.Page.captureScreenshot({ format: "png" });
  const ssPath = path.join(ROOT, "shared", "screenshots", PAIR.toLowerCase() + "_setup_" + DATE + ".png");
  fs.writeFileSync(ssPath, ss.data, "base64");
  console.log("Screenshot: " + ssPath);

  await client.close();
})();
