// LLM Layer Regression Tests — llm_client, llm_prompts, memory_lessons,
// setup_auditor, and ict_decision_validator --edge mode.
//
// All LLM calls use injected fake clients (no network, no API keys).
// Run: npm test   (node --test tests/*.test.cjs)

process.env.WORKSPACE_ROOT = require("path").join(__dirname, "..");

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = process.env.WORKSPACE_ROOT;
const llm = require(path.join(ROOT, "tools", "llm", "llm_client.cjs"));
const prompts = require(path.join(ROOT, "tools", "llm", "llm_prompts.cjs"));
const mem = require(path.join(ROOT, "tools", "llm", "memory_lessons.cjs"));
const auditor = require(path.join(ROOT, "tools", "llm", "setup_auditor.cjs"));
const validator = require(path.join(ROOT, "tools", "ict_decision_validator.cjs"));

// ── llm_client helpers ────────────────────────────────────────────────────────

test("parseToolCalls extracts id/name/arguments and tolerates bad JSON", () => {
  const calls = llm.parseToolCalls({
    tool_calls: [
      { id: "c1", function: { name: "read_file", arguments: '{"path":"a.md"}' } },
      { id: "c2", function: { name: "bad", arguments: "{unclosed" } },
    ],
  });
  assert.strictEqual(calls.length, 2);
  assert.deepStrictEqual(calls[0].arguments, { path: "a.md" });
  assert.strictEqual(calls[1].arguments._raw, "{unclosed");
  assert.strictEqual(llm.parseToolCalls({ content: "no calls" }), null);
});

test("safeJsonParse handles raw JSON, embedded JSON, and garbage", () => {
  assert.deepStrictEqual(llm.safeJsonParse('{"a":1}'), { a: 1 });
  assert.deepStrictEqual(llm.safeJsonParse('prefix {"a":1} suffix'), { a: 1 });
  assert.strictEqual(llm.safeJsonParse("no json here", "fallback"), "fallback");
  assert.strictEqual(llm.safeJsonParse(null, "fallback"), "fallback");
});

test("tallyVotes sorts by count descending", () => {
  const t = llm.tallyVotes(["up", "down", "up"]);
  assert.deepStrictEqual(t, [{ value: "up", count: 2 }, { value: "down", count: 1 }]);
});

test("sleep resolves after ~10ms", async () => {
  const start = Date.now();
  await llm.sleep(10);
  assert.ok(Date.now() - start >= 5);
});

// ── agentLoop (ReAct) ─────────────────────────────────────────────────────────

test("agentLoop completes when the model stops calling tools", async () => {
  const fakeClient = async (msgs) => {
    const toolMessages = msgs.filter((m) => m.role === "tool").length;
    return toolMessages < 1
      ? { text: "checking", toolCalls: [{ id: "t1", name: "lookup", arguments: { key: "x" } }] }
      : { text: "answer", toolCalls: [] };
  };
  const events = [];
  const r = await llm.agentLoop({
    messages: [{ role: "user", content: "go" }],
    tools: [{ type: "function", function: { name: "lookup", parameters: {} } }],
    toolDispatch: { lookup: async (args) => (events.push(args.key), { ok: true }) },
    client: fakeClient,
  });
  assert.strictEqual(r.status, "complete");
  assert.strictEqual(r.text, "answer");
  assert.deepStrictEqual(events, ["x"]);
});

test("agentLoop short-circuits on [LLM error strings", async () => {
  const r = await llm.agentLoop({
    messages: [{ role: "user", content: "x" }],
    client: async () => ({ text: "[LLM not configured: no API key]", toolCalls: null }),
  });
  assert.strictEqual(r.status, "llm_unavailable");
});

test("agentLoop caps at maxIterations", async () => {
  const r = await llm.agentLoop({
    messages: [{ role: "user", content: "x" }],
    maxIterations: 2,
    client: async () => ({ text: "again", toolCalls: [{ id: "a", name: "noop", arguments: {} }] }),
    toolDispatch: { noop: async () => "done" },
  });
  assert.strictEqual(r.status, "max_iterations");
});

