/**
 * TradingView Desktop — Replay Mode Tools
 *
 * Control TradingView's bar replay system: start replay from a date,
 * step forward, autoplay, trade in replay mode, stop replay.
 */

import { z } from "zod";
import { evaluate, safeString, KNOWN_PATHS } from "./core/connection.js";
import type { ToolDef } from "./index.js";

const RP = KNOWN_PATHS.REPLAY_API;

// Unwrap value-or-observable pattern used by TV's replay API
const wv = (path: string) =>
  `(function(){ var v = ${path}; return (v && typeof v === 'object' && typeof v.value === 'function') ? v.value() : v; })()`;

const VALID_AUTOPLAY_DELAYS = [100, 143, 200, 300, 1000, 2000, 3000, 5000, 10000];

export const replayTools: ToolDef[] = [
  {
    name: "tv_replay_start",
    description: "Start replay mode on the current chart. Optionally specify a date to start from (use the format YYYY-MM-DD).",
    parameters: z.object({
      date: z.string().optional().describe("Date to start replay from, e.g. 2024-01-15 (optional — starts from earliest available)"),
    }),
    execute: async ({ date }: { date?: string }) => {
      const available = await evaluate(wv(`${RP}.isReplayAvailable()`));
      if (!available) throw new Error("Replay is not available for the current symbol/timeframe");
      await evaluate(`${RP}.showReplayToolbar()`);
      if (date) {
        const ts = new Date(date).getTime();
        if (isNaN(ts)) throw new Error(`Invalid date: "${date}". Use YYYY-MM-DD format.`);
        await evaluate(`${RP}.selectDate(${ts}).then(function() { return 'ok'; })`);
      } else {
        await evaluate(`${RP}.selectFirstAvailableDate()`);
      }
      let started: boolean | null = false, currentDate: number | null = null;
      for (let i = 0; i < 30; i++) {
        started = await evaluate(wv(`${RP}.isReplayStarted()`));
        currentDate = await evaluate(wv(`${RP}.currentDate()`));
        if (started && currentDate !== null) break;
        await new Promise(r => setTimeout(r, 250));
      }
      if (!started) { try { await evaluate(`${RP}.stopReplay()`); } catch {} throw new Error("Replay failed to start."); }
      return { success: true, replay_started: true, date: date || "(first available)", current_date: currentDate };
    },
  },
  {
    name: "tv_replay_step",
    description: "Advance the replay by one bar.",
    parameters: z.object({}),
    execute: async () => {
      const started = await evaluate(wv(`${RP}.isReplayStarted()`));
      if (!started) throw new Error("Replay is not started. Use tv_replay_start first.");
      const before = await evaluate(wv(`${RP}.currentDate()`));
      await evaluate(`${RP}.doStep()`);
      let currentDate = before;
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 250));
        currentDate = await evaluate(wv(`${RP}.currentDate()`));
        if (currentDate !== before) break;
      }
      return { success: true, action: "step", current_date: currentDate };
    },
  },
  {
    name: "tv_replay_autoplay",
    description: "Toggle replay autoplay on/off, or change the autoplay speed. Valid delays: 100, 143, 200, 300, 1000, 2000, 3000, 5000, 10000 ms.",
    parameters: z.object({
      speed: z.number().optional().describe("Autoplay delay in milliseconds (100-10000). Changes speed if already autoplaying."),
      active: z.boolean().optional().describe("True to start, false to stop, omit to toggle"),
    }),
    execute: async ({ speed, active }: { speed?: number; active?: boolean }) => {
      if (speed && !VALID_AUTOPLAY_DELAYS.includes(speed)) throw new Error(`Invalid speed ${speed}ms. Valid: ${VALID_AUTOPLAY_DELAYS.join(", ")}`);
      const started = await evaluate(wv(`${RP}.isReplayStarted()`));
      if (!started) throw new Error("Replay not started. Use tv_replay_start first.");
      if (speed) await evaluate(`${RP}.changeAutoplayDelay(${speed})`);
      if (active === true) { const isOn = await evaluate(wv(`${RP}.isAutoplayStarted()`)); if (!isOn) await evaluate(`${RP}.toggleAutoplay()`); }
      else if (active === false) { const isOn = await evaluate(wv(`${RP}.isAutoplayStarted()`)); if (isOn) await evaluate(`${RP}.toggleAutoplay()`); }
      else await evaluate(`${RP}.toggleAutoplay()`);
      const isAutoplay = await evaluate(wv(`${RP}.isAutoplayStarted()`));
      const currentDelay = await evaluate(wv(`${RP}.autoplayDelay()`));
      return { success: true, autoplay_active: !!isAutoplay, delay_ms: currentDelay };
    },
  },
  {
    name: "tv_replay_stop",
    description: "Stop replay mode and return to the live chart.",
    parameters: z.object({}),
    execute: async () => {
      const started = await evaluate(wv(`${RP}.isReplayStarted()`));
      if (!started) return { success: true, action: "already_stopped" };
      await evaluate(`${RP}.stopReplay()`);
      return { success: true, action: "replay_stopped" };
    },
  },
  {
    name: "tv_replay_trade",
    description: "Execute a trade in replay mode: buy, sell, or close position.",
    parameters: z.object({
      action: z.enum(["buy", "sell", "close"]).describe("Trade action: buy, sell, or close"),
    }),
    execute: async ({ action }: { action: string }) => {
      const started = await evaluate(wv(`${RP}.isReplayStarted()`));
      if (!started) throw new Error("Replay not started. Use tv_replay_start first.");
      if (action === "buy") await evaluate(`${RP}.buy()`);
      else if (action === "sell") await evaluate(`${RP}.sell()`);
      else if (action === "close") await evaluate(`${RP}.closePosition()`);
      else throw new Error("Invalid action. Use buy, sell, or close");
      const position = await evaluate(wv(`${RP}.position()`));
      const pnl = await evaluate(wv(`${RP}.realizedPL()`));
      return { success: true, action, position, realized_pnl: pnl };
    },
  },
  {
    name: "tv_replay_status",
    description: "Get the current replay mode status: is started, autoplay state, current date, position, P&L.",
    parameters: z.object({}),
    execute: async () => {
      const st = await evaluate(`
        (function() {
          var r = ${RP};
          function unwrap(v) { return (v && typeof v === 'object' && typeof v.value === 'function') ? v.value() : v; }
          return {
            is_replay_available: unwrap(r.isReplayAvailable()), is_replay_started: unwrap(r.isReplayStarted()),
            is_autoplay_started: unwrap(r.isAutoplayStarted()), replay_mode: unwrap(r.replayMode()),
            current_date: unwrap(r.currentDate()), autoplay_delay: unwrap(r.autoplayDelay()),
          };
        })()
      `);
      const pos = await evaluate(wv(`${RP}.position()`));
      const pnl = await evaluate(wv(`${RP}.realizedPL()`));
      return { ...st, position: pos, realized_pnl: pnl };
    },
  },
];
