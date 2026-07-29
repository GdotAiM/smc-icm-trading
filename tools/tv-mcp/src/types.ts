/**
 * TradingView Integration — Type Definitions
 *
 * Types for TradingView Desktop connectivity via CDP, data source
 * configuration, chart state, drawings, and reconciliation.
 */

export type DataSourceMode = "app" | "tv" | "hybrid";
export type InteractionMode = "readonly" | "readwrite";
export type TvConnectionType = "desktop" | "web";

export interface TvConnectionConfig {
  type: TvConnectionType;
  /** Chrome DevTools Protocol port (Desktop app: --remote-debugging-port) */
  cdpPort: number;
  /** URL for web version fallback */
  webUrl: string;
  /** Health check interval in ms */
  reconnectIntervalMs: number;
}

export interface TradingViewConfig {
  enabled: boolean;
  connection: TvConnectionConfig;
  /** Which data source to treat as truth */
  dataSource: DataSourceMode;
  /** Whether to allow write operations on the TV chart */
  interactionMode: InteractionMode;
  /** Auto-draw SMC levels (OB/FVG/Draw) on TV chart */
  syncLevels: boolean;
  /** Price difference percentage that triggers a reconciliation flag */
  reconcileThreshold: number;
}

export const DEFAULT_TV_CONFIG: TradingViewConfig = {
  enabled: false,
  connection: {
    type: "desktop",
    cdpPort: 9222,
    webUrl: "https://www.tradingview.com/chart/",
    reconnectIntervalMs: 5000,
  },
  dataSource: "app",
  interactionMode: "readonly",
  syncLevels: false,
  reconcileThreshold: 0.1,
};

// ─── Chart State ──────────────────────────────────────────────────────────

export interface ChartState {
  symbol: string;
  timeframe: string;
  visibleRange: { from: number; to: number } | null;
  crosshairPrice: number | null;
  drawings: Drawing[];
  indicators: string[];
}

export interface Drawing {
  id: string;
  type: "horizontal_line" | "trend_line" | "fib_retracement" | "rectangle" | "ray" | "text";
  price: number;
  text?: string;
  color?: string;
}

// ─── Reconciliation ───────────────────────────────────────────────────────

export interface Discrepancy {
  field: string;
  appValue: unknown;
  tvValue: unknown;
  severity: "info" | "warning" | "error";
  description: string;
}

export interface ReconciliationReport {
  discrepancies: Discrepancy[];
  recommendedAction: "use_app" | "use_tv" | "flag_ai";
  symbol: string;
  timeframe: string;
}

// ─── Symbol Map ───────────────────────────────────────────────────────────

/**
 * Maps our internal symbol format (BTCUSDT) to TradingView format (BINANCE:BTCUSDT).
 * Extend with additional exchange prefixes as needed.
 */
export const SYMBOL_TO_TV: Record<string, string> = {
  BTCUSDT: "BINANCE:BTCUSDT",
  ETHUSDT: "BINANCE:ETHUSDT",
  SOLUSDT: "BINANCE:SOLUSDT",
  BNBUSDT: "BINANCE:BNBUSDT",
  XRPUSDT: "BINANCE:XRPUSDT",
  ADAUSDT: "BINANCE:ADAUSDT",
  DOGEUSDT: "BINANCE:DOGEUSDT",
  AVAXUSDT: "BINANCE:AVAXUSDT",
  DOTUSDT: "BINANCE:DOTUSDT",
  LINKUSDT: "BINANCE:LINKUSDT",
  EURUSD: "FX:EURUSD",
  GBPUSD: "FX:GBPUSD",
  USDJPY: "FX:USDJPY",
  AUDUSD: "FX:AUDUSD",
  USDCAD: "FX:USDCAD",
  USDCHF: "FX:USDCHF",
  NZDUSD: "FX:NZDUSD",
};

export function toTvSymbol(symbol: string): string {
  const cleaned = symbol.replace("=X", "");
  return SYMBOL_TO_TV[cleaned] ?? `BINANCE:${cleaned}`;
}

export function fromTvSymbol(tvSymbol: string): string {
  const parts = tvSymbol.split(":");
  return parts[parts.length - 1] || tvSymbol;
}

// ─── Timeframe map ────────────────────────────────────────────────────────

export const TF_TO_TV: Record<string, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1h": "60",
  "4h": "240",
  "1d": "1D",
  "1w": "1W",
};

export function toTvTimeframe(tf: string): string {
  return TF_TO_TV[tf] ?? tf;
}

export function fromTvTimeframe(tvTf: string): string {
  const rev: Record<string, string> = {};
  for (const [k, v] of Object.entries(TF_TO_TV)) rev[v] = k;
  return rev[tvTf] ?? tvTf;
}
