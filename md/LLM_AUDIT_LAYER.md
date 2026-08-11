# LLM Audit & Reasoning Layer (Aug 11, 2026)

An **audit-only** LLM reasoning layer on top of the deterministic SMC/ICT pipeline.
It never gates, never places orders, never modifies decisions — it produces
second-opinion evidence, reasoning, and recommendations. Every LLM failure
degrades to a written "unavailable" record; the deterministic outcome is
byte-for-byte unchanged.

## Components

| File | Role |
|------|------|
| `tools/llm/llm_client.cjs` | Provider abstraction + **tool-calling**, `agentLoop` (ReAct), `selfConsistent`, `safeJsonParse`, `parseToolCalls`, `tallyVotes`, `sleep` |
| `tools/llm/llm_prompts.cjs` | 6 prompt templates, all now embed the mandatory `COT_CHAIN` (HYPOTHESIS → EVIDENCE → COUNTER-EVIDENCE → VERDICT); `journalAnalysis` / `decisionEdgeCase` accept live trade-graph memory |
| `tools/llm/memory_lessons.cjs` | Loads active lessons + unresolved gaps for a pair from `shared/trade_graph.json` |
| `tools/llm/setup_auditor.cjs` | Audit-only ReAct agent that reviews an emitted decision and writes `setup_audit.{json,md}` |
| `tools/llm/load_env.cjs` | Idempotent project `.env` loader (llm_client only self-loads when it is the entry module) |
| `tools/ict_decision_validator.cjs` | New `--edge` mode: self-consistency voting over the `decisionEdgeCase` prompt |
| `tools/run_pair.cjs` | Launches the setup auditor as a **detached, non-blocking** child after decision emit |

## CoT chain (injected into every template)

```
1. HYPOTHESIS        — the claim/setup being evaluated, stated precisely
2. EVIDENCE          — specific data points, chunks, or stage outputs, cited
3. COUNTER-EVIDENCE  — the strongest case against; "none found" if genuine
4. VERDICT           — one-sentence conclusion, separated from reasoning
```
Stage 3 is mandatory — a missing counter-evidence scan is a failed answer.

## Setup Auditor

```bash
node tools/llm/setup_auditor.cjs EURUSD                # decision's date or most recent
node tools/llm/setup_auditor.cjs EURUSD --date 2026-08-11 --provider cerebras
node tools/llm/setup_auditor.cjs EURUSD --dry-run      # context + tools, no LLM call
```

- ReAct loop (default 6 iterations) with 3 sandboxed tools:
  - `read_file` — repo-relative paths only; allowed roots `stages/`, `_config/`, `shared/`
  - `query_trade_graph` — active lessons/gaps for the pair
  - `query_ict_knowledge` — keyword search over the 138-concept taxonomy
- Final answer is strict JSON: `{verdict, confidence, evidence[], counterEvidence[], recommendations[], reasoning}`
  where verdict ∈ `ALIGNED | CHALLENGED | UNABLE`.
- Writes `shared/<date>/<PAIR>/setup_audit.json` (machine) + `setup_audit.md` (human), including the tool-call trace.
- `run_pair.cjs` spawns it detached (`child.unref()`), so the pipeline never waits on the LLM.

## Edge-case review (`--edge`)

```bash
node tools/ict_decision_validator.cjs --edge EURUSD
# env: ICT_EDGE_RUNS (default 3), ICT_EDGE_TEMP (default 0.7)
```

Runs the `decisionEdgeCase` prompt N times at higher temperature, extracts each
`RULING: VALID | BORDERLINE-VALID | INVALID` line, and tallies the majority.
Used only when the deterministic validator has failed/borderline findings;
grey-area trades get a reconciliation pass against trade-graph memory.

## Verification

```bash
npm test                       # full suite
node --test tests/llm_layer.test.cjs   # 22 LLM-layer tests (fake clients, no network)
```

All LLM-layer tests are deterministic — injected fake clients, no API keys.

## Provider resilience (discovered Aug 11)

Two live Gemini quirks surfaced during validation; both degrade gracefully:

1. **Gemini thinking models reject round-2 tool calls** with HTTP 400
   ("Function call is missing a thought_signature"). `llm_client.cjs` now
   captures `thoughtSignature`/`thought_signature` per tool call and echoes it
   back in the `agentLoop` tool responses. If a provider still rejects tool
   calls, `setup_auditor` retries **once without tools** — the initial context
   already inlines the decision, 12 priority stage files, graph memory, and a
   file index, so a verdict is still producible from context alone.
2. **Free-tier 429 quota exhaustion** is recorded as `status: llm_unavailable`
   with a written `setup_audit.json` (raw error preserved). The pipeline
   outcome is unchanged.

If the verdict text isn't strict JSON, `runAudit` issues one bounded
temperature-0 re-ask demanding the schema verbatim. Verified live: produced
`{"verdict":"CHALLENGED","confidence":92,...}` from context alone.

## Known pre-existing failures (unrelated to this layer)

`tests/models_registry.test.cjs` fails 3 assertions: the registry now holds 20
models but the test expects 17, and the IFVG Scale-In model is missing a DoD
fail-case override for its `ifvg_present` step. Not touched here.
