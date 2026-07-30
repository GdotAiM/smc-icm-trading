// CDP Client helper — resolves chrome-remote-interface regardless of CWD
const path = require("path");

let CDP;
try {
  CDP = require(path.join(__dirname, "node_modules", "chrome-remote-interface"));
} catch {
  try {
    CDP = require("chrome-remote-interface");
  } catch {
    console.error("FATAL: Cannot find chrome-remote-interface. Run: cd tools/tv-mcp && npm install");
    process.exit(1);
  }
}

module.exports = CDP;
