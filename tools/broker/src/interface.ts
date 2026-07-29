import * as fs from "node:fs";
import * as path from "node:path";

// UnifiedTradeSignal — inlined from non-existent ../services/SignalGenerator.js
interface UnifiedTradeSignal {
  id: string;
  symbol: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  suggested_qty?: number;
  confidence_score?: number;
  setup_type?: string;
  asset_class?: string;
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Derive trade side (BUY/SELL) from a signal's price structure.
 *
 * UnifiedTradeSignal has no explicit `side` field — direction is encoded in
 * the relationship between take_profit and entry_price:
 *   - take_profit > entry_price  → BUY  (long — profit above entry)
 *   - take_profit < entry_price  → SELL (short — profit below entry)
 *
 * This replaces the old MockBrokerAdapter heuristic `entry_price > 0` which
 * was always true (prices are never negative) and always returned BUY.
 */
export function deriveSide(signal: UnifiedTradeSignal): "BUY" | "SELL" {
  return signal.take_profit > signal.entry_price ? "BUY" : "SELL";
}

// ─── Interfaces ───

export interface BrokerAdapter {
  name: string;
  isReady: boolean;
  executeOrder(
    signal: UnifiedTradeSignal,
    mode: "REVIEW" | "LIVE"
  ): Promise<ExecutionResult>;
  getBalance(): Promise<AccountBalance>;
  getOpenOrders(): Promise<BrokerOrder[]>;
  closeOrder(orderId: string): Promise<void>;
  getOrderStatus(orderId: string): Promise<OrderStatus>;
}

export interface ExecutionResult {
  success: boolean;
  order_id?: string;
  executed_at?: Date;
  actual_entry_price?: number;
  error?: string;
  mode: "REVIEW" | "LIVE";
  broker_name: string;
  trade_signal_id: string;
}

export interface AccountBalance {
  total_value: number;
  cash: number;
  positions_value: number;
  buying_power: number;
  updated_at?: Date;
}

export interface BrokerOrder {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  status: "PENDING" | "FILLED" | "CANCELLED" | "REJECTED";
  created_at: Date;
}

export interface OrderStatus {
  id: string;
  status: "PENDING" | "FILLED" | "CANCELLED" | "REJECTED";
  filled_price?: number;
  filled_qty?: number;
}

// ─── Mock Broker Adapter (file-based) ───

const DATA_DIR = path.resolve(
  process.cwd(),
  "data/mock_broker"
);

export class MockBrokerAdapter implements BrokerAdapter {
  name = "MOCK_BROKER";
  isReady = true;

  private pendingOrdersPath: string;
  private executedOrdersPath: string;
  private balanceFile: string;

  constructor(customDataDir?: string) {
    const dir = customDataDir ?? DATA_DIR;
    this.pendingOrdersPath = path.join(dir, "pending_orders.jsonl");
    this.executedOrdersPath = path.join(dir, "executed_orders.jsonl");
    this.balanceFile = path.join(dir, "account_balance.json");
    this.initializeFiles();
  }

  private initializeFiles(): void {
    if (!fs.existsSync(path.dirname(this.pendingOrdersPath))) {
      fs.mkdirSync(path.dirname(this.pendingOrdersPath), { recursive: true });
    }

    if (!fs.existsSync(this.balanceFile)) {
      const defaultBalance: AccountBalance = {
        total_value: 100000,
        cash: 100000,
        positions_value: 0,
        buying_power: 100000,
        updated_at: new Date(),
      };
      fs.writeFileSync(this.balanceFile, JSON.stringify(defaultBalance, null, 2));
    }

    // Create empty order files if they don't exist
    if (!fs.existsSync(this.pendingOrdersPath)) {
      fs.writeFileSync(this.pendingOrdersPath, "");
    }
    if (!fs.existsSync(this.executedOrdersPath)) {
      fs.writeFileSync(this.executedOrdersPath, "");
    }
  }

