# TradingView MCP Tools Guide

74 MCP tools for controlling TradingView Desktop via Chrome DevTools Protocol.

## Prerequisites

TradingView Desktop must be launched with the CDP debugging port:

```powershell
# Find the AUMID first
Get-StartApps | Where-Object Name -like "*TradingView*"

# Launch with CDP port
Start-Process "shell:AppsFolder\<AUMID>!TradingView.Desktop" -ArgumentList "--remote-debugging-port=9222"
```

Or use the helper script:
```powershell
.\tools\tv_mcp\launch-tv.bat
```

## Quick Reference — Most Used Tools

### Chart Control
```
tv_chart_set_symbol      — Change symbol (e.g., "EURUSD")
tv_chart_set_timeframe   — Change timeframe ("1m","5m","15m","1h","4h","1d","1w")
tv_chart_get_state       — Get current symbol, timeframe, chart type
tv_chart_set_type        — Set chart type (Candles, HeikinAshi, Line, etc.)
tv_chart_visible_range   — Get/set visible price/time range
tv_chart_symbol_search   — Search for symbols
```

### Drawing Tools
```
tv_draw_shape            — Draw any shape (horizontal_line, trend_line, rectangle,
                           fib_retracement, text, arrow, and 20+ more)
tv_draw_list             — List all drawings on the chart
tv_draw_remove           — Remove a specific drawing
tv_draw_clear_all        — Clear all drawings
tv_draw_get_properties   — Get properties of a specific drawing
```

### Data Extraction
```
tv_data_get_ohlcv        — Get OHLCV bars for current symbol/timeframe
tv_data_get_quote        — Get real-time quote (bid/ask/spread)
tv_data_get_indicator_values — Get values from an indicator (RSI, MACD, etc.)
tv_data_get_strategy_results — Get Pine Strategy backtest results
tv_data_get_trades       — Get trade list from strategy tester
```

### Alerts
```
tv_alert_create          — Create a price alert
tv_alert_list            — List all alerts
tv_alert_delete          — Delete an alert
```

### Bar Replay
```
tv_replay_start          — Start bar replay from a date
tv_replay_step           — Step forward one bar
tv_replay_autoplay       — Toggle autoplay
tv_replay_stop           — Stop replay
tv_replay_status         — Get replay status
```

### Screenshots
```
tv_capture_screenshot    — Take screenshot (full window, chart only, or strategy tester)
```

### Health
```
tv_health                — Check connection status
tv_connect               — Force reconnect to TV Desktop
```

## Common Patterns

### Pattern 1: Load a pair and draw levels
```typescript
// 1. Set up the chart
tv_chart_set_symbol({ symbol: "EURUSD" })
tv_chart_set_timeframe({ timeframe: "4h" })

// 2. Draw a bullish order block
tv_draw_shape({
  type: "rectangle",
  points: [{ price: 1.0850, time: 1752019200 }, { price: 1.0870, time: 1752105600 }],
  color: "#2962FF",
  fillColor: "#2962FF20"
})

// 3. Draw stop loss and take profit
tv_draw_shape({ type: "horizontal_line", points: [{ price: 1.0830 }], color: "#FF0000" })
tv_draw_shape({ type: "horizontal_line", points: [{ price: 1.0920 }], color: "#00FF00" })
```

### Pattern 2: Extract data for SMC engine
```typescript
// Get OHLCV data
const bars = tv_data_get_ohlcv({ limit: 400 })
// Save to file and feed to smc-engine
```

### Pattern 3: Multi-timeframe scan
```typescript
const timeframes = ["1d", "4h", "1h", "15m"]
for (const tf of timeframes) {
  tv_chart_set_timeframe({ timeframe: tf })
  tv_capture_screenshot({ region: "chart" })
  // Save screenshot for this TF
}
```
