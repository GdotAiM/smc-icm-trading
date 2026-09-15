# LLM Stub Status — 2026-09-15

## Problem
LLM provider (gemini/groq/cerebras) returning `503 Service Unavailable` / `Model is unavailable` on all calls.
Setup auditor returns `llm_unavailable` for all 4 pairs.

## Solution Applied
Created `tools/llm/human_llm_stub.cjs` — a CLI tool that:
1. Reads all stage output files directly (same files setup_auditor would ingest)
2. Outputs structured audit context with system prompt + pair data
3. Claude (me) performs the COT audit (Hypothesis → Evidence → Counter-Evidence → Verdict)
4. Python writes the result as JSON matching setup_auditor's exact schema

## Audit Results (Human-as-LLM)

| Pair | Verdict | Confidence | Key Finding |
|------|---------|------------|-------------|
| EURUSD | CHALLENGED | 72/100 | Structure bearish but execution conditions not met — wait for Silver Bullet window + DXY stabilization |
| GBPUSD | ALIGNED | 68/100 | Locked SELL is valid but low coherence (30/100) warrants reduced size (50%) entry |
| XAUUSD | UNABLE | 45/100 | Insufficient evidence — no session raid, no MSS, neutral bias. Correct NO TRADE. |
| NAS100 | UNABLE | 40/100 | Classic manipulation squeeze (HTF up, LTF down). No tradeable edge exists yet. |

## How to Use Going Forward

```bash
# Run human-as-LLM audit for any pair:
node tools/llm/human_llm_stub.cjs <PAIR> --date <YYYY-MM-DD>

# Then manually run the COT audit and write results:
python -c "..."  # see templates in shared/2026-09-15/llm_stub_results/

# Or set env var to auto-route:
export LLM_PROVIDER=human
# And modify llm_client.cjs to detect "human" provider and skip API call
```

## Permanent Fix Options
1. **Quick**: Set `LLM_PROVIDER=custom` with a working endpoint (OpenCode Zen gateway)
2. **Medium**: Add `--stub` flag to setup_auditor that auto-runs this human path
3. **Long**: Integrate as a proper fallback in llm_client.cjs when all providers return 5xx

