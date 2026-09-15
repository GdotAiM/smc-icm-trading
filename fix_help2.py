#!/usr/bin/env python3
import re

with open('C:\Users\cash\projects\smc-icm-trading\\tools\\discord_bot.cjs', 'r', encoding='utf8') as f:
    content = f.read()

# Replace the help embed description
old_desc = '''function embedHelp() {
  const embed = new EmbedBuilder()
    .setTitle("📋 SMC-ICM Discord Commands")
    .setColor(0x448AFF)
    .setDescription("All times in New York local (ICT standard)")
    .addFields(
      { name: "📊 Analysis", value: "`/status` `/analyze` `/council` `/prices` `/ipda` `/narrative` `/micro` `/fractal` `/scan`", inline: false },
      { name: "🛡️ Validation", value: "`/invalidation` `/coherence`", inline: false },
      { name: "📈 Trading", value: "`/positions` `/trades` `/pnl` `/journal` `/draw` `/briefing`", inline: false },
      { name: "⏰ Session", value: "`/session` — NY time, killzone, SB windows\\n`/rules` — today's trading rules\\n`/news` — economic calendar\\n`/graph` — trade graph stats", inline: false },
      { name: "🔴 Monitor", value: "`/live` — start live structure monitor\\n`/silent` — stop monitor", inline: false },
      { name: "🔔 Session Alerts", value: "London Open (02:00) · NY AM (08:00) · Silver Bullet (10:00) · NY Lunch (11:00) · NY Close (15:30) · Daily Briefing (08:30)", inline: false },
    )
    .setFooter({ text: "SMC-ICM · All times NY local · TV Desktop CDP required for /prices /draw /live" });
  return embed;
}'''

new_desc = '''function embedHelp() {
  const embed = new EmbedBuilder()
    .setTitle("📋 SMC-ICM Discord Commands")
    .setColor(0x448AFF)
    .setDescription(
      "*All times in New York local (ICT standard)*\\n\\n" +
      "🔹 **Quick Start**: Use `/prices` for live prices → `/council` for pair votes → `/status` for macro context\\n\\n" +
      "📊 **Analysis**\\n" +
      "`/status` — Macro context, cycle, session, liquidity, top models\\n" +
      "`/analyze [pair]` — Full 8-stage pipeline on a pair\\n" +
      "`/council` — Archetype Council vote — all 5 pairs\\n" +
      "`/ipda [pair]` — IPDA dealing range + equilibrium cascade\\n" +
      "`/narrative [pair]` — The market's story — causal chain narrative\\n" +
      "`/micro [pair]` — 15m/5m/1m micro coherence + triggers\\n" +
      "`/fractal [pair]` — Fractal MMXM step map + 1m Inversion\\n\\n" +
      "🛡️ **Validation**\\n" +
      "`/invalidation [pair]` — 7-dimension invalidation check\\n" +
      "`/coherence [pair]` — Lens/temporal/archetype coherence audit\\n\\n" +
      "📈 **Trading**\\n" +
      "`/positions` — Open positions (TV paper trading)\\n" +
      "`/trades` — Today's trade history + live positions\\n" +
      "`/pnl` — Today's P&L summary — all closed + open trades\\n" +
      "`/journal [pair]` — Latest entry plan + risk ticket\\n" +
      "`/briefing` — Weekly briefing\\n\\n" +
      "⏰ **Session**\\n" +
      "`/session` — NY time, killzone, SB windows, tradeable?\\n" +
      "`/rules` — Today's trading rules and risk limits\\n" +
      "`/news` — Today's economic calendar events\\n" +
      "`/graph` — Trade graph stats — trades, lessons, edges, models\\n\\n" +
      "🔔 **Monitor**\\n" +
      "`/live` — Start live market monitor — structure events, sweeps, entry scores\\n" +
      "`/silent` — Stop live monitor and return to silent mode\\n\\n" +
      "🔴 **Alert System** — Automated NY-time killzone & Silver Bullet alerts\\n" +
      "• London Killzone: 02:00 NY\\n" +
      "• NY AM Killzone: 08:00 NY\\n" +
      "• Silver Bullet AM: 10:00-11:00 NY\\n" +
      "• NY Lunch: 11:00-13:00 NY (no entries)\\n" +
      "• Silver Bullet PM: 14:00-15:00 NY\\n" +
      "• NY Close approaching: 15:30 NY",
    )
    .setFooter({ text: "SMC-ICM · All times NY local · TV Desktop CDP required for /prices /draw /live" });
  return embed;
}'''

if old_desc in content:
    new_content = content.replace(old_desc, new_desc)
    with open('C:\Users\cash\projects\smc-icm-trading\\tools\\discord_bot.cjs', 'w', encoding='utf8') as f:
        f.write(new_content)
    print("SUCCESS: Help embed description updated")
else:
    print("FAILED: old_desc pattern not found")