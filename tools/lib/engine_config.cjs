// tools/lib/engine_config.cjs
// Single validated home for the system's magic numbers (Remediation Principle 4:
// "Config over Code"). Every threshold, buffer multiple, and window flag that
// the pipeline depends on is defined here and validated at startup, so a bad
// value fails loudly instead of silently corrupting decisions.

const CONFIG = {
  atr: {
    period: 14,
    defaultBufferMultiple: 0.5,
    sbBufferMultiple: 0.25,
  },
  inversion: {
    // The 1m "sentence" (inversion) detector fires at score >= minScore.
    // Both the detector (fractal_mmxm.cjs) and the gate (cross_system_guard.cjs)
    // MUST read this value, so they can never disagree (Remediation WP-13).
    // Score components (max 8): CHoCH(2) + Sweep(2) + HTF-aligned(2) + FVG(1) + Displacement(1)
    // 4 = minimum viable: 2 of 4 major criteria met — 1m is building structure.
    minScore: 4,
    maxScore: 8,
  },
  killzones: {
    // ICT-correct: "London PM" (05:00-08:00 NY) is the dead overlap zone.
    // It is a session name but NEVER a killzone.
    londonPMIsKillzone: false,
  },
  liquidityRaid: {
    // Consistent wick-vs-close rule for every sweep detector (Remediation 5.7).
    // Single source: tools/lib/raid_config.cjs reads THIS value (env var
    // LIQUIDITY_RAID_CONFIRMATION overrides it). "wick" is ICT's preferred
    // reading — the wick is the stop-run signature, the body is the lie.
    // "close" | "wick"
    confirmation: "wick",
  },
  buffers: {
    // Structural-SL buffer multiples (multiples of real ATR), used via
    // lib/metrics.cjs structuralSL().
    swingBufferMultiple: 0.5,
  },
};

function validate() {
  const errors = [];
  if (CONFIG.atr.period < 2) errors.push("atr.period must be >= 2");
  if (CONFIG.atr.defaultBufferMultiple <= 0) errors.push("atr.defaultBufferMultiple must be > 0");
  if (CONFIG.atr.sbBufferMultiple <= 0) errors.push("atr.sbBufferMultiple must be > 0");
  if (CONFIG.inversion.minScore > CONFIG.inversion.maxScore) errors.push("inversion.minScore must be <= inversion.maxScore");
  if (CONFIG.killzones.londonPMIsKillzone) errors.push("killzones.londonPMIsKillzone must be false (ICT dead zone)");
  if (!["close", "wick"].includes(CONFIG.liquidityRaid.confirmation)) errors.push("liquidityRaid.confirmation must be 'close' or 'wick'");
  if (errors.length > 0) {
    throw new Error("engine_config validation failed: " + errors.join("; "));
  }
  return CONFIG;
}

validate();

module.exports = { CONFIG };
