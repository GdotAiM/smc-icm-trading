# Stage 00b — Council Vote

4-archetype council (Position/Swing/Day/Scalp) voting on direction, confidence, and model selection for each pair.

## Purpose

Run a multi-timeframe council vote before committing to any bias. Each archetype anchors to its natural timeframe and votes independently. The council's verdict determines whether to proceed with analysis or stand aside.

## Archetypes

| Archetype | Anchor TF | Personality |
|-----------|-----------|-------------|
| Position Trader | 1W/1D | Patient, trend-following, holds through pullbacks |
| Swing Trader | 4H/1D | Captures multi-day swings, sensitive to structure breaks |
| Day Trader | 15m/1H | Intraday bias, enters on LTF confirmation of HTF |
| Scalper | 1m/5m | Fast entries, FVG/OTE triggers, tight management |

## Output Files

- `output/{pair}_vote.md` — Individual archetype votes + verdict
- `output/{pair}_intel.md` — Pre-vote intelligence gathering
- `output/{pair}_coherence_audit.md` — Cross-timeframe coherence check
- `output/{pair}_narrative.md` — Narrative synthesis across all archetypes

## Input Dependencies

- Stage 00 (Macro Context) — cycle phase, Po3 state, IPDA zone
- ICT RAG queries for council-specific concepts
- Trade graph memory for failure patterns

## Run

```bash
node tools/council.cjs EURUSD
node tools/coherence_audit.cjs EURUSD
node tools/narrative.cjs EURUSD
```
