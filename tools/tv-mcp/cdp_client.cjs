// CDP Client helper — resolves chrome-remote-interface regardless of CWD with retry resiliency
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

/**
 * Connect to CDP with exponential backoff retry
 */
CDP.connectWithRetry = async function (options = {}, maxRetries = 3, delayMs = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await CDP(options);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  throw new Error(`CDP Connection failed after ${maxRetries} attempts: ${lastError.message}`);
};

module.exports = CDP;

