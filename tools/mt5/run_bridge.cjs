// MT5 Bridge supervisor + HTTP proxy — keeps tools/mt5/mt5_bridge.py alive
// and exposes it over HTTP on :5111 for the Node stack.
//
// The python bridge speaks newline-delimited JSON on stdio. This process owns
// that stdio, auto-restarts the bridge on exit, and exposes:
//
//   POST /            JSON-RPC { cmd, args }  -> { ok, result } | { ok, error }
//   GET  /health      { status, terminal, connected, tradeAllowed, uptime, bridgePid, started }
//   POST /shutdown    graceful stop of bridge + supervisor
//
// Usage:
//   node tools/mt5/run_bridge.cjs               (foreground supervisor)
//   node tools/mt5/run_bridge.cjs --port 5111   (custom port)
//   node tools/mt5/run_bridge.cjs --ping-only   (spawn bridge, ping, exit — health probe)
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");

const ROOT = process.env.WORKSPACE_ROOT || "C:\\Users\\cash\\smc-icm-trading";
const BRIDGE = path.join(ROOT, "tools", "mt5", "mt5_bridge.py");
const PY = process.env.PYTHON || "python";
const PORT = (() => {
  const i = process.argv.indexOf("--port");
  const raw = (i >= 0 && process.argv[i + 1]) || process.env.MT5_BRIDGE_PORT || "5111";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : 5111;
})();
const MAX_RESTARTS = Number(process.env.MAX_RESTARTS || 50); // 0 = infinite

const pingOnly = process.argv.includes("--ping-only");
const logTxt = () => `[${new Date().toISOString()}] `;

let started = 0;
let child = null;
let shuttingDown = false;
const UP_TIME = Date.now();

// ═══ Bridge child process (stdio JSON-RPC) ═══
let lineBuf = "";
const pending = []; // [{ resolve, timer }]

function forwardToBridge(msg, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.splice(pending.indexOf(entry), 1);
      reject(new Error("bridge timeout"));
    }, timeoutMs);
    const entry = { resolve, timer };
    pending.push(entry);
    child.stdin.write(JSON.stringify(msg) + "\n");
  });
}

function onStdout(d) {
  lineBuf += d.toString("utf8");
  let i;
  while ((i = lineBuf.indexOf("\n")) >= 0) {
    const line = lineBuf.slice(0, i);
    lineBuf = lineBuf.slice(i + 1);
    try {
      const msg = JSON.parse(line);
      const entry = pending.shift();
      if (entry) {
        clearTimeout(entry.timer);
        entry.resolve(msg);
      }
    } catch { /* bridge log on stdout — ignore */ }
  }
}

function start() {
  if (shuttingDown) return;
  if (started >= MAX_RESTARTS && MAX_RESTARTS > 0) {
    console.error(logTxt() + `MAX_RESTARTS (${MAX_RESTARTS}) reached — giving up`);
    process.exit(1);
  }
  started++;
  console.error(logTxt() + `starting bridge (attempt ${started})`);
  child = spawn(PY, [BRIDGE], { cwd: ROOT });
  child.on("error", (e) => console.error(logTxt() + "spawn error: " + e.message));
  child.stdout.on("data", onStdout);
  child.stderr.on("data", (d) => process.stderr.write(d));
  child.on("exit", (code, signal) => {
    child = null;
    // Fail anything still waiting so callers get an error instead of hanging.
    while (pending.length) {
      const entry = pending.shift();
      clearTimeout(entry.timer);
      entry.resolve({ ok: false, error: `bridge exited (code=${code})` });
    }
    if (shuttingDown) {
      console.error(logTxt() + "bridge stopped, supervisor exiting");
      process.exit(0);
    }
    console.error(logTxt() + `bridge exited code=${code} signal=${signal}`);
    setTimeout(start, 2000); // 2s backoff
  });
}

// ═══ HTTP server ═══
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

async function handleHttp(req, res) {
  const url = req.url || "/";

  if (req.method === "GET" && url === "/health") {
    send(res, 200, {
      status: child && child.exitCode === null ? "ok" : "restarting",
      terminal: child ? "running" : "starting",
      connected: null,
      tradeAllowed: null,
      uptime: Math.round((Date.now() - UP_TIME) / 1000),
      bridgePid: child ? child.pid : null,
      started,
    });
    return;
  }

  if (req.method === "POST" && url === "/shutdown") {
    send(res, 200, { status: "shutting_down" });
    shuttingDown = true;
    if (child) {
      child.stdin.write(JSON.stringify({ cmd: "shutdown" }) + "\n");
      setTimeout(() => { child.kill(); }, 2000);
    } else {
      process.exit(0);
    }
    return;
  }

  if (req.method === "POST" && url === "/") {
    const raw = await readBody(req);
    if (!child) {
      send(res, 503, { ok: false, error: "bridge starting" });
      return;
    }
    try {
      const msg = JSON.parse(raw || "{}");
      const reply = await forwardToBridge(msg);
      send(res, reply.ok === false ? 200 : 200, reply);
    } catch (e) {
      send(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  send(res, 404, { ok: false, error: "not found" });
}

// ═══ ping-only probe ═══
async function pingOnce() {
  const p = spawn(PY, [BRIDGE], { cwd: ROOT });
  let buf = "";
  const resp = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ping timeout")), 15000);
    p.stdout.on("data", (d) => {
      buf += d.toString("utf8");
      const i = buf.indexOf("\n");
      if (i >= 0) {
        clearTimeout(t);
        resolve(JSON.parse(buf.slice(0, i)));
      }
    });
    p.stderr.on("data", () => {});
    p.on("error", (e) => { clearTimeout(t); reject(e); });
  });
  p.stdin.write(JSON.stringify({ cmd: "ping" }) + "\n");
  try {
    const r = await resp;
    console.log(JSON.stringify({ ok: r.ok, result: r.result }));
    p.kill();
    process.exit(r.ok && r.result?.pong ? 0 : 1);
  } catch (e) {
    console.error(logTxt() + e.message);
    p.kill();
    process.exit(1);
  }
}

if (pingOnly) {
  pingOnce();
} else {
  start();
  const server = http.createServer(handleHttp);
  server.listen(PORT, () => {
    console.error(logTxt() + `HTTP proxy on :${PORT} — forwarding to mt5_bridge.py`);
  });
  process.on("SIGINT", () => { shuttingDown = true; child && child.kill(); server.close(); process.exit(0); });
  process.on("SIGTERM", () => { shuttingDown = true; child && child.kill(); server.close(); process.exit(0); });
}