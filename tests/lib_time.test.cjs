const test = require("node:test");
const assert = require("node:assert");
const time = require("../tools/lib/time.cjs");

// Fixed timestamps in UTC. Offsets: Jan = EST(-5), Jul = EDT(-4).
const ts = (utcHour) => Date.UTC(2026, 6, 15, utcHour, 0, 0); // July → EDT

test("WP-2: London PM (05-08 NY) is NOT a killzone", () => {
  // 10:00 UTC = 06:00 EDT
  assert.strictEqual(time.isKillzoneFor(ts(10)), false);
  const s = time.resolveSessionFor(ts(10));
  assert.strictEqual(s.name, "londonPM");
  assert.strictEqual(s.killzone, false);
});

test("killzones: London (02-05), NY AM (08-11), NY PM (13-16) are killzones", () => {
  assert.strictEqual(time.isKillzoneFor(ts(8)), true);  // 04:00 EDT london
  assert.strictEqual(time.isKillzoneFor(ts(13)), true); // 09:00 EDT nyAM
  assert.strictEqual(time.isKillzoneFor(ts(18)), true); // 14:00 EDT nyPM
});

test("non-killzones: Asia, lunch, close, off-hours are not killzones", () => {
  assert.strictEqual(time.isKillzoneFor(ts(22)), false); // Asia 18:00 EDT
  assert.strictEqual(time.isKillzoneFor(ts(16)), false); // nyLunch 12:00 EDT
  assert.strictEqual(time.isKillzoneFor(ts(21)), false); // nyClose 17:00 EDT
  assert.strictEqual(time.isKillzoneFor(ts(2)), false);  // offHours 22:00 EDT
});

test("DST: January offset is EST (-5), July offset is EDT (-4)", () => {
  const jan = Date.UTC(2026, 0, 15, 12, 0, 0);
  assert.strictEqual(time.getNYOffset(jan), -5);
  assert.strictEqual(time.getNYOffset(ts(12)), -4);
});

test("hour-based killzone helper agrees with timestamp helper", () => {
  for (let h = 0; h < 24; h++) {
    assert.strictEqual(time.isKillzoneHour(h), time.isKillzoneFor(Date.UTC(2026, 6, 15, h + 4, 0, 0)), `mismatch at NY hour ${h}`);
  }
});

test("Silver Bullet windows: 03-04, 10-11, 14-15 NY", () => {
  assert.strictEqual(time.isInSilverBulletFor(ts(7)).active, true);  // 03:00 EDT
  assert.strictEqual(time.isInSilverBulletFor(ts(14)).active, true); // 10:00 EDT
  assert.strictEqual(time.isInSilverBulletFor(ts(18)).active, true); // 14:00 EDT
  assert.strictEqual(time.isInSilverBulletFor(ts(13)).active, false); // 09:00 EDT
});

test("Judas Swing windows: London open 02-03, NY open 08-09 NY", () => {
  assert.strictEqual(time.isInJudasSwingFor(ts(6)).active, true);  // 02:00 EDT london open
  assert.strictEqual(time.isInJudasSwingFor(ts(12)).active, true); // 08:00 EDT ny open
  assert.strictEqual(time.isInJudasSwingFor(ts(18)).active, false);
});
