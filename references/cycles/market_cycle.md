# Market Cycles — The ICT 4-Phase Framework

Price does not move randomly. Institutions accumulate, manipulate, distribute, and expand.
This cycle is fractal — it exists on the 1m chart and the monthly chart simultaneously.

## The Four Phases

### 1. ACCUMULATION (Range-Bound, Low Volatility)
**What's happening**: Institutions are building positions quietly. Price moves sideways in a range.
Price is typically in the DISCOUNT zone (below equilibrium) for accumulation before a markup,
or in the PREMIUM zone (above equilibrium) for redistribution before a markdown.

**Detection signals**:
- Weekly structure: No clear HH/HL or LH/LL sequence — price ranging
- Daily structure: Neutral or mixed bias, low confidence
- ATR: Below average (low volatility)
- PD Array: Price at equilibrium or meandering within dealing range
- Volume: Low and steady (no spikes — no urgency)
- Session: Often Asian or early London

**Typical days**: Monday, Tuesday AM, post-news consolidation
**Duration**: Hours to days on LTF, weeks to months on HTF

**Trading approach**: Do NOT trade breakouts from accumulation — they're likely false.
Wait for the manipulation phase (sweep of the range) before entering.

### 2. MANIPULATION (False Breakout, Spike Volatility)
**What's happening**: Institutions engineer a false breakout to trigger stops and trap retail.
Price sweeps beyond the accumulation range (BSL above or SSL below), then immediately reverses.
This is the "spring" or "upthrust" in Wyckoff terminology.

**Detection signals**:
- Price breaks out of the accumulation range
- Liquidity pool sweep (BSL or SSL taken out)
- Sharp reversal candle — long wick back into the range
- Volume spike on the sweep candle
- Session: Often London open, NY AM open (Judas Swing windows)

**Typical days**: Wednesday (classic reversal day), session opens
**Duration**: Minutes to hours — the manipulation is fast

**Trading approach**: This is where Turtle Soup and Breaker Block entries shine.
Wait for the sweep, then the reversal close back inside the range. Enter on the reversal.
The manipulation phase tells you the DIRECTION of the next expansion.

**ICT rule**: "The market will always seek the path of most pain."
If everyone is long (stops below), price sweeps below before going up.
If everyone is short (stops above), price sweeps above before going down.

### 3. DISTRIBUTION (Trending, High Volatility)
**What's happening**: Institutions are distributing (selling to buyers in an uptrend) or
accumulating (buying from sellers in a downtrend). Price trends strongly in one direction.
This is the "markup" or "markdown" phase.

**Detection signals**:
- Clear BOS sequence in the trend direction
- Price moving away from the accumulation range
- Displacement candles (body > ATR)
- Order blocks forming and holding (unmitigated)
- FVGs left unfilled — price is "running"
- ATR: Expanding
- Session: London PM, NY AM, NY PM

**Typical days**: Wednesday PM, Thursday (strongest trending day)
**Duration**: Hours to days

**Trading approach**: This is where MMXM, OTE + OB, Unicorn, and SCOB excel.
Enter on retracements to OBs/FVGs within the trend.

### 4. EXPANSION (Parabolic, Extreme Volatility)
**What's happening**: The trend accelerates. Latecomers chase. Institutions are completing
their distribution/accumulation. This is the blow-off phase.

**Detection signals**:
- Consecutive large displacement candles (ATR > 2x)
- Multiple FVGs in a row (price is inefficient)
- Price far from equilibrium (extreme premium or discount)
- Exhaustion signals: Doji, long wicks, volume climax
- Session: Often Thursday PM or Friday AM — the "last push"

**Typical days**: Thursday PM, Friday AM
**Duration**: Hours at most — expansion ends quickly

**Trading approach**: Late trend entries are dangerous. If you're already in the trade,
trail stops tightly. If not in, wait for the cycle to reset. Do not chase expansion.
The next phase is accumulation — the cycle repeats.

## The Complete Cycle in Practice

```
WEEKLY CYCLE EXAMPLE (EURUSD):

Monday:    ACCUMULATION — price sets the weekly range, chops in 50-80 pip band
Tuesday:   ACCUMULATION → early MANIPULATION — false break of Monday range
Wednesday: MANIPULATION — sweep of weekly high/low, sharp reversal (classic Wednesday reversal)
Wednesday PM - Thursday: DISTRIBUTION — the real move, 100-150 pip expansion
Thursday PM: EXPANSION — late trend acceleration, blow-off top/bottom
Friday:    ACCUMULATION — position squaring, retracement, range-bound

The cycle is ALWAYS running. The question is: which phase are we in RIGHT NOW?
```

## Phase Detection Algorithm

```
Inputs: 1W bias, 1D bias, ATR ratio, sweep presence, displacement strength

IF 1W has clear HH/HL or LH/LL AND 1D has clear HH/HL or LH/LL
   AND 1D direction == 1W direction:
   → DISTRIBUTION (trend is established and continuing)
   → If ATR > 2x normal: EXPANSION

IF 1W has clear trend AND 1D is OPPOSITE direction:
   → MANIPULATION (daily pullback within weekly trend, likely a trap)

IF 1W has clear trend AND 1D is neutral/ranging:
   → ACCUMULATION (pause within the larger trend)

IF 1W is neutral/ranging AND 1D is ranging:
   → ACCUMULATION (no trend established anywhere)

IF sweep detected on 1D (pool taken out, price reversed):
   → MANIPULATION confirmed (sweep = manipulation signature)

IF displacement ATR > 2x:
   → EXPANSION active (blow-off phase)
```

## Phase → Model Mapping

| Phase | Primary Models | Secondary | Avoid |
|-------|---------------|-----------|-------|
| **Accumulation** | Asian Range, NWOG/NDOG | Judas Swing (session open) | MMXM, 2FVG (no trend to follow) |
| **Manipulation** | Turtle Soup, Breaker Block, Silver Bullet | Judas Swing | OTE (trend not yet established) |
| **Distribution** | ★ MMXM, OTE+OB, Unicorn, SCOB | Silver Bullet, 2FVG | Asian Range, NWOG (trend is active) |
| **Expansion** | 2FVG, Continuation | Silver Bullet, MMXM | Turtle Soup (don't fade expansion), Breaker Block (too late) |
