// SMC-ICM Discord Bot — Full Commands + Alerts
// Connects the trading workspace to Discord for mobile/remote access.
// Setup: npm install discord.js
// Run:   node tools/discord_bot.cjs
// Requires: DISCORD_TOKEN, DISCORD_CLIENT_ID in .env or environment

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";

// Load .env file if env vars not set (background processes don't inherit shell env)
try {
  const envPath = path.join(ROOT, ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    envContent.split("\n").filter(l => l.trim() && !l.startsWith("#")).forEach(l => {
      const eq = l.indexOf("=");
      if (eq > 0) {
        const k = l.slice(0, eq).trim();
        const v = l.slice(eq + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    });
  }
} catch(e) {}

const TOKEN = process.env.DISCORD_TOKEN || "";
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || "";
const GUILD_ID = process.env.DISCORD_GUILD_ID || "";

if (!TOKEN || !CLIENT_ID) {
  console.error("ERROR: DISCORD_TOKEN and DISCORD_CLIENT_ID must be set in environment.");
  console.error("Create a bot at https://discord.com/developers/applications");
  process.exit(1);
}

const PAIRS = [
  { name: "EURUSD", label: "EURUSD" },
  { name: "GBPUSD", label: "GBPUSD" },
  { name: "GOLD", label: "GOLD" },
  { name: "NAS100", label: "NAS100" },
  { name: "DXY", label: "DXY" },
];

// ═══════════════════════════════════════════════════════════════════
// TOOL WRAPPERS — Run workspace tools and return JSON
// ═══════════════════════════════════════════════════════════════════

function runTool(toolPath, pair, timeoutMs = 30000) {
  try {
    const cmd = `node "${path.join(ROOT, "tools", toolPath)}" ${pair}`;
    const output = execSync(cmd, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: timeoutMs });
    // Find full JSON block at end of output (handles multi-line JSON)
    const pairIdx = output.lastIndexOf('"pair"'); const jsonStart = pairIdx >= 0 ? output.lastIndexOf('{', pairIdx) : -1;
    if (jsonStart >= 0) {
      try { return JSON.parse(output.slice(jsonStart)); } catch {}
    }
    // Fallback: try parsing entire output
    try { return JSON.parse(output.trim()); } catch {}
    return { error: "Could not parse tool output", raw: output.slice(-200) };
  } catch(e) {
    return { error: e.message.slice(0, 200) };
  }
}

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

// ═══════════════════════════════════════════════════════════════════
// SLASH COMMAND DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

const commands = [
  new SlashCommandBuilder()
    .setName("status").setDescription("Macro context — cycle, session, liquidity, top models"),
  new SlashCommandBuilder()
    .setName("analyze").setDescription("Run full 8-stage pipeline on a pair")
    .addStringOption(o => o.setName("pair").setDescription("Trading pair").setRequired(true).addChoices(...PAIRS.map(p => ({ name: p.label, value: p.name })))),
  new SlashCommandBuilder()
    .setName("council").setDescription("Archetype Council vote — all 5 pairs"),
  new SlashCommandBuilder()
    .setName("ipda").setDescription("IPDA dealing range + equilibrium cascade")
    .addStringOption(o => o.setName("pair").setDescription("Trading pair").setRequired(true).addChoices(...PAIRS.map(p => ({ name: p.label, value: p.name })))),
  new SlashCommandBuilder()
    .setName("narrative").setDescription("The market's story — causal chain narrative")
    .addStringOption(o => o.setName("pair").setDescription("Trading pair").setRequired(true).addChoices(...PAIRS.map(p => ({ name: p.label, value: p.name })))),
  new SlashCommandBuilder()
    .setName("invalidation").setDescription("7-dimension invalidation check")
    .addStringOption(o => o.setName("pair").setDescription("Trading pair").setRequired(true).addChoices(...PAIRS.map(p => ({ name: p.label, value: p.name })))),
  new SlashCommandBuilder()
    .setName("coherence").setDescription("Lens/temporal/archetype coherence audit")
    .addStringOption(o => o.setName("pair").setDescription("Trading pair").setRequired(true).addChoices(...PAIRS.map(p => ({ name: p.label, value: p.name })))),
  new SlashCommandBuilder()
    .setName("fractal").setDescription("Fractal MMXM step map + 1m Inversion")
    .addStringOption(o => o.setName("pair").setDescription("Trading pair").setRequired(true).addChoices(...PAIRS.map(p => ({ name: p.label, value: p.name })))),
  new SlashCommandBuilder()
    .setName("micro").setDescription("15m/5m/1m micro coherence + triggers")
    .addStringOption(o => o.setName("pair").setDescription("Trading pair").setRequired(true).addChoices(...PAIRS.map(p => ({ name: p.label, value: p.name })))),
  new SlashCommandBuilder()
    .setName("journal").setDescription("Latest entry plan + risk ticket")
    .addStringOption(o => o.setName("pair").setDescription("Trading pair").setRequired(true).addChoices(...PAIRS.map(p => ({ name: p.label, value: p.name })))),
  new SlashCommandBuilder()
    .setName("briefing").setDescription("Weekly briefing — all 4 archetype plans"),
  new SlashCommandBuilder()
    .setName("draw").setDescription("Draw setup on TradingView (requires TV Desktop running)")
    .addStringOption(o => o.setName("pair").setDescription("Trading pair").setRequired(true).addChoices(...PAIRS.map(p => ({ name: p.label, value: p.name })))),
  new SlashCommandBuilder()
    .setName("prices").setDescription("Live prices + 1m bias for all pairs (from TradingView)"),
  new SlashCommandBuilder()
    .setName("live").setDescription("Start live market monitor — structure events, sweeps, entry scores"),
  new SlashCommandBuilder()
    .setName("silent").setDescription("Stop live monitor and return to silent mode"),
  new SlashCommandBuilder()
    .setName("trades").setDescription("Active trade status + today's trade history"),
  new SlashCommandBuilder()
    .setName("help").setDescription("Show all available commands"),
].map(cmd => cmd.toJSON());

// ═══════════════════════════════════════════════════════════════════
// LIVE PRICE FETCHER — Quick CDP connection for current prices
// ═══════════════════════════════════════════════════════════════════

async function getLivePrices(pairs) {
  let CDP;
  try { CDP = require("./tv-mcp/node_modules/chrome-remote-interface"); } catch(e) { console.error("CDP require fail:", e.message); return null; }

  let client;
  try {
    const resp = await fetch("http://127.0.0.1:9222/json/list");
    const targets = await resp.json();
    const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
    if (!chart) { console.error("No chart tab in targets:", targets.length); return null; }

    client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
    await client.Runtime.enable();

    const results = {};
    for (const pair of pairs) {
      const sym = pair === "DXY" ? "USDOLLAR" : pair;
      try {
        await client.Runtime.evaluate({
          expression: `(function() {
            window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${sym}", {});
            window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");
            return "ok";
          })()`,
          returnByValue: true
        });
        await new Promise(r => setTimeout(r, 2500));

        const result = await client.Runtime.evaluate({
          expression: `(function() {
            var api = window.TradingViewApi._activeChartWidgetWV.value();
            var bars = api._chartWidget.model().mainSeries().bars();
            var last = bars.lastIndex();
            var bar = bars.valueAt(last);
            return JSON.stringify({ price: bar[4], high: bar[2], low: bar[3], open: bar[1] });
          })()`,
          returnByValue: true
        });
        const data = JSON.parse(result.result.value);
        results[pair] = { price: data.price, high: data.high, low: data.low, error: null };
      } catch(e) {
        results[pair] = { price: null, error: e.message.slice(0, 50) };
      }
    }
    await client.close();
    return results;
  } catch(e) {
    if (client) try { await client.close(); } catch {}
    return null;
  }
}

function loadEnginePrices() {
  const prices = {};
  const DATE = new Date().toISOString().split("T")[0];
  for (const p of PAIRS) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, p.name, "engine_1d.json"), "utf8"));
      prices[p.name] = { price: r.price || r.structure?.lastEventPrice, bias1d: r.structure?.bias };
    } catch(e) {
      prices[p.name] = { price: null, bias1d: "?" };
    }
  }
  return prices;
}

