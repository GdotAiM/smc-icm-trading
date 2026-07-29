/**
 * TradingView Integration — Configuration
 *
 * Module-level config singleton, following the SMC_CONFIG / NewsFetcher
 * pattern of environment-variable-driven defaults with a programmatic
 * override path.
 */

import type { TradingViewConfig, DataSourceMode, InteractionMode, TvConnectionType } from "./types.js";
import { DEFAULT_TV_CONFIG } from "./types.js";

// ── Mutable singleton config ──────────────────────────────────────────────
// Updated via setConfig() at runtime, seeded from env vars on import.

let _config: TradingViewConfig = { ...DEFAULT_TV_CONFIG };

// Read env vars on first import
try {
  if (process.env.TV_ENABLED === "true") _config.enabled = true;
  if (process.env.TV_CDP_PORT) _config.connection.cdpPort = parseInt(process.env.TV_CDP_PORT, 10);
  if (process.env.TV_WEB_URL) _config.connection.webUrl = process.env.TV_WEB_URL;
  if (process.env.TV_DATA_SOURCE) _config.dataSource = process.env.TV_DATA_SOURCE as DataSourceMode;
  if (process.env.TV_INTERACTION) _config.interactionMode = process.env.TV_INTERACTION as InteractionMode;
  if (process.env.TV_CONNECTION_TYPE) _config.connection.type = process.env.TV_CONNECTION_TYPE as TvConnectionType;
  if (process.env.TV_SYNC_LEVELS === "true") _config.syncLevels = true;
} catch { /* safe to ignore — defaults apply */ }

// ── Public API ────────────────────────────────────────────────────────────

/** Get the current TV integration config */
export function getTvConfig(): TradingViewConfig {
  return { ..._config };
}

/** Override the TV integration config at runtime */
export function setTvConfig(partial: Partial<TradingViewConfig>): TradingViewConfig {
  _config = { ..._config, ...partial };
  return getTvConfig();
}

/** Quick check if TV integration is enabled */
export function isTvEnabled(): boolean {
  return _config.enabled;
}

/** Check if TV should be used as the primary data source */
export function isTvPrimary(): boolean {
  return _config.enabled && _config.dataSource === "tv";
}

/** Check if TV should be used as a hybrid comparator */
export function isHybridMode(): boolean {
  return _config.enabled && _config.dataSource === "hybrid";
}

/** Check if write operations are allowed on TV */
export function canWriteToTv(): boolean {
  return _config.enabled && _config.interactionMode === "readwrite";
}