test("agentLoop handles unknown tool names gracefully", async () => {
  const r = await llm.agentLoop({
    messages: [{ role: "user", content: "x" }],
    maxIterations: 1,
    client: async () => ({ text: "?", toolCalls: [{ id: "a", name: "missing", arguments: {} }] }),
    toolDispatch: {},
  });
  assert.strictEqual(r.status, "max_iterations");
});

test("selfConsistent returns majority among extracted verdicts", async () => {
  const texts = ["RULING: VALID", "RULING: VALID", "RULING: INVALID"];
  const fakeClient = async () => ({ text: texts.shift(), toolCalls: [] });
  const r = await llm.selfConsistent({
    messages: [{ role: "user", content: "x" }],
    llmOpts: {},
    runs: 3,
    extract: (t) => (t.match(/RULING: (\w+)/) || [])[1] || null,
    client: fakeClient,
  });
  assert.strictEqual(r.majority.value, "VALID");
  assert.strictEqual(r.majority.count, 2);
});

// ── llm_prompts ───────────────────────────────────────────────────────────────

test("all 6 templates embed the COT reasoning chain", () => {
  const cases = [
    prompts.ragSynthesis("q", []),
    prompts.journalAnalysis([], [], "EURUSD"),
    prompts.councilNarrative({}, ""),
    prompts.newsAnalysis("FOMC", {}, "XAUUSD"),
    prompts.decisionEdgeCase({}, [], []),
    prompts.morningBriefing({}, {}),
  ];
  assert.strictEqual(cases.length, 6);
  for (const c of cases) {
    const system = c.messages.find((m) => m.role === "system").content;
    assert.ok(system.includes("COUNTER-EVIDENCE"), `missing COT in system prompt`);
  }
});

test("journalAnalysis injects Active Memory when memoryLessons provided", () => {
  const p = prompts.journalAnalysis([], [], "EURUSD", [{ title: "T", detail: "D", tradeDate: "2026-08-01" }]);
  const user = p.messages.find((m) => m.role === "user").content;
  assert.ok(user.includes("Active Memory"));
  assert.ok(user.includes("2026-08-01"));
});

test("decisionEdgeCase reconciles against memory context", () => {
  const p = prompts.decisionEdgeCase({}, [], [], [{ title: "P", detail: "Q" }]);
  const user = p.messages.find((m) => m.role === "user").content;
  assert.ok(user.includes("[P] Q"));
});

// ── memory_lessons ────────────────────────────────────────────────────────────

test("loadActiveLessons returns pair-scoped lessons from the trade graph", () => {
  const r = mem.loadActiveLessons({ pair: "GBPUSD", limit: 5 });
  assert.strictEqual(r.pair, "GBPUSD");
  assert.ok(r.graphVersion, "graph should be loaded");
  assert.ok(Array.isArray(r.lessons));
  for (const l of r.lessons) {
    assert.ok(l.title && l.detail, "lesson entries carry title+detail");
  }
});

test("loadActiveLessons is safe for unknown pairs and missing args", () => {
  const r = mem.loadActiveLessons({ pair: "ZZZZZZ", limit: 3 });
  assert.deepStrictEqual(r.lessons, []);
  assert.ok(Array.isArray(r.gaps));
  const noPair = mem.loadActiveLessons({});
  assert.strictEqual(noPair.error, "no pair provided");
});

// ── setup_auditor tools ───────────────────────────────────────────────────────

test("auditor read_file sandbox blocks traversal, bad bases, and missing files", async () => {
  const dispatch = auditor.buildDispatch({ root: ROOT });
  const ok = await dispatch.read_file({ path: "stages/01_htf_bias/output/eurusd_bias.md" });
  assert.ok(ok.startsWith("# HTF Bias"));
  assert.ok((await dispatch.read_file({ path: "../../etc/passwd" })).startsWith("[error"));
  assert.ok((await dispatch.read_file({ path: "node_modules/x" })).startsWith("[error"));
  assert.ok((await dispatch.read_file({ path: "stages/zz/output/nope.md" })).startsWith("[error"));
});

