#!/usr/bin/env node
/**
 * SMC Engine CLI
 *
 * Usage:
 *   npx smc-engine --pair EURUSD --tf 4h
 *   npx smc-engine --input candles.json --tf 1d
 *   cat candles.json | npx smc-engine --stdin --tf 4h
 *   npx smc-engine --pair EURUSD --mode strategies --output report.json
 *
 * Modes:
 *   full       — Complete SmcReport (default)
 *   structure  — Structure only
 *   levels     — Key levels (structure + liquidity + OBs + FVGs)
 *   strategies — Strategy detection via predicates
 *   entry      — Entry refinement (LTF structure + OBs + FVGs)
 *   risk       — ATR-based SL distance calculation
 */

import { readFileSync } from "fs";
import { writeFileSync } from "fs";
import { buildReport } from "./report";
import { analyzeStructure } from "./structure";
import { analyzeLiquidity } from "./liquidity";
import { analyzeOrderBlocks } from "./order-blocks";
import { analyzeFVG } from "./fvg";
import { lastAtr } from "./atr";
import type { Candle } from "./types";

interface Args {
  pair?: string;
  market?: "crypto" | "forex";
  tf: string[];
  mode: "full" | "structure" | "levels" | "strategies" | "entry" | "risk";
  output?: string;
  input?: string;
  stdin?: boolean;
  dailyInput?: string;
  correlatedInput?: string;
  correlatedSymbol?: string;
}

function parseArgs(): Args {
  const raw = process.argv.slice(2);
  const args: Record<string, string[]> = {};
  let current = "";
  for (const a of raw) {
    if (a.startsWith("--")) {
      current = a.slice(2);
      args[current] = [];
    } else if (current) {
      args[current].push(a);
    }
  }

  return {
    pair: args.pair?.[0],
    market: (args.market?.[0] as "crypto" | "forex") ?? "forex",
    tf: args.tf ?? ["4h"],
    mode: (args.mode?.[0] as Args["mode"]) ?? "full",
    output: args.output?.[0],
    input: args.input?.[0],
    stdin: args.stdin !== undefined,
    dailyInput: args["daily-input"]?.[0],
    correlatedInput: args["correlated-input"]?.[0],
    correlatedSymbol: args["correlated-symbol"]?.[0],
  };
}

function loadCandles(args: Args): Candle[] {
  if (args.stdin) {
    // Read from stdin
    const chunks: Buffer[] = [];
    // Synchronous read for CLI simplicity
    const fd = process.stdin.fd;
    if (fd === undefined) {
      // Node.js: read from stdin synchronously
      const fs = require("fs");
      const data = fs.readFileSync(0, "utf-8"); // fd 0 = stdin
      return JSON.parse(data);
    }
  }

  if (args.input) {
    const raw = readFileSync(args.input, "utf-8");
    const parsed = JSON.parse(raw);
    // Support both raw Candle[] and { candles: Candle[] }
    return Array.isArray(parsed) ? parsed : parsed.candles ?? parsed.data ?? [];
  }

  console.error("Error: No input provided. Use --input <file> or --stdin");
  process.exit(1);
  // TypeScript needs this — process.exit never returns but TS doesn't know
  throw new Error("unreachable");
}

function main() {
  const args = parseArgs();

  if (args.mode === "risk") {
    // ATR-based risk calculation
    const candles = loadCandles(args);
    const atr = lastAtr(candles);
    const last = candles[candles.length - 1].close;
    console.log(JSON.stringify({
      pair: args.pair ?? "unknown",
      atr,
      currentPrice: last,
      suggestedSL: {
        tight: +(last - atr * 1.5).toFixed(5),
        normal: +(last - atr * 2).toFixed(5),
        wide: +(last - atr * 3).toFixed(5),
      },
      atrPct: +((atr / last) * 100).toFixed(3),
    }, null, 2));
    return;
  }

  // Load candles
  const candles = loadCandles(args);

  // Load optional data
  const dailyCandles = args.dailyInput
    ? (() => { try { return JSON.parse(readFileSync(args.dailyInput, "utf-8")); } catch { return undefined; } })()
    : undefined;

  const correlatedPairs = args.correlatedInput && args.correlatedSymbol
    ? [{ symbol: args.correlatedSymbol, candles: (() => { try { return JSON.parse(readFileSync(args.correlatedInput!, "utf-8")); } catch { return []; } })() }]
    : undefined;

  // Execute requested mode
  switch (args.mode) {
    case "structure": {
      const result = analyzeStructure(candles);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "levels": {
      const structure = analyzeStructure(candles);
      const liquidity = analyzeLiquidity(candles);
      const orderBlocks = analyzeOrderBlocks(candles);
      const fvgs = analyzeFVG(candles);
      console.log(JSON.stringify({ structure, liquidity, orderBlocks, fvgs }, null, 2));
      break;
    }
    case "full":
    case "strategies":
    case "entry":
    default: {
      const report = buildReport(candles, { dailyCandles, correlatedPairs });
      const output = JSON.stringify(report, null, 2);

      if (args.output) {
        writeFileSync(args.output, output, "utf-8");
        console.error(`Report written to ${args.output}`);
      } else {
        console.log(output);
      }
      break;
    }
  }
}

main();
