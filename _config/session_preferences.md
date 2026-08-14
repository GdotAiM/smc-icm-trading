# Session Preferences

> **DST NOTE**: All UTC times below assume US Eastern Daylight Time (EDT, UTC-4, Mar-Nov).
> During Eastern Standard Time (EST, UTC-5, Nov-Mar), ADD 1 HOUR to all UTC times.
> The canonical source of truth is `tools/ny_time.cjs` — this file is documentation only.
> If these tables disagree with ny_time.cjs, the code is correct and this file is wrong.

## ICT Killzone Times (NY local → UTC during EDT)

| Killzone | NY Local | UTC (EDT) | Session | Character |
|----------|----------|-----------|---------|-----------|
| Asian Range | 20:00-02:00 | 00:00-06:00 | Asia | Accumulation, range-bound |
| London Killzone | 02:00-05:00 | 06:00-09:00 | London | Institutional flow, manipulation |
| London PM (dead) | 05:00-08:00 | 09:00-12:00 | London PM | NOT a killzone — monitor only |
| NY AM Killzone | 08:00-11:00 | 12:00-15:00 | NY AM | Highest volume, displacement |
| NY Lunch | 11:00-13:00 | 15:00-17:00 | NY Lunch | Low volume, avoid entries (×0.4) |
| NY PM Killzone | 13:00-16:00 | 17:00-20:00 | NY PM | Standard conditions, secondary SB |
| NY Close | 16:00-17:00 | 20:00-21:00 | NY Close | Close positions, no new entries |
| Off Hours | 17:00-20:00 | 21:00-00:00 | Off | Avoid trading |

## Silver Bullet Windows (1-Hour, ICT Standard)

| Window | NY Time | UTC (EDT) | Best Pairs |
|--------|---------|-----------|------------|
| London SB | 03:00-04:00 | 07:00-08:00 | EURUSD, GBPUSD |
| NY AM SB | 10:00-11:00 | 14:00-15:00 | All USD majors, XAUUSD |
| NY PM SB | 14:00-15:00 | 18:00-19:00 | USDJPY, USDCAD |

## Judas Swing Windows (First 60 min of session open)

| Window | NY Time | UTC (EDT) |
|--------|---------|-----------|
| London Open | 02:00-03:00 | 06:00-07:00 |
| NY Open | 08:00-09:00 | 12:00-13:00 |

## Preferred Trading Sessions

1. **London Killzone (02:00-05:00 NY)** — Best for EURUSD, GBPUSD
2. **NY AM Killzone (08:00-11:00 NY)** — Best for all USD pairs, XAUUSD
3. **NY AM Silver Bullet (10:00-11:00 NY)** — Highest probability SB window (1 hour only)

## Session Weighting (matches ny_time.cjs multipliers)

| Session | Multiplier | Rule |
|---------|-----------|------|
| Silver Bullet (active) | ×1.5 | ICT's highest-probability window |
| Killzone (London, NY AM, NY PM) | ×1.3 | Institutional flow active |
| Regular session | ×1.0 | Standard conditions |
| NY Lunch | ×0.4 | No new entries — low liquidity |
| Off-hours / Asia late | ×0.3 | Avoid trading |
