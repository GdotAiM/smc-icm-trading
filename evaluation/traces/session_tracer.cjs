// Session Tracer — Unified input→output trace for every session run
// Usage: node evaluation/traces/session_tracer.cjs start [PAIR]
//        node evaluation/traces/session_tracer.cjs step [PAIR] [STAGE] [status]
//        node evaluation/traces/session_tracer.cjs finish [PAIR]
// Writes: shared/YYYY-MM-DD/traces/PAIR_trace.jsonl

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const DATE = require("../../tools/ny_time.cjs").getNYDate();
const TRACE_DIR = path.join(ROOT, "shared", DATE, "traces");

if (!fs.existsSync(TRACE_DIR)) fs.mkdirSync(TRACE_DIR, { recursive: true });

const cmd = process.argv[2]; // start | step | finish | read
const PAIR = process.argv[3] || "UNKNOWN";
const STAGE = process.argv[4] || "";
const STATUS = process.argv[5] || "ok";

const TRACE_FILE = path.join(TRACE_DIR, `${PAIR}_trace.jsonl`);

function traceEntry(event, data = {}) {
  return {
    timestamp: new Date().toISOString(),
    pair: PAIR,
    event,
    ...data,
  };
}

// ═══ START — begin a new trace session ═══
function start() {
  const entry = traceEntry("SESSION_START", {
    date: DATE,
    nyTime: getNYTime(),
    nodeVersion: process.version,
  });
  fs.appendFileSync(TRACE_FILE, JSON.stringify(entry) + "\n");
  console.log(`Trace started: ${TRACE_FILE}`);
}

// ═══ STEP — record a pipeline stage completion ═══
function step() {
  const entry = traceEntry("STAGE_COMPLETE", {
    stage: STAGE,
    status: STATUS, // ok | failed | skipped | stale
    outputFiles: listStageOutputs(PAIR, STAGE),
  });
  fs.appendFileSync(TRACE_FILE, JSON.stringify(entry) + "\n");
}

// ═══ FINISH — close the trace with summary ═══
function finish() {
  // Read all entries for this trace
  const lines = fs.readFileSync(TRACE_FILE, "utf8").trim().split("\n").filter(Boolean);
  const entries = lines.map(l => JSON.parse(l));

  const stages = entries.filter(e => e.event === "STAGE_COMPLETE");
  const failed = stages.filter(s => s.status === "failed").length;
  const skipped = stages.filter(s => s.status === "skipped").length;
  const ok = stages.filter(s => s.status === "ok").length;
  const startTime = entries[0]?.timestamp;
  const endTime = new Date().toISOString();
  const durationSec = startTime
    ? Math.round((new Date(endTime) - new Date(startTime)) / 1000)
    : 0;

  const summary = traceEntry("SESSION_FINISH", {
    totalStages: stages.length,
    ok,
    failed,
    skipped,
    durationSec,
    status: failed > 0 ? "DEGRADED" : skipped >= stages.length * 0.5 ? "PARTIAL" : "COMPLETE",
    stageList: stages.map(s => `${s.stage}:${s.status}`),
  });
  fs.appendFileSync(TRACE_FILE, JSON.stringify(summary) + "\n");

  console.log(JSON.stringify({
    trace: TRACE_FILE,
    summary: {
      stages: stages.length,
      ok, failed, skipped,
      duration: `${durationSec}s`,
      status: summary.status,
    },
  }, null, 2));
}

// ═══ READ — read an existing trace ═══
function read() {
  if (!fs.existsSync(TRACE_FILE)) {
    console.log(JSON.stringify({ error: "No trace found", pair: PAIR, date: DATE }));
    return;
  }
  const lines = fs.readFileSync(TRACE_FILE, "utf8").trim().split("\n").filter(Boolean);
  const entries = lines.map(l => JSON.parse(l));

  console.log(JSON.stringify({
    trace: TRACE_FILE,
    entries: entries.length,
    timeline: entries.map(e => ({
      time: e.timestamp,
      event: e.event,
      stage: e.stage,
      status: e.status,
    })),
    summary: entries.find(e => e.event === "SESSION_FINISH") || null,
  }, null, 2));
}

// ═══ HELPERS ═══
function getNYTime() {
  try {
    const ny = require(path.join(ROOT, "tools", "ny_time.cjs"));
    return {
      hour: ny.getNYHour(),
      day: ny.getNYDay(),
      dayName: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][ny.getNYDay()],
    };
  } catch {
    return { hour: new Date().getHours(), day: 5, dayName: "Unknown" };
  }
}

function listStageOutputs(pair, stage) {
  const stageDir = path.join(ROOT, "stages", stage, "output");
  if (!fs.existsSync(stageDir)) return [];
  const pairLabel = pair.toLowerCase();
  return fs.readdirSync(stageDir)
    .filter(f => f.includes(pairLabel) || f.includes("day_context") || f.includes("cycle_phase") || f.includes("model_filter"))
    .map(f => ({ file: f, size: fs.statSync(path.join(stageDir, f)).size }));
}

// ═══ DISPATCH ═══
switch (cmd) {
  case "start": start(); break;
  case "step": step(); break;
  case "finish": finish(); break;
  case "read": read(); break;
  default:
    console.log(JSON.stringify({
      usage: "node evaluation/traces/session_tracer.cjs [start|step|finish|read] [PAIR] [STAGE] [status]",
      examples: [
        "node evaluation/traces/session_tracer.cjs start XAUUSD",
        "node evaluation/traces/session_tracer.cjs step XAUUSD 01_htf_bias ok",
        "node evaluation/traces/session_tracer.cjs finish XAUUSD",
        "node evaluation/traces/session_tracer.cjs read XAUUSD",
      ],
    }));
}
