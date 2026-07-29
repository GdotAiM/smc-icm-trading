/**
 * TradingView Desktop CDP Connection
 *
 * Manages a Chrome DevTools Protocol connection to a locally running
 * TradingView Desktop instance via chrome-remote-interface.
 *
 * Connection flow:
 *   1. Read CDP host/port from env (TV_CDP_HOST / TV_CDP_PORT, default 127.0.0.1:9222)
 *   2. Fetch /json/list to find a TradingView chart page target
 *   3. Attach chrome-remote-interface to that target
 *   4. Provide evaluate(), evaluateAsync(), screenshot() helpers
 *
 * Also supports tab switching by reconnecting to a different target.
 *
 * Based on patterns from github.com/tradesdontlie/tradingview-mcp
 */

import { logger } from "../logger.js";
import { getTvConfig } from "../config.js";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import CDP from "chrome-remote-interface";

// ─── State ────────────────────────────────────────────────────────────────

let _client: any = null;
let _targetUrl: string | null = null;
let _connected = false;

// ─── Config helpers ───────────────────────────────────────────────────────

export function getCdpHost(): string {
  return process.env.TV_CDP_HOST || process.env.CDP_HOST || "127.0.0.1";
}

export function getCdpPort(): number {
  return Number(process.env.TV_CDP_PORT || process.env.CDP_PORT) || 9222;
}

export async function getClient(): Promise<any> {
  return _client;
}

function getEndpoint(): string {
  return `http://${getCdpHost()}:${getCdpPort()}`;
}

// ─── Target discovery ────────────────────────────────────────────────────

export interface TvTarget {
  id: string;
  title: string;
  url: string;
  chart_id: string | null;
  is_chart: boolean;
}

/**
 * List all CDP page targets from TV Desktop.
 */
export async function listTargets(): Promise<TvTarget[]> {
  const resp = await fetch(`${getEndpoint()}/json/list`);
  const targets = await resp.json() as any[];
  return targets
    .filter(t => t.type === "page")
    .map(t => ({
      id: t.id,
      title: t.title,
      url: t.url,
      chart_id: t.url.match(/\/chart\/([^/?]+)/)?.[1] || null,
      is_chart: /tradingview\.com\/chart/i.test(t.url),
    }));
}

/**
 * Find the best chart target — prefers a visible chart page.
 */
async function findChartTarget(): Promise<TvTarget | null> {
  const targets = await listTargets();
  // Prefer visible chart pages
  const charts = targets.filter(t => t.is_chart);
  if (charts.length === 0) return null;
  // Return the first chart (the active one is usually first)
  return charts[0];
}

// ─── Connection lifecycle ────────────────────────────────────────────────

/**
 * Connect to TradingView Desktop via CDP.
 * Idempotent — safe to call multiple times.
 */
export async function connect(): Promise<boolean> {
  if (_connected && _client) return true;

  const tvConfig = getTvConfig();
  if (!tvConfig.enabled) return false;

  try {
    const target = await findChartTarget();
    if (!target) {
      logger.warn("No TradingView chart target found. Is TV Desktop open with --remote-debugging-port?");
      return false;
    }

    _client = await CDP({
      host: getCdpHost(),
      port: getCdpPort(),
      target: target.id,
    });

    await _client.Runtime.enable();
    await _client.Page.enable();
    await _client.DOM.enable();

    _targetUrl = target.url;
    _connected = true;
    logger.info({ url: target.url, title: target.title }, "TradingView Desktop CDP connected");
    return true;
  } catch (err: any) {
    _connected = false;
    logger.warn({ err: err.message }, "TradingView Desktop CDP connection failed");
    return false;
  }
}

/**
 * Disconnect and clean up.
 */
export async function disconnect(): Promise<void> {
  if (_client) {
    try {
      await _client.close();
    } catch { /* ignore */ }
    _client = null;
  }
  _connected = false;
  _targetUrl = null;
  logger.info("TradingView Desktop CDP disconnected");
}

/**
 * Check if the CDP connection is still alive.
 */
export async function isConnected(): Promise<boolean> {
  if (!_connected || !_client) return false;
  try {
    await _client.Runtime.evaluate({ expression: "1", returnByValue: true });
    return true;
  } catch {
    _connected = false;
    return false;
  }
}

/**
 * Reconnect the cached CDP client to a different target (for tab switching).
 */
