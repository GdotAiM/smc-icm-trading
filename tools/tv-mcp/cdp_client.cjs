// CDP Client helper — resolves chrome-remote-interface regardless of CWD
// Replace: const CDP = require("./cdp_client.cjs");
// With:    const CDP = require("./cdp_client.cjs");
const path = require("path");

let CDP;
try {
  // Try relative to this file (tv-mcp directory)
  CDP = require(path.join(__dirname, "node_modules", "chrome-remote-interface"));
} catch {
  try {
    // Try NODE_PATH or global
    CDP = require("chrome-remote-interface");
  } catch {
    console.error("FATAL: Cannot find chrome-remote-interface. Run: cd tools/tv-mcp && npm install");
    process.exit(1);
  }
}

module.exports = CDP;
