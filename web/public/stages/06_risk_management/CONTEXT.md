# Stage 06 — Risk Management & Position Sizing

## Purpose
Calculate position size based on account balance and risk parameters,
finalize trade execution plan, and prepare for trade management.

## Inputs

| Source | Location | What to load |
|--------|----------|--------------|
| Previous Stage | `../05_entry_refinement/output/entry_plan.md` | Entry, SL, TP levels |
| Config | `../../_config/risk_parameters.md` | Account size, risk %, rules |
| Config | `../../_config/trading_rules.md` | Position sizing rules |
| Engine | `npx smc-engine --mode risk` | ATR for dynamic SL sizing |

## Process

### 1. Load Risk Parameters
From `_config/risk_parameters.md`:
- Account balance
- Max risk per trade (%)
- Max daily loss limit
- Max correlation exposure
- Max positions open

### 2. Calculate Position Size
```
Risk Amount = Account Balance × Risk Per Trade %
Stop Distance = |Entry - SL| in pips
Pip Value = (for forex: depends on pair and lot size)
Position Size = Risk Amount / (Stop Distance × Pip Value)
```

Round down to nearest standard lot size:
- Standard: 100,000 units
- Mini: 10,000 units
- Micro: 1,000 units

### 3. Validate Against Rules
Check from `_config/trading_rules.md`:
- Position size ≤ max position size
- Daily loss (if this trade hits SL) ≤ max daily loss
- No correlated positions open (e.g., don't long EURUSD and short GBPUSD)
- Total exposure ≤ max portfolio exposure

### 4. Determine Execution Mode
- **Paper Trading** (default): Use MockBrokerAdapter, log to files
- **Live** (if Alpaca keys set): Use AlpacaAdapter with REVIEW mode first
- **Manual**: Just write the plan; user executes themselves

### 5. Write Trade Ticket
Generate a complete trade ticket ready for execution:
- Pair, direction, entry type (limit/market)
- Entry price, SL price, TP1 price, TP2 price
- Position size, risk amount, max loss, max gain

### 6. Set Trade Management Rules
- **Move SL to breakeven**: When TP1 is hit
- **Partial TP**: 50% at TP1, 50% at TP2 (configurable)
- **Trail SL**: After TP1, trail SL by [X] pips or to next structure
- **Time stop**: If trade not at TP1 within [X] candles, close

## Output Requirements

Create `output/risk_plan.md`:

```markdown
# Risk Plan — [PAIR] — [DATE]

## Account Summary
- **Balance**: $[amount]
- **Risk Per Trade**: [X]% = $[amount]
- **Daily Loss Limit**: $[amount] ([Y]% of account)
- **Current Daily P&L**: $[amount]

## Position Size Calculation
| Parameter | Value |
|-----------|-------|
| Entry Price | [price] |
| Stop Loss | [price] |
| Stop Distance | [X] pips |
| Pip Value (1 standard lot) | $[value] |
| Risk Amount | $[amount] |
| **Position Size** | **[X] lots** |

## Trade Ticket
```
PAIR:      [EURUSD]
DIRECTION: [LONG / SHORT]
ENTRY:     [price] ([limit / market])
STOP LOSS: [price]
TAKE PROFIT 1: [price] ([X] pips, [Y]% of position)
TAKE PROFIT 2: [price] ([X] pips, [Y]% of position)
POSITION:  [X] standard lots
RISK:      $[amount] ([X]% of account)
MAX GAIN:  $[amount] ([X]:1 R:R)
```

## Trade Management
- [ ] Move SL to BE after TP1 hit
- [ ] Close 50% at TP1
- [ ] Trail SL after TP1: [method]
- [ ] Time stop: [X] candles / [X] minutes

## Execution Mode
**[PAPER / LIVE-REVIEW / MANUAL]**

## Pre-Execution Checklist
- [ ] R:R ≥ minimum (1.0:1)
- [ ] Risk ≤ max risk per trade
- [ ] Daily loss not exceeded
- [ ] No correlated positions
- [ ] Alerts set in TradingView
- [ ] Journal entry ready for Stage 07

## ICT Knowledge Reference

Before writing this stage, query the ICT knowledge base:

```bash
node tools/ict_rag.cjs --query "ICT stop loss placement structural invalidation"
```

```bash
node tools/ict_rag.cjs --query "ICT risk management position sizing rules"
```

Cite ICT sources in your output with the format: `[ICT: concept-name.md]`
