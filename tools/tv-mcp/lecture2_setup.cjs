// ICT 2024 Lecture 2: 07:00 AM Liquidity Hunt + IFVG Entry
// "Sit down before 07:00 AM. Mark London high/low. Do not predict."
// Official mechanics (audited against innercircletrader.net 2026-07-31):
//   1. Mark London high/low (draw reference)
//   2. Find relative equal highs/lows forming AFTER 07:00 AM on 5m/1m
//   3. Wait for liquidity hunt (sweep of those relative equal levels)
//   4. Mandatory MSS: close beyond prior swing after the sweep
//   5. First FVG before the hunt → IFVG; entry at CE (50% midpoint)
//   6. Breaker block as backup entry if no IFVG
//   7. SL beyond post-hunt swing (not just post-7AM low)
//   8. TP at Fib -2/-2.5 extensions (post-hunt swing → 7AM open)
// Usage: node tools/tv-mcp/lecture2_setup.cjs PAIR

const fs = require("fs");
const path = require("path");
const ny = require("../ny_time.cjs");

const ROOT = "C:/Users/cash/smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
const PAIR = process.argv[2] || "XAUUSD";

function getCandles(tf, dateOverride, rootOverride, pairOverride) {
  try {
    const d = dateOverride || DATE;
    const r = rootOverride || ROOT;
    const p = pairOverride || PAIR;
    let file = path.join(r, "shared", d, p, `candles_${tf}.json`);
    if (!fs.existsSync(file) && p === "XAUUSD") file = path.join(r, "shared", d, "GOLD", `candles_${tf}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch(e) { return null; }
}

function getEngineReport(tf, dateOverride, rootOverride, pairOverride) {
  try {
    const d = dateOverride || DATE;
    const r = rootOverride || ROOT;
    const p = pairOverride || PAIR;
    const file = path.join(r, "shared", d, p, `engine_${tf.toLowerCase()}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch(e) { return null; }
}

// ═══ HELPER: Find swing highs/lows from candles ═══
function findSwings(candles, lookback) {
  const lb = lookback || 2;
  const swings = [];
  if (candles.length < lb * 2 + 1) return swings;

  for (let i = lb; i < candles.length - lb; i++) {
    const c = candles[i];
    let isSwingHigh = true, isSwingLow = true;

    for (let j = i - lb; j <= i + lb; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isSwingHigh = false;
      if (candles[j].low <= c.low) isSwingLow = false;
    }

    if (isSwingHigh) swings.push({ index: i, price: c.high, type: "high", time: c.time });
    if (isSwingLow) swings.push({ index: i, price: c.low, type: "low", time: c.time });
  }
  return swings;
}

// ═══ HELPER: Filter candles after a given NEW YORK hour (DST-aware) ═══
function filterAfterUTCHour(candles, nyHour) {
  return candles.filter(c => ny.getNYHourFor(c.time) >= nyHour);
}

// ═══ HELPER: Find first candle at/after a given NEW YORK hour ═══
function findFirstCandleAtUTCHour(candles, nyHour) {
  return candles.find(c => ny.getNYHourFor(c.time) >= nyHour) || null;
}

// ═══ HELPER: Calculate ATR from candles ═══
function calcATR(candles, period) {
  const p = period || 14;
  if (candles.length < p + 1) return 0;
  let sum = 0;
  const slice = candles.slice(-p - 1);
  for (let i = 1; i < slice.length; i++) {
    const h = slice[i].high, l = slice[i].low, pc = slice[i-1].close;
    sum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  return sum / p;
}

// ═══ 1. MARK LONDON HIGH & LOW ═══
// London session: 02:00-05:00 NY. From 1H candles.
// These are DRAW REFERENCES — not the hunt targets.
function getLondonRange(rootOverride, pairOverride) {
  const candles1h = getCandles("1h", null, rootOverride, pairOverride);
  if (!candles1h || candles1h.length < 4) return null;

  const londonCandles = candles1h.filter(c => {
    const hour = ny.getNYHourFor(c.time);
    return hour >= 2 && hour <= 5;
  });

  const source = londonCandles.length >= 3 ? londonCandles : candles1h.slice(-6);
  if (source.length < 3) return null;

  const high = Math.max(...source.map(c => c.high));
  const low = Math.min(...source.map(c => c.low));
  const range = high - low;

  return { high, low, range, sourceCount: source.length, source: londonCandles.length >= 3 ? "London session" : "Last 6H" };
}

// ═══ 2. FIND RELATIVE EQUAL LEVELS (post-07:00 AM) ═══
// ICT: "Look for relative equal highs or relative equal lows forming on the
// 5-minute or 1-minute chart after 07:00 AM."
// Relative Equal High = a swing high with a LOWER swing high to its right
// Relative Equal Low  = a swing low with a HIGHER swing low to its right
function findRelativeEqualLevels(candles, atr) {
  const swings = findSwings(candles, 2);
  if (swings.length < 3) return { highs: [], lows: [] };

  const tolerance = atr * 0.15; // 15% of ATR for "equal" price tolerance
  const relEqualHighs = [];
  const relEqualLows = [];

  // Group swing highs by proximity and check for lower right shoulder
  const highs = swings.filter(s => s.type === "high");
  for (let i = 0; i < highs.length - 1; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      if (Math.abs(highs[i].price - highs[j].price) / (atr || 1) < 0.15) {
        // If the right one is lower OR price already dropped below the level → relative equal high
        if (highs[j].price <= highs[i].price * 1.001) {
          relEqualHighs.push({
            price: Math.max(highs[i].price, highs[j].price),
            firstIndex: highs[i].index,
            secondIndex: highs[j].index,
            firstTime: highs[i].time,
            secondTime: highs[j].time,
            detail: `Relative equal high: ${highs[i].price.toFixed(5)} → ${highs[j].price.toFixed(5)} (lower right shoulder)`
          });
          break; // One match per level
        }
      }
    }
  }

  // Group swing lows by proximity and check for higher right shoulder
  const lows = swings.filter(s => s.type === "low");
  for (let i = 0; i < lows.length - 1; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      if (Math.abs(lows[i].price - lows[j].price) / (atr || 1) < 0.15) {
        if (lows[j].price >= lows[i].price * 0.999) {
          relEqualLows.push({
            price: Math.min(lows[i].price, lows[j].price),
            firstIndex: lows[i].index,
            secondIndex: lows[j].index,
            firstTime: lows[i].time,
            secondTime: lows[j].time,
            detail: `Relative equal low: ${lows[i].price.toFixed(5)} → ${lows[j].price.toFixed(5)} (higher right shoulder)`
          });
          break;
        }
      }
    }
  }

  return { highs: relEqualHighs, lows: relEqualLows };
}

// ═══ 3. DETECT LIQUIDITY HUNT ═══
// ICT: Hunt = price sweeps relative equal highs/lows that formed after 07:00 AM
// Then reverses — close must come back through the swept level.
// We check BOTH 5m (structure) and 1m (precision) for the sweep.
function detectHunt(candles5m, candles1m, atr5m) {
  if (!candles5m || candles5m.length < 20 || !candles1m || candles1m.length < 10) {
    return { active: false, detail: "Insufficient candle data for hunt detection" };
  }

  // Only look at post-07:00 AM candles
  const post7am5m = filterAfterUTCHour(candles5m, 7); // 07:00 NY
  const post7am1m = filterAfterUTCHour(candles1m, 7);

  if (post7am5m.length < 10) {
    return { active: false, detail: "Not enough post-07:00 AM candles yet" };
  }

  const relLevels = findRelativeEqualLevels(post7am5m, atr5m || calcATR(candles5m, 14));
  const allRelHighs = relLevels.highs;
  const allRelLows = relLevels.lows;

  if (allRelHighs.length === 0 && allRelLows.length === 0) {
    return { active: false, detail: "No relative equal highs/lows formed yet after 07:00 AM" };
  }

  // Check for sweeps of these levels using 1m candles for precision
  const recent1m = post7am1m.slice(-20);
  let bestSweep = null;

  // Check relative equal highs (bearish setup)
  for (const level of allRelHighs) {
    for (const c of recent1m) {
      if (c.high > level.price) {
        // Sweep detected — check if price reversed back below
        const lastClose = recent1m[recent1m.length - 1].close;
        if (lastClose < level.price) {
          if (!bestSweep || level.price > bestSweep.sweepPrice) {
            bestSweep = {
              type: "BEARISH",
              swept: "RELATIVE EQUAL HIGHS",
              sweepPrice: level.price,
              levelDetail: level.detail,
              sweepTime: c.time,
              currentPrice: lastClose,
              reversed: true,
            };
          }
        } else if (!bestSweep) {
          bestSweep = {
            type: "BEARISH",
            swept: "RELATIVE EQUAL HIGHS",
            sweepPrice: level.price,
            levelDetail: level.detail,
            sweepTime: c.time,
            currentPrice: lastClose,
            reversed: false,
          };
        }
        break;
      }
    }
  }

  // Check relative equal lows (bullish setup)
  for (const level of allRelLows) {
    for (const c of recent1m) {
      if (c.low < level.price) {
        const lastClose = recent1m[recent1m.length - 1].close;
        if (lastClose > level.price) {
          if (!bestSweep || level.price < bestSweep.sweepPrice) {
            bestSweep = {
              type: "BULLISH",
              swept: "RELATIVE EQUAL LOWS",
              sweepPrice: level.price,
              levelDetail: level.detail,
              sweepTime: c.time,
              currentPrice: lastClose,
              reversed: true,
            };
          }
        } else if (!bestSweep) {
          bestSweep = {
            type: "BULLISH",
            swept: "RELATIVE EQUAL LOWS",
            sweepPrice: level.price,
            levelDetail: level.detail,
            sweepTime: c.time,
            currentPrice: lastClose,
            reversed: false,
          };
        }
        break;
      }
    }
  }

  if (!bestSweep) {
    // No sweep yet — report what levels are forming
    const highPrices = allRelHighs.map(l => l.price.toFixed(5)).join(", ");
    const lowPrices = allRelLows.map(l => l.price.toFixed(5)).join(", ");
    return {
      active: false,
      detail: `No sweep yet. Relative equal highs: [${highPrices || 'none'}] | Relative equal lows: [${lowPrices || 'none'}]`,
      relEqualHighs: allRelHighs,
      relEqualLows: allRelLows,
    };
  }

  return {
    active: true,
    direction: bestSweep.type === "BEARISH" ? "BEARISH (highs swept → reversal down)" : "BULLISH (lows swept → reversal up)",
    swept: bestSweep.swept,
    sweepPrice: bestSweep.sweepPrice,
    sweepTime: bestSweep.sweepTime,
    reversed: bestSweep.reversed,
    currentPrice: bestSweep.currentPrice,
    levelDetail: bestSweep.levelDetail,
    relEqualHighs: allRelHighs,
    relEqualLows: allRelLows,
    detail: bestSweep.reversed
      ? `${bestSweep.type}: ${bestSweep.swept} swept at ${bestSweep.sweepPrice.toFixed(5)} and price reversed back. Hunt complete — waiting for MSS.`
      : `${bestSweep.type}: ${bestSweep.swept} swept at ${bestSweep.sweepPrice.toFixed(5)}. Waiting for reversal.`
  };
}

// ═══ 4. MSS CONFIRMATION (Market Structure Shift) ═══
// ICT: "MSS is required before any entry. A wick alone is insufficient."
// Bearish MSS: after sweeping relative equal highs, price must CLOSE below prior swing low
// Bullish MSS: after sweeping relative equal lows, price must CLOSE above prior swing high
function confirmMSS(candles5m, hunt) {
  if (!hunt || !hunt.active || !hunt.reversed) {
    return { confirmed: false, detail: "Hunt not complete — MSS not checked" };
  }
  if (!candles5m || candles5m.length < 20) {
    return { confirmed: false, detail: "Insufficient candle data for MSS check" };
  }

  const swings = findSwings(candles5m, 2);
  if (swings.length < 3) {
    return { confirmed: false, detail: "Not enough swing points for MSS check" };
  }

  const isBearish = hunt.direction.includes("BEARISH");
  const isBullish = hunt.direction.includes("BULLISH");

  // Find the sweep candle index in 5m
  let sweepIdx = -1;
  for (let i = candles5m.length - 1; i >= 0; i--) {
    if (candles5m[i].time === hunt.sweepTime || new Date(candles5m[i].time).getTime() >= new Date(hunt.sweepTime).getTime()) {
      sweepIdx = i;
    }
  }
  if (sweepIdx < 0) sweepIdx = candles5m.length - 5; // fallback

  if (isBearish) {
    // Find the last swing LOW before the sweep
    let priorSwingLow = null;
    for (const s of swings) {
      if (s.type === "low" && s.index < sweepIdx) {
        priorSwingLow = s;
      }
    }
    if (!priorSwingLow) {
      return { confirmed: false, detail: "No prior swing low found for bearish MSS" };
    }

    // Check if any candle AFTER the sweep CLOSED below the prior swing low
    for (let i = sweepIdx; i < candles5m.length; i++) {
      if (candles5m[i].close < priorSwingLow.price) {
        return {
          confirmed: true,
          direction: "BEARISH",
          priorSwing: priorSwingLow.price,
          priorSwingTime: priorSwingLow.time,
          mssCandle: candles5m[i].time,
          mssPrice: candles5m[i].close,
          detail: `MSS CONFIRMED: Close ${candles5m[i].close.toFixed(5)} below prior swing low ${priorSwingLow.price.toFixed(5)} at ${new Date(candles5m[i].time).toLocaleTimeString("en-US", {timeZone:"America/New_York", hour12:false})} NY`
        };
      }
    }
    return { confirmed: false, detail: `Awaiting close below prior swing low @ ${priorSwingLow.price.toFixed(5)}` };

  } else if (isBullish) {
    // Find the last swing HIGH before the sweep
    let priorSwingHigh = null;
    for (const s of swings) {
      if (s.type === "high" && s.index < sweepIdx) {
        priorSwingHigh = s;
      }
    }
    if (!priorSwingHigh) {
      return { confirmed: false, detail: "No prior swing high found for bullish MSS" };
    }

    // Check if any candle AFTER the sweep CLOSED above the prior swing high
    for (let i = sweepIdx; i < candles5m.length; i++) {
      if (candles5m[i].close > priorSwingHigh.price) {
        return {
          confirmed: true,
          direction: "BULLISH",
          priorSwing: priorSwingHigh.price,
          priorSwingTime: priorSwingHigh.time,
          mssCandle: candles5m[i].time,
          mssPrice: candles5m[i].close,
          detail: `MSS CONFIRMED: Close ${candles5m[i].close.toFixed(5)} above prior swing high ${priorSwingHigh.price.toFixed(5)} at ${new Date(candles5m[i].time).toLocaleTimeString("en-US", {timeZone:"America/New_York", hour12:false})} NY`
        };
      }
    }
    return { confirmed: false, detail: `Awaiting close above prior swing high @ ${priorSwingHigh.price.toFixed(5)}` };
  }

  return { confirmed: false, detail: "Could not determine MSS direction" };
}

// ═══ 5. IFVG DETECTION + CONSEQUENT ENCROACHMENT ═══
// ICT: "Mark the very FIRST Fair Value Gap formed PRIOR to the stop hunt"
// That FVG gets filled during the hunt → becomes IFVG
// Entry at CE (Consequent Encroachment) = 50% midpoint of the IFVG
function detectIFVG(candles1m, hunt, candles5m) {
  if (!candles1m || candles1m.length < 5 || !hunt?.active || !hunt?.reversed) {
    return { found: false, detail: "Hunt not complete — IFVG not checked" };
  }

  const isBearish = hunt.direction.includes("BEARISH");
  const isBullish = hunt.direction.includes("BULLISH");

  // Find all FVGs formed AFTER 07:00 AM and BEFORE the hunt sweep
  const post7am1m = filterAfterUTCHour(candles1m, 7);
  if (post7am1m.length < 4) return { found: false, detail: "Not enough post-07:00 1m candles for IFVG" };

  // Find sweep candle time and index
  const sweepTime = new Date(hunt.sweepTime).getTime();
  let sweepIdx1m = post7am1m.length - 1;
  for (let i = 0; i < post7am1m.length; i++) {
    if (new Date(post7am1m[i].time).getTime() >= sweepTime) {
      sweepIdx1m = i;
      break;
    }
  }

  // Find ALL FVGs between 07:00 AM and the sweep
  // The FIRST one (chronologically) is the IFVG
  const fvgs = [];
  for (let i = 1; i < sweepIdx1m && i < post7am1m.length - 1; i++) {
    const prev = post7am1m[i - 1];
    const curr = post7am1m[i];
    const next = post7am1m[i + 1];

    // Bullish FVG (BISI): next.low > prev.high → gap up
    if (next.low > prev.high) {
      const gap = next.low - prev.high;
      fvgs.push({
        index: i, time: post7am1m[i].time,
        type: "bullish",
        top: next.low, bottom: prev.high,
        gap: gap,
        ce: prev.high + gap / 2, // Consequent Encroachment = 50%
        detail: `Bullish FVG: ${prev.high.toFixed(5)} → ${next.low.toFixed(5)} (gap: ${gap.toFixed(5)})`
      });
    }
    // Bearish FVG (SIBI): next.high < prev.low → gap down
    if (next.high < prev.low) {
      const gap = prev.low - next.high;
      fvgs.push({
        index: i, time: post7am1m[i].time,
        type: "bearish",
        top: prev.low, bottom: next.high,
        gap: gap,
        ce: next.high + gap / 2, // Consequent Encroachment = 50%
        detail: `Bearish FVG: ${prev.low.toFixed(5)} → ${next.high.toFixed(5)} (gap: ${gap.toFixed(5)})`
      });
    }
  }

  if (fvgs.length === 0) {
    return { found: false, detail: "No FVGs formed between 07:00 AM and the hunt — check breaker block" };
  }

  // The FIRST FVG chronologically is the IFVG
  const firstFVG = fvgs[0];

  // For bearish setup: we want a bullish FVG that got filled (price came back down into it)
  // For bullish setup: we want a bearish FVG that got filled (price came back up into it)
  // The IFVG is that first FVG, now acting as support/resistance in the opposite direction

  // Check if the first FVG was filled during the hunt
  let wasFilled = false;
  for (let i = firstFVG.index + 1; i < post7am1m.length; i++) {
    const c = post7am1m[i];
    if (firstFVG.type === "bullish") {
      // Bullish FVG filled when price trades below its bottom
      if (c.low < firstFVG.bottom) { wasFilled = true; break; }
    } else {
      // Bearish FVG filled when price trades above its top
      if (c.high > firstFVG.top) { wasFilled = true; break; }
    }
  }

  // The IFVG's type flips: bullish FVG → bearish IFVG (resistance), bearish FVG → bullish IFVG (support)
  const ifvgType = firstFVG.type === "bullish" ? "BEARISH IFVG (inverted)" : "BULLISH IFVG (inverted)";
  const entryPrice = firstFVG.ce;

  return {
    found: true,
    type: ifvgType,
    originalType: firstFVG.type,
    top: firstFVG.top,
    bottom: firstFVG.bottom,
    ce: entryPrice,
    gap: firstFVG.gap,
    fvgTime: firstFVG.time,
    wasFilled,
    isFirstFVG: true,
    totalFvgsBeforeHunt: fvgs.length,
    entry: entryPrice,
    detail: `${ifvgType} | First FVG: ${firstFVG.detail} | CE entry: ${entryPrice.toFixed(5)} | Filled: ${wasFilled ? 'YES' : 'PARTIAL'} | ${fvgs.length} total FVGs before hunt`
  };
}

// ═══ 6. BREAKER BLOCK DETECTION (backup entry) ═══
// ICT: When no IFVG is present, use the breaker block.
// Breaker = a failed order block that forms after the swing break.
function detectBreakerBlock(candles5m, hunt, mss) {
  if (!hunt?.active || !mss?.confirmed) return null;

  const isBearish = mss.direction === "BEARISH";
  const swings = findSwings(candles5m, 2);

  // Find the last opposing candle before the MSS break
  if (isBearish) {
    // Bearish breaker: last bullish candle before the break
    // That candle's body becomes the breaker zone
    for (let i = candles5m.length - 1; i >= 0; i--) {
      const c = candles5m[i];
      if (c.close > c.open && c.close <= mss.priorSwing) {
        return {
          found: true,
          type: "BEARISH BREAKER",
          high: Math.max(c.open, c.close),
          low: Math.min(c.open, c.close),
          entry: c.close,
          time: c.time,
          detail: `Bearish breaker block @ ${c.close.toFixed(5)} — last bullish candle before MSS`
        };
      }
    }
  } else {
    // Bullish breaker: last bearish candle before the break
    for (let i = candles5m.length - 1; i >= 0; i--) {
      const c = candles5m[i];
      if (c.close < c.open && c.close >= mss.priorSwing) {
        return {
          found: true,
          type: "BULLISH BREAKER",
          high: Math.max(c.open, c.close),
          low: Math.min(c.open, c.close),
          entry: c.close,
          time: c.time,
          detail: `Bullish breaker block @ ${c.close.toFixed(5)} — last bearish candle before MSS`
        };
      }
    }
  }

  return { found: false, detail: "No breaker block identified" };
}

// ═══ 7. POST-HUNT SL REFERENCE ═══
// ICT: "Stop goes above the swing high formed AFTER the 07:00 AM liquidity hunt"
// "Beyond the entire post-07:00 AM swing — not just at the MSS pivot"
function getPostHuntSL(candles5m, hunt, mss) {
  if (!hunt?.active || !candles5m || candles5m.length < 10) return null;

  const post7am5m = filterAfterUTCHour(candles5m, 7);
  if (post7am5m.length < 5) return null;

  const isBearish = hunt.direction.includes("BEARISH");
  const isBullish = hunt.direction.includes("BULLISH");
  const atr = calcATR(candles5m, 14);

  // Find the post-hunt swing extreme
  if (isBearish) {
    // For bearish: SL above the swing HIGH formed AFTER the hunt sweep
    const sweepTime = new Date(hunt.sweepTime).getTime();
    const postSweepCandles = post7am5m.filter(c => new Date(c.time).getTime() >= sweepTime);
    if (postSweepCandles.length < 2) {
      // Fallback: use highest high of post-7AM candles
      const highestHigh = Math.max(...post7am5m.map(c => c.high));
      return {
        price: highestHigh + atr * 0.3,
        swingPrice: highestHigh,
        source: "Post-07:00 AM high (fallback — not enough post-sweep candles)",
        detail: `SL above post-07:00 AM high @ ${highestHigh.toFixed(5)} + buffer`
      };
    }
    const postSweepHigh = Math.max(...postSweepCandles.map(c => c.high));
    return {
      price: postSweepHigh + atr * 0.3,
      swingPrice: postSweepHigh,
      source: "Post-hunt swing high",
      detail: `SL above post-hunt swing high @ ${postSweepHigh.toFixed(5)} + ${(atr * 0.3).toFixed(5)} buffer`
    };
  } else if (isBullish) {
    // For bullish: SL below the swing LOW formed AFTER the hunt sweep
    const sweepTime = new Date(hunt.sweepTime).getTime();
    const postSweepCandles = post7am5m.filter(c => new Date(c.time).getTime() >= sweepTime);
    if (postSweepCandles.length < 2) {
      const lowestLow = Math.min(...post7am5m.map(c => c.low));
      return {
        price: lowestLow - atr * 0.3,
        swingPrice: lowestLow,
        source: "Post-07:00 AM low (fallback — not enough post-sweep candles)",
        detail: `SL below post-07:00 AM low @ ${lowestLow.toFixed(5)} - buffer`
      };
    }
    const postSweepLow = Math.min(...postSweepCandles.map(c => c.low));
    return {
      price: postSweepLow - atr * 0.3,
      swingPrice: postSweepLow,
      source: "Post-hunt swing low",
      detail: `SL below post-hunt swing low @ ${postSweepLow.toFixed(5)} - ${(atr * 0.3).toFixed(5)} buffer`
    };
  }

  return null;
}

// ═══ 8. 30-MINUTE REVERSAL CHECK ═══
// ICT: "After 07:00 AM, 08:00 AM, and 09:00 AM in the first 30 minutes,
// expect something opposite."
function check30MinReversal() {
  const now = new Date();
  const nyHour = ny.getNYHour();
  const minutesIntoHour = now.getUTCMinutes();

  const reversalWindows = [7, 8, 9]; // 07:00, 08:00, 09:00 AM NY
  for (const h of reversalWindows) {
    if (nyHour === h && minutesIntoHour < 30) {
      return {
        active: true,
        hour: h,
        minutesRemaining: 30 - minutesIntoHour,
        warning: `⚠️ ${h}:00 AM 30-MIN REVERSAL WINDOW ACTIVE — expect OPPOSITE direction. ${30 - minutesIntoHour}m remaining. Do NOT enter against the reversal.`,
      };
    }
  }

  return { active: false, detail: "Outside 30-minute reversal windows" };
}

// ═══ 9. FIBONACCI TAKE PROFIT TARGETS ═══
// ICT: Draw Fib from post-hunt swing → 07:00 AM opening price
// TP at -2 and -2.5 extensions (staged exits)
function calculateFibTargets(candles5m, hunt, mss) {
  if (!hunt?.active || !mss?.confirmed || !candles5m || candles5m.length < 10) return null;

  const isBearish = mss.direction === "BEARISH";
  const isBullish = mss.direction === "BULLISH";

  // Find 07:00 AM opening price (first candle at/after 07:00 NY)
  const post7am5m = filterAfterUTCHour(candles5m, 7);
  if (post7am5m.length < 2) return null;
  const sevenAMOpen = post7am5m[0].open;

  // Find post-hunt swing extreme
  const sweepTime = new Date(hunt.sweepTime).getTime();
  const postSweepCandles = post7am5m.filter(c => new Date(c.time).getTime() >= sweepTime);

  if (isBearish) {
    // Sell: fib from post-hunt HIGH → 07:00 AM opening LOW
    const postHuntHigh = postSweepCandles.length > 0
      ? Math.max(...postSweepCandles.map(c => c.high))
      : Math.max(...post7am5m.map(c => c.high));
    const fibStart = postHuntHigh;
    const fibEnd = sevenAMOpen; // 07:00 AM open as the low reference

    if (fibStart <= fibEnd) return null;

    const range = fibStart - fibEnd;
    const tp2Ext = fibEnd - range * 2;   // -2 extension
    const tp25Ext = fibEnd - range * 2.5; // -2.5 extension

    return {
      fibStart, fibEnd, range,
      tp1: tp2Ext, tp1Label: "-2.0 Fib ext",
      tp2: tp25Ext, tp2Label: "-2.5 Fib ext",
      detail: `Fib: ${fibStart.toFixed(5)} → ${fibEnd.toFixed(5)} | TP1 (-2.0): ${tp2Ext.toFixed(5)} | TP2 (-2.5): ${tp25Ext.toFixed(5)}`
    };
  } else if (isBullish) {
    // Buy: fib from post-hunt LOW → 07:00 AM opening HIGH
    const postHuntLow = postSweepCandles.length > 0
      ? Math.min(...postSweepCandles.map(c => c.low))
      : Math.min(...post7am5m.map(c => c.low));
    const fibStart = postHuntLow;
    const fibEnd = sevenAMOpen; // 07:00 AM open as the high reference

    if (fibStart >= fibEnd) return null;

    const range = fibEnd - fibStart;
    const tp2Ext = fibEnd + range * 2;   // -2 extension
    const tp25Ext = fibEnd + range * 2.5; // -2.5 extension

    return {
      fibStart, fibEnd, range,
      tp1: tp2Ext, tp1Label: "-2.0 Fib ext",
      tp2: tp25Ext, tp2Label: "-2.5 Fib ext",
      detail: `Fib: ${fibStart.toFixed(5)} → ${fibEnd.toFixed(5)} | TP1 (-2.0): ${tp2Ext.toFixed(5)} | TP2 (-2.5): ${tp25Ext.toFixed(5)}`
    };
  }

  return null;
}

// ═══ EXPORTED WRAPPER — callable from run_pair.cjs ═══
function runLecture2Setup(pair, date, root) {
  const r = root || ROOT;
  const d = date || DATE;
  const p = pair || PAIR;

  // ═══ TIME GATE: 07:00-08:00 NY only ═══
  const nyHour = ny.getNYHour();
  if (nyHour < 7 || nyHour >= 8) {
    return { pair: p, time: new Date().toLocaleTimeString("en-US", {timeZone:"America/New_York", hour12:false}) + " NY",
      hunt: { active: false }, mss: { confirmed: false }, ifvg: { found: false }, setupReady: false,
      detail: `Outside Lecture 2 window (07:00-08:00 NY). Current: ${nyHour}:00 NY.` };
  }

  // Step 1: London range (draw reference)
  const londonRange = getLondonRange(r, p);

  // Step 2: Get candle data
  const candles5m = getCandles("5m", d, r, p);
  const candles1m = getCandles("1m", d, r, p);
  const atr5m = candles5m ? calcATR(candles5m, 14) : 0;

  // Step 3: Hunt detection — relative equal levels post-07:00 AM
  const hunt = detectHunt(candles5m, candles1m, atr5m);

  // Step 4: MSS confirmation
  const mss = confirmMSS(candles5m, hunt);

  // Step 5: IFVG detection (first FVG before hunt, CE entry)
  const ifvg = detectIFVG(candles1m, hunt, candles5m);

  // Step 6: Breaker block (backup entry)
  const breaker = detectBreakerBlock(candles5m, hunt, mss);

  // Step 7: Post-hunt SL reference
  const postHuntSL = getPostHuntSL(candles5m, hunt, mss);

  // Step 8: 30-minute reversal check
  const reversalCheck = check30MinReversal();

  // Step 9: Fibonacci take profit targets
  const fibTargets = calculateFibTargets(candles5m, hunt, mss);

  // Determine setup readiness
  const hasEntry = ifvg?.found || breaker?.found;
  const setupReady = hunt?.active && hunt?.reversed && mss?.confirmed && hasEntry;
  const direction = hunt?.direction?.includes("BEARISH") ? "SELL" : hunt?.direction?.includes("BULLISH") ? "BUY" : null;

  // Build detail string
  let detailStr = "";
  if (setupReady) {
    const entrySource = ifvg?.found ? `IFVG CE @ ${ifvg.ce.toFixed(5)}` : `Breaker @ ${breaker.entry.toFixed(5)}`;
    detailStr = `LECTURE 2 SETUP READY (${direction}): ${hunt.swept} swept. MSS confirmed. Entry: ${entrySource}. SL: ${postHuntSL?.detail || 'N/A'}. ${fibTargets?.detail || ''}`;
  } else if (hunt?.active && hunt?.reversed && !mss?.confirmed) {
    detailStr = `Hunt complete — AWAITING MSS: ${mss?.detail || 'checking...'}`;
  } else if (hunt?.active && !hunt?.reversed) {
    detailStr = `Hunt active — AWAITING REVERSAL: ${hunt.detail}`;
  } else if (hunt?.active) {
    detailStr = hunt.detail;
  } else {
    detailStr = hunt?.detail || "No hunt detected.";
  }

  return {
    pair: p,
    time: new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }) + " NY",
    // Context
    londonRange: londonRange ? {
      high: londonRange.high, low: londonRange.low,
      range: londonRange.range, source: londonRange.source
    } : null,
    // Hunt
    hunt: hunt || { active: false },
    relEqualHighs: hunt?.relEqualHighs || [],
    relEqualLows: hunt?.relEqualLows || [],
    // MSS
    mss: mss || { confirmed: false },
    // Entry
    ifvg: ifvg || { found: false, detail: "Not checked" },
    breaker: breaker || { found: false },
    // SL
    postHuntSL: postHuntSL || null,
    // Filters
    reversalCheck: reversalCheck || { active: false },
    // Targets
    fibTargets: fibTargets || null,
    // Summary
    setupReady,
    direction,
    entryPrice: ifvg?.found ? ifvg.ce : (breaker?.found ? breaker.entry : null),
    slReference: postHuntSL?.price || null,
    slSource: postHuntSL?.source || null,
    detail: detailStr,
  };
}

module.exports = {
  getLondonRange, detectHunt, confirmMSS, detectIFVG,
  detectBreakerBlock, getPostHuntSL, check30MinReversal,
  calculateFibTargets, runLecture2Setup,
  // Helpers shared with Lecture 4
  findSwings, findRelativeEqualLevels, calcATR,
  filterAfterUTCHour, findFirstCandleAtUTCHour
};

// ═══ CLI MODE — only runs when invoked directly ═══
if (require.main === module) {
  const result = runLecture2Setup(PAIR, DATE, ROOT);
  // Format numbers for display
  if (result.londonRange) {
    result.londonRange.high = Number(result.londonRange.high.toFixed(5));
    result.londonRange.low = Number(result.londonRange.low.toFixed(5));
    result.londonRange.range = Number(result.londonRange.range.toFixed(5));
  }
  console.log(JSON.stringify(result, null, 2));
}
