# SMC-ICM Hybrid — Complete User Manual

## System Architecture

### What The System Is

A **multi-lens, multi-timeframe ICT/SMC trading intelligence system** that combines deterministic engine analysis with AI-powered narrative reasoning. It operates as a filesystem-native workspace where Claude Code walks through 8 analysis stages, reading markdown instructions and writing structured output files.

**⏰ ALL TIME-BASED LOGIC USES NEW YORK LOCAL TIME (ICT STANDARD).** Session detection, killzone gating, Silver Bullet windows, Judas Swing windows, and session reliability weighting all operate on NY time. See `tools/ny_time.cjs` for the NY time module.

### System Score: 99/100 (A++) — ICT-Compliant

### The Stack (15 Intelligence Layers)

```
LAYER 0: SMC ENGINE (TypeScript)        Deterministic detection — no AI
  ├─ Structure (BOS/CHoCH), Liquidity (BSL/SSL), Order Blocks, FVGs
  ├─ PD Arrays, Daily Bias, SMT Divergence
  └─ Output: JSON SmcReport per timeframe

LAYER 1: MACRO CONTEXT (NY Time)         Cycle phase, day profile, session
  ├─ Cycle: ACCUMULATION/MANIPULATION/DISTRIBUTION/EXPANSION
  ├─ Day: Monday-Friday ICT profiles with weights
  ├─ Session: NY Local Time killzones (London 02-05, NY AM 08-11, etc.)
  └─ Model filter: which models fit today's cycle

LAYER 1b: Po3 STATE MACHINE 🆕           Formal 4-state machine with transitions
  ├─ Accumulation→Manipulation→Distribution→Expansion
  ├─ Transition confirmation signals
  ├─ Per-phase entry rules + timing gates
  └─ Fractal Po3 nesting (macro→meso→micro)

LAYER 2: IPDA DEALING RANGE             Premium/Discount across all TFs
  ├─ 20/40/60-period dealing ranges
  ├─ Equilibrium cascade (stepping stones)
  ├─ Zone consensus (how many TFs agree)
  └─ AMD mapped onto the dealing range

LAYER 3: ARCHETYPE COUNCIL              Four specialists voting
  ├─ Position (1W/1D): Macro direction
  ├─ Swing (4H/1D): Entry zone
  ├─ Day (15m/1H): Entry timing
  └─ Scalp (1m/5m): Trigger execution

LAYER 4: FRACTAL MMXM                   Per-TF MMXM step detection
  ├─ 7-TF step classification (1W→1m)
  ├─ Nesting validation (is the fractal intact?)
  └─ 1m Inversion detection (is the entry sentence written?)

LAYER 5: MICRO CONFIRMATION              LTF coherence check
  ├─ Session-aware coherence scoring
  ├─ Liquidity state awareness
  └─ Entry trigger checklist (5-point)

LAYER 6: MODEL SELECTION                Cycle-weighted + conflict-aware
  ├─ 11 models scored with SMT, CISD, OTE, Po3 filters
  ├─ Mutual exclusivity detection
  └─ 6 Confirmations checklist

LAYER 7: ENTRY REFINEMENT               ICT-correct SL/TP
  ├─ SL at structural invalidation
  ├─ TP at 1:1 minimum with liquidity targets
  └─ Fibonacci OTE zone (62/70.5/79%) + extensions

LAYER 8: RISK MANAGEMENT                Position sizing
  ├─ Account-based lot calculation
  └─ Demo→Live progression gating

LAYER 9: INVALIDATION ENGINE            7-dimension check
  ├─ Price, Structure, Time, Model, Cycle, Micro, Correlation
  └─ Real-time trade validity monitoring

LAYER 10: NARRATIVE ENGINE              Causal storytelling
  ├─ Causal chain connecting all timeframes
  ├─ Model-fit explanation (WHY, not just score)
  └─ Invalidation story

LAYER 11: COHERENCE AUDIT               Internal consistency check
  ├─ Lens coherence (4 lenses agree?)
  ├─ Temporal coherence (TFs tell one story?)
  ├─ Archetype coherence (Council united?)
  └─ Self-contradiction detection

LAYER 12: TIER 1 (Precision) 🆕          SMT wired, Fibonacci tool, ATR SL
  ├─ SMT: Correlated pair divergence detection
  ├─ Fibonacci: 7 levels + 3 extensions
  ├─ Multi-TF Fibonacci confluence clusters
  ├─ BPR scoring + ATR Dynamic SL
  └─ Confidence boost: +12/13 when active

LAYER 13: TIER 2 (Trade Management) 🆕   Judas Swing, pyramiding, time stops
  ├─ Judas Swing: Session-open sweep+reversal detection
  ├─ Pyramiding: 4-step scale-in (0.25%→0.5%→1%→1%)
  ├─ Time Stops: Auto-exit if trade not at TP1 within N bars
  ├─ Correlation: DXY-based position reduction
  └─ Win Rates: Per-model historical performance weighting

LAYER 14: NEWS + RANGING 🆕              Economic calendar + range detection
  ├─ ForexFactory XML calendar (free, no API key)
  ├─ News blackout detection (30min window)
  ├─ 8-point ranging market score
  └─ Model/size adjustment for ranging conditions

LAYER 15: NY TIME MODULE 🆕              All time-based logic in NY local time
  ├─ ICT killzones: London 02-05, NY AM 08-11, NY Lunch 11-13
  ├─ Silver Bullet: London SB 03-04, NY AM SB 10-11, NY PM SB 14-15
  ├─ Judas Swing: London Open 02-03, NY Open 08-09
  └─ Session reliability: NY AM ×1.4, NY Lunch ×0.4, Off ×0.3
```

