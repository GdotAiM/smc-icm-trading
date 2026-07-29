// Types originally from BrokerAbstraction.js — inlined since that module is not yet built
interface BrokerAdapter { name: string; isReady: boolean; placeOrder(signal: any): Promise<ExecutionResult>; getAccount(): Promise<AccountBalance>; }
interface ExecutionResult { success: boolean; orderId?: string; error?: string; }
interface AccountBalance { equity: number; cash: number; buyingPower: number; }
interface BrokerOrder { id: string; status: OrderStatus; filledPrice?: number; }
type OrderStatus = "PENDING" | "FILLED" | "REJECTED" | "CANCELLED";
interface UnifiedTradeSignal { symbol: string; asset_class?: string; action?: string; entry?: number; sl?: number; tp1?: number; tp2?: number; }

// deriveSide — inlined from non-existent BrokerAbstraction.js
function deriveSide(signal: UnifiedTradeSignal): "BUY" | "SELL" {
  if (signal.action === "BUY" || signal.action === "LONG") return "BUY";
  if (signal.action === "SELL" || signal.action === "SHORT") return "SELL";
  if (signal.entry && signal.sl) return signal.entry > signal.sl ? "BUY" : "SELL";
  return "BUY";
}

// logger — inlined from non-existent ../logger.js
const logger = { info: (msg: string) => console.log(`[alpaca] ${msg}`), error: (msg: string) => console.error(`[alpaca] ${msg}`), warn: (msg: string) => console.warn(`[alpaca] ${msg}`) };

// ─── Constants ───────────────────────────────────────────────────────────────

/** Alpaca Paper Trading API — hardcoded, never the live endpoint. */
const PAPER_BASE = "https://paper-api.alpaca.markets";

// ─── Symbol translation ──────────────────────────────────────────────────────

/**
 * Map Binance-style crypto symbols to Alpaca's BTC/USD format.
 * Only the pairs the app actually subscribes to are listed — anything else
 * gets a clean rejection rather than a guess.
 */
const CRYPTO_SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: "BTC/USD",
  BTCUSD: "BTC/USD",
  ETHUSDT: "ETH/USD",
  ETHUSD: "ETH/USD",
  SOLUSDT: "SOL/USD",
  SOLUSD: "SOL/USD",
  BNBUSDT: "BNB/USD",
  BNBUSD: "BNB/USD",
  XRPUSDT: "XRP/USD",
  XRPUSD: "XRP/USD",
  ADAUSDT: "ADA/USD",
  ADAUSD: "ADA/USD",
  DOGEUSDT: "DOGE/USD",
  DOGEUSD: "DOGE/USD",
};

function translateSymbol(signal: UnifiedTradeSignal): string | null {
  // Forex is unsupported by Alpaca
  if (signal.asset_class === "FOREX" || signal.asset_class === ("FOREX" as any)) {
    return null;
  }

  const sym = signal.symbol.toUpperCase();
  return CRYPTO_SYMBOL_MAP[sym] ?? null;
}

// ─── AlpacaAdapter ───────────────────────────────────────────────────────────

export class AlpacaAdapter implements BrokerAdapter {
  name = "ALPACA_PAPER";
  isReady: boolean;

  private apiKeyId: string;
  private apiSecretKey: string;

