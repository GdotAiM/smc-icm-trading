const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

test("weekly_profile_engine module should load cleanly without path errors", () => {
  const enginePath = path.resolve(__dirname, "../tools/weekly_profile_engine.cjs");
  assert.doesNotThrow(() => {
    require(enginePath);
  });
});
