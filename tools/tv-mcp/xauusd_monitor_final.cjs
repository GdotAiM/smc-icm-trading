// XAUUSD Scalp Monitor - v9: absolute paths, robust JSON parsing
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/cash/projects/smc-icm-trading';
const LOG = path.join(ROOT, 'shared', '2026-09-09', 'xauusd_monitor.log');
const CFG = path.join(ROOT, 'shared', '2026-09-09', 'xauusd_scalp_monitor.json');
const GLP = path.join(ROOT, 'tools', 'tv-mcp', 'get_live_price.cjs');

const config = JSON.parse(fs.readFileSync(CFG, 'utf8'));
const ENTRY = config.entry;
const SL = config.sl;
const TP1 = config.tp1;
const TP2 = config.tp2;

function log(msg) {
  const line = '[' + new Date().toISOString() + '] ' + msg;
  fs.appendFileSync(LOG, line + '\n');
  console.log(line);
}

function poll() {
  try {
    // Use absolute path to avoid cwd issues
    const result = execSync('node "' + GLP + '" XAUUSD', { encoding: 'utf8', timeout: 15000 });
    // Extract JSON with regex (output may have stray chars)
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in: ' + result.substring(0, 100));
    const d = JSON.parse(jsonMatch[0]);
    const price = d.currentPrice;
    const symbol = d.symbol || 'XAUUSD';
    const pnlPerOz = price - ENTRY;
    const pnlUsd = pnlPerOz * 100;
    
    if (price >= TP2) {
      log('🎯 TP2 HIT at ' + price.toFixed(2) + '! PnL: $' + pnlUsd.toFixed(2));
      process.exit(0);
    }
    if (price <= SL) {
      log('🛑 SL HIT at ' + price.toFixed(2) + '. PnL: $' + pnlUsd.toFixed(2));
      process.exit(0);
    }
    if (!config.tp1Hit && price >= TP1) {
      config.tp1Hit = true;
      log('✅ TP1 CROSSED at ' + price.toFixed(2) + '! Now targeting TP2 @ ' + TP2);
      fs.writeFileSync(CFG, JSON.stringify(config, null, 2));
    }
    
    log(symbol + ': ' + price.toFixed(2) + ' | PnL: $' + pnlUsd.toFixed(2) + ' | to TP2: ' + (TP2 - price).toFixed(2) + ' | to SL: ' + (price - SL).toFixed(2));
  } catch(e) {
    log('Error: ' + e.message);
  }
}

log('=== XAUUSD SCALP MONITOR v9 (ABSOLUTE PATHS) ===');
log('Entry: ' + ENTRY + ' | SL: ' + SL + ' | TP1: ' + TP1 + ' | TP2: ' + TP2);
log('Status: TP1=' + (config.tp1Hit ? 'HIT ✅' : 'pending') + ' | Current price ~4405');

poll();
setInterval(poll, 15000);