export async function reconnectTo(targetId: string): Promise<void> {
  if (_client) {
    try { await _client.close(); } catch { /* ignore */ }
    _client = null;
  }
  _connected = false;

  _client = await CDP({
    host: getCdpHost(),
    port: getCdpPort(),
    target: targetId,
  });
  await _client.Runtime.enable();
  await _client.Page.enable();
  await _client.DOM.enable();
  _connected = true;
}

// ─── Evaluation helpers ─────────────────────────────────────────────────

/**
 * Evaluate synchronous JavaScript in the TV Desktop page context.
 * Returns the result value, or null on failure.
 */
export async function evaluate<T = any>(expression: string): Promise<T | null> {
  if (!(await isConnected()) || !_client) return null;
  try {
    const { result } = await _client.Runtime.evaluate({ expression, returnByValue: true });
    return result.value as T;
  } catch (err: any) {
    logger.warn({ err: err.message, expression: expression.slice(0, 80) }, "TV Desktop evaluate failed");
    return null;
  }
}

/**
 * Evaluate asynchronous JavaScript (Promise-returning) in the TV page context.
 * The expression should return a Promise.
 */
export async function evaluateAsync<T = any>(expression: string): Promise<T | null> {
  if (!(await isConnected()) || !_client) return null;
  try {
    const { result } = await _client.Runtime.evaluate({
      expression,
      returnByValue: true,
      awaitPromise: true,
      timeout: 15000,
    });
    return result.value as T;
  } catch (err: any) {
    logger.warn({ err: err.message, expression: expression.slice(0, 80) }, "TV Desktop evaluateAsync failed");
    return null;
  }
}

/**
 * Sanitize a string for safe interpolation into JavaScript evaluated via CDP.
 * Uses JSON.stringify to produce a properly escaped JS string literal.
 */
export function safeString(str: string): string {
  return JSON.stringify(String(str));
}

/**
 * Validate that a value is a finite number.
 */
export function requireFinite(value: any, name: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a finite number, got: ${value}`);
  return n;
}

// ─── Screenshot ─────────────────────────────────────────────────────────

/**
 * Capture a screenshot of the TV Desktop page.
 * `region` can be "full" (default), "chart" (pane only), or "strategy_tester".
 */
export async function captureScreenshot(region: "full" | "chart" | "strategy_tester" = "full"): Promise<string | null> {
  if (!(await isConnected()) || !_client) return null;

  let clip: any = undefined;
  if (region === "chart") {
    const bounds = await evaluate(`
      (function() {
        var el = document.querySelector('[data-name="pane-canvas"]')
          || document.querySelector('[class*="chart-container"]')
          || document.querySelector('canvas');
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      })()
    `);
    if (bounds) clip = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, scale: 1 };
  } else if (region === "strategy_tester") {
    const bounds = await evaluate(`
      (function() {
        var el = document.querySelector('[data-name="backtesting"]')
          || document.querySelector('[class*="strategyReport"]');
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      })()
    `);
    if (bounds) clip = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, scale: 1 };
  }

  try {
    const params: any = { format: "png" };
    if (clip) params.clip = clip;
    const { data } = await _client.Page.captureScreenshot(params);
    return data as string; // base64-encoded PNG
  } catch (err: any) {
    logger.warn({ err: err.message }, "TV Desktop screenshot failed");
    return null;
  }
}

// ─── Known API path helpers ──────────────────────────────────────────────

const CHART_API = "window.TradingViewApi._activeChartWidgetWV.value()";
const CHART_COLLECTION = "window.TradingViewApi._chartWidgetCollection";
const REPLAY_API = "window.TradingViewApi._replayApi";
const BARS_PATH = `${CHART_API}._chartWidget.model().mainSeries().bars()`;

export const KNOWN_PATHS = { CHART_API, CHART_COLLECTION, REPLAY_API, BARS_PATH };

/**
 * Verify a JS path expression exists in the page context, then return it.
 */
async function verifyPath(path: string, name: string): Promise<string> {
  const exists = await evaluate(`typeof (${path}) !== 'undefined' && (${path}) !== null`);
  if (!exists) throw new Error(`${name} not available at ${path}`);
  return path;
}

export async function getChartApi(): Promise<string> {
  return verifyPath(CHART_API, "Chart API");
}

export async function getReplayApi(): Promise<string> {
  return verifyPath(REPLAY_API, "Replay API");
}

export async function getChartCollection(): Promise<string> {
  return verifyPath(CHART_COLLECTION, "Chart Collection");
}

export async function getMainSeriesBars(): Promise<string> {
  return verifyPath(BARS_PATH, "Main Series Bars");
}
