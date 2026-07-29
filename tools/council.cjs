// Archetype Council — Collaborative Multi-Timeframe Intelligence
// Convenes all 4 archetypes, runs voting, builds scale-in plan, enables cross-queries.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
const PAIR = process.argv[2] || "GBPUSD";
const pairLabel = PAIR === "GOLD" ? "XAUUSD" : PAIR;

function r2(v) { return Number(v).toFixed(2); }

// ── Convene the Council ──────────────────────────────────────────────────
console.error(`\n${"=".repeat(70)}`);
console.error(`  ARCHETYPE COUNCIL — ${pairLabel} — ${DATE}`);
console.error(`${"=".repeat(70)}`);

const archetypes = ["position", "swing", "day", "scalp"];
const votes = {};

for (const arch of archetypes) {
  try {
    const output = execSync(`node "${ROOT}\\tools\\archetype_engine.cjs" ${PAIR} ${arch}`, {
      stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 15000
    });
    votes[arch] = JSON.parse(output);
    const icon = votes[arch].direction === "bullish" ? "🟢" : votes[arch].direction === "bearish" ? "🔴" : "⚪";
    console.error(`  ${icon} ${votes[arch].archetype.padEnd(16)} ${votes[arch].direction.toUpperCase().padEnd(8)} → ${votes[arch].bestModel} (${votes[arch].modelScore}) | ${votes[arch].notes}`);
  } catch(e) {
    votes[arch] = { archetype: arch, direction: "neutral", confidence: 0, error: e.message.slice(0, 60) };
    console.error(`  ⚠️ ${arch}: ERROR — ${e.message.slice(0, 50)}`);
  }
}

// ── Council Vote ─────────────────────────────────────────────────────────
const councilConfig = JSON.parse(fs.readFileSync(path.join(ROOT, "_config", "archetypes", "council.json"), "utf8"));
const weights = councilConfig.voting.weights;

const bullish = archetypes.filter(a => votes[a].direction === "bullish").length;
const bearish = archetypes.filter(a => votes[a].direction === "bearish").length;
const neutral = archetypes.filter(a => votes[a].direction === "neutral").length;

const weightedScore =
  (votes.position.direction === "bullish" ? weights.position : votes.position.direction === "bearish" ? -weights.position : 0) +
  (votes.swing.direction === "bullish" ? weights.swing : votes.swing.direction === "bearish" ? -weights.swing : 0) +
  (votes.day.direction === "bullish" ? weights.day : votes.day.direction === "bearish" ? -weights.day : 0) +
  (votes.scalp.direction === "bullish" ? weights.scalp : votes.scalp.direction === "bearish" ? -weights.scalp : 0);

const absWeighted = Math.abs(weightedScore);
const maxWeighted = weights.position + weights.swing + weights.day + weights.scalp;

const allAligned = bullish === 4 || bearish === 4;
const majorityBull = bullish >= 3;
const majorityBear = bearish >= 3;
const positionScalpAligned = votes.position.direction !== "neutral" &&
  votes.scalp.direction !== "neutral" &&
  votes.position.direction === votes.scalp.direction &&
  bullish + bearish <= 2;

let verdict, action, confidencePct;
if (allAligned) {
  const dir = votes.position.direction.toUpperCase();
  verdict = `STRONG ${dir} — ALL 4 ARCHETYPES AGREE`;
  action = "FULL SIZE — Maximum conviction. Trade standard size.";
  confidencePct = 100;
} else if (majorityBull || majorityBear) {
  const dir = majorityBull ? "BULLISH" : "BEARISH";
  verdict = `${dir} MAJORITY — ${Math.max(bullish, bearish)}/4 archetypes`;
  action = "ENTER with standard size. Dissenting archetype may be seeing a counter-trend pullback.";
  confidencePct = Math.round(absWeighted / maxWeighted * 100);
} else if (positionScalpAligned) {
  verdict = `POSITION-SCALP ALIGNED — ${votes.position.direction.toUpperCase()} (Position + Scalp agree, middle TFs disagree)`;
  action = "SCALE-IN OPPORTUNITY — Start with scalp size (0.25%), add Day/Swing as middle TFs confirm.";
  confidencePct = 50;
} else {
  verdict = "SPLIT — No consensus";
  action = "WAIT — The Council is divided. Let the market resolve the conflict before entering.";
  confidencePct = 0;
}