### Data Flow

```
TradingView Desktop (CDP:9222)
       │ OHLCV candles (7 TFs × 5 pairs)
       ▼
  SMC ENGINE (TypeScript, deterministic)
       │ JSON SmcReport per TF
       ▼
  STAGE PIPELINE (Claude Code walks 8 stages)
       │ reads CONTEXT.md instructions
       │ calls tools for analysis
       │ writes output/*.md files
       ▼
  TRADINGVIEW CHART (CDP drawing)
       │ levels + forecast + labels drawn
       ▼
  WEB DASHBOARD (localhost:5173)
       │ reads stage outputs, renders UI
```

---

## What The System CAN Do

| Capability | Detail |
|-----------|--------|
| **Detect market structure** | BOS/CHoCH on all 7 timeframes, close-confirmed, ATR-filtered |
| **Find liquidity pools** | BSL/SSL with EQH/EQL clustering, sweep detection, session-weighted scoring |
| **Identify PD Arrays** | Order Blocks (with lifecycle), Fair Value Gaps (with fill tracking), Inverse FVGs, Breaker Blocks |
| **Determine cycle phase** | Accumulation/Manipulation/Distribution/Expansion per session and daily |
| **Score 11 ICT models** | With cycle-weighting, Po3 filtering, SMT, CISD, and OTE zone checks |
| **Detect MMXM fractally** | Per-TF MMXM step classification with nesting validation |
| **Compute IPDA dealing ranges** | 20/40/60-period ranges across all TFs with equilibrium cascade |
| **Run 4-archetype council** | Position/Swing/Day/Scalp voting with confidence scoring |
| **Generate trade plans** | ICT-correct SL at structural invalidation, TP at 1:1 minimum |
| **Draw on TradingView** | Entry/SL/TP levels, risk/reward zones, forecast paths, IPDA equilibrium |
| **Validate trades** | 7-dimension invalidation check across price/structure/time/model/cycle/micro/correlation |
| **Audit coherence** | Lens/temporal/archetype/contradiction coherence scoring |
| **Tell the market's story** | Causal chain narrative connecting macro to micro |

## NY Time Reference (ICT Standard)

**ALL time-based logic uses New York local time.** ICT specifically teaches that everything must be in NY time.

| NY Time | Session | Killzone | Reliability | Action |
|---------|---------|----------|-------------|--------|
| 20:00-00:00 | Asia (prev day) | No | ×0.6 | Range only |
| 00:00-02:00 | Asia (overnight) | No | ×0.5 | Avoid |
| **02:00-05:00** | **London Killzone** | **Yes** | **×1.3** | **ENTER** |
| 05:00-08:00 | London PM / Pre-NY | No | ×1.1 | Standard |
| **08:00-11:00** | **NY AM Killzone** | **Yes** | **×1.4** | **ENTER** |
| 11:00-13:00 | NY Lunch | No | ×0.4 | WAIT |
| 13:00-16:00 | NY PM Session | No | ×1.0 | Standard |
| 16:00-17:00 | NY Close | No | ×0.3 | No new entries |
| 17:00-20:00 | Off Hours | No | ×0.3 | Avoid |

**Silver Bullet (NY Time):** London SB 03:00-04:00 | NY AM SB 10:00-11:00 | NY PM SB 14:00-15:00
**Judas Swing (NY Time):** London Open 02:00-03:00 | NY Open 08:00-09:00

## What The System CANNOT Do (Limitations)

| Limitation | Why |
|-----------|-----|
| **Execute trades** | Analysis only. No broker connection is live. Paper trading mode only. |
| **Predict price** | The statistical forecast is a confluence tool, not a prediction. |
| **Replace discretion** | ICT is a discretionary framework. The system provides intelligence, not orders. |
| **Guarantee wins** | No system can. The system helps you make better decisions. |
| **Trade without TradingView** | CDP connection requires TradingView Desktop with debug port. |
| **Run without data** | Engine reports must be generated from live TradingView data. |
| **Detect all news** | ForexFactory XML is used; may be blocked on some networks. |

