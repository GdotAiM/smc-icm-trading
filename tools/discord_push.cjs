// Push alert to Discord via file — no new client, no token conflict
// Appends to shared/YYYY-MM-DD/discord_alerts.jsonl
// The Discord bot watches this file and sends new entries to #general
const fs = require("fs");
const path = require("path");

const ROOT = "C:/Users/cash/smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
const ALERT_FILE = path.join(ROOT, "shared", DATE, "discord_alerts.jsonl");

const message = process.argv.slice(2).join(" ") || "No message";

try {
  fs.mkdirSync(path.dirname(ALERT_FILE), { recursive: true });
  fs.appendFileSync(ALERT_FILE, JSON.stringify({ time: new Date().toISOString(), message }) + "\n");
  console.log("Alert queued: " + message.substring(0, 80));
} catch(e) {
  console.log("Alert failed: " + e.message);
}
