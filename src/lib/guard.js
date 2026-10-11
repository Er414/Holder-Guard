export const DEFAULT_RULES = Object.freeze({
  noBuysBeforeEarnings: true,
  hoursBeforeEarnings: 24,
  warnOnSellsWhilePaused: true,
  blockBuysWhenUnavailable: true,
});

function toTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
      const dayStart = Date.parse(`${value.trim()}T00:00:00.000Z`);
      return Number.isFinite(dayStart) ? dayStart : null;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isEarningsBlackout(value, now, windowEnd) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const dayStart = Date.parse(`${value.trim()}T00:00:00.000Z`);
    if (!Number.isFinite(dayStart)) return false;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return (now >= dayStart && now < dayEnd) || (dayStart >= now && dayStart <= windowEnd);
  }
  const earningsAt = toTimestamp(value);
  return earningsAt !== null && earningsAt >= now && earningsAt <= windowEnd;
}

function statusState(value) {
  if (typeof value === "string") return value.toLowerCase();
  return String(value?.state || "unknown").toLowerCase();
}

const REASON_COPY = {
  EARNINGS_BLACKOUT: "Buy is inside the configured pre-earnings blackout window.",
  MARKET_NOT_OPEN: "Buy is blocked because the asset is not currently open.",
  SELL_WHILE_PAUSED: "Sell requested while this asset is paused.",
  RULES_CLEAR: "No configured guard rule was triggered.",
  INVALID_ACTION: "Choose a supported trade action: buy or sell.",
};

// This function is pure: callers pass the evaluation time, so equal inputs always yield equal verdicts.
export function evaluateTradeIntent(intent = {}, rules = DEFAULT_RULES) {
  const action = String(intent.action || "").trim().toUpperCase();
  const state = statusState(intent.status);
  const now = toTimestamp(intent.now) ?? 0;
  const reasonCodes = [];

  if (action !== "BUY" && action !== "SELL") {
    reasonCodes.push("INVALID_ACTION");
  }

  if (action === "BUY" && rules.noBuysBeforeEarnings) {
    const earningsDate = intent.earningsAt || intent.earnings?.date || intent.earnings?.earningsDate;
    const hours = Math.max(0, Number(rules.hoursBeforeEarnings) || 0);
    const windowEnd = now + hours * 60 * 60 * 1000;
    if (isEarningsBlackout(earningsDate, now, windowEnd)) {
      reasonCodes.push("EARNINGS_BLACKOUT");
    }
  }

  if (action === "BUY" && rules.blockBuysWhenUnavailable && state !== "open") {
    reasonCodes.push("MARKET_NOT_OPEN");
  }

  if (action === "SELL" && rules.warnOnSellsWhilePaused && state === "paused") {
    reasonCodes.push("SELL_WHILE_PAUSED");
  }

  if (reasonCodes.length === 0) reasonCodes.push("RULES_CLEAR");

  const verdict = reasonCodes.some((code) => ["INVALID_ACTION", "EARNINGS_BLACKOUT", "MARKET_NOT_OPEN"].includes(code))
    ? "BLOCK"
    : reasonCodes.includes("SELL_WHILE_PAUSED")
      ? "WARN"
      : "ALLOW";

  return {
    verdict,
    reasonCodes,
    reasons: reasonCodes.map((code) => REASON_COPY[code] || code),
  };
}