console.error(`\n  COUNCIL VERDICT: ${verdict}`);
console.error(`  CONFIDENCE: ${confidencePct}% | Weighted Score: ${absWeighted}/${maxWeighted}`);
console.error(`  ACTION: ${action}`);

// ── Scale-In Plan ────────────────────────────────────────────────────────
let scaleInPlan = null;
if (positionScalpAligned && councilConfig.scaleIn.enabled) {
  const dir = votes.position.direction;
  scaleInPlan = {
    direction: dir,
    thesis: votes.position.notes,
    steps: councilConfig.scaleIn.steps.map(step => ({
      ...step,
      status: "PENDING",
      description: step.name === "Scalp Entry" ? `Enter ${dir} on 1m trigger. SL at 1m swing.` :
                  step.name === "Day Add" ? `Add when 15m prints BOS ${dir}. SL at 15m swing.` :
                  step.name === "Swing Add" ? `Add when 4H closes ${dir}. SL at 4H swing.` :
                  `Add when Daily closes ${dir}. SL at Daily swing. Now a full position.`
    })),
    totalRisk: councilConfig.scaleIn.totalRisk,
  };
  console.error(`\n  SCALE-IN PLAN ACTIVE — ${dir.toUpperCase()} direction`);
  scaleInPlan.steps.forEach(s => console.error(`    ${s.name}: ${s.risk} — ${s.trigger}`));
}

// ── Cross-Archetype Intelligence ─────────────────────────────────────────
const queries = [];
if (councilConfig.crossQueries.enabled) {
  // Scalp asks Position
  if (votes.scalp.direction !== "neutral" && votes.position.direction !== "neutral") {
    queries.push({
      from: "Scalp", to: "Position",
      question: `Is this ${votes.scalp.direction} 1m move worth holding?`,
      answer: votes.scalp.direction === votes.position.direction ?
        `Yes — Position also sees ${votes.position.direction}. Scale it into a Day trade if 5m confirms.` :
        `No — Position is ${votes.position.direction}. Take the scalp and reset. Don't hold against the HTF.`
    });
  }
  // Day asks Swing
  if (votes.day.direction !== "neutral") {
    queries.push({
      from: "Day", to: "Swing",
      question: `Does 4H/1D support this 15m ${votes.day.direction} entry?`,
      answer: votes.day.direction === votes.swing.direction ?
        `Yes — Swing confirms. The ${votes.day.direction} move has HTF backing.` :
        `Caution — Swing sees ${votes.swing.direction}. This may be a counter-trend move. Tighten SL.`
    });
  }
  // Position asks Scalp
  if (votes.position.direction !== "neutral") {
    const hasTrigger = votes.scalp.direction === votes.position.direction;
    queries.push({
      from: "Position", to: "Scalp",
      question: `Is there a 1m trigger to start building ${votes.position.direction}?`,
      answer: hasTrigger ?
        `Yes — Scalp sees ${votes.scalp.direction}. 1m trigger may be available. Start building.` :
        `Not yet — Scalp is ${votes.scalp.direction}. Wait for 1m to align with Position's ${votes.position.direction} thesis.`
    });
  }
}

// ── Output ────────────────────────────────────────────────────────────────
const outDir = path.join(ROOT, "stages", "00_council_vote", "output");
fs.mkdirSync(outDir, { recursive: true });

