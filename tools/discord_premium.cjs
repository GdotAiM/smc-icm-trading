/**
 * Discord Premium — Daily briefings for paying subscribers
 *
 * Watches shared/YYYY-MM-DD/*.json for agent output, formats as Discord
 * embeds, posts to #premium channel. Runs alongside discord_bot.cjs.
 *
 * Usage:
 *   node tools/discord_premium.cjs          # normal mode
 *   DRY_RUN=1 node tools/discord_premium.cjs  # stdout instead of Discord
 */
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

// ── Timezone: all schedules in ET regardless of host location ───────────────
process.env.TZ = "America/New_York";

const ROOT = "C:\\Users\\cash\\smc-icm-trading";

// ── Env config ──────────────────────────────────────────────────────────────
const TOKEN = process.env.DISCORD_TOKEN || "";
const PREMIUM_CHANNEL_ID = process.env.DISCORD_PREMIUM_CHANNEL || "";
const PREMIUM_ROLE_ID = process.env.PREMIUM_ROLE_ID || "";
const PREMIUM_ENABLED = process.env.PREMIUM_ENABLED === "true";
const DRY_RUN = process.env.DRY_RUN === "true";

// ── File paths ──────────────────────────────────────────────────────────────
const SHARED_DIR = path.join(ROOT, "shared");
const SUBSCRIBERS_CSV = path.join(ROOT, "data", "subscribers.csv");
const LAST_POSTED_FILE = path.join(ROOT, "data", "last_posted_date.json");

// ── Helpers ─────────────────────────────────────────────────────────────────
function log(tag, ...args) {
  const ts = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  console.log(`[${ts}] [PREMIUM:${tag}]`, ...args);
}

function parseBriefing(filePath) {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (e) {
    log("PARSE", `Failed to parse ${filePath}: ${e.message.slice(0, 200)}`);
    return null;
  }
}

