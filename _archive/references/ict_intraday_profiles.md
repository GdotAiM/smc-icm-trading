# ICT Intraday Profiles — Reference

Source: https://innercircletrader.net/tutorials/ict-intraday-profiles/

## Overview

ICT teaches two core intraday profile types based on daily directional bias.
Each profile has a Normal and Delayed variant depending on when the protraction (Judas Swing) occurs.

## Profile Types

### Sell Profile (Bearish Daily Bias)
- **Normal**: Rally above CBDR between 00:00-02:00 NY (Judas Swing window)
- **Delayed**: Rally only after 02:00 NY (London open)

### Buy Profile (Bullish Daily Bias)
- **Normal**: Dip below CBDR between 00:00-02:00 NY
- **Delayed**: Dip only after 02:00 NY

## Key Time Windows (All NY Local Time)

| Window | Time | Purpose |
|--------|------|---------|
| CBDR Formation | 14:00-20:00 NY | Central Bank Dealers Range — institutional positioning |
| Asian Range | 20:00-00:00 NY | Overnight accumulation |
| Judas Swing | 00:00-02:00 NY | Protraction window — the trap |
| London Open | 02:00 NY | Session begins, profile plays out |

## Validity Conditions

- **CBDR must be < 40 pips** (for forex). Wider = profile less reliable.
- **Asian range should be 20-30 pips**. Wider = less clean.
- **Clear daily bias required**. Neutral days do not produce clean profiles.
- **Judas Swing protraction should not exceed 2-3 standard deviations of CBDR**.

## 10-Step Trade Flow

1. Set daily directional bias (1D + 4H)
2. Mark CBDR, confirm < 40 pips
3. Mark Asian range, confirm 20-30 pips
4. Plot 1σ, 2σ, 3σ standard deviation projections of CBDR
5. Watch 00:00-02:00 NY for Judas Swing protraction
6. Classify as Normal (move before 02:00) or Delayed (after 02:00)
7. Wait for 5-minute (or lower) MSS in profile direction
8. Enter on retest — premium for shorts, discount for longs
9. Stop above London high (Normal) or dealing range high (Delayed)
10. Target HTF DOL, opposite PD array, or default 50-70 pips

## Integration Into SMC-ICM

The intraday profile runs via `tools/intraday_profile.cjs` and produces output at `stages/00_macro_context/output/{pair}_intraday_profile.md`.

It feeds into:
- **Stage 00**: Pre-session profile classification
- **Stage 03**: Session gating (profile type affects entry timing)
- **Cross-System Guard**: Profile validity reduces confidence if invalid
- **Discord**: `/profile` command
