# Stale Data Audit — July 31, 2026

## Incidents

| # | Date | What Happened | Impact |
|---|------|--------------|--------|
| 1 | Jul 30 | Positions table showed $4,111 for 30+ min while gold moved 6pts | Thought position was flat, missed TP approach |
| 2 | Jul 30 | Verification timed out on real orders — reported "unverified" | Confusion about whether trades placed |
| 3 | Jul 31 | Orders tab showed SL/TP "working" after position closed | Reported "holding" for 20+ min after SL hit |

## Data Sources — Freshness Assessment

### CHART DATA (CDP) — ✅ LIVE

| Source | How It's Read | Freshness | Reliability |
|--------|-------------|-----------|-------------|
| `live_levels.cjs` | Reads chart bars via CDP `bars.valueAt()` | **Real-time** | ✅ Best source |
| `scan_all_pairs.cjs` | CDP chart data + engine JSON | **Real-time** | ✅ Reliable |
| Chart price via `Runtime.evaluate` | Reads from chart's internal data model | **Real-time** | ✅ Best for current price |

### DOM TABLE DATA — ⚠️ CACHED

| Source | How It's Read | Freshness | Reliability |
|--------|-------------|-----------|-------------|
| Positions tab — current price | `check_orders.cjs` → `rows[j].textContent` | **Cached DOM** — refreshes on tab click only | ❌ Stale prices |
| Positions tab — position existence | Same | **Accurate** — position disappears when closed | ✅ For open/closed status |
| Orders tab — order status | Same | **Accurate for filled/cancelled** — updates on fill | ✅ For exit detection |
| Orders tab — "working" status | Same | **PERSISTS after position closes** — SL/TP orders stay "working" until cancelled by broker | ❌ CANNOT use for position existence |
| Buy-sell bar | `data-name="buy-sell-buttons"` | **Cached** — refreshes on symbol switch | ❌ Stale prices |

### FILE-BASED DATA — ⚠️ EVENTUAL

| Source | How It's Read | Freshness | Reliability |
|--------|-------------|-----------|-------------|
| `session_state.json` | `session_monitor.cjs` | **60s delay** — if monitor alive | ⚠️ Monitor-dependent |
| `trade_graph.json` | `trade_graph.cjs --rebuild` | **Manual rebuild only** | ⚠️ Stale between rebuilds |
| `decision_journal.md` | Written by us | **Real-time** | ✅ Always current |

---

## Mitigation Plan

### 1. NEVER Trust Positions Table For Current Price

**Rule**: The positions table's "Last price" column is cached DOM. Do not use it for P&L calculations or trade decisions.

**Fix**: When checking positions, verify current price against a live chart read. If the positions table price hasn't changed in 5+ minutes, flag as potentially stale and fetch live price from chart.

```javascript
// Cross-reference: positions table price vs chart price
const tablePrice = positions[0].current;  // from DOM — may be stale
const chartPrice = await getLivePrice(pair); // from CDP — always live
if (Math.abs(tablePrice - chartPrice) > threshold) {
  console.warn("STALE DATA: table=" + tablePrice + " chart=" + chartPrice);
}
```

### 2. Position Existence = Table Row Existence, NOT Order Status

**Rule**: A position is open if and only if it appears in the Positions tab. Do NOT use the Orders tab's "working" status to determine if a position is still open.

**Why**: When a position closes (TP or SL hit), the SL/TP bracket orders may still show "working" for seconds or minutes before the broker cancels them. The position itself disappears from the Positions tab immediately.

**Fix**: 
- Primary check: Positions tab → row exists = position open, row gone = position closed
- Secondary check: Orders tab → SL/TP status "filled" or "cancelled" = position closed
- NEVER: Orders tab → SL/TP status "working" → assume position still open

### 3. Add Staleness Detection To Every Check

**Fix**: Every position check should include:

```javascript
const STALENESS = {
  tablePriceAge: Date.now() - lastTableRefresh,
  chartPriceAge: Date.now() - lastChartRead,
  dataFresh: false
};

if (tablePriceAge > 300000) STALENESS.dataFresh = false; // 5 min
if (chartPrice === tablePrice && chartPriceAge > 60000) STALENESS.dataFresh = false; // 1 min unchanged
```

### 4. Use Chart CDP For All Price Checks

**Rule**: `live_levels.cjs` and direct chart CDP reads are the ONLY reliable sources for current price. Always prefer these over DOM table reads.

**Implementation**: Create a `get_live_price.cjs` script that:
- Switches to the pair on the chart
- Reads the current bar's close price from the chart's internal data model
- Returns JSON with timestamp and price
- Used by all position checks instead of table reads

### 5. Alert On Suspicious Data Patterns

**Patterns that indicate stale data:**

| Pattern | Meaning | Action |
|---------|---------|--------|
| Table price unchanged for 10+ min | Cached DOM | Force chart read |
| Orders show "working" but Positions tab empty | Position closed, orders not yet cancelled | Trust Positions tab |
| TP/SL both show "working" 30+ min after entry | Normal for open position, but verify | Cross-check with Positions tab |
| session_state.json timestamp > 5 min old | Monitor may be dead | Restart monitor |

### 6. Immediate Code Fixes

1. `check_orders.cjs`: After reading positions, also read live chart price and compare. Flag stale if > 2pt difference.

2. `session_monitor.cjs`: Add staleness detection. If same price for 3+ cycles, flag as potentially stale.

3. New `verify_live.cjs`: Dedicated script that checks position existence (Positions tab) AND live price (chart CDP) in one call. Single source of truth for position state.

4. `market_order.cjs`: After verification timeout, check both Positions AND Orders tabs. If position found in either, mark as "likely placed."