// ═══════════════════════════════════════════════════════════════════
// EMBED BUILDERS — Format tool output for Discord
// ═══════════════════════════════════════════════════════════════════

function embedStatus(data) {
  const embed = new EmbedBuilder()
    .setTitle("📊 Macro Context")
    .setColor(0x448AFF)
    .addFields(
      { name: "Cycle", value: `${data.cycle || "UNKNOWN"}`, inline: true },
      { name: "MMXM", value: `Step ${data.mmxmStep || "?"}/4`, inline: true },
      { name: "Liquidity", value: data.liquidity || "N/A", inline: true },
      { name: "Day / Session", value: `${data.day || "?"} / ${data.session || "?"}`, inline: true },
      { name: "Top Models", value: data.topModels || "N/A", inline: false },
    )
    .setFooter({ text: "SMC-ICM · /analyze for pair details · /council for votes" });
  return embed;
}

function embedAnalyze(data) {
  const embed = new EmbedBuilder()
    .setTitle(`🔍 ${data.pair || "?"} Analysis`)
    .setColor(0x00E676)
    .addFields(
      { name: "Bias", value: `${data.bias || "?"} (${data.cascade || "?"})`, inline: true },
      { name: "Model", value: `${data.model || "?"} (${data.modelScore || "?"})`, inline: true },
      { name: "Coherence", value: `${data.coherence || "?"}/10`, inline: true },
      { name: "Entry", value: `${data.entryType || "?"} @ ${data.entry || "?"}`, inline: true },
      { name: "SL", value: `${data.sl || "?"}`, inline: true },
      { name: "TP1 / TP2", value: `${data.tp1 || "?"} / ${data.tp2 || "?"}`, inline: true },
      { name: "R:R", value: `${data.rr || "?"}`, inline: true },
      { name: "ISD", value: data.isd || "?", inline: true },
      { name: "1m Inversion", value: data.inversion || "?", inline: true },
      { name: "Fractal", value: `${data.fractal || "?"}/20`, inline: true },
    )
    .setFooter({ text: "SMC-ICM Hybrid · Run /journal for full trade ticket" });
  return embed;
}

