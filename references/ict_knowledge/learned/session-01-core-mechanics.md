# ICT Learning Session — Tier 1: Core Mechanics

**Date**: 2026-07-27
**Concepts Learned**: 26
**Est. Study Time**: ~278 minutes

---

## Concept Summaries

### fair-value-gap-trading-strategy

ICT fair value gap is a three-candle structure indicating a gap between the high and low of the 1st and 3rd candlesticks. The gap between the three candles is created because price does not retrace into that area and leaves it open. You can see the example of an ICT FVG in the picture below.

**Key Rules:**
1. Read the higher-timeframe context. 1-day and 4-hour charts — bullish, bearish or neutral structure
2. Identify premium / discount. Bullish bias targets discount FVGs; bearish bias targets premium FVGs
3. Mark the bias-aligned FVG. Three-candle pattern with the gap between the 1st-candle and 3rd-candle wicks
4. Wait for price to retrace to the FVG. Bullish — price comes down to the discount FVG. Bearish — price rallies up to the premium FVG
5. Drop to the lower timeframe (5-minute or 15-minute). For the entry trigger
6. Wait for the lower-timeframe MSS at the FVG. A clean break of the most recent counter-trend swing point in the bias direction
7. Enter on the post-MSS retest. At the consequent encroachment (50% of the FVG) or at the IOFED (the very edge of the FVG)

**When NOT to Use / Avoid:**
- you can jump to the section you are most interested in from below or continue reading the full article for a complete view.
- **step 5 — mark the fair value gap.** in a bullish trend, mark the gap between the high of the first candle and the low of the third candle. in a bearish trend, mark the gap between the low of the fir
- **step 6 — execute the trade.** if price is in a bullish trend, wait for price to retrace and test the discount fair value gap to balance the move. when price tests the discount fair value gap, execut

**Source**: `01 - ICT Trading Tutorials\fair-value-gap-trading-strategy.md`

---

### ict-balanced-price-range-bpr

