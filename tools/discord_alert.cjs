// Send alert to Discord channel
// Usage: node tools/discord_alert.cjs "Your message here"
const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";

// Load .env
try {
  const envPath = path.join(ROOT, ".env");
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf8").split("\n")
      .filter(l => l.trim() && !l.startsWith("#"))
      .forEach(l => { const eq = l.indexOf("="); if (eq > 0) { const k = l.slice(0, eq).trim(); const v = l.slice(eq + 1).trim(); if (!process.env[k]) process.env[k] = v; } });
  }
} catch {}

const TOKEN = process.env.DISCORD_TOKEN || "";
const CHANNEL_ID = process.env.DISCORD_ALERT_CHANNEL || "";
const MESSAGE = process.argv.slice(2).join(" ") || "No message";

if (!TOKEN) { console.log("ERROR: No DISCORD_TOKEN"); process.exit(1); }
if (!CHANNEL_ID) { console.log("ERROR: No DISCORD_ALERT_CHANNEL in .env"); process.exit(1); }

(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(TOKEN);
  await new Promise(r => client.once("ready", r));

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (channel && channel.send) {
      await channel.send(MESSAGE);
      console.log("Sent: " + MESSAGE.substring(0, 80));
    } else {
      console.log("Channel not found or not text channel");
    }
  } catch(e) {
    console.log("Send failed: " + e.message);
  }

  client.destroy();
  process.exit(0);
})().catch(e => { console.log("FATAL: " + e.message); process.exit(1); });