  async executeOrder(
    signal: UnifiedTradeSignal,
    mode: "REVIEW" | "LIVE"
  ): Promise<ExecutionResult> {
    const orderId = `MOCK_${signal.id.substring(0, 8)}_${Date.now()}`;

    const side = deriveSide(signal);

    const mockOrder = {
      trade_signal_id: signal.id,
      order_id: orderId,
      symbol: signal.symbol,
      side,
      qty: signal.suggested_qty ?? 100,
      entry_price: signal.entry_price,
      stop_loss: signal.stop_loss,
      take_profit: signal.take_profit,
      mode,
      confidence_score: signal.confidence_score,
      setup_type: signal.setup_type,
      created_at: new Date().toISOString(),
      status: "PENDING" as const,
    };

    const targetFile =
      mode === "REVIEW" ? this.pendingOrdersPath : this.executedOrdersPath;

    fs.appendFileSync(targetFile, JSON.stringify(mockOrder) + "\n");

    return {
      success: true,
      order_id: orderId,
      executed_at: new Date(),
      actual_entry_price: signal.entry_price,
      mode,
      broker_name: this.name,
      trade_signal_id: signal.id,
    };
  }

  async getBalance(): Promise<AccountBalance> {
    const data = JSON.parse(fs.readFileSync(this.balanceFile, "utf8"));
    return data as AccountBalance;
  }

  async getOpenOrders(): Promise<BrokerOrder[]> {
    if (!fs.existsSync(this.pendingOrdersPath)) return [];

    const content = fs.readFileSync(this.pendingOrdersPath, "utf8");
    const lines = content.split("\n").filter(Boolean);

    return lines.map((line) => {
      const order = JSON.parse(line);
      return {
        id: order.order_id,
        symbol: order.symbol,
        side: order.side,
        qty: order.qty,
        price: order.entry_price,
        status: order.status as BrokerOrder["status"],
        created_at: new Date(order.created_at),
      };
    });
  }

  async getOrderStatus(orderId: string): Promise<OrderStatus> {
    const orders = await this.getOpenOrders();
    const order = orders.find((o) => o.id === orderId);

    if (!order) {
      return {
        id: orderId,
        status: "CANCELLED",
      };
    }

    return {
      id: orderId,
      status: order.status as OrderStatus["status"],
      filled_price: order.price,
      filled_qty: order.qty,
    };
  }

  async closeOrder(orderId: string): Promise<void> {
    if (!fs.existsSync(this.pendingOrdersPath)) return;

    const content = fs.readFileSync(this.pendingOrdersPath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    const updated = lines
      .map((line) => {
        const order = JSON.parse(line);
        if (order.order_id === orderId) {
          order.status = "CANCELLED";
        }
        return JSON.stringify(order);
      })
      .join("\n");

    fs.writeFileSync(this.pendingOrdersPath, updated + (updated ? "\n" : ""));
  }
}

// ─── Execution Manager ───

export class ExecutionManager {
  private broker: BrokerAdapter;
  private mode: "REVIEW" | "LIVE";

  constructor(
    broker: BrokerAdapter = new MockBrokerAdapter(),
    mode: "REVIEW" | "LIVE" = "REVIEW"
  ) {
    this.broker = broker;
    this.mode = mode;
  }

  async executeSignal(
    signal: UnifiedTradeSignal
  ): Promise<ExecutionResult> {
    if (!this.broker.isReady) {
      return {
        success: false,
        error: "Broker not ready — check connection",
        mode: this.mode,
        broker_name: this.broker.name,
        trade_signal_id: signal.id,
      };
    }

    return this.broker.executeOrder(signal, this.mode);
  }

  async getAccountStatus() {
    return {
      balance: await this.broker.getBalance(),
      open_orders: await this.broker.getOpenOrders(),
    };
  }

  setMode(mode: "REVIEW" | "LIVE"): void {
    this.mode = mode;
  }

  getMode(): "REVIEW" | "LIVE" {
    return this.mode;
  }

  getBroker(): BrokerAdapter {
    return this.broker;
  }
}
