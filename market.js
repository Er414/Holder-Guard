export function numericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function toMilliseconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (typeof value === "string" && value.trim()) {
    const number = Number(value);
    if (Number.isFinite(number)) return number < 1e12 ? number * 1000 : number;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function resolveMarketState(status) {
  if (!status) return "unknown";
  const code = String(status.reasonCode || "").toUpperCase();
  if (code === "TRADING") return "open";
  if (code === "ASSET_LIMITED") return "limited";
  if (["ASSET_PAUSED", "MARKET_PAUSED", "MARKET_MAINTENANCE", "UNSUPPORTED"].includes(code)) return "paused";
  if (code === "MARKET_CLOSED") return "closed";
  if (status.openState === true) return "open";
  if (status.openState === false || String(status.marketStatus || "").toLowerCase() === "closed") return "closed";
  return "unknown";
}

export function humanizeReason(code, message) {
  if (message) {
    return String(message)
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  if (!code) return "Reason not supplied";
  return String(code)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function decimalToScaled(value, targetScale) {
  const text = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  const scale = 10n ** BigInt(targetScale);
  const fractionValue = BigInt((fraction + "0".repeat(targetScale)).slice(0, targetScale) || "0");
  const result = BigInt(whole) * scale + fractionValue;
  return negative ? -result : result;
}

function readablePercent(value) {
  if (!Number.isFinite(value)) return "an unquantified amount";
  const magnitude = Math.abs(value);
  if (magnitude > 0 && magnitude < 1e-12) return "<0.000000000001%";
  const places = magnitude >= 0.01 ? 2 : Math.min(12, Math.max(4, Math.ceil(-Math.log10(magnitude || 1)) + 2));
  return `${Math.abs(value).toFixed(places).replace(/\.?0+$/, "")}%`;
}

export function detectMultiplierChange(previousMultiplier, currentMultiplier) {
  if (previousMultiplier === null || previousMultiplier === undefined || currentMultiplier === null || currentMultiplier === undefined) {
    return null;
  }

  const previousText = String(previousMultiplier).trim();
  const currentText = String(currentMultiplier).trim();
  const previousPlaces = (previousText.split(".")[1] || "").length;
  const currentPlaces = (currentText.split(".")[1] || "").length;
  const scale = Math.min(36, Math.max(previousPlaces, currentPlaces));
  const previous = decimalToScaled(previousText, scale);
  const current = decimalToScaled(currentText, scale);
  if (previous === null || current === null || previous === current) return null;

  const difference = current - previous;
  const percentage = previous === 0n ? null : (Number(difference) / Number(previous)) * 100;
  const direction = difference > 0n ? "rose" : "fell";
  const size = readablePercent(percentage);
  const message = difference > 0n && percentage !== null && percentage < 5
    ? `Multiplier rose ${size}, consistent with dividend reinvestment.`
    : difference > 0n
      ? `Multiplier rose ${size}; a split or token adjustment may be involved.`
      : `Multiplier fell ${size}.`;

  return {
    previous: previousText,
    current: currentText,
    direction,
    percentChange: percentage,
    message,
  };
}

export function formatUnits(rawValue, decimals) {
  const raw = typeof rawValue === "bigint" ? rawValue : BigInt(rawValue);
  const places = Math.max(0, Math.min(255, Number(decimals) || 0));
  if (!places) return raw.toString();
  const negative = raw < 0n;
  const digits = (negative ? -raw : raw).toString().padStart(places + 1, "0");
  const whole = digits.slice(0, -places);
  const fraction = digits.slice(-places).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function formatCountdown(target, now = Date.now()) {
  const timestamp = toMilliseconds(target);
  if (timestamp === null) return "Schedule unavailable";
  const totalSeconds = Math.max(0, Math.floor((timestamp - now) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const prefix = timestamp <= now ? "Due now" : "In ";
  const parts = days
    ? [`${days}d`, `${String(hours).padStart(2, "0")}h`]
    : hours
      ? [`${hours}h`, `${String(minutes).padStart(2, "0")}m`]
      : [`${minutes}m`, `${String(seconds).padStart(2, "0")}s`];
  return `${prefix}${prefix === "In " ? parts.join(" ") : ""}`;
}

export function compareMarketSnapshot(previous, current, context = {}) {
  if (!previous || !current) return [];
  const events = [];
  const prevCode = previous.reasonCode || null;
  const nextCode = current.reasonCode || null;
  const prevMessage = previous.reasonMsg || null;
  const nextMessage = current.reasonMsg || null;

  if (previous.trackStatus !== false && current.trackStatus !== false && (prevCode !== nextCode || prevMessage !== nextMessage)) {
    const from = [prevCode, prevMessage].filter(Boolean).join(" / ") || "No reason supplied";
    const to = [nextCode, nextMessage].filter(Boolean).join(" / ") || "No reason supplied";
    events.push({
      kind: "status",
      ticker: context.ticker,
      symbol: context.symbol,
      title: "Market reason changed",
      message: `${from} -> ${to}`,
      source: current.statusSource || "Binance asset market status",
      timestamp: new Date(context.now || Date.now()).toISOString(),
    });
  }

  const multiplierChange = detectMultiplierChange(previous.multiplier, current.multiplier);
  if (multiplierChange) {
    events.push({
      kind: "multiplier",
      ticker: context.ticker,
      symbol: context.symbol,
      title: "Shares multiplier changed",
      message: multiplierChange.message,
      source: "Binance dynamic v2",
      timestamp: new Date(context.now || Date.now()).toISOString(),
      details: multiplierChange,
    });
  }

  return events;
}