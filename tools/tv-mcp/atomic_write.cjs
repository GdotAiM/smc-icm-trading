// Atomic file write — prevents corruption on crash
// Usage: const atomicWrite = require("./atomic_write.cjs"); atomicWrite(filePath, data);
const fs = require("fs");
const path = require("path");

function atomicWrite(filePath, data) {
  const tmpPath = filePath + ".tmp." + Date.now();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tmpPath, typeof data === "string" ? data : JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, filePath); // Atomic on same filesystem
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch {} // Clean up temp file
    throw e; // Let caller handle
  }
}

function atomicAppend(filePath, line) {
  // Appends are naturally atomic on POSIX for writes < PIPE_BUF.
  // On Windows, just append and hope — JSONL is resilient to partial lines.
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, line + "\n");
  } catch (e) {
    console.error("[atomic_write] Append failed:", e.message);
  }
}

module.exports = { atomicWrite, atomicAppend };
