// tools/lib/session_levels.cjs
// WP-12 / audit 5.5: previous-session H/L draws.
//
// Daily H/Ls are the obvious draw; the PREVIOUS session's high/low is the
// draw map's next target — the resting liquidity left behind by the prior NY
// session. This module reads the daily candles and returns the most recent
// COMPLETED day's high/low (the last candle is today's, still forming).

function previousSessionHL(candles1d) {
  if (!candles1d || candles1d.length < 2) return null;
  const days = candles1d.slice(0, -1); // drop today (forming)
  const prev = days[days.length - 1];
  return {
    date: prev.time ?? prev.date ?? null,
    high: prev.high,
    low: prev.low,
    label: "previous-session H/L",
  };
}

module.exports = { previousSessionHL };