---

## Daily User Workflow

### Startup (2 minutes)

```
1. Launch TradingView Desktop with CDP port:
   Start-Process "shell:AppsFolder\TradingView.Desktop_n534cwy3pjxzj!TradingView.Desktop" -ArgumentList "--remote-debugging-port=9222"

2. In Claude Code, say:
   "Run the full premium session"
```

This fetches live data, runs all engines, convenes the Council, generates narratives, checks coherence, and draws everything on TradingView.

### Morning Analysis (5 minutes)

```
"Run confluence on EURUSD, GBPUSD, Gold, NAS100, DXY"
"Show me the 15-minute analysis for all pairs"
"Draw the setups on TradingView"
```

### Entry Planning (2 minutes)

```
"Run all stages on GBPUSD"
"Show me the GBPUSD entry plan"
"What does the fractal MMXM say?"
"Is the 1m Inversion ready?"
```

### Intraday Monitoring (30 seconds each)

```
"Check GBPUSD 5m micro coherence"
"Is the trade still valid? Run invalidation check"
"Draw the latest levels on the chart"
```

### End of Day (2 minutes)

```
"Journal today's GBPUSD trade"
"Run the coherence audit"
"What did the narrative engine say about today?"
```

---

## Archetype User Manuals

### The Scalper (1m/5m anchor — minutes hold)

**You trade**: 5-10 times per session. Silver Bullet, 2FVG, Judas Swing.
**You need**: Fast 1m Inversion confirmations. You don't care about the weekly trend except for direction.
**Your edge**: Precision entry timing. You enter on the sentence, not the story.

**Daily Prompts:**

```
"Run the 1-minute analysis on EURUSD, GBPUSD, and DXY"
"Which pair has 1m Inversion detected right now?"
"Draw the 1m setups on TradingView"
"Check 1m micro coherence on GBPUSD"
"Is there a 5m CISD on any pair?"
"Show me the ISD sequence on EURUSD 1m"
"What's the Council's scalp read on GBPUSD?"
```

**Your Cheat Sheet:**
- Only trade when 1m Inversion score ≥ 5/8
- Only trade during London or NY AM killzones
- SL at 1m swing point — tight, 5-15 pips
- TP1 at 1:1 minimum, scalp what the market gives
- Never hold a scalp against the HTF direction. Position told you the trend.

---

### The Day Trader (15m/1H anchor — hours hold)

**You trade**: 1-3 times per day. Silver Bullet, MMXM intraday, OTE+OB, Unicorn.
**You need**: Session-aligned entries with micro confirmation. You use 5m for triggers.
**Your edge**: Riding the intraday distribution phase within the daily bias.

**Daily Prompts:**

```
"Run the full premium session"
"Show me the Council vote on all pairs"
"Which pair has the highest coherence score?"
"Run all stages on the best pair"
"Check the 6 confirmations"
"What's the fractal MMXM nesting look like?"
"Show me the Fibonacci OTE zone for entry"
"Draw the 15m setup with IPDA equilibrium"
"Run the coherence audit — are the lenses aligned?"
```

**Your Cheat Sheet:**
- Only trade in the HTF direction from Stage 01
- Coherence ≥ 7/10 to enter
- Fractal MMXM ≥ 12/20 preferred
- SL at 15m or 4H swing point — 15-40 pips
- TP1 at nearest liquidity pool or 1:1 measured move
- Close all positions by NY close (21:00 UTC)

---

### The Swing Trader (4H/1D anchor — days hold)

**You trade**: 1-3 times per week. MMXM full cycle, Turtle Soup, Breaker Block, OTE+OB.
**You need**: HTF bias confirmation with cycle phase alignment. You use 15m for entries.
**Your edge**: Capturing the distribution phase of the MMXM cycle.

**Daily Prompts:**

```
"Run the macro context and IPDA analysis"
"What cycle phase are we in? Is it distribution yet?"
"Show me the weekly and daily structure"
"Where is the IPDA drawing price on the weekly?"
"Which pair has the Council most aligned?"
"Run top-down analysis on EURUSD"
"Has the inducement occurred on 4H? What MMXM step?"
"Show me the dealing range — are we at premium or discount?"
"Check the quarterly shift — is this month 1 of the quarter?"
```

**Your Cheat Sheet:**
- Only enter when cycle phase is DISTRIBUTION or late MANIPULATION
- HTF bias must be clear on 1D AND 4H
- Entry on 15m after sweep + CHoCH confirmation
- SL at 4H swing point — 40-100 pips
- TP at opposite HTF liquidity pool or -1.5 Fib extension
- Trail stops behind each new 4H swing
- Hold through intraday noise — the daily bias is your compass