function embedCouncil(results, prices) {
  const embed = new EmbedBuilder()
    .setTitle("🏛️ Archetype Council — All Pairs")
    .setColor(0xFFD740)
    .setDescription(
      PAIRS.map(p => {
        const res = results[p.name];
        if (!res) return `${p.label}: No data`;
        const pos = res.votes?.find(v => v.archetype?.includes("Position"))?.direction || "?";
        const swg = res.votes?.find(v => v.archetype?.includes("Swing"))?.direction || "?";
        const day = res.votes?.find(v => v.archetype?.includes("Day"))?.direction || "?";
        const scp = res.votes?.find(v => v.archetype?.includes("Scalper"))?.direction || "?";
        const price = prices?.[p.name]?.price;
        const priceStr = price ? ` @ ${typeof price === 'number' && price > 100 ? Math.round(price).toLocaleString() : price}` : "";
        return `**${p.label}**${priceStr}\nP:${pos[0]?.toUpperCase() || "?"} S:${swg[0]?.toUpperCase() || "?"} D:${day[0]?.toUpperCase() || "?"} Sc:${scp[0]?.toUpperCase() || "?"} | ${res.verdict || "?"} (${res.confidencePct || 0}%)`;
      }).join("\n\n")
    )
    .setFooter({ text: "P=Position S=Swing D=Day Sc=Scalp · Prices from engine (session start)" });
  return embed;
}

function embedIPDA(data) {
  const cascade = (data.equilibriumCascade || []).map(c => `${c.tf}@${c.eq}`).join(" → ");
  const embed = new EmbedBuilder()
    .setTitle(`📐 IPDA Dealing Range — ${data.pair || "?"}`)
    .setColor(0xCE93D8)
    .addFields(
      { name: "Zone Consensus", value: `${data.draw?.consensus || "?"} (${data.draw?.strength || "?"})`, inline: true },
      { name: "Draw Direction", value: data.draw?.direction || "?", inline: true },
      { name: "AMD Position", value: data.amd?.position || "?", inline: true },
      { name: "EQ Cascade", value: cascade || "N/A", inline: false },
    )
    .setFooter({ text: "IPDA: Price delivers from one EQ to another, hunting liquidity" });
  return embed;
}

function embedInvalidation(data) {
  const color = data.overallStatus === "VALID" ? 0x00E676 : data.overallStatus === "HIGH RISK" ? 0xFFD740 : 0xFF1744;
  const embed = new EmbedBuilder()
    .setTitle(`🛡️ Invalidation Check — ${data.pair || "?"}`)
    .setColor(color)
    .setDescription(`**${data.summary || "N/A"}**`)
    .addFields(
      { name: "Invalidated", value: `${data.totalInvalidated || 0}`, inline: true },
      { name: "Warnings", value: `${data.totalWarnings || 0}`, inline: true },
      { name: "Confirmed", value: `${data.totalValid || 0}`, inline: true },
      { name: "SL", value: `${data.price?.sl || "?"} (${data.price?.slPips || 0})`, inline: true },
    )
    .setFooter({ text: "7-dimension check: Price·Structure·Time·Model·Cycle·Micro·Correlation" });
  return embed;
}

