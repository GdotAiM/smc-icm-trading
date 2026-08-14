const { test } = require("node:test");
const assert = require("node:assert");
const { DAY_PLAN, ACTIONS, planAt, nyNow } = require("../tools/llm/day_planner.cjs");

test("day plan covers all 24 hours without gaps", () => {
  for (let h = 0; h < 24; h += 0.5) {
    const p = planAt(Math.floor(h), (h % 1) * 60);
    assert.ok(p.phase, `phase missing at ${h}`);
    assert.ok(p.scanMin > 0, `scanMin missing at ${h}`);
    assert.ok(p.label, `label missing at ${h}`);
  }
});

test("phases at key times", () => {
  assert.equal(planAt(1, 0).phase, "PAUSE");
  assert.equal(planAt(3, 30).phase, "SCAN");
  assert.equal(planAt(6, 0).phase, "PREP");
  assert.equal(planAt(7, 30).phase, "SCAN"); // Lecture 2 — London Hunt + IFVG
  assert.equal(planAt(7, 50).phase, "LOCK"); // post-lecture2, 7-9AM range forming
  assert.equal(planAt(10, 0).phase, "SCAN");
  assert.equal(planAt(12, 0).phase, "EXTRACT");
  assert.equal(planAt(14, 0).phase, "SCAN");
  assert.equal(planAt(16, 30).phase, "CLOSE");
  assert.equal(planAt(21, 0).phase, "PAUSE");
});

test("scan intervals are tight in killzones, sparse in dead zones", () => {
  assert.equal(planAt(3, 0).scanMin, 5);
  assert.equal(planAt(10, 0).scanMin, 5);
  assert.equal(planAt(12, 0).scanMin, 10);
  assert.equal(planAt(16, 30).scanMin, 10);
  assert.equal(planAt(21, 0).scanMin, 15);
});

test("refresh_range is due only after 09:08, refresh_lunch after 13:08", () => {
  assert.deepEqual(planAt(9, 0).dueActions, []);
  assert.ok(planAt(9, 10).dueActions.includes("refresh_range"));
  assert.ok(planAt(13, 10).dueActions.includes("refresh_lunch"));
});

test("warmup fires at the London open", () => {
  assert.ok(!planAt(1, 59).dueActions.includes("warmup"));
  assert.ok(planAt(2, 1).dueActions.includes("warmup"));
});

test("lunch extract is scheduled only inside the lunch window", () => {
  assert.ok(planAt(11, 10).dueActions.includes("lunch_extract"));
  assert.ok(!planAt(10, 0).dueActions.includes("lunch_extract"));
  assert.ok(!planAt(14, 0).dueActions.includes("lunch_extract"));
});

test("EOD report + close check are scheduled at the NY close", () => {
  const p = planAt(16, 10);
  assert.ok(p.dueActions.includes("eod_report"));
  assert.ok(p.dueActions.includes("close_check"));
});

test("every scheduled action has a registry entry", () => {
  const scheduled = new Set(DAY_PLAN.flatMap((w) => (w.actions || []).map((a) => a.id)));
  for (const id of scheduled) {
    assert.ok(ACTIONS[id], `no ACTIONS registry entry for ${id}`);
    assert.ok(ACTIONS[id].label, `no label for ${id}`);
  }
});

test("nyNow returns a plausible hour", () => {
  const n = nyNow();
  assert.ok(Number.isInteger(n.hour) && n.hour >= 0 && n.hour <= 23);
  assert.ok(Number.isInteger(n.minute) && n.minute >= 0 && n.minute <= 59);
});