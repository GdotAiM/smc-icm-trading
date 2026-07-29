// Core types shared across all SMC engine modules.
// Each detection module defines and exports its own result types.
// This file provides the fundamental types that multiple modules import.

export interface Candle {
  time: number; // Unix epoch milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Pivot {
  index: number;
  price: number;
  time: number;
  type: "high" | "low";
}