function embedFractal(data) {
  const embed = new EmbedBuilder()
    .setTitle(`🔬 Fractal MMXM — ${data.pair || "?"}`)
    .setColor(0x448AFF)
    .addFields(
      { name: "Fractal Score", value: `${data.fractalScore || 0}/20`, inline: true },
      { name: "1m Inversion", value: `${data.inversionDetected ? "✅ DETECTED" : "⏳ NOT YET"} (${data.inversionScore || 0}/8)`, inline: true },
      { name: "Nesting", value: `${data.nestingScore || 0}/6`, inline: true },
      { name: "MMXM Steps", value: Object.entries(data.mmxmSteps || {}).map(([tf, step]) => `${tf}:${step}`).join(" "), inline: false },
    )
    .setFooter({ text: "MMXM: 1=Consolidation 2=Manipulation 3=Distribution 4=Re-accumulation 5=Completion" });
  return embed;
}

function embedHelp() {
  const embed = new EmbedBuilder()
    .setTitle("📋 SMC-ICM Discord Commands")
    .setColor(0x448AFF)
    .setDescription("All times in New York local (ICT standard)")
    .addFields(
      { name: "📊 Analysis", value: "`/status` `/analyze` `/council` `/prices` `/ipda` `/narrative` `/micro` `/fractal`", inline: false },
      { name: "🛡️ Validation", value: "`/invalidation` `/coherence`", inline: false },
      { name: "📈 Trading", value: "`/journal` `/draw` `/trades` `/briefing`", inline: false },
      { name: "🔴 Monitor", value: "`/live` — start live structure monitor\n`/silent` — stop monitor", inline: false },
      { name: "🔔 Session Alerts", value: "London Open (02:00) · NY AM (08:00) · Silver Bullet (10:00) · NY Lunch (11:00) · NY Close (15:30) · Daily Briefing (08:30)", inline: false },
    )
    .setFooter({ text: "SMC-ICM · All times NY local · TV Desktop CDP required for /prices /draw /live" });
  return embed;
}

// ═══════════════════════════════════════════════════════════════════
// BOT SETUP
// ═══════════════════════════════════════════════════════════════════

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  console.log(`✅ Discord bot online as ${client.user.tag}`);

  // Register slash commands
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log(`Registered ${commands.length} slash commands for guild`);
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log(`Registered ${commands.length} global slash commands`);
    }
  } catch(e) {
    console.error("Command registration error:", e.message);
  }

  // Start alert scheduler
  startAlerts();
  console.log("Alert scheduler started (NY time)");
});

