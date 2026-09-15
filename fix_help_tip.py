#!/usr/bin/env python3
import re

with open('C:\Users\cash\projects\smc-icm-trading\\tools\\discord_bot.cjs', 'r', encoding='utf8') as f:
    content = f.read()

# Add follow-up tip after /help command
old_help_case = '''case "help": {
        await interaction.editReply({ embeds: [embedHelp()] });
        break;
      }'''

new_help_case = '''case "help": {
        await interaction.editReply({ embeds: [embedHelp()] });
        // Also send a follow-up with quick-start tips
        try {
          await interaction.followUp({ content: "💡 **Tip:** Use `/prices` for live snapshots, `/council` for pair votes, and `/live` to check TV Desktop status. All times are New York (ICT)." });
        } catch {}
        break;
      }'''

if old_help_case in content:
    new_content = content.replace(old_help_case, new_help_case)
    with open('C:\Users\cash\projects\smc-icm-trading\\tools\\discord_bot.cjs', 'w', encoding='utf8') as f:
        f.write(new_content)
    print("SUCCESS: Help follow-up tip added")
else:
    print("FAILED: old_help_case pattern not found - may already be modified")