The ICT Balanced Price Range is built on top of the [ICT Fair Value Gap](<https://innercircletrader.net/tutorials/fair-value-gap-trading-strategy/> "ICT Fair Value Gap"). To work with the BPR you should already understand the FVG — three-candle imbalance, gap between candle 1 high and candle 3 low (

**Key Rules:**
1. Mark a fair value gap on the sell side of price (a bearish FVG)
2. Mark a fair value gap on the buy side of price (a bullish FVG)
3. Confirm the two FVGs are horizontally opposite — meaning they cover overlapping price ranges from opposite directions
4. Mark the area where both fair value gaps intersect. That intersection is the BPR
5. Mark the higher-timeframe PD Array on the daily, 4-hour, or 1-hour chart — the level where the institutional move is expected to begin
6. Wait for price to approach the higher-timeframe PD Array. Do not pre-position
7. Drop to the 5-minute or 3-minute chart at the moment of the tap

**When to Use:**
- the reliability is conditional on three filters: alignment with the daily bias, the bpr sitting in the right zone (discount for bullish trades, premium for bearish trades), and a confirming market str

**When NOT to Use / Avoid:**
- 1. **set the daily bias** using [ict daily bias](<https://innercircletrader.net/tutorials/ict-daily-bias-explained/>). bpr trades work cleanest in the direction of the higher-timeframe bias.
- 2. **mark the higher-timeframe pd array** on the daily, 4-hour, or 1-hour chart — the level where the institutional move is expected to begin.
- 4. **drop to the 5-minute or 3-minute chart** at the moment of the tap.

**Source**: `01 - ICT Trading Tutorials\ict-balanced-price-range-bpr.md`

---

### ict-bearish-order-block

The ICT bearish order block is the zone on a price chart where a large number of sell orders are placed by smart money, and the market shows a sudden, strong move from that area. Retail traders follow smart-money footprints, so they wait for these order-block zones to sell in the market and profit a

**Key Rules:**
1. Confirm bearish trend. Lower highs and lower lows on the daily and H4. The bearish OB works best in a bearish higher-timeframe context
2. Spot the candle pair. A bullish candle followed by a strong bearish candle that fully engulfs it body-to-body and wick-to-wick
3. Mark the order block zone. The body of the bullish candle defines the zone
4. Mark the next draw on liquidity. Old low or relative equal low below the OB — this is the profit target
5. Wait for the retest. Price must come back to the bearish order block
6. Drop to the lower timeframe. 15-minute or 5-minute for the entry trigger
7. Wait for the LTF MSS. A clean Market Structure Shift to the downside confirms intent at the OB retest

**When NOT to Use / Avoid:**
- these are the recurring mistakes i see when traders first start trading bearish ob setups.
- 1. **trading bearish ob in a bullish trend.** the bearish ob is a continuation pattern. against the higher-timeframe bias, it usually fails to hold and price runs through to the next liquidity level.
- 2. **skipping the engulfing rule.** the bearish candle must engulf the bullish candle body-to-body and wick-to-wick. partial engulfing is not a valid ob.

**Source**: `01 - ICT Trading Tutorials\ict-bearish-order-block.md`

---

### ict-breaker-block-trading

A breaker block is a failed order block, identified after a liquidity sweep and a Market Structure Shift. It is one of the cleanest reversal triggers in the ICT method. No strategy is foolproof, ICT included. Traders position at bullish order blocks with stops below the OB low, and at bearish order 

**Key Rules:**
1. A clean [Liquidity Sweep](<https://innercircletrader.net/tutorials/ict-liquidity-sweep-vs-liquidity-run/>)
2. A valid bearish order block at the swept extreme
3. Price closing above the high of the bearish order block
4. A confirming [Market Structure Shift](<https://innercircletrader.net/tutorials/ict-market-structure-shift/>) to the upside
5. A clean liquidity sweep
6. A valid bullish order block at the swept extreme
7. Price closing below the low of the bullish order block

**When NOT to Use / Avoid:**
- 1. **set the daily bias** using [ict daily bias](<https://innercircletrader.net/tutorials/ict-daily-bias-trick/>). breaker trades only work in the direction of the higher-timeframe bias.
- 2. **mark the higher-timeframe pd array** on the daily, 4-hour, or 1-hour chart — the order block where institutions positioned.
- 3. **wait for the liquidity sweep** at the ob extreme. the sweep is the trigger event that flips the ob into a potential breaker.

**Source**: `01 - ICT Trading Tutorials\ict-breaker-block-trading.md`

---

### ict-bullish-order-block

The ICT bullish order block is the zone on a price chart where a large number of buy orders are executed by institutional traders, and the market shows a sudden, strong move from that area. Retail traders follow institutional footprints, so they wait for these order-block zones to buy in the market 

**Key Rules:**
1. Confirm bullish trend. Higher highs and higher lows on the daily and H4. The bullish OB works best in a bullish higher-timeframe context
2. Spot the candle pair. A bearish candle followed by a strong bullish candle that fully engulfs it body-to-body and wick-to-wick
3. Mark the order block zone. The body of the bearish candle defines the zone
4. Mark the next draw on liquidity. Old high or relative equal high above the OB — this is the profit target
5. Wait for the retest. Price must come back to the bullish order block
6. Drop to the lower timeframe. 15-minute or 5-minute for the entry trigger
7. Wait for the LTF MSS. A clean Market Structure Shift to the upside confirms intent at the OB retest

**When NOT to Use / Avoid:**
- these are the recurring mistakes i see when traders first start trading bullish ob setups.
- 1. **trading bullish ob in a bearish trend.** the bullish ob is a continuation pattern. against the higher-timeframe bias, it usually fails to hold and price runs through to the next liquidity level.
- 2. **skipping the engulfing rule.** the bullish candle must engulf the bearish candle body-to-body and wick-to-wick. partial engulfing is not a valid ob.

**Source**: `01 - ICT Trading Tutorials\ict-bullish-order-block.md`

---

### ict-consequent-encroachment

Consequent encroachment is the 50% measure of an ICT fair value gap (or any [PD array](<https://innercircletrader.net/tutorials/ict-pd-array-key-to-trade-execution/>) in the ICT framework). Being an ICT trader, you have likely noticed that you may miss a trade while waiting for a fair value gap or o

**Key Rules:**
1. Set the daily bias. Bullish, bearish or neutral on the daily and H4
2. Identify the higher-timeframe PD array. Order block, FVG or breaker that price is drawn to, in the direction of the daily bias
3. Mark the next draw on liquidity. Old high/low or relative equal level beyond the PD array — this is the profit target
4. Wait for price to tap the PD array. Price must reach into the higher-timeframe PD array
5. Drop to the lower timeframe. 5-minute or 1-minute for the trigger
6. Wait for the MSS. A clean Market Structure Shift on the lower timeframe confirms the reversal
7. Mark the CE of the new FVG. Drop the Fibonacci from the FVG high to the FVG low and mark the 50% line — that is the CE

**When NOT to Use / Avoid:**
- you identify the consequent encroachment level of the fvg and wait for price to mitigate that level for trade execution.
- while price might not fully mitigate the fvg, there is a higher probability that it will address the consequent encroachment, providing an opportunity for trade entry.
- these are the recurring mistakes i see when traders first start trading off the ce.

**Source**: `01 - ICT Trading Tutorials\ict-consequent-encroachment.md`

---

### ict-displacement-move

The word “displacement” means changing position from one place to another. ICT displacement means an energetic and quick price movement having strong momentum, which can be bullish or bearish. The idea behind the displacement move is that whenever price moves quickly with strong momentum, it indicat

**Key Rules:**
1. First, look for a bullish market structure.
2. After confirmation , execute a buy trade targeting the next draw on liquidity levels
3. First, look for a bearish market structure.
4. When price retraces back and tests the discount zone , look for bearish trade confirmations like an ICT Market Structure Shift on a lower timeframe
5. After confirmation , execute a sell trade targeting the next draw on liquidity levels

**Source**: `01 - ICT Trading Tutorials\ict-displacement-move.md`

---

### ict-enigma-fair-value-gap

A traditional Fair Value Gap is an imbalance created when a strong displacement candle leaves an inefficient area between three consecutive candles. The Enigma Fair Value Gap takes that idea one step further. Instead of waiting for the gap to form and then trading its retracement, the Enigma model p

**When NOT to Use / Avoid:**
- ![bullish ict enigma projection example, fibonacci drawn from the open of candle 2 to the low of candle 3 with the 1.25 low hanging fruit level projected ahead](https://innercircletrader.net/wp-conten
- the enigma model is powerful but easy to misuse. these are the errors that ruin it most often.
- 1. **anchoring from the wrong candle.** projection starts from the open of candle 2, and protraction starts from the close of candle 1. mixing the two anchors gives you the wrong levels every time. kn

**Source**: `01 - ICT Trading Tutorials\ict-enigma-fair-value-gap.md`

---

### ict-implied-fair-value-gap-ifvg

The ICT implied fair value gap is not a typical [fair value gap](<https://innercircletrader.net/tutorials/fair-value-gap-trading-strategy/>). It is a hidden fair value gap, and the algorithm uses it to reprice and balance price delivery. It forms when price falls or rises with a displacement move an

**Key Rules:**
1. Set the higher-timeframe trend. Daily and H4 — bullish or bearish
2. Mark the higher-timeframe PD array. Order block, FVG or breaker that price is drawn to
3. Wait for price to tap the PD array. Confirmation that the algorithm is reaching for the level
4. Drop to the lower timeframe. 5-minute or 1-minute for the trigger
5. Watch for a Market Structure Shift. The MSS confirms the reversal at the PD array
6. Spot the displacement candle. The largest-body candle in the displacement leg after the MSS
7. Verify the wick overlap. The wicks of the candles before and after the large candle must overlap its body — leaving no visual FVG

**When NOT to Use / Avoid:**
- * **implied fvg (this article)** — hidden gap inside a 3-candle displacement where the wicks of the 1st and 3rd candle do overlap the body of the middle candle. marked between the ce of the surroundin
- * **inversion fvg** — a regular fvg that has been broken and now acts as the opposite zone (a failed fvg). covered in the [inversion fair value gap](<https://innercircletrader.net/tutorials/ict-invers
- the three concepts are commonly grouped under the umbrella term “ifvg” but only two of them legitimately abbreviate to that — the implied fvg and the inversion fvg. the regular fvg is just fvg (or bis

**Source**: `01 - ICT Trading Tutorials\ict-implied-fair-value-gap-ifvg.md`

---

### ict-institutional-order-flow-entry-drill

The ICT institutional order flow entry drill is the starting point of a fair value gap — the level from which price may reverse even by approaching a pip. A fair value gap is a three-candle structure where there is a gap between the high and low of the 1st and 3rd candlestick because of no price ret

**Key Rules:**
1. Set the daily bias. Daily and H4 — bullish or bearish
2. Identify the higher-timeframe premium / discount. Bullish bias targets the discount zone; bearish bias targets the premium zone
3. Mark the higher-timeframe PD array. Order block, FVG or breaker that price is drawn to inside the bias-aligned zone
4. Wait for price to tap the PD array. Confirmation that the algorithm is reaching for the level
5. Drop to the lower timeframe. 5-minute or 15-minute for the structure read
6. Wait for the LTF MSS. A clean Market Structure Shift in the bias direction
7. Identify the lower-timeframe FVG. The 3-candle imbalance left behind by the displacement after the MSS

**When NOT to Use / Avoid:**
- you can jump to the section you are most interested in from below or continue reading the full article for a complete view.
- these are the recurring mistakes i see when traders first start trading the iofed.
- 1. **trading iofed without a daily bias.** the iofed is a continuation entry inside a bias-aligned pd array. counter-trend iofeds deliver poorly.

**Source**: `01 - ICT Trading Tutorials\ict-institutional-order-flow-entry-drill.md`

---

### ict-inversion-fair-value-gap

The ICT Fair Value Gap is a three-candle structure with a gap between the high and low of candle 1 and candle 3. The gap represents an institutional imbalance — delivery was one-sided enough that buy and sell orders did not overlap during the move.

**Key Rules:**
1. Identify a regular fair value gap on the chart — a 3-candle imbalance with a clear unfilled gap between candle 1 and candle 3
2. Watch for price to close beyond the FVG in the opposite direction — a candle body close that violates the fair value gap
3. Identify the original fair value gap on the chart timeframe you are working with — typically the 15-minute or 5-minute for execution
4. Watch for violation — a candle body close past the FVG in the opposite direction. A wick poke is not enough
5. Mark the IFVG zone — the original FVG body is now the IFVG. Mark its high and low; the consequent encroachment (50% level) is the precise entry
6. Wait for the retest back to the IFVG. Do not chase the violation candle
7. Take profit at the next significant draw on liquidity in the trade direction — old highs, old lows, or higher-timeframe PD Array

**When NOT to Use / Avoid:**
- 1. **set the daily bias** using [ict daily bias](<https://innercircletrader.net/tutorials/ict-daily-bias-explained/>). ifvg trades work cleanest in the direction of the higher-timeframe bias.
- 2. **identify the original fair value gap** on the chart timeframe you are working with — typically the 15-minute or 5-minute for execution.
- 3. **watch for violation** — a candle body close past the fvg in the opposite direction. a wick poke is not enough.

**Source**: `01 - ICT Trading Tutorials\ict-inversion-fair-value-gap.md`

---

### ict-mitigation-block-explained

The Mitigation Block is an old, partially-mitigated order block that gets re-tested by price after the initial displacement leg has played out. The retest is the entry; the trade direction is the same as the original OB direction. The “mitigation” in the name refers to the unfilled portion of the or

**Key Rules:**
1. A valid [Order Block](<https://innercircletrader.net/tutorials/ict-order-block/>) on a higher timeframe
2. A clear displacement leg from that OB in the direction of the daily bias
3. A retracement back to the OB zone after the leg has extended
4. Wait for the retrace back to the OB zone. Do not pre-position
5. Mark the Mitigation zone — the body of the OB candle, narrowed to the most relevant single candle if the OB spans multiple bars
6. Execute the trade on the OB tap with stop loss beyond the OB extreme (above the high for bearish, below the low for bullish), with a small buffer
7. Take profit at the next significant draw on liquidity in the direction of the trend, or at the prior swing extreme

**When NOT to Use / Avoid:**
- 1. **set the daily bias** using [ict daily bias](<https://innercircletrader.net/tutorials/ict-daily-bias-trick/>). mitigation block trades only work in the direction of the higher-timeframe trend.
- 2. **identify the original order block** on the daily, 4-hour, or 1-hour chart. the ob must have already delivered a clean displacement leg in the trend direction.
- 3. **confirm the ob has not been broken** by any subsequent price action. body close past the ob extreme disqualifies it (that is a breaker, not a mitigation).

**Source**: `01 - ICT Trading Tutorials\ict-mitigation-block-explained.md`

---

### ict-new-day-opening-gap-ndog

ICT New Day Opening Gap (NDOG) is the gap between the closing price at 5:00 PM New York local time and the opening price at 6:00 PM New York local time — because trading stops for an hour every day from Monday to Thursday. On Friday, the market closes for the week-end, and the gap on Monday’s openin

**Key Rules:**
1. Mark the last 5 NDOGs on your daily chart. Closing price at 5:00 PM NY to opening price at 6:00 PM NY for each weekday
2. Mark the consequent encroachment for each. Fibonacci 0 / 0.5 / 1 from low to high of every NDOG
3. Set the daily bias. 1-day and 4-hour structure plus the higher-timeframe PD array
4. Drop to the 15-minute (or 5-minute) for the trigger. Wait for price to tap the NDOG (or the consequent encroachment)
5. Wait for confirmation. Lower-timeframe MSS, fair value gap or order block formed at the NDOG or its consequent encroachment
6. Enter on the retest. Buy at the bullish NDOG (bias up) or sell at the bearish NDOG (bias down) on the post-MSS PD array
7. Set the stop. Beyond the NDOG extreme, with a small buffer

**When NOT to Use / Avoid:**
- you can jump to the section you are most interested in from below or continue reading the full article for a complete view.
- these are the recurring mistakes i see when traders first start trading the ndog concept.
- 1. **marking only one ndog.** ict recommends at least 5 — monday through friday. a single ndog out of context is much less useful than a stack of recent ndogs.

**Source**: `01 - ICT Trading Tutorials\ict-new-day-opening-gap-ndog.md`

---

### ict-order-block

An ICT Order Block is the price area where a large number of orders were executed by institutional traders before the market made a sudden, strong move away from that level. It is the visible footprint of institutional positioning on the chart. The mechanic is simple: institutions cannot fill all of

**Key Rules:**
1. The second candle (bullish) must grab the low of the previous bearish candle — price goes below the low of the bearish OB before reversing
2. The second candle must close above the high of the previous bearish candle — a clean engulf
3. An imbalance (fair value gap) prints on the lower timeframe inside or just above the Order Block zone
4. A market structure shift to the upside on the lower timeframe confirms the bullish intent
5. The second candle (bearish) must grab the high of the previous bullish candle — price goes above the high of the bullish OB before reversing
6. The second candle must close below the low of the previous bullish candle — a clean engulf to the downside
7. An imbalance (fair value gap) prints on the lower timeframe inside or just below the Order Block zone

**When NOT to Use / Avoid:**
- 1. **set the daily bias** using [ict daily bias](<https://innercircletrader.net/tutorials/ict-daily-bias-explained/>). order block trades work cleanest in the direction of the higher-timeframe bias.
- 2. **mark the higher-timeframe[pd array](<https://innercircletrader.net/tutorials/ict-pd-array-key-to-trade-execution/>)** on the daily, 4-hour, or 1-hour chart — the level where institutional positio
- 4. **drop to the 5-minute or 3-minute chart** at the moment of the tap.

**Source**: `01 - ICT Trading Tutorials\ict-order-block.md`

---

### ict-power-of-3

The ICT Power of 3 is the trading model Michael Huddleston designed to expose smart-money manipulation in intraday markets. It is built on three sequential phases of price delivery: Accumulation, Manipulation, and Distribution. Accumulation is where institutions quietly build their positions inside 

**Key Rules:**
1. Establish daily bias on the daily and 4-hour charts before the session opens. Bullish or bearish — the AMD model only works with a clear bias
2. Mark the daily opening price at midnight New York time. The accumulation forms around this level
3. Wait for accumulation — a tight horizontal range to form near the opening price. Do not pre-position
4. Mark the accumulation range high and low. These are the levels manipulation will target
5. Wait for the manipulation move — price runs in the opposite direction of your bias, sweeping the stops on that side of the range
6. Confirm the sweep by watching for price to fail at the swept extreme and reverse
7. Drop to the lower timeframe (5-minute or 3-minute) for entry confirmation — Market Structure Shift or CISD in the direction of your bias

**When NOT to Use / Avoid:**
- 1. **establish daily bias** on the daily and 4-hour charts before the session opens. bullish or bearish — the amd model only works with a clear bias.
- 2. **mark the daily opening price** at midnight new york time. the accumulation forms around this level.
- 4. **mark the accumulation range high and low**. these are the levels manipulation will target.

**Source**: `01 - ICT Trading Tutorials\ict-power-of-3.md`

---

### ict-propulsion-block

The word “propulsion” means to push something. In trading it is a single candlestick that pushes price away from itself. The ICT propulsion block is the single candlestick which traded into an [order block](<https://innercircletrader.net/tutorials/ict-order-block/> "Order Block") — and price then mo

**Key Rules:**
1. Identify a valid order block. Bullish OB on a higher-timeframe bullish trend, or bearish OB on a higher-timeframe bearish trend
2. Spot the propulsion candle. The single candle whose body or wick traded into the order block — and from which price then moved sharply away
3. Mark the mean threshold. 50% of the propulsion candle’s range. Use the Fibonacci tool: high-to-low for bullish, low-to-high for bearish
4. Wait for the retest. Price must trade back to the propulsion candle on a later leg
5. Set the stop. 10 pips below the low of the propulsion candle (bullish) or 10 pips above the high (bearish)

**When NOT to Use / Avoid:**
- you can continue reading the whole article or jump to the section you are most interested in.
- these are the recurring mistakes i see when traders first start trading propulsion blocks.
- 1. **trading propulsion blocks outside an order block.** the propulsion block is defined as a candle that traded into an order block. without the ob context, the candle is just a single bar — not a pr

**Source**: `01 - ICT Trading Tutorials\ict-propulsion-block.md`

---

### ict-reaper-inversion-fair-value-gap

An [ICT Fair Value Gap](<https://innercircletrader.net/tutorials/fair-value-gap-trading-strategy/>) is a three-candle structure showing a gap between the high and the low of the first and third candles. The gap is created because price moved with such force that it did not retrace into that area, le

**Key Rules:**
1. Locate the Reaper IFVG. Mark the Inversion Fair Value Gap immediately before the Bullish Breaker. This is your area of interest
2. Look for confirmation. As price enters the Reaper IFVG, look for signs that buyers are returning to the market:
3. Establish a bearish bias. Begin with higher-timeframe analysis and confirm the market is bearish. Identify premium pricing within the dealing range
4. Identify the bearish Breaker. Find a bullish Order Block that has been violated to the downside and transformed into a Bearish Breaker Block
5. Locate the Reaper IFVG. Mark the Inversion Fair Value Gap immediately before the Bearish Breaker
6. Wait for price to reach premium. Instead of selling directly from the Breaker, allow price to rally into premium and reach the Reaper IFVG
7. Look for confirmation. As price enters the Reaper IFVG, look for evidence that sellers are returning:

**When NOT to Use / Avoid:**
- 1. **entering at the breaker instead of waiting for the reaper.** this is the whole reason the concept exists. if you enter at the obvious breaker level, you are the liquidity the reaper is built to c
- 2. **marking an ifvg that is not inside the breaker price leg.** a valid reaper ifvg lives within the breaker leg and in the correct premium or discount zone. any other inversion gap on the chart is n
- 3. **trading without higher-timeframe bias.** the reaper ifvg is a refinement tool, not a standalone signal. counter-bias setups fail far more often. confirm the daily bias before you act.

**Source**: `01 - ICT Trading Tutorials\ict-reaper-inversion-fair-value-gap.md`

---

### ict-reclaimed-order-block

Reclaimed order blocks are the areas where institutional traders accumulate their positions by hedging, and the market shows a minor displacement at that area. Later on, these blocks are reclaimed and act as support or resistance to push price up or down. As you know, the market moves like a curve a

**Key Rules:**
1. Confirm the Market Maker model. Bullish setup — Market Maker Buy Model. Bearish setup — Market Maker Sell Model
2. Mark the higher-timeframe PD array. Order block, FVG or breaker on the daily or H4
3. Watch for accumulation candles. Multiple small-bodied candles with minor displacement — institutional hedging in progress
4. Wait for the reclaim. Price must shift momentum and return to the reclaimed OB candle on the opposite-side curve
5. Drop to the lower timeframe. 5-minute or 1-minute for the entry trigger and confirmation
6. Enter on the retest. Buy at the reclaimed OB on a bullish setup; sell at the reclaimed OB on a bearish setup
7. Set the stop. Below the low of the reclaimed OB (bullish) or above the high (bearish), with a small buffer

**When NOT to Use / Avoid:**
- these are the recurring mistakes i see when traders first start trading reclaimed obs.
- 1. **trading reclaimed obs without the market maker model.** the reclaimed ob is defined inside the market maker buy/sell model curve. without that broader context, the candle is just an order block —
- 2. **wrong side of the curve.** bullish reclaimed obs sit on the sell side of the curve. bearish reclaimed obs sit on the buy side. reversing the side inverts the entire setup.

**Source**: `01 - ICT Trading Tutorials\ict-reclaimed-order-block.md`

---

### ict-rejection-block

An ICT Rejection Block is a wick rejection at a swing extreme. The candle reaches into liquidity above an old high or below an old low, the wick gets rejected, and the candle closes back inside the prior range. The wick — specifically the area between the candle’s open/close range and the extreme of

**Key Rules:**
1. Mark the Rejection Block zone — the wick area between the candle close and the candle low
2. Wait for price to retrace back to the wick zone. Do not chase the initial reversal leg
3. Drop to a lower timeframe (5-minute or 3-minute) at the wick tap and watch for a Market Structure Shift to the upside
4. Execute the buy trade on the wick tap with stop loss below the candle low (the deepest point of the wick), with a small buffer
5. Take profit at the next significant draw on liquidity — typically the recent swing high or the next old high
6. Set a bearish daily bias.
7. Identify the swing high that has been swept by a long-tailed bullish candle. Wick clearly above the prior high, body closes back inside

**When to Use:**
- the reliability degrades sharply outside those conditions: against the daily bias, on random wicks that did not sweep a real extreme, or in low-volatility sessions. the setup is high quality in the ri

**When NOT to Use / Avoid:**
- 5. **drop to a lower timeframe** (5-minute or 3-minute) at the wick tap and watch for a market structure shift to the upside.
- 6. **execute the buy trade** on the wick tap with stop loss below the candle low (the deepest point of the wick), with a small buffer.
- 7. **take profit** at the next significant draw on liquidity — typically the recent swing high or the next old high.

**Source**: `01 - ICT Trading Tutorials\ict-rejection-block.md`

---

### ict-smt-divergence-smart-money-technique

ICT SMT — also known as Smart Money Technique — is a market condition where two correlated assets, viewed on the same timeframe, exhibit opposing structure. Most of the time, financial markets move symmetrically: when two assets are positively correlated and one prints a higher high, the other typic

**Key Rules:**
1. Identify the correlated pair for the instrument you are trading — EUR/USD vs GBP/USD, ES vs NQ, BTC vs ETH, or the negative-correlation equivalents
2. Pull both charts side by side on the same timeframe (preferably 15-minute or lower for execution)
3. Mark the higher-timeframe PD Array on the asset you intend to trade — daily, 4-hour, or 1-hour
4. Wait for both assets to approach a swing high or swing low at the PD Array tap
5. Compare the two assets at that swing — one prints a new extreme, the other fails to
6. Confirm the divergence by reading the structure on both charts simultaneously. The non-confirming leg is the SMT signal
7. Execute the trade in the direction the divergence suggests, with stop loss beyond the swept extreme of the asset you are trading

**When NOT to Use / Avoid:**
- use the table of contents to jump to any section.
- 1. **identify the correlated pair** for the instrument you are trading — eur/usd vs gbp/usd, es vs nq, btc vs eth, or the negative-correlation equivalents.
- 2. **pull both charts side by side** on the same timeframe (preferably 15-minute or lower for execution).

**Source**: `01 - ICT Trading Tutorials\ict-smt-divergence-smart-money-technique.md`

---

### ict-unicorn-model

The ICT Unicorn Model is the area of overlap between an ICT Fair Value Gap and an ICT Breaker Block. By stacking two independent PD Arrays at the same price level, the Unicorn produces a uniquely reliable trade-entry signal that neither tool delivers on its own. The Breaker Block contributes the dir

**Key Rules:**
1. A break of a swing high or swing low (the structural shift)
2. A Breaker Block forming at the broken swing
3. A Fair Value Gap overlapping that Breaker Block
4. A lower low followed by a higher high (structural shift to the upside)
5. A bullish Breaker Block overlapping a bullish Fair Value Gap
6. A successful retest of the overlap zone — that retest confirms the Unicorn
7. A higher high followed by a lower low (structural shift to the downside)

**When NOT to Use / Avoid:**
- 1. **set the daily bias** using [ict daily bias](<https://innercircletrader.net/tutorials/ict-daily-bias-explained/>). unicorn trades work best in the direction of the higher-timeframe bias.
- 2. **mark the higher-timeframe[pd array](<https://innercircletrader.net/tutorials/ict-pd-array-key-to-trade-execution/>)** on the daily, 4-hour, or 1-hour chart — the level where institutions are like
- 3. **wait for price to approach** the higher-timeframe pd array in the premium or discount zone.

**Source**: `01 - ICT Trading Tutorials\ict-unicorn-model.md`

---

### master-ict-1st-presented-fvg

The ICT 1st Presented FVG is the very first fair value gap that forms at the opening, between 09:30 AM and 10:00 AM New York local time. It can either be a bullish FVG or a bearish FVG. You would observe the 1-Minute chart to look for the 1st presented fair value gap, while the 5-Minute and 15-Minut

**Key Rules:**
1. Identify the 1st Presented FVG on the 1-minute chart between 09:30 AM and 10:00 AM NY time
2. Confirm qualification — the FVG candlestick must break the range of the previous candlesticks
3. Mark the FVG and extend it forward through the whole day until 03:45 PM NY local time
4. Switch to a 5-minute or 15-minute chart for execution.
5. Place stop loss just beyond the far side of the 1st FVG
6. Target the next opposing PD Array or the next significant liquidity pool inside the day’s range

**When NOT to Use / Avoid:**
- this monday, set an alert for the 9:30 am new york open and watch the 1-minute chart. mark the first qualified fvg you see. then watch how price interacts with that level for the rest of the day.

**Source**: `01 - ICT Trading Tutorials\master-ict-1st-presented-fvg.md`

---

### mentorship-lecture-2

title: "ICT 2024 Mentorship Lecture 2 Notes — 07:00 AM Liquidity Hunt + IFVG Entry & Free PDF"

**Key Rules:**
1. Sit down before 07:00 AM NY time. The setup is built between 07:00 and the first 30 minutes of the AM session
2. Mark the London high and low. These are the only references you need from the prior session — they become the draw-on-liquidity for the AM open
3. Do not predict. Wait for price to actually print relative equal highs or relative equal lows on the 5-minute or 1-minute chart
4. Wait for the liquidity hunt. Price must take out the relative equal level after 07:00 AM
5. Wait for the MSS. A clean close below the prior swing low (bearish) or above the prior swing high (bullish) confirms the shift
6. Mark the IFVG. The very first fair value gap prior to the stop hunt becomes the most sensitive Inverse Fair Value Gap
7. Set the stop. Above the post-07:00 AM swing high (shorts) or below the post-07:00 AM swing low (longs)

**When NOT to Use / Avoid:**
- anything you want to see prior to 07:00 am is the london high and low for the draw on liquidity.
- the 07:00 am (am-session) first and foremost characteristic is retracing back into the london-session range.
- at 07:00 am you should be at your computer and you have to look for relative equal highs or relative equal lows forming on the 5-minute or 1-minute timeframe.

**Source**: `02 - ICT 2024\mentorship-lecture-2.md`

---

### sibi-and-bisi-the-ict-concepts

SIBI is the abbreviation for **Sell-side Imbalance Buy-side Inefficiency**. It is a bearish fair value gap formed by an impulsive downward price movement driven primarily by sellers, with minimal buying activity to counter the move. Three large bearish candles with short wicks print in sequence, and

**Key Rules:**
1. Mark the higher-timeframe PD Array on the daily, 4-hour, or 1-hour chart — the level where price delivery is expected to begin
2. Wait for price to approach the higher-timeframe PD Array
3. Drop to the 5-minute or 3-minute chart at the moment of the tap
4. Confirm with a Market Structure Shift on the lower timeframe. Without the MSS, the SIBI/BISI is a continuation pattern, not a high-probability entry
5. Mark the SIBI or BISI zone precisely — the gap between candle 1 and candle 3
6. Wait for the retest back into the imbalance. Do not chase the displacement leg
7. Take profit at the next significant draw on liquidity in the trade direction

**When NOT to Use / Avoid:**
- 1. **set the daily bias** using [ict daily bias](<https://innercircletrader.net/tutorials/ict-daily-bias-explained/>). trade sibi for sells when the bias is bearish; trade bisi for buys when the bias 
- 2. **mark the higher-timeframe pd array** on the daily, 4-hour, or 1-hour chart — the level where price delivery is expected to begin.
- 3. **wait for price to approach** the higher-timeframe pd array.

**Source**: `01 - ICT Trading Tutorials\sibi-and-bisi-the-ict-concepts.md`

---

### single-candle-order-block-scob

A Single Candle Order Block (SCOB) is a singular candle that emerges at a significant price level, indicating a confirmed reversal in price direction from that specific area of interest. Mostly, SCOB is used for confirmation and execution of a trade. Instead of buying or selling the moment price rea

**Key Rules:**
1. First candle closes at a bullish point of interest with a short or long wick
2. Second candle sweeps the low of the previous (first) candle and closes above the low of the previous candle
3. Third candle closes above the high of the second candle
4. First candle concludes at a bearish point of interest with either a short or long wick
5. Second candle surpasses the high of the preceding (first) candle and closes below its high
6. Third candle closes below the low of the second candle
7. Identify your point of interest on a higher timeframe — a fair value gap, order block, or breaker block

**When NOT to Use / Avoid:**
- that is why traders who use scob for entry typically see better win rates than those who buy or sell directly at a point of interest.
- 6. **choose your entry style** — direct entry on test, or drop to a lower timeframe and wait for a market structure shift for tighter precision.
- 7. **place your stop loss** 10–20 pips beyond the scob extreme (below for buys, above for sells).

**Source**: `01 - ICT Trading Tutorials\single-candle-order-block-scob.md`

---

### valid-ict-fair-value-gap

A valid ICT Fair Value Gap is a 3-candle pattern strong enough to deliver a real reaction when price retraces back to it. The basic FVG itself is simple: an unretraced area between the high of candle 1 and the low of candle 3 (for bullish), or between the low of candle 1 and the high of candle 3 (fo

**Key Rules:**
1. Mark every FVG on your bias timeframe. Then categorize each one — weak, quietly strong, or exceptional
2. Drop the weak ones. Don’t trade them. They’re traps

**Source**: `01 - ICT Trading Tutorials\valid-ict-fair-value-gap.md`

---


## Prerequisite Map

Concepts from previous tiers referenced by this session:

- `cisd-and-ict-mss`
- `daily-bias-trick`
- `liquidity-sweep-vs-liquidity-run`
- `market-maker-sell-model`
- `market-structure`
- `market-structure-shift`
- `pd-array-key-to-trade-execution`
- `premium-and-discount-zone-identification`
