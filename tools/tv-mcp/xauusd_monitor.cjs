const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/cash/projects/smc-icm-trading';
const LOG = path.join(ROOT, 'shared', '2026-09-09', 'xauusd_monitor.log');
const CFG = path.join(ROOT, 'shared', '2026-09-09', 'xauusd_scalp_monitor.json');
const GLP = 'C:/Users/cash/projects/smc-icm-trading/tools/tv-mcp/get_live_price.cjs';

const config = JSON.parse(fs.readFileSync(CFG, 'utf8'));
const ENTRY = config.entry, SL = config.sl, TP1 = config.tp1, TP2 = config.tp2;

function log(msg) {
  const line = '[' + new Date().toISOString() + '] ' + msg;
  fs.appendFileSync(LOG, line + '\n');
  console.log(line);
}

function poll() {
  try {
    // Use spawnSync for better Windows compatibility - no shell redirect needed
    const { spawnSync } = require('child_process');
    const child = spawnSync(process.execPath, [GLP, 'XAUUSD'], { encoding: 'utf8', timeout: 15000, maxBuffer: 1024*1024 });
    if (child.error) throw new Error(child.error.message);
    const result = child.stdout + child.stderr;
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in output: ' + result.substring(0, 80));
    const d = JSON.parse(jsonMatch[0]);
    const price = d.currentPrice;
    const symbol = d.symbol || 'XAUUSD';
    const pnlUsd = (price - ENTRY) * 100;
    
    if (price >= TP2) { log('🎯 TP2 HIT at ' + price.toFixed(2) + '! PnL: $' + pnlUsd.toFixed(2)); process.exit(0); }
    if (price <= SL) { log('🛑 SL HIT at ' + price.toFixed(2) + '. PnL: $' + pnlUsd.toFixed(2)); process.exit(0); }
    if (!config.tp1Hit && price >= TP1) {
      config.tp1Hit = true;
      log('✅ TP1 CROSSED → targeting TP2 @ ' + TP2);
      fs.writeFileSync(CFG, JSON.stringify(config, null, 2));
    }
    log(symbol + ' @ ' + price.toFixed(2) + ' | PnL: $' + pnlUsd.toFixed(2) + ' | ΔTP2: ' + (TP2-price).toFixed(2) + ' | ΔSL: ' + (price-SL).toFixed(2));
  } catch(e) { log('ERR: ' + e.message); }
}

log('=== XAUUSD SCALP MONITOR ===');
log('Entry:' + ENTRY + ' SL:' + SL + ' TP1:' + TP1 + ' TP2:' + TP2);
poll();
setInterval(poll, 20000);