test("auditor query_ict_knowledge returns ranked concept hits", async () => {
  const dispatch = auditor.buildDispatch({ root: ROOT });
  const hits = await dispatch.query_ict_knowledge({ query: "killzone silver bullet" });
  assert.ok(hits.startsWith("- ["), "expected bulleted hits");
  assert.ok(hits.length > 40);
});

test("auditor buildContext includes decision + stage files + graph memory", () => {
  const ctx = auditor.buildContext({ pair: "EURUSD", date: "2026-08-11", root: ROOT });
  assert.ok(ctx.context.includes("## Emitted Decision"));
  assert.ok(ctx.context.length > 3000);
  assert.ok(ctx.stageFiles.length >= 1);
});

test("auditor runAudit parses verdict and writes json+md (fake client)", async () => {
  let calls = 0;
  const fakeClient = async () => {
    calls++;
    if (calls === 1) {
      return { text: "checking", toolCalls: [{ id: "c1", name: "query_trade_graph", arguments: { pair: "EURUSD" } }] };
    }
    return {
      text: JSON.stringify({
        verdict: "CHALLENGED",
        confidence: 71,
        evidence: ["bias file conflicts"],
        counterEvidence: ["council votes differently"],
        recommendations: ["verify inversion"],
        reasoning: "HYPOTHESIS x EVIDENCE y COUNTER-EVIDENCE z VERDICT CHALLENGED",
      }),
      toolCalls: [],
    };
  };
  const r = await auditor.runAudit({ pair: "EURUSD", date: "2026-08-11", client: fakeClient, maxIterations: 3 });
  assert.strictEqual(r.verdict, "CHALLENGED");
  assert.strictEqual(r.confidence, 71);
  assert.ok(fs.existsSync(r.file));
  assert.ok(fs.existsSync(path.join(r.sharedDir, "setup_audit.md")));
  const json = JSON.parse(fs.readFileSync(r.file, "utf8"));
  assert.strictEqual(json.verdict, "CHALLENGED");
  fs.rmSync(r.file, { force: true });
  fs.rmSync(path.join(r.sharedDir, "setup_audit.md"), { force: true });
});

test("auditor runAudit degrades to llm_unavailable without blocking", async () => {
  const deadClient = async () => ({ text: "[LLM not configured: no API key]", toolCalls: null });
  const r = await auditor.runAudit({ pair: "EURUSD", date: "2026-08-11", client: deadClient });
  assert.strictEqual(r.status, "llm_unavailable");
  assert.strictEqual(r.verdict, null);
  assert.ok(fs.existsSync(r.file));
  fs.rmSync(r.file, { force: true });
  fs.rmSync(path.join(r.sharedDir, "setup_audit.md"), { force: true });
});

// ── ict_decision_validator --edge ─────────────────────────────────────────────

test("extractRuling parses the directive format", () => {
  assert.strictEqual(validator.extractRuling("RULING: INVALID\nreasoning"), "INVALID");
  assert.strictEqual(validator.extractRuling("**RULING:** BORDERLINE-VALID"), "BORDERLINE-VALID");
  assert.strictEqual(validator.extractRuling("no label here"), null);
});

test("validateTrade now exposes findings (used by --edge)", () => {
  const res = validator.validateTrade({ pair: "EURUSD", riskPct: 1, rr: 1.5 }, ["risk"]);
  assert.ok(Array.isArray(res.findings));
  assert.ok(res.findings.length >= 1);
});

test("runEdgeCase votes majority across fake runs", async () => {
  const texts = [
    "RULING: BORDERLINE-VALID — pass",
    "RULING: VALID — fine",
    "RULING: BORDERLINE-VALID — agree",
  ];
  const fakeClient = async () => ({ text: texts.shift(), toolCalls: [] });
  const r = await validator.runEdgeCase("EURUSD", { client: fakeClient, runs: 3 });
  assert.strictEqual(r.ruling, "BORDERLINE-VALID");
  assert.strictEqual(r.votes.find((v) => v.value === "BORDERLINE-VALID").count, 2);
  assert.strictEqual(r.detail.length, 3);
});