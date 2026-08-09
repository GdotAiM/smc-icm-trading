// tools/lib/raid_config.cjs
// WP-12 / audit 5.7: one decision constant for how a liquidity raid is
// confirmed — by WICK (price spiked through the level but closed back) or by
// CLOSE (price closed through the level).
//
// Default comes from the single validated config home (engine_config.cjs,
// CONFIG.liquidityRaid.confirmation — Remediation Principle 4, WP-13). It is
// configurable without code edits via the env var:
//   LIQUIDITY_RAID_CONFIRMATION=close   (runtime override)
// Only the values "wick" and "close" are accepted; anything else falls back
// to the config default.

const { CONFIG } = require("./engine_config.cjs");

function loadRaidConfirmation() {
  const env = process.env.LIQUIDITY_RAID_CONFIRMATION;
  if (env === "close" || env === "wick") return env;
  const configured = CONFIG.liquidityRaid && CONFIG.liquidityRaid.confirmation;
  return configured === "close" || configured === "wick" ? configured : "wick";
}

const LIQUIDITY_RAID_CONFIRMATION = loadRaidConfirmation();

module.exports = { LIQUIDITY_RAID_CONFIRMATION, loadRaidConfirmation };