function formatDate(isoString) {
  if (!isoString) return "Unknown";
  try {
    return new Date(isoString).toLocaleDateString("en-ZA", {
      timeZone: "Africa/Johannesburg",
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoString;
  }
}

function formatTime(isoString) {
  if (!isoString) return "";
  try {
    return new Date(isoString).toLocaleTimeString("en-ZA", {
      timeZone: "Africa/Johannesburg",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function loadSubscribers() {
  try {
    if (!fs.existsSync(SUBSCRIBERS_CSV)) return [];
    const content = fs.readFileSync(SUBSCRIBERS_CSV, "utf8");
    const lines = content
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"));
    if (lines.length <= 1) return []; // header only
    const headers = lines[0].split(",").map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.trim());
      const obj = {};
      headers.forEach((h, i) => (obj[h] = values[i] || ""));
      return obj;
    });
  } catch (e) {
    log("SUBS", `Error loading subscribers: ${e.message.slice(0, 100)}`);
    return [];
  }
}

function loadLastPostedDate() {
  try {
    if (!fs.existsSync(LAST_POSTED_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(LAST_POSTED_FILE, "utf8"));
    return data.date || null;
  } catch {
    return null;
  }
}

function saveLastPostedDate(date) {
  try {
    fs.mkdirSync(path.dirname(LAST_POSTED_FILE), { recursive: true });
    fs.writeFileSync(LAST_POSTED_FILE, JSON.stringify({ date, ts: new Date().toISOString() }));
  } catch (e) {
    log("SAVE", `Failed to save last posted date: ${e.message.slice(0, 100)}`);
  }
}

function getBiasEmoji(bias) {
  const b = (bias || "").toUpperCase();
  if (b.includes("BULL")) return "🟢";
  if (b.includes("BEAR")) return "🔴";
  return "⚪";
}

function getStrengthColor(strength) {
  const s = (strength || "").toUpperCase();
  if (s.includes("STRONG")) return 0x2ee6a6; // green
  if (s.includes("WEAK")) return 0xe85d6c; // red
  return 0x3d8bfd; // blue
}

function buildEmbed(briefing) {
  const {
    symbol,
    date,
    bias = "NEUTRAL",
    draw_on_liquidity = "TBD",
    entry_trigger = "NONE",
    invalidation = "TBD",
    target = "TBD",
    confluence_score = 0,
    decision = "WATCH",
  } = briefing;

  const color = getStrengthColor(decision);
  const biasEmoji = getBiasEmoji(bias);

  const embed = new EmbedBuilder()
    .setTitle(`${biasEmoji} ${symbol} — Daily Briefing`)
    .setColor(color)
    .setTimestamp(new Date(date || undefined))
    .addFields(
      { name: "📅 Date", value: formatDate(date), inline: true },
      { name: "📊 Bias", value: `${biasEmoji} ${bias}`, inline: true },
      { name: "🎯 Draw on Liquidity", value: draw_on_liquidity, inline: false },
      { name: "⚡ Entry Trigger", value: entry_trigger || "NONE", inline: true },
      { name: "🛑 Invalidation", value: invalidation || "TBD", inline: true },
      { name: "🎪 Target", value: target || "TBD", inline: true },
      { name: "📈 Confluence", value: `${confluence_score}/4`, inline: true },
      { name: "✅ Decision", value: decision, inline: true }
    )
    .setFooter({ text: "ICT Level Alerts · Powered by smc-icm-trading" });

  return embed;
}

async function sendToChannel(channel, embed) {
  if (DRY_RUN) {
    log("DRY-RUN", "Would post to channel:", embed.data.title);
    console.log("--- EMBED ---");
    console.log(embed.data.description || "(no description)");
    console.log("--- FIELDS ---");
    embed.data.fields?.forEach((f) => {
      console.log(`  **${f.name}**: ${f.value}`);
    });
    console.log("--- END ---\n");
    return true;
  }

  try {
    await channel.send({ embeds: [embed] });
    log("POST", `Posted to #premium: ${embed.data.title}`);
    return true;
  } catch (e) {
    log("POST", `Failed to post: ${e.message.slice(0, 200)}`);
    return false;
  }
}

// ── Watcher ─────────────────────────────────────────────────────────────────
async function watchBriefings(client) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).replace(/-/g, "");
  const dateDir = path.join(SHARED_DIR, today);

  if (!fs.existsSync(dateDir)) {
    log("WATCH", `No briefings dir for ${today}, waiting...`);
    return;
  }

  const files = fs.readdirSync(dateDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    log("WATCH", "No briefing files found yet");
    return;
  }

  const channel = await client.channels.fetch(PREMIUM_CHANNEL_ID).catch(() => null);
  if (!channel) {
    log("CHANNEL", "Premium channel not found or inaccessible");
    return;
  }

  const subscribers = loadSubscribers();
  log("SUBS", `Loaded ${subscribers.length} subscribers`);

  for (const file of files) {
    const filePath = path.join(dateDir, file);
    const briefing = parseBriefing(filePath);
    if (!briefing) continue;

    const embed = buildEmbed(briefing);
    const success = await sendToChannel(channel, embed);

    if (success) {
      saveLastPostedDate(today);
    }
  }
}

// ── Scheduled runs ──────────────────────────────────────────────────────────
function getNYHour() {
  return parseInt(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).trim(),
    10
  );
}

async function scheduledRun(client) {
  const hour = getNYHour();

  // Run at key times: 07:30 ET (daily briefing), 20:00 ET (weekly map Sunday)
  if (hour === 7 || hour === 20) {
    log("SCHEDULE", `Running scheduled briefing at ${hour}:00 ET`);
    await watchBriefings(client);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!TOKEN) {
    console.error("ERROR: DISCORD_TOKEN must be set in environment.");
    process.exit(1);
  }

  if (!PREMIUM_CHANNEL_ID && !DRY_RUN) {
    console.error("ERROR: DISCORD_PREMIUM_CHANNEL must be set in environment.");
    console.error("Or run with DRY_RUN=1 to test without Discord.");
    process.exit(1);
  }

  if (!PREMIUM_ENABLED && !DRY_RUN) {
    log("CONFIG", "Premium is disabled (PREMIUM_ENABLED=false). Exiting.");
    process.exit(0);
  }

  log("START", `Premium bot starting (DRY_RUN=${DRY_RUN}, ENABLED=${PREMIUM_ENABLED})`);

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.on("error", (err) => {
    log("ERROR", err.message.slice(0, 200));
  });

  client.on("ready", async () => {
    log("READY", `Logged in as ${client.user.tag}`);

    // Initial run
    await watchBriefings(client);

    // Poll every 30 seconds for new briefings
    setInterval(async () => {
      await watchBriefings(client);
    }, 30_000);

    // Scheduled checks at key hours
    setInterval(async () => {
      await scheduledRun(client);
    }, 60_000); // Check every minute, filter by hour internally
  });

  await client.login(TOKEN);
}

main().catch((err) => {
  log("FATAL", err.message.slice(0, 200));
  process.exit(1);
});
