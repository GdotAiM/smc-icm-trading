# Stage 03 — Session & Time-Based Filters

## Purpose
Evaluate the current trading session and apply time-based ICT models
(killzones, Silver Bullet windows, Judas Swing, PO3) to determine if
conditions warrant active trading or patience.

## Inputs

| Source | Location | What to load |
|--------|----------|--------------|
| Previous Stages | `../01_htf_bias/output/bias.md` | Directional bias |
| Previous Stages | `../02_key_levels/output/levels.md` | Active key levels |
| Config | `../../_config/session_preferences.md` | Killzone times, preferred sessions |
| Config | `../../_config/trading_rules.md` | Session gating rules |
| Current Time | System clock | UTC time |

## Process

### 1. Determine Current Session
Map current UTC hour to ICT session:

| UTC Hours | Session | Character |
|-----------|---------|-----------|
| 00:00-07:00 | Asia | Range-bound, accumulation |
| 07:00-12:00 | London | Institutional flow, manipulation |
| 12:00-16:00 | NY AM | Highest volume, displacement |
| 16:00-21:00 | NY PM | Late continuation / reversal |
| 21:00-00:00 | Off | Low liquidity, avoid |

### 2. Check Active Killzones
Based on `_config/session_preferences.md`, determine which killzone is active:
- **London Killzone**: 07:00-10:00 UTC
- **NY AM Killzone**: 12:00-15:00 UTC
- **NY PM Killzone**: 17:00-20:00 UTC
- **Silver Bullet (NY AM)**: 13:00-15:00 UTC
- **Silver Bullet (London)**: 08:00-10:00 UTC
- **Silver Bullet (NY PM)**: 17:00-19:00 UTC
- **Judas Swing**: First hour of each session

### 3. Time-Based Model Eligibility
Check which time-gated models are eligible:

| Model | Window | Active Now? |
|-------|--------|-------------|
| Silver Bullet | 08-10, 13-15, 17-19 UTC | [Y/N] |
| Judas Swing | Session open + 1h | [Y/N] |
| AMD (Accumulation) | 00-07, 12-16 UTC | [Y/N] |
| PO3 | Any active session | [Y/N] |
| Asian Range | 00-07 UTC | [Y/N] |

### 4. Session Alignment Check
- Is the bias from Stage 01 aligned with the current session's typical behavior?
  - London: Typically sets the day's direction. Manipulation first, then expansion.
  - NY AM: Continuation or reversal of London. Highest displacement probability.
  - Asia: Range-bound. Most breakouts from Asia range are false.
- Is price inside a killzone window? (Higher displacement probability)

### 5. Gating Decision
- **ACTIVE**: Inside killzone, bias aligned, liquidity levels nearby → proceed to Stage 04
- **MONITOR**: Outside killzone but approaching one → wait, re-check
- **NO TRADE**: Outside all sessions, or Asian session with no clear setup → skip remaining stages

## Output Requirements

Create `output/session.md`:

```markdown
# Session Analysis — [PAIR] — [DATE] [UTC TIME]

## Current Session
- **Session**: [Asia/London/NY AM/NY PM/Off]
- **Killzone**: [Active/Inactive] — [Name] until [HH:MM UTC]
- **Next Killzone**: [Name] at [HH:MM UTC] (in X hours Y minutes)

## Time-Based Model Eligibility
| Model | Window | Status |
|-------|--------|--------|
| Silver Bullet | [window] | [ELIGIBLE / Next: HH:MM] |
| Judas Swing | [window] | [ELIGIBLE / Not today] |
| PO3 | Any session | [ELIGIBLE / Wait for next] |

## Session Alignment
- Bias: [Bullish/Bearish]
- Session character: [Manipulation/Expansion/Accumulation]
- Alignment: [Aligned / Opposed / Neutral]

## Gating Decision
**[ACTIVE / MONITOR / NO TRADE]**

## Notes for Model Selection
- Time-gated models available: [list]
- Wait until: [next session/killzone time]

## ICT Knowledge Reference

Before writing this stage, query the ICT knowledge base:

```bash
node tools/ict_rag.cjs --query "ICT kill zones times session windows NY local time"
```

```bash
node tools/ict_rag.cjs --query "ICT Silver Bullet strategy times windows entry rules"
```

```bash
node tools/ict_rag.cjs --query "ICT macro time-based strategy session models"
```

Cite ICT sources in your output with the format: `[ICT: concept-name.md]`
