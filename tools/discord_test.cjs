// Discord Bot Test — send welcome message + register commands
const fs = require("fs");
const path = require("path");

// Load from .env
const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const config = {};
env.split("\n").filter(l => l.trim() && !l.startsWith("#")).forEach(l => {
  const [k, v] = l.split("=");
  if (k && v) config[k.trim()] = v.trim();
});

console.log("Token:", config.DISCORD_TOKEN ? config.DISCORD_TOKEN.slice(0, 20) + "..." : "MISSING");
console.log("Guild:", config.DISCORD_GUILD_ID || "MISSING");

const { Client, GatewayIntentBits } = require("discord.js");
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

client.once("ready", async () => {
  console.log("Connected: " + client.user.tag);

  const guild = client.guilds.cache.get(config.DISCORD_GUILD_ID);
  if (!guild) {
    console.log("ERROR: Guild not found. Invite bot first:");
    console.log("https://discord.com/oauth2/click/applications/" + config.DISCORD_CLIENT_ID + "/invite?scope=bot&permissions=2048");
    process.exit(1);
  }
  console.log("Guild: " + guild.name);

  // Find text channel
  const channel = guild.channels.cache.find(
    c => c.type === 0 && c.permissionsFor(guild.members.me).has("SendMessages")
  );
  if (!channel) { console.log("ERROR: No writable channel"); process.exit(1); }
  console.log("Channel: #" + channel.name);

  // Send test
  await channel.send(
    "**SMC Trading Bot - Online**\n\n" +
    "Session: July 29, 2026 | FOMC Day\n" +
    "Pairs: EURUSD | GBPUSD | XAUUSD | NAS100\n\n" +
    "Today's top setup: NAS100 BEARISH (1D/4H/1H aligned, 9/10 Po3)\n" +
    "Gold Turtle Soup triggered at $4,031 sweep\n\n" +
    "Type /help to see commands."
  );
  console.log("Message sent!");

  // Register slash commands
  const { REST, Routes } = require("discord.js");
  const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

  const commands = [
    { name: "status", description: "Session macro context" },
    { name: "analyze", description: "Full analysis for a pair",
      options: [{ name: "pair", description: "Trading pair", type: 3, required: true,
        choices: [{ name: "EURUSD", value: "eurusd" }, { name: "GBPUSD", value: "gbpusd" }, { name: "GOLD", value: "gold" }, { name: "NAS100", value: "nas100" }]
      }]
    },
    { name: "council", description: "Archetype Council vote" },
    { name: "ipda", description: "IPDA equilibrium cascade",
      options: [{ name: "pair", description: "Pair", type: 3, required: true,
        choices: [{ name: "EURUSD", value: "eurusd" }, { name: "GBPUSD", value: "gbpusd" }, { name: "GOLD", value: "gold" }]
      }]
    },
    { name: "draw", description: "Draw levels on TV chart",
      options: [{ name: "pair", description: "Pair", type: 3, required: true,
        choices: [{ name: "EURUSD", value: "eurusd" }, { name: "GBPUSD", value: "gbpusd" }, { name: "GOLD", value: "gold" }, { name: "NAS100", value: "nas100" }]
      }]
    },
    { name: "alert", description: "Set price alert",
      options: [
        { name: "pair", description: "Pair", type: 3, required: true, choices: [{ name: "GOLD", value: "gold" }, { name: "NAS100", value: "nas100" }] },
        { name: "price", description: "Alert price level", type: 10, required: true },
      ]
    },
    { name: "help", description: "Show all commands" },
  ];

  try {
    await rest.put(
      Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID),
      { body: commands }
    );
    console.log("Slash commands registered!");
  } catch(e) {
    console.log("Command registration note: " + e.message);
  }

  console.log("\nBot is live! Check Discord. Staying online 60s for testing.");
  setTimeout(() => { console.log("Test done."); process.exit(0); }, 60000);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  console.log("Command received: " + commandName);

  if (commandName === "help") {
    await interaction.reply(
      "**SMC Trading Bot - Commands**\n\n" +
      "/status - Session macro context\n" +
      "/analyze [pair] - Full analysis: bias, model, entry, SL, TP\n" +
      "/council - Archetype council vote across all pairs\n" +
      "/ipda [pair] - IPDA dealing range + equilibrium\n" +
      "/draw [pair] - Draw key levels on TradingView\n" +
      "/alert [pair] [price] - Set a price alert\n\n" +
      "Alerts for entry-quality setups coming soon."
    );
  } else if (commandName === "status") {
    await interaction.reply(
      "**Session Status - July 29, 2026**\n\n" +
      "Session: London KZ (closed) | Next: NY AM\n" +
      "Cycle: DISTRIBUTION | Day: Wednesday Reversal\n" +
      "FOMC Day - Rate decision 14:00 ET\n\n" +
      "Active monitor: Tier 1+2 (4 pairs)\n" +
      "No active trades\n\n" +
      "Top setups today:\n" +
      "NAS100: BEARISH (1D/4H/1H aligned, 9/10 Po3)\n" +
      "XAUUSD: Turtle Soup triggered (sweep $4,031)"
    );
  } else {
    await interaction.reply("Command received! Full integration coming next session.");
  }
});

client.login(config.DISCORD_TOKEN).catch(e => {
  console.log("Login failed: " + e.message);
  if (e.message.includes("disallowed intents")) {
    console.log("\nFIX: Go to https://discord.com/developers/applications");
    console.log("Bot page > Privileged Gateway Intents > Toggle ON Message Content Intent");
  }
  process.exit(1);
});