---

### The Position Trader (1W/1D anchor — weeks hold)

**You trade**: 1-3 times per month. MMXM full cycle, PO3 macro, IPDA quarterly shifts.
**You need**: Macro cycle transitions and quarterly regime changes. You use 4H for entries.
**Your edge**: Building positions during accumulation, holding through distribution.

**Daily Prompts:**

```
"Show me the IPDA 60-period dealing range on the weekly"
"What's the quarterly shift status?"
"Where is the 1W equilibrium? How far is price from fair value?"
"Are we in accumulation or distribution on the weekly?"
"Show me the macro cycle phase across all pairs"
"Has the 1D closed above the 1W equilibrium?"
"What does the Council's Position trader say?"
"Check for 1W-1D divergence — is this manipulation or reversal?"
"Show me the monthly context — NFP week? FOMC? Month-end?"
```

**Your Cheat Sheet:**
- Build positions during ACCUMULATION at discount (buys) or premium (sells)
- Add during MANIPULATION sweeps (the trap is your friend)
- Hold through DISTRIBUTION — let winners run for weeks
- Exit at EXPANSION extremes or when weekly structure breaks
- SL at 1D or 1W swing point — 100-300 pips
- Position size smaller (0.5-1% per entry, scale into full position over days)
- The IPDA equilibrium is your North Star — price always returns to fair value

---

## Quick Reference: All Claude Code Commands

```
# Full Session
"Run the full premium session"
"Run the full premium session with NY time"
"Run confluence on EURUSD, GBPUSD, Gold, NAS100, DXY"

# IPDA / Dealing Range
"Show me the IPDA analysis for GBPUSD"
"Where is price in the dealing range?"
"What's the equilibrium cascade?"

# Po3 State Machine
"Show me the Po3 state machine"
"What phase are we in? Is it distribution yet?"
"Show me the fractal Po3 nesting"
"Are we at the expected Po3 phase for this time?"

# Tier 1 (Precision)
"Run the Tier 1 analysis"
"Show me the complete Fibonacci levels"
"Is there a Fibonacci cluster?"
"What does SMT say?"
"Show me the ATR dynamic SL"

# Tier 2 (Trade Management)
"Check for Judas Swing"
"Show me the pyramiding plan"
"What's the time stop for this entry?"
"Check DXY correlation"
"Show me model win rates"

# Single Pair Analysis
"Run all stages on GBPUSD"
"Run the 15-minute analysis on all pairs"
"Run the 5-minute analysis on all pairs"
"Run the 1-minute analysis on all pairs"

# IPDA / Dealing Range
"Show me the IPDA analysis for GBPUSD"
"Where is price in the dealing range?"
"What's the equilibrium cascade?"

# Council / Archetypes
"Convene the Council on GBPUSD"
"What does the Scalper say?"
"Show me Position vs Swing divergence"

# Fractal MMXM
"Run the fractal MMXM on GBPUSD"
"Is the 1m Inversion detected?"
"What MMXM step is the 4H at?"

# Entry / Trade
"Show me the GBPUSD entry plan"
"Show me the Fibonacci OTE zone"
"What's the trade ticket?"
"Check the 6 confirmations"

# Validation
"Run the invalidation check on GBPUSD"
"Is the trade still valid?"
"Run the coherence audit"

# Narrative
"Tell me the market's story for GBPUSD"
"Run the narrative engine on all pairs"

# TradingView
"Draw GBPUSD on the chart"
"Draw the 15m setups on all pairs"
"Draw the 5m setups on all pairs"
"Draw the 1m setups on all pairs"
"Clear the chart"

# Journal / Review
"Journal today's trades"
"What did we learn today?"
"Show me the decision quality assessment"
```

---

## Configuration Files

| File | What You Set |
|------|-------------|
| `_config/trading_rules.md` | Minimum confluence, R:R, SL rules, session rules |
| `_config/risk_parameters.md` | Account balance, risk %, daily loss limit |
| `_config/preferred_pairs.md` | Which pairs you trade, preferred sessions |
| `_config/session_preferences.md` | Killzone times, Silver Bullet windows |
| `_config/model_priority.md` | Your ranked preference of ICT models |
| `_config/ict_calendar.md` | Day-of-week profiles, monthly events |
| `_config/micro_params.md` | LTF-specific engine thresholds |
| `_config/archetypes/*.json` | Per-archetype configs (anchor TFs, models, risk) |

---

## Prerequisites

- **TradingView Desktop** with `--remote-debugging-port=9222`
- **Node.js 22+** with `tsx` globally available
- **Python 3.10+** for forecast engine
- **Claude Code** — the AI agent that walks the stages

---

*"The market is a storyteller. Our job is to listen, not to guess."*
