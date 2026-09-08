// Weekend Analysis — All pairs drawn via simple sequential calls
const CDP = require("chrome-remote-interface");
const { fetchRetry } = require("../lib/http_retry.cjs");
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const r = await fetchRetry("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const api = "window.TradingViewApi._activeChartWidgetWV.value()";

  // ── Setup: switch to XAUUSD 15m, get time bounds ──
  console.log("Switching to XAUUSD 15m...");
  await client.Runtime.evaluate({
    expression: `${api}.setSymbol("OANDA:XAUUSD", {}); ${api}.setResolution("15"); "ok"`,
    returnByValue: true
  });
  await sleep(4000);

  const tr = await client.Runtime.evaluate({
    expression: `(function(){
      var b=${api}._chartWidget.model().mainSeries().bars();
      var e=b.lastIndex(), s=Math.max(b.firstIndex(),e-350);
      return JSON.stringify({t:b.valueAt(s)[0],te:b.valueAt(e)[0]});
    })()`,
    returnByValue: true
  });
  const {t, te} = JSON.parse(tr.result.value);
  const tWide = t - 1500, tFar = te + 8000;
  console.log(`Time range: ${t} → ${te} | tWide=${tWide} tFar=${tFar}`);

  // Clear
  await client.Runtime.evaluate({expression: `try{${api}.removeAllShapes();}catch(e){}`, returnByValue: true});
  await sleep(600);

  // ── Helper: create one horizontal line ──
  async function hline(price, label, color, width, dashed) {
    var ls = dashed ? 2 : 0;
    await client.Runtime.evaluate({
      expression: `${api}.createShape({time: ${te}+200, price: ${price}}, {shape:"horizontal_line",text:"${label}",overrides:{"linecolor":"${color}","linewidth":${width},"linestyle":${ls},"showLabel":true,"textColor":"${color}"}})`,
      returnByValue: true
    });
  }

  // ── Helper: create one rectangle zone ──
  async function hrect(tp1, tp2, tp3, tp4, label, bg, bd) {
    await client.Runtime.evaluate({
      expression: `${api}.createMultipointShape([{time:${tp1},price:${tp2}},{time:${tp3},price:${tp4}}],{shape:"rectangle",text:"${label}",overrides:{"backgroundColor":"${bg}","borderColor":"${bd}","borderWidth":1}})`,
      returnByValue: true
    });
  }

  // ── Helper: create text panel ──
  async function htxt(tp1, tp2, tp3, tp4, text) {
    var safe = text.replace(/"/g, '\\"');
    await client.Runtime.evaluate({
      expression: `${api}.createMultipointShape([{time:${tp1},price:${tp2}},{time:${tp3},price:${tp4}}],{shape:"text",text:"${safe}"})`,
      returnByValue: true
    });
  }

  // ════════════════════════════════════════
  // PHASE 1: XAUUSD (gold/yellow + accent colors)
  // ════════════════════════════════════════
  console.log("\n── XAUUSD ──");
  await hline(4697.105, "XAU 1D Swing H $4,697",         "#FFD700", 1, true);
  await hline(4593.845, "XAU Bearish FVG $4,594",        "#FFD700", 1, true);
  await hline(4582.900, "XAU FVG Bot $4,583",            "#FFD700", 1, true);
  await hline(4510.930, "XAU BSL $4,511",                "#FFD700", 2, false);
  await hline(4490.895, "XAU 1H Swing H $4,491",         "#FFD700", 1, false);
  await hline(4489.220, "XAU BSL x2 $4,489",             "#EF4444", 1, true);
  await hline(4462.965, "XAU DIST TARGET $4,463",        "#F97316", 2, false);
  await hline(4460.155, "XAU 1H BOS $4,460",             "#EF4444", 1, false);
  await hline(4449.830, "XAU 1D BOS $4,450",             "#E040FB", 1, false);
  await hline(4431.595, "XAU Weekly H $4,432",           "#FFD700", 2, false);
  await hline(4429.825, "NOW XAU $4,429.83",             "#FFFFFF", 3, false);
  await hline(4428.789, "XAU SSL swept $4,429",          "#E040FB", 1, true);
  await hline(4422.245, "XAU SSL swept $4,422",          "#E040FB", 1, true);
  await hline(4417.472, "XAU SSL x3 PRIMARY $4,417",     "#E040FB", 3, false);
  await hline(4415.098, "XAU 15m SSL $4,415",            "#E040FB", 1, true);
  await hline(4381.250, "XAU Prev Day Low $4,381",       "#EF4444", 1, true);
  await hline(4365.570, "XAU 1H Swing L $4,366",         "#FFD700", 1, false);
  await hline(4344.385, "XAU Bullish FVG $4,344",        "#22C55E", 1, true);
  await hline(4324.565, "XAU Deep SSL $4,325",           "#26C6DA", 1, false);
  await hline(4311.040, "XAU 1D Swing L $4,311",         "#26C6DA", 1, true);
  await hrect(tWide, 4422.675, te+2000, 4416.255, "INV FVG 4416-4423", "rgba(224,64,251,0.08)", "rgba(224,64,251,0.33)");
  await hrect(tWide, 4465.145, te+2000, 4434.930, "BEARISH FVG",         "rgba(239,68,68,0.08)",    "rgba(239,68,68,0.33)");
  await hrect(tWide, 4374.410, tFar,    4344.385, "BULLISH FVG",         "rgba(34,197,94,0.08)",    "rgba(34,197,94,0.33)");
  await hrect(tWide, 4465.145, te+4000, 4435.000, "DISTRIBUTION ZONE",   "rgba(239,68,68,0.06)",    "rgba(239,68,68,0.25)");
  await hrect(tWide, 4423.000, te+4000, 4365.000, "ACQUISITION ZONE",    "rgba(34,197,94,0.06)",    "rgba(34,197,94,0.25)");
  console.log("  ✓ 20 lines + 5 zones");

  // ════════════════════════════════════════
  // PHASE 2: EURUSD (cyan)
  // ════════════════════════════════════════
  console.log("\n── EURUSD ──");
  await hline(1.16516, "EUR 4H BSL $1.1652",      "#00BCD4", 1, true);
  await hline(1.16414, "EUR Prev AM High",        "#00BCD4", 2, false);
  await hline(1.16273, "EUR BSL closest",         "#F97316", 2, false);
  await hline(1.16224, "EUR 1H CHoCH",            "#EF4444", 1, true);
  await hline(1.16138, "NOW EUR 1.16138",         "#00BCD4", 3, false);
  await hline(1.16086, "EUR 15m Swing L",         "#FFD700", 1, false);
  await hline(1.15873, "EUR SSL PRIMARY",         "#E040FB", 3, false);
  await hline(1.15568, "EUR IOFED Starter",       "#22C55E", 1, true);
  await hline(1.15450, "EUR IOFED CE",            "#22C55E", 1, true);
  await hline(1.15100, "EUR Deep SSL T2",         "#26C6DA", 1, true);
  await hrect(tWide, 1.16270, te+2000, 1.16080, "EUR Bullish FVG", "rgba(34,197,94,0.08)", "rgba(34,197,94,0.33)");
  console.log("  ✓ 10 lines + 1 zone");

  // ════════════════════════════════════════
  // PHASE 3: GBPUSD (purple)
  // ════════════════════════════════════════
  console.log("\n── GBPUSD ──");
  await hline(1.35655, "GBP BSL far",         "#E040FB", 1, true);
  await hline(1.35504, "GBP DIST TARGET",     "#F97316", 2, false);
  await hline(1.35491, "GBP 1H Swing H",      "#FFD700", 1, false);
  await hline(1.35378, "GBP 1H BOS",          "#22C55E", 1, false);
  await hline(1.35162, "NOW GBP 1.35162",     "#E040FB", 3, false);
  await hline(1.35108, "GBP 15m Swing L",     "#FFD700", 1, false);
  await hline(1.34840, "GBP 1H Swing L",      "#EF4444", 1, false);
  await hline(1.34811, "GBP SSL PRIMARY",     "#E040FB", 3, false);
  await hline(1.33093, "GBP IOFED Starter",   "#22C55E", 1, true);
  await hline(1.33287, "GBP IOFED CE",        "#22C55E", 1, true);
  await hline(1.33530, "GBP IOFED Far",       "#22C55E", 1, true);
  await hrect(tWide, 1.35410, te+2000, 1.35220, "GBP Bearish FVG #1", "rgba(239,68,68,0.09)", "rgba(239,68,68,0.33)");
  await hrect(tWide, 1.35220, te+2000, 1.35080, "GBP Bearish FVG #2", "rgba(239,68,68,0.09)", "rgba(239,68,68,0.33)");
  console.log("  ✓ 11 lines + 2 zones");

  // ════════════════════════════════════════
  // PHASE 4: NAS100 (green)
  // ════════════════════════════════════════
  console.log("\n── NAS100 ──");
  await hline(29654.4, "NAS 1H Swing H",      "#22C55E", 1, false);
  await hline(29593.0, "NAS BSL target",      "#FFD700", 1, true);
  await hline(29538.1, "NAS 1H BOS",          "#22C55E", 1, false);
  await hline(29530.3, "NAS BREAKOUT TRIGGER","#EF4444", 3, false);
  await hline(29493.3, "NOW NAS $29,493",     "#22C55E", 3, false);
  await hline(29438.1, "NAS 1H Swing L",      "#EF4444", 1, false);
  await hline(29436.0, "NAS SSL PRIMARY",     "#E040FB", 3, false);
  await hline(29350.4, "NAS Alt SSL",         "#26C6DA", 1, true);
  await hline(29332.9, "NAS IOFED Starter",   "#22C55E", 1, true);
  await hline(29378.2, "NAS IOFED CE",        "#22C55E", 1, true);
  await hline(29434.8, "NAS IOFED Far",       "#22C55E", 1, true);
  await hrect(tWide, 29540, te+2000, 29490, "NAS Bearish FVG",  "rgba(239,68,68,0.08)", "rgba(239,68,68,0.33)");
  await hrect(tWide, 29440, te+2000, 29380, "NAS Bullish FVG",  "rgba(34,197,94,0.08)", "rgba(34,197,94,0.33)");
  console.log("  ✓ 11 lines + 2 zones");

  // ════════════════════════════════════════
  // PHASE 5: DXY (orange)
  // ════════════════════════════════════════
  console.log("\n── DXY ──");
  await hline(99.392, "DXY 1H Swing H",      "#F97316", 1, false);
  await hline(99.197, "DXY SPRING TOP",      "#F97316", 3, false);
  await hline(99.163, "DXY Weekly Low",      "#E040FB", 1, true);
  await hline(99.159, "NOW DXY 99.159",      "#F97316", 3, false);
  await hline(99.109, "DXY SPRING BOTTOM",   "#F97316", 3, false);
  await hline(99.069, "DXY 1H CHoCH",        "#EF4444", 1, true);
  await hline(99.018, "DXY 1H Swing L",      "#EF4444", 1, false);
  await hline(98.951, "DXY Deep SSL",        "#26C6DA", 1, true);
  await hrect(tWide, 99.14, te+2000, 99.08, "DXY Bearish FVG",  "rgba(239,68,68,0.08)", "rgba(239,68,68,0.33)");
  await hrect(tWide, 99.20, te+4000, 99.10, "DXY SPRING ZONE",  "rgba(249,115,22,0.08)","rgba(249,115,22,0.33)");
  console.log("  ✓ 8 lines + 2 zones");

  // ════════════════════════════════════════
  // PHASE 6: Master info panel
  // ════════════════════════════════════════
  console.log("\n── Info panels ──");
  await htxt(tWide, 4700, te+200, 4670,
    "WEEKEND PREP | MONDAY 08:30-11:00 NY\n\nXAUUSD  ★ $4,417 SSL pivot >> $4,463 / << $4,374\nNASDAQ  ★ $29,530 trigger >> $29,593 / << $29,436\nGBPUSD  ★ FVG ceiling     >> $1.3550 / << $1.3481\nEURUSD  ★ Micro range     >> $1.1627 / << $1.1587\nDXY     ★ WATCH FIRST     break 99.109/99.197");
  console.log("  ✓ Master panel");

  // ════════════════════════════════════════
  // VERIFY
  // ════════════════════════════════════════
  await sleep(1000);
  const cnt = await client.Runtime.evaluate({
    expression: `(function(){var w=${api};return (w.getAllShapes?w.getAllShapes().length:-1);})()`,
    returnByValue: true
  });
  console.log(`\nTotal shapes: ${cnt.result.value}`);

  // List shape IDs and types
  const list = await client.Runtime.evaluate({
    expression: `(function(){
      var w=${api};
      var s=w.getAllShapes?w.getAllShapes():[];
      var out=[];
      for(var i=0;i<s.length;i++){
        out.push(s[i].id+' ['+s[i].name+']');
      }
      return s.length+' total\\n'+out.join('\\n');
    })()`,
    returnByValue: true
  });
  console.log(list.result.value);

  console.log("\n==================================================");
  console.log("ALL LEVELS DRAWN ON XAUUSD 15m CHART");
  console.log("==================================================");
  console.log("Colors: Gold=XAUUSD | Cyan=EURUSD | Purple=GBPUSD");
  console.log("        Green=NASDAQ | Orange=DXY");
  console.log("");
  console.log("Monday priority: XAUUSD > NAS100 > GBPUSD > EURUSD");
  console.log("Watch DXY first → confirms direction for all.");
  console.log("Best window: Mon 08:30–11:00 NY Killzone");
  console.log("==================================================");

  await client.close();
})();