// vote.md
const voteMd = `# Council Vote — ${pairLabel} — ${DATE}

## Verdict: **${verdict}**
**Confidence**: ${confidencePct}% | **Action**: ${action}

## Individual Votes

| Archetype | Anchor | Direction | Confidence | Top Model | Notes |
|-----------|--------|-----------|------------|-----------|-------|
${archetypes.map(a => {
  const v = votes[a];
  const icon = v.direction === "bullish" ? "🟢" : v.direction === "bearish" ? "🔴" : "⚪";
  return `| ${icon} ${v.archetype} | ${v.anchorTFs.join('/')} | **${v.direction.toUpperCase()}** | ${v.confidence} | ${v.bestModel} | ${v.notes} |`;
}).join("\n")}

## Council Breakdown
- **Bullish**: ${bullish}/4 — ${archetypes.filter(a => votes[a].direction === "bullish").map(a => votes[a].archetype).join(', ') || 'none'}
- **Bearish**: ${bearish}/4 — ${archetypes.filter(a => votes[a].direction === "bearish").map(a => votes[a].archetype).join(', ') || 'none'}
- **Neutral**: ${neutral}/4 — ${archetypes.filter(a => votes[a].direction === "neutral").map(a => votes[a].archetype).join(', ') || 'none'}
- **Weighted Score**: ${absWeighted}/${maxWeighted} (${confidencePct}%)

## Conflict Analysis
${allAligned ? '✅ NO CONFLICTS — All archetypes see the same direction. This is the highest-probability setup.' :
  majorityBull || majorityBear ? `⚠️ MINORITY DISSENT — ${neutral > 0 ? neutral + ' archetype(s) neutral' : 4 - Math.max(bullish, bearish) + ' archetype(s) disagree'}. The dissenter may be seeing a counter-trend move. Trade with standard size.` :
  positionScalpAligned ? '⚡ POSITION-SCALP DIVERGENCE — The outer timeframes agree but middle TFs don\'t. This is a scale-in opportunity. Start small and add as each TF confirms.' :
  '❌ SPLIT COUNCIL — No direction has majority support. Wait for the market to tip the balance.'}
`;
fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_vote.md`), voteMd, "utf8");

// scale_in_plan.md
if (scaleInPlan) {
  const planMd = `# Scale-In Plan — ${pairLabel} — ${DATE}

## Thesis (from Position)
${scaleInPlan.thesis}

## Direction: **${scaleInPlan.direction.toUpperCase()}**

## Scale-In Sequence

| Step | Archetype | Risk | Trigger | SL | Status |
|------|-----------|------|---------|-----|--------|
${scaleInPlan.steps.map(s => `| ${s.name} | ${s.archetype} | ${s.risk} | ${s.trigger} | ${s.sl} | ${s.status} |`).join("\n")}

## Total Risk: ${scaleInPlan.totalRisk}

## Instructions
1. Enter **Step 1** immediately on the next valid scalp trigger
2. If stopped out on Step 1, the Position thesis is still intact — wait for the next trigger
3. Add **Step 2** only when 15m prints BOS in the ${scaleInPlan.direction} direction
4. Add **Step 3** only when 4H closes confirming
5. Add **Step 4** only when Daily closes confirming — this is now a full position
6. Never add to a losing position — each step only activates on confirmation
`;
  fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_scale_in.md`), planMd, "utf8");
}

// intelligence_share.md
if (queries.length > 0) {
  const intelMd = `# Cross-Archetype Intelligence — ${pairLabel} — ${DATE}

${queries.map(q => `### ${q.from} → ${q.to}
**Q**: ${q.question}
**A**: ${q.answer}
`).join("\n")}
`;
  fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_intel.md`), intelMd, "utf8");
}

console.error(`\n  Output: stages/00_council_vote/output/`);
console.error(`    ${PAIR.toLowerCase()}_vote.md`);
if (scaleInPlan) console.error(`    ${PAIR.toLowerCase()}_scale_in.md`);
if (queries.length > 0) console.error(`    ${PAIR.toLowerCase()}_intel.md`);

// Final JSON output for consumption by other tools
console.log(JSON.stringify({
  pair: pairLabel,
  date: DATE,
  verdict,
  confidencePct,
  action,
  votes: archetypes.map(a => ({ archetype: votes[a].archetype, direction: votes[a].direction, confidence: votes[a].confidence, model: votes[a].bestModel })),
  weightedScore: absWeighted,
  maxWeighted,
  allAligned,
  positionScalpAligned,
  scaleInPlan: scaleInPlan ? { direction: scaleInPlan.direction, steps: scaleInPlan.steps.length, totalRisk: scaleInPlan.totalRisk } : null,
  queries: queries.length,
}, null, 2));