  constructor() {
    this.apiKeyId = (process.env.ALPACA_API_KEY_ID || "").trim();
    this.apiSecretKey = (process.env.ALPACA_API_SECRET_KEY || "").trim();
    this.isReady = Boolean(this.apiKeyId && this.apiSecretKey);

    if (!this.isReady) {
      logger.warn(
        "AlpacaAdapter: ALPACA_API_KEY_ID and/or ALPACA_API_SECRET_KEY not set — " +
          "adapter is NOT ready. Set both env vars to enable Alpaca paper trading."
      );
    } else {
      logger.info("AlpacaAdapter: paper trading ready (paper-api.alpaca.markets)");
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private authHeaders(): Record<string, string> {
    return {
      "APCA-API-KEY-ID": this.apiKeyId,
      "APCA-API-SECRET-KEY": this.apiSecretKey,
      "Content-Type": "application/json",
    };
  }

  private rejection(
    signal: UnifiedTradeSignal,
    mode: "REVIEW" | "LIVE",
    error: string,
  ): ExecutionResult {
    return {
      success: false,
      error,
      mode,
      broker_name: this.name,
      trade_signal_id: signal.id,
    };
  }

  // ── BrokerAdapter implementation ─────────────────────────────────────────

  async executeOrder(
    signal: UnifiedTradeSignal,
    mode: "REVIEW" | "LIVE",
  ): Promise<ExecutionResult> {
    // REVIEW mode — never call Alpaca, return a dry-run preview
    if (mode === "REVIEW") {
      return {
        success: true,
        mode: "REVIEW",
        broker_name: this.name,
        trade_signal_id: signal.id,
        executed_at: new Date(),
        actual_entry_price: signal.entry_price,
        // no order_id — this was a preview
      };
    }

    // Symbol checks
    if (signal.asset_class === "FOREX") {
      return this.rejection(
        signal,
        mode,
        "Alpaca does not support forex — this adapter only handles crypto/equities",
      );
    }

    const symbol = translateSymbol(signal);
    if (!symbol) {
      return this.rejection(
        signal,
        mode,
        `Symbol "${signal.symbol}" is not in the Alpaca crypto symbol map — ` +
          "add it to CRYPTO_SYMBOL_MAP in AlpacaAdapter.ts if Alpaca supports it",
      );
    }

    const side = deriveSide(signal).toLowerCase(); // Alpaca expects "buy"/"sell"
    const qty = signal.suggested_qty ?? 1;

    const body: Record<string, unknown> = {
      symbol,
      qty: String(qty),
      side,
      type: "market",
      time_in_force: "gtc",
    };

    try {
      const res = await fetch(`${PAPER_BASE}/v2/orders`, {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        return this.rejection(
          signal,
          mode,
          `Alpaca order failed (HTTP ${res.status}): ${JSON.stringify(data)}`,
        );
      }

      const filledPrice =
        data.filled_avg_price != null
          ? Number(data.filled_avg_price)
          : undefined;

      return {
        success: true,
        order_id: data.id as string,
        executed_at: new Date(),
        actual_entry_price: filledPrice ?? signal.entry_price,
        mode,
        broker_name: this.name,
        trade_signal_id: signal.id,
      };
    } catch (err: any) {
      return this.rejection(signal, mode, `Alpaca request failed: ${err.message}`);
    }
  }

  async getBalance(): Promise<AccountBalance> {
    try {
      const res = await fetch(`${PAPER_BASE}/v2/account`, {
        headers: this.authHeaders(),
      });

      const data = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        throw new Error(`Alpaca /v2/account failed (HTTP ${res.status}): ${JSON.stringify(data)}`);
      }

      const portfolioValue = Number(data.portfolio_value ?? 0);
      const cash = Number(data.cash ?? 0);

      return {
        total_value: portfolioValue,
        cash,
        positions_value: portfolioValue - cash,
        buying_power: Number(data.buying_power ?? 0),
        updated_at: new Date(),
      };
    } catch (err: any) {
      logger.error({ err }, "AlpacaAdapter.getBalance failed");
      throw err;
    }
  }

  async getOpenOrders(): Promise<BrokerOrder[]> {
    try {
      const res = await fetch(`${PAPER_BASE}/v2/orders?status=open`, {
        headers: this.authHeaders(),
      });

      const data = (await res.json()) as Record<string, unknown>[];

      if (!res.ok) {
        throw new Error(
          `Alpaca /v2/orders failed (HTTP ${res.status}): ${JSON.stringify(data)}`,
        );
      }

      return data.map((o) => ({
        id: o.id as string,
        symbol: o.symbol as string,
        side: (o.side as string)?.toUpperCase() === "SELL" ? ("SELL" as const) : ("BUY" as const),
        qty: Number(o.qty ?? 0),
        price: Number(o.limit_price ?? o.filled_avg_price ?? 0),
        status: mapAlpacaStatus(o.status as string),
        created_at: new Date((o.created_at as string) ?? Date.now()),
      }));
    } catch (err: any) {
      logger.error({ err }, "AlpacaAdapter.getOpenOrders failed");
      throw err;
    }
  }

  async getOrderStatus(orderId: string): Promise<OrderStatus> {
    try {
      const res = await fetch(`${PAPER_BASE}/v2/orders/${orderId}`, {
        headers: this.authHeaders(),
      });

      const data = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        throw new Error(
          `Alpaca /v2/orders/${orderId} failed (HTTP ${res.status}): ${JSON.stringify(data)}`,
        );
      }

      return {
        id: orderId,
        status: mapAlpacaStatus(data.status as string),
        filled_price: data.filled_avg_price != null ? Number(data.filled_avg_price) : undefined,
        filled_qty: data.filled_qty != null ? Number(data.filled_qty) : undefined,
      };
    } catch (err: any) {
      logger.error({ err, orderId }, "AlpacaAdapter.getOrderStatus failed");
      throw err;
    }
  }

  async closeOrder(orderId: string): Promise<void> {
    try {
      const res = await fetch(`${PAPER_BASE}/v2/orders/${orderId}`, {
        method: "DELETE",
        headers: this.authHeaders(),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          `Alpaca DELETE /v2/orders/${orderId} failed (HTTP ${res.status}): ${JSON.stringify(data)}`,
        );
      }
    } catch (err: any) {
      logger.error({ err, orderId }, "AlpacaAdapter.closeOrder failed");
      throw err;
    }
  }
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapAlpacaStatus(
  status: string | undefined,
): "PENDING" | "FILLED" | "CANCELLED" | "REJECTED" {
  switch (status) {
    case "new":
    case "accepted":
    case "pending_new":
    case "accepted_for_bidding":
    case "pending_cancel":
    case "pending_replace":
    case "stopped":
    case "suspended":
    case "calculated":
      return "PENDING";
    case "filled":
      return "FILLED";
    case "partially_filled":
      return "FILLED"; // closest match — order is executing
    case "canceled":
    case "expired":
    case "done_for_day":
      return "CANCELLED";
    case "rejected":
    case "order_failed":
      return "REJECTED";
    default:
      logger.warn(
        { alpacaStatus: status },
        "AlpacaAdapter: unrecognized order status, defaulting to PENDING",
      );
      return "PENDING";
  }
}