// ═══════════════════════════════════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════════

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  try {
    await interaction.deferReply();
  } catch(e) {
    // Stale interaction from previous bot instance — ignore
    if (e.code === 10062) return;
    console.error("Defer error:", e.message);
    return;
  }

  try {
    switch (commandName) {
      case "status": {
        const macro = execSync(`node "${ROOT}/tools/macro_context.cjs"`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 15000 });
        const lines = macro.split("\n");
        const cycle = (lines.find(l => l.includes("Cycle:")) || "").replace(/.*Cycle:\s*/, "").split("(")[0].trim() || "UNKNOWN";
        const mmxm = (lines.find(l => l.includes("MMXM:")) || "").replace(/.*MMXM:\s*/, "").split("—")[0].trim() || "?";
        const liq = (lines.find(l => l.includes("Liquidity:")) || "").replace(/.*Liquidity:\s*/, "").trim() || "N/A";
        const models = (lines.find(l => l.includes("Top Models:")) || "").replace(/.*Top Models:\s*/, "").trim() || "N/A";
        const day = (lines.find(l => l.includes("Day:")) || "").replace(/.*Day:\s*/, "").trim() || "";
        const session = (lines.find(l => l.includes("Session:")) || "").replace(/.*Session:\s*/, "").trim() || "";
        await interaction.editReply({ embeds: [embedStatus({ cycle, mmxmStep: mmxm, liquidity: liq, topModels: models, day, session })] });
        break;
      }
      case "analyze": {
        const analyzePair = interaction.options.getString("pair");
        // Map Discord names to filesystem names
        const pairMap = { "GOLD": "XAUUSD", "EURUSD": "EURUSD", "GBPUSD": "GBPUSD", "NAS100": "NAS100", "DXY": "DXY" };
        const fsPair = pairMap[analyzePair] || analyzePair;
        await interaction.editReply({ content: `🔍 Running full pipeline on ${analyzePair}... (30-60s)` });
        const result = execSync(`node "${ROOT}/tools/run_pair.cjs" ${fsPair}`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 90000 });
        const lines = result.split("\n");
        const bias = (lines.find(l => l.includes("Bias:")) || "").replace(/.*Bias:\s*/, "").trim();
        const model = (lines.find(l => l.includes("Model:")) || "").replace(/.*Model:\s*/, "").split("(")[0].trim();
        const entryLine = (lines.find(l => l.includes("Entry:")) || "").replace(/.*Entry:\s*/, "").trim();
        const slLine = (lines.find(l => l.includes("SL:")) || "").replace(/.*SL:\s*/, "").split("|")[0].trim();
        const tpLine = (lines.find(l => l.includes("TP1:")) || "").replace(/.*TP1:\s*/, "").trim();
        const rrLine = (lines.find(l => l.includes("R:R:")) || "").replace(/.*R:R:\s*/, "").trim();
        const coherenceLine = (lines.find(l => l.includes("Coherence:")) || "").match(/(\d+)\/10/);
        const fractalLine = (lines.find(l => l.includes("Fractal MMXM:")) || "").match(/(\d+)\/20/);
        await interaction.editReply({ content: null, embeds: [embedAnalyze({
          pair: analyzePair, bias, model: model || "?", modelScore: (lines.find(l=>l.includes("Model:"))||"").match(/\(([^)]+)\)/)?.[1] || "?",
          entryType: entryLine.split(" ")[0] || "?", entry: entryLine.split("@")[1]?.trim() || entryLine,
          sl: slLine, tp1: tpLine.split("|")[1]?.trim() || tpLine,
          tp2: tpLine.split("|")[2]?.trim() || "", rr: rrLine, coherence: coherenceLine?.[1] || "?",
          fractal: fractalLine?.[1] || "?", isd: "?", inversion: "?"
        })] });
        break;
      }
      case "council": {
        await interaction.editReply({ content: "🏛️ Running council across all pairs..." });
        const results = {};
        for (const p of PAIRS) {
          try {
            const output = execSync(`node "${ROOT}/tools/council.cjs" ${p.name}`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 20000 });
            // council.cjs outputs multi-line JSON at the end — find the full JSON block
            const pairIdx = output.lastIndexOf('"pair"'); const jsonStart = pairIdx >= 0 ? output.lastIndexOf('{', pairIdx) : -1;
            if (jsonStart >= 0) {
              const jsonBlock = output.slice(jsonStart);
              try { results[p.name] = JSON.parse(jsonBlock); } catch(e) { results[p.name] = { error: "JSON parse failed" }; }
            } else {
              results[p.name] = { error: "No JSON found in output" };
            }
          } catch(e) { results[p.name] = { error: e.message.slice(0, 100) }; }
        }
        const prices = loadEnginePrices();
        await interaction.editReply({ content: null, embeds: [embedCouncil(results, prices)] });
        break;
      }
      case "prices": {
        await interaction.editReply({ content: "📡 Connecting to TradingView for live prices..." });
        try {
          const livePrices = await getLivePrices(PAIRS.map(p => p.name));
          if (!livePrices) {
            await interaction.editReply({ content: "❌ Could not connect to TradingView. Is TV Desktop running with CDP (port 9222)?" });
            break;
          }
          const embed = new EmbedBuilder()
            .setTitle("📊 Live Prices — All Pairs")
            .setColor(0x00E676)
            .setDescription(
              PAIRS.map(p => {
                const lp = livePrices[p.name];
                if (!lp || lp.error) return `**${p.label}**: ❌ ${lp?.error || "No data"}`;
                return `**${p.label}**: ${lp.price} (H:${lp.high} L:${lp.low})`;
              }).join("\n")
            )
            .setFooter({ text: "Live from TradingView Desktop · Updated on demand" });
          await interaction.editReply({ content: null, embeds: [embed] });
        } catch(e) {
          console.error("Prices error:", e.message, e.stack?.slice(0, 200));
          await interaction.editReply({ content: `❌ Error: ${e.message.slice(0, 300)}` });
        }
        break;
      }
      case "ipda": {
        const pair = interaction.options.getString("pair");
        const data = runTool("ipda.cjs", pair, 15000);
        await interaction.editReply({ embeds: [embedIPDA(data)] });
        break;
      }
      case "fractal": {
        const pair = interaction.options.getString("pair");
        const data = runTool("fractal_mmxm.cjs", pair, 15000);
        await interaction.editReply({ embeds: [embedFractal(data)] });
        break;
      }
      case "invalidation": {
        const pair = interaction.options.getString("pair");
        const data = runTool("invalidation.cjs", pair, 15000);
        await interaction.editReply({ embeds: [embedInvalidation(data)] });
        break;
      }
      case "micro": {
        const pair = interaction.options.getString("pair");
        const result = execSync(`node "${ROOT}/tools/micro_context.cjs" ${pair}`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 20000 });
        const lines = result.split("\n");
        const coh = (lines.find(l => l.includes("Coherence:")) || "").trim();
        const dec = (lines.find(l => l.includes("Decision:")) || "").trim();
        const embed = new EmbedBuilder().setTitle(`🔬 Micro — ${pair}`).setColor(0x00E676).setDescription(`${coh}\n${dec}`).setFooter({ text: "LTF: 15m/5m/1m coherence + session + liquidity + triggers" });
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case "narrative": {
        const pair = interaction.options.getString("pair");
        const data = runTool("narrative.cjs", pair, 20000);
        const embed = new EmbedBuilder().setTitle(`📖 Narrative — ${pair}`).setColor(0xFFD740)
          .setDescription(data.councilVerdict ? `**Council**: ${data.councilVerdict} | **Bias**: ${data.bias?.toUpperCase()} (${data.strength}) | **Phase**: ${data.phase} | **Coherence**: ${data.coherence}/10` : "Narrative unavailable")
          .setFooter({ text: "Full narrative: stages/00_council_vote/output/" + pair.toLowerCase() + "_narrative.md" });
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case "coherence": {
        const pair = interaction.options.getString("pair");
        const data = runTool("coherence_audit.cjs", pair, 15000);
        const embed = new EmbedBuilder().setTitle(`🔍 Coherence Audit — ${pair}`).setColor(data.coherenceScore >= 75 ? 0x00E676 : 0xFFD740)
          .setDescription(`**${data.coherenceLabel || "N/A"}** (${data.coherenceScore || 0}/100)`)
          .addFields(
            { name: "Lens", value: data.lens?.coherent ? "✅" : "⚠️", inline: true },
            { name: "Temporal", value: data.temporal?.coherent ? "✅" : "⚠️", inline: true },
            { name: "Archetype", value: data.archetype?.coherent ? "✅" : "⚠️", inline: true },
          )
          .setFooter({ text: "Coherence audit: lens · temporal · archetype · contradictions" });
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case "journal": {
        const pair = interaction.options.getString("pair");
        const entryPlan = fs.existsSync(path.join(ROOT, "stages", "05_entry_refinement", "output", `${pair.toLowerCase()}_entry_plan.md`))
          ? fs.readFileSync(path.join(ROOT, "stages", "05_entry_refinement", "output", `${pair.toLowerCase()}_entry_plan.md`), "utf8").slice(0, 800)
          : "No entry plan found. Run /analyze first.";
        const riskPlan = fs.existsSync(path.join(ROOT, "stages", "06_risk_management", "output", `${pair.toLowerCase()}_risk_plan.md`))
          ? fs.readFileSync(path.join(ROOT, "stages", "06_risk_management", "output", `${pair.toLowerCase()}_risk_plan.md`), "utf8").slice(0, 500)
          : "";
        const embed = new EmbedBuilder().setTitle(`📓 Trade Journal — ${pair}`).setColor(0xFFD740)
          .setDescription("```" + entryPlan.replace(/[#*`]/g, "").slice(0, 1000) + "```")
          .addFields({ name: "Risk Plan", value: "```" + riskPlan.replace(/[#*`]/g, "").slice(0, 500) + "```" })
          .setFooter({ text: "Full plans: stages/05_entry_refinement + stages/06_risk_management" });
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case "briefing": {
        const briefingFile = path.join(ROOT, "shared", "WEEKLY_BRIEFING_2026-07-27.md");
        if (fs.existsSync(briefingFile)) {
          const md = fs.readFileSync(briefingFile, "utf8").slice(0, 1500);
          const embed = new EmbedBuilder().setTitle("📋 Weekly Briefing").setColor(0x448AFF).setDescription("```" + md.replace(/[*`#]/g, "") + "```").setFooter({ text: "Full briefing: shared/WEEKLY_BRIEFING_2026-07-27.md" });
          await interaction.editReply({ embeds: [embed] });
        } else {
          await interaction.editReply({ content: "No weekly briefing found. Run 'Prepare for the coming week' in Claude Code first." });
        }
        break;
      }
      case "draw": {
        const drawPair = interaction.options.getString("pair");
        const scriptName = `draw_${drawPair.toLowerCase()}_1m.cjs`;
        const scriptPath = path.join(ROOT, "tools", "tv-mcp", scriptName);
        if (!fs.existsSync(scriptPath)) {
          await interaction.editReply({ content: `❌ No draw script for ${drawPair}. Available: EURUSD, GBPUSD, XAUUSD, NAS100` });
          break;
        }
        try {
          await interaction.editReply({ content: `🎨 Drawing ${drawPair} on 1m chart...` });
          execSync(`node "${scriptPath}"`, { stdio: "ignore", timeout: 45000 });
          await interaction.editReply({ content: `✅ **${drawPair}** drawn on 1m chart. Check TradingView.` });
        } catch(e) {
          await interaction.editReply({ content: `❌ Draw failed: ${e.message.slice(0, 200)}. Is TV Desktop running (CDP:9222)?` });
        }
        break;
      }
      case "live": {
        await interaction.editReply({ content: "📡 Checking system status..." });
        const tvOnline = await getLivePrices(["EURUSD"]);
        if (tvOnline) {
          await interaction.editReply({ content: "✅ **System ready.** TV Desktop connected. Live prices available.\n\nTo start live monitoring, say **'go live'** in Claude Code. The Tier 1+2 monitor streams structural events, sweeps, entry scores, and divergence alerts across all 4 pairs.\n\nQuick commands:\n• `/prices` — live prices on demand\n• `/council` — archetype votes\n• `/analyze [pair]` — full pipeline\n• `/trades` — trade history" });
        } else {
          await interaction.editReply({ content: "⚠️ **TV Desktop not reachable.** Make sure:\n1. TradingView Desktop is running\n2. It was launched with `--remote-debugging-port=9222`\n3. Try `/prices` to test the connection directly" });
        }
        break;
      }
      case "silent": {
        await interaction.editReply({ content: "🔇 To stop live monitoring, say **'go silent'** in Claude Code. The Discord bot doesn't control the monitor — it runs in the Claude Code session.\n\nUse `/prices` for on-demand snapshots." });
        break;
      }
      case "trades": {
        const perfDir = path.join(ROOT, "shared", "performance");
        const todayFiles = fs.existsSync(perfDir) ? fs.readdirSync(perfDir).filter(f => f.startsWith("trades_") && f.includes(new Date().toISOString().split("T")[0])) : [];
        const journalFile = path.join(ROOT, "stages", "07_journal_review", "output", `session_master_journal_${new Date().toISOString().split("T")[0]}.md`);

        let description = "";
        if (todayFiles.length > 0) {
          for (const f of todayFiles) {
            try {
              const trades = JSON.parse(fs.readFileSync(path.join(perfDir, f), "utf8"));
              for (const t of (Array.isArray(trades) ? trades : [trades])) {
                const pnl = t.pnl || 0;
                const emoji = t.status === "OPEN" ? "🔄" : pnl >= 0 ? "✅" : "❌";
                description += `${emoji} **${t.pair}** ${t.direction} | Entry: ${t.entry} | SL: ${t.sl} | TP1: ${t.tp1} | P&L: ${pnl >= 0 ? '+' : ''}${pnl} pts | ${t.status || t.outcome || 'CLOSED'}\n`;
              }
            } catch {}
          }
        } else {
          description = "No trades today. Use /analyze to find setups.";
        }

        const embed = new EmbedBuilder()
          .setTitle("📊 Trade History — " + new Date().toISOString().split("T")[0])
          .setColor(0xFFD740)
          .setDescription(description || "No data")
          .setFooter({ text: "Full journal: stages/07_journal_review/output/" });
        await interaction.editReply({ embeds: [embed] });
        break;
      }
      case "help": {
        await interaction.editReply({ embeds: [embedHelp()] });
        break;
      }
    }
  } catch(e) {
    await interaction.editReply({ content: `❌ Error: ${e.message.slice(0, 500)}` });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ALERT SYSTEM (NY Time)
// ═══════════════════════════════════════════════════════════════════

function startAlerts() {
  const { getNYHour, getNYDay } = require("./ny_time.cjs");

  // Prevent duplicate alerts — track which windows have fired
  const firedWindows = new Set();
  let lastSetupTime = null; // Track last Discord-alerted setup

  // Check every 60 seconds for alert triggers
  setInterval(async () => {
    const now = new Date();
    const nyHour = getNYHour();
    const nyDay = getNYDay();
    const nyMinute = now.getUTCMinutes(); // approximate — same offset as NY hour

    // Only fire on weekdays
    if (nyDay === 0 || nyDay === 6) return;

    const alertChannelId = process.env.DISCORD_ALERT_CHANNEL || "";
    let channel = null;

    if (alertChannelId) {
      try { channel = await client.channels.fetch(alertChannelId); } catch {}
    } else {
      try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (guild) channel = guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(guild.members.me).has("SendMessages"));
      } catch {}
    }

    if (!channel || !channel.send) {
      console.error("[ALERTS] No channel available — alerts disabled");
      return;
    }

    // ── Helper: fire at most once per window ──
    const alertOnce = (key, message) => {
      if (firedWindows.has(key)) return;
      firedWindows.add(key);
      channel.send(message).catch(() => {});
    };

    // London Killzone starts (02:00 NY)
    if (nyHour === 2 && nyMinute <= 2) alertOnce("london_kz",
      "🇬🇧 **London Killzone begins.** Manipulation window active. Silver Bullet 03:00-04:00 NY. Euro pairs: EURUSD, GBPUSD. Judas Swing at open.");

    // NY AM Killzone starts (08:00 NY)
    if (nyHour === 8 && nyMinute <= 2) alertOnce("ny_am_kz",
      "🇺🇸 **NY AM Killzone begins.** Highest volume window. Silver Bullet 10:00-11:00. All USD pairs active.");

    // Silver Bullet AM (10:00 NY)
    if (nyHour === 10 && nyMinute <= 2) alertOnce("sb_am",
      "🎯 **Silver Bullet AM (10:00-11:00 NY).** Highest probability 1-hour window. Look for displacement + FVG on 5m/1m.");

    // NY Lunch (11:00 NY)
    if (nyHour === 11 && nyMinute <= 2) alertOnce("ny_lunch",
      "🍽️ **NY Lunch (11:00-13:00 NY).** Low liquidity. No new entries. Review morning trades.");

    // Silver Bullet PM (14:00 NY)
    if (nyHour === 14 && nyMinute <= 2) alertOnce("sb_pm",
      "🎯 **Silver Bullet PM (14:00-15:00 NY).** Afternoon window. DXY and Gold often move here.");

    // NY Close approaching (15:30 NY)
    if (nyHour === 15 && nyMinute >= 28 && nyMinute <= 32) alertOnce("ny_close",
      "🔔 **NY Close approaching (16:00 NY).** Tighten stops. No new entries. Close positions before 16:00.");

    // Daily Briefing (08:30 NY) — static content, no execSync spam
    if (nyHour === 8 && nyMinute >= 28 && nyMinute <= 32) {
      alertOnce("daily_briefing", "📊 **Daily Briefing — " + new Date().toISOString().split("T")[0] + "**\n\n" +
        "Use these commands to start your day:\n" +
        "• `/status` — Macro context, cycle, session\n" +
        "• `/council` — Archetype votes across all 5 pairs\n" +
        "• `/prices` — Live prices from TradingView\n" +
        "• `/analyze` — Full pipeline on any pair\n" +
        "• `/trades` — Today's trade history\n\n" +
        "Check economic calendar for today's news events before trading.");
    }

    // ── Check for entry-quality setups from intel monitor ──
    try {
      const setupsFile = path.join(ROOT, "shared", "monitor", "setups.jsonl");
      if (fs.existsSync(setupsFile)) {
        const lines = fs.readFileSync(setupsFile, "utf8").trim().split("\n").filter(Boolean);
        const allSetups = lines.map(l => JSON.parse(l)).filter(s => s.score >= 7);
        // Send all setups newer than last check
        const newSetups = lastSetupTime ? allSetups.filter(s => s.time > lastSetupTime) : allSetups.slice(-1);
        for (const setup of newSetups) {
          lastSetupTime = setup.time;
          const emoji = setup.verdict === "🔥" ? "🚨" : "⚠️";
          const htfEmoji = setup.htfBias === "bearish" ? "🔴" : setup.htfBias === "bullish" ? "🟢" : "⚪";
          await channel.send(
            emoji + " **" + setup.pair + " " + setup.lastEvent + " — " + setup.score + "/10 " + setup.verdict + "**\n" +
            "Price: " + (typeof setup.price === 'number' && setup.price > 100 ? Math.round(setup.price).toLocaleString() : setup.price) +
            " | HTF: " + htfEmoji + " " + setup.htfBias.toUpperCase() +
            "\n" + setup.reasons.join(" | ") +
            "\n\nUse `/analyze " + setup.pair.toLowerCase() + "` for entry plan." +
            "\nUse `/draw " + setup.pair.toLowerCase() + "` to draw levels."
          );
        }
        // Update lastSetupTime to latest setup time
        if (allSetups.length > 0) {
          lastSetupTime = allSetups[allSetups.length - 1].time;
        }
      }
    } catch(e) { console.error("[SETUPS] Error:", e.message); }

    // Reset dedup keys daily
    const todayKey = now.toISOString().split("T")[0];
    for (const key of firedWindows) {
      if (!key.endsWith(todayKey)) firedWindows.delete(key);
    }
  }, 60000); // Every 60 seconds
}

// ═══════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════

client.login(TOKEN).catch(e => {
  console.error("Login failed:", e.message);
  process.exit(1);
});
