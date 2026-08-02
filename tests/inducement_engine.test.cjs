const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

test("inducement_engine module should load cleanly without path errors", () => {
  const enginePath = path.resolve(__dirname, "../tools/inducement_engine.cjs");
  assert.doesNotThrow(() => {
    require(enginePath);
  });
});
