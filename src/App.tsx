// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import Lenis from "lenis";
import {
  askExplainer,
  fetchAssetStatus,
  fetchDynamicData,
  fetchEarnings,
  fetchProxyHealth,
  fetchTokenCatalog,
  readBscTokenBalances,
} from "./lib/api.js";
import { DEFAULT_RULES, evaluateTradeIntent } from "./lib/guard.js";
import {
  compareMarketSnapshot,
  formatCountdown,
  humanizeReason,
  numericValue,
  resolveMarketState,
  toMilliseconds,
} from "./lib/market.js";
import { readLocal, STORAGE_KEYS, writeLocal } from "./lib/storage.js";

const POLL_INTERVAL = 120_000;

/* Pexels photography (WebP requested from the CDN), credited in the footer. */
const HERO_IMG = "https://images.pexels.com/photos/10149290/pexels-photo-10149290.jpeg";
const CHART_IMG = "https://images.pexels.com/photos/5831268/pexels-photo-5831268.jpeg";
const CLOCK_IMG = "https://images.pexels.com/photos/8646391/pexels-photo-8646391.jpeg";
const px = (base, width) => `${base}?auto=compress&cs=tinysrgb&fm=webp&w=${width}`;
const HERO_SRCSET = `${px(HERO_IMG, 1600)} 1600w, ${px(HERO_IMG, 2200)} 2200w, ${px(HERO_IMG, 2800)} 2800w`;
const CHART_SRCSET = `${px(CHART_IMG, 360)} 360w, ${px(CHART_IMG, 560)} 560w`;
const CLOCK_SRCSET = `${px(CLOCK_IMG, 360)} 360w, ${px(CLOCK_IMG, 560)} 560w`;

function Icon({ name, size = 18, strokeWidth = 1.8 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  const drawings = {
    shield: <><path d="M12 3 19 6v5c0 4.5-2.9 8-7 10-4.1-2-7-5.5-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    grid: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></>,
    wallet: <><path d="M4 6.5h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2h13" /><path d="M21 11h-5a2 2 0 0 0 0 4h5" /><circle cx="16" cy="13" r=".5" fill="currentColor" /></>,
    sliders: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
    timeline: <><path d="M4 5v14h16" /><path d="m7 15 3-4 3 2 5-7" /><circle cx="7" cy="15" r="1" /><circle cx="10" cy="11" r="1" /><circle cx="13" cy="13" r="1" /><circle cx="18" cy="6" r="1" /></>,
    spark: <><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M5.5 9a7 7 0 0 1 11.7-2L20 12M4 12l2.8 5a7 7 0 0 0 11.7-2" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    pause: <><circle cx="12" cy="12" r="9" /><path d="M10 9v6M14 9v6" /></>,
    alert: <><path d="M12 3 2.8 19a1 1 0 0 0 .9 1.5h16.6a1 1 0 0 0 .9-1.5L12 3Z" /><path d="M12 9v4M12 17h.01" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M4 17v3h16v-3" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return <svg {...common}>{drawings[name] || drawings.spark}</svg>;
}

function BrandHex({ size = 40 }) {
  return (
    <svg className="brand-hex" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 2.5 L35.2 11.25 V28.75 L20 37.5 L4.8 28.75 V11.25 Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M20 10.5l6.5 2.9v5.2c0 4.6-2.8 8.2-6.5 9.9-3.7-1.7-6.5-5.3-6.5-9.9v-5.2L20 10.5Z" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="m16.8 20 2.3 2.3 4.2-4.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function providerName(type) {
  const providers = { 1: "Ondo", 2: "xStocks", 3: "bStocks" };
  return providers[Number(type)] || "Tokenized stock";
}

function assetKey(asset) {
  return String(asset?.contractAddress || asset?.symbol || asset?.ticker || "").toLowerCase();
}

function formatNumber(value, digits = 4) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "N/A";
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: digits });
}

function formatMoney(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
}

function formatShortAddress(value) {
  return value ? `${value.slice(0, 7)}...${value.slice(-5)}` : "No wallet loaded";
}

function formatAge(timestamp, now) {
  if (!timestamp) return "Not synced";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function formatDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  const timestamp = toMilliseconds(value);
  return timestamp === null ? "Date unavailable" : new Date(timestamp).toLocaleString("en-US", options);
}

function getUpcomingEarning(response, now) {
  const events = Array.isArray(response?.events) ? response.events : [];
  const normalized = events.map((event) => {
    if (!event || typeof event !== "object") return null;
    const rawDate = event.date || event.earningsDate || event.reportDate || event.dateTime || event.startDate || event.time;
    const timestamp = typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim())
      ? Date.parse(`${rawDate.trim()}T23:59:59.999Z`)
      : toMilliseconds(rawDate);
    const rawTiming = event.timing || event.session || event.when || "";
    const timing = typeof rawTiming === "string" || typeof rawTiming === "number" ? String(rawTiming) : "";
    return !Number.isFinite(timestamp) ? null : {
      ...event,
      timestamp,
      date: rawDate,
      timing,
    };
  }).filter((event) => event && event.timestamp >= now);
  normalized.sort((first, second) => first.timestamp - second.timestamp);
  return normalized[0] || null;
}

function getStatusIcon(state) {
  if (state === "open") return "check";
  if (state === "limited") return "alert";
  if (state === "paused") return "pause";
  return "clock";
}

function getCountdown(status, state) {
  return state === "open" ? status?.nextCloseTime : status?.nextOpenTime;
}

function makeTimelineEvent({ kind = "simulation", ticker, symbol, title, message, source, timestamp = new Date().toISOString() }) {
  return {
    id: `${Date.parse(timestamp) || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    ticker,
    symbol,
    title,
    message,
    source,
    timestamp,
  };
}

function readArray(key) {
  const value = readLocal(key, []);
  return Array.isArray(value) ? value : [];
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

/* Staggered word-by-word headline reveal (transform + opacity only). */
const HEADLINE_WORDS = [
  { text: "Know" },
  { text: "what" },
  { text: "changed" },
  { text: "across" },
  { text: "your" },
  { text: "Tokenized", shimmer: true },
  { text: "Stocks", shimmer: true },
];

function HeadlineWords() {
  const reduced = useReducedMotion();
  return (
    <h1 className="hero-title" aria-label="Know what changed across your Tokenized Stocks">
      {HEADLINE_WORDS.map((word, index) => (
        <motion.span
          key={word.text}
          className={word.shimmer ? "word word-shimmer" : "word"}
          aria-hidden="true"
          initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 + index * 0.075, ease: [0.22, 0.61, 0.36, 1] }}
        >
          {word.text}
        </motion.span>
      ))}
    </h1>
  );
}

/* Count-up numbers (rAF, transform-free text). */
function CountUp({ value, format = (v) => String(v), duration = 950 }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(() => Number(value) || 0);
  const fromRef = useRef(Number(value) || 0);
  useEffect(() => {
    const from = fromRef.current;
    const to = Number(value) || 0;
    if (reduced || from === to) {
      fromRef.current = to;
      setDisplay(to);
      return undefined;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (time) => {
      const p = Math.min(1, (time - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = to;
    };
  }, [value, reduced, duration]);
  return <>{format(display)}</>;
}

/* Magnetic primary button: transform + press feedback only. */
function Magnetic({ children, className = "", ...props }) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const pressedRef = useRef(false);
  const apply = () => {
    const node = ref.current;
    if (!node) return;
    const t = node.dataset.transform || "";
    node.style.transform = t ? `${t}${pressedRef.current ? " scale(0.97)" : ""}` : pressedRef.current ? "scale(0.97)" : "";
  };
  return (
    <button
      ref={ref}
      className={`magnetic ${className}`}
      onMouseMove={(event) => {
        if (reduced || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const x = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
        const y = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
        ref.current.dataset.transform = `translate3d(${(x * 5).toFixed(1)}px, ${(y * 4).toFixed(1)}px, 0)`;
        apply();
      }}
      onMouseLeave={() => {
        if (ref.current) {
          ref.current.dataset.transform = "";
          pressedRef.current = false;
          ref.current.style.transform = "";
        }
      }}
      onPointerDown={() => {
        pressedRef.current = true;
        apply();
      }}
      onPointerUp={() => {
        pressedRef.current = false;
        apply();
      }}
      {...props}
    >
      {children}
    </button>
  );
}

/* Lazy mount: heavy sections mount once they approach the viewport. */
function LazyMount({ children, label = "Loading section" }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (!("IntersectionObserver" in window)) {
      setReady(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setReady(true);
          observer.disconnect();
        }
      },
      { rootMargin: "280px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  if (!ready) {
    return (
      <div ref={ref} className="section-sketch" role="status" aria-label={label}>
        <span className="sketch-hex" aria-hidden="true" />
      </div>
    );
  }
  return (
    <motion.div ref={ref} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}

const listVariants = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 0.61, 0.36, 1] } },
};

function StatusPill({ state, pulse, compact = false }) {
  const labels = { open: "Open", limited: "Limited", paused: "Paused", closed: "Closed", unknown: "Unknown" };
  return (
    <span className={`state-pill state-${state} ${pulse ? "pill-pulse" : ""} ${compact ? "is-compact" : ""}`}>
      <span className="pill-hex"><Icon name={getStatusIcon(state)} size={compact ? 11 : 13} strokeWidth={2.1} /></span>
      <span className="pill-text">{labels[state] || "Unknown"}</span>
    </span>
  );
}

function App() {
  const reduced = useReducedMotion();
  const [walletAddress, setWalletAddress] = useState(() => readLocal(STORAGE_KEYS.wallet, ""));
  const [addressInput, setAddressInput] = useState(() => readLocal(STORAGE_KEYS.wallet, ""));
  const [catalog, setCatalog] = useState([]);
  const [positions, setPositions] = useState([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [portfolioError, setPortfolioError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const [timeline, setTimeline] = useState(() => readArray(STORAGE_KEYS.timeline));
  const [ledger, setLedger] = useState(() => readArray(STORAGE_KEYS.ledger));
  const [rules, setRules] = useState(() => ({ ...DEFAULT_RULES, ...readLocal(STORAGE_KEYS.rules, {}) }));
  const [earningsByTicker, setEarningsByTicker] = useState({});
  const [proxyHealth, setProxyHealth] = useState(null);
  const [simulatedEvent, setSimulatedEvent] = useState(null);
  const [selectedAssetKey, setSelectedAssetKey] = useState("");
  const [tradeAction, setTradeAction] = useState("BUY");
  const [tradeAmount, setTradeAmount] = useState("1");
  const [lastVerdict, setLastVerdict] = useState(null);
  const [activeNavigation, setActiveNavigation] = useState("overview");
  const [question, setQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [assistantError, setAssistantError] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const snapshotsRef = useRef(readLocal(STORAGE_KEYS.snapshots, {}));
  const earningFetchRef = useRef({});
  const refreshLock = useRef(false);
  const heroRef = useRef(null);
  const progressRef = useRef(null);
  const lenisRef = useRef(null);
  const statePulseRef = useRef({});
  const [pulseMap, setPulseMap] = useState({});

  const addTimelineEvents = useCallback((items) => {
    if (!items.length) return;
    setTimeline((previous) => {
      const next = [...items, ...previous];
      writeLocal(STORAGE_KEYS.timeline, next);
      return next;
    });
  }, []);

  const loadEarnings = useCallback((tickers) => {
    const uniqueTickers = [...new Set(tickers.filter(Boolean).map((ticker) => String(ticker).toUpperCase()))];
    uniqueTickers.forEach((ticker) => {
      const fetchedAt = earningFetchRef.current[ticker];
      if (fetchedAt && Date.now() - fetchedAt < 6 * 60 * 60 * 1000) return;
      earningFetchRef.current[ticker] = Date.now();
      fetchEarnings(ticker)
        .then((response) => setEarningsByTicker((previous) => ({ ...previous, [ticker]: response })))
        .catch((error) => setEarningsByTicker((previous) => ({
          ...previous,
          [ticker]: { configured: false, error: error.message, events: [] },
        })));
    });
  }, []);

  const refreshPortfolio = useCallback(async (targetAddress = walletAddress, sourceCatalog = catalog) => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(targetAddress) || !sourceCatalog.length || refreshLock.current) return;
    refreshLock.current = true;
    setPortfolioLoading(true);
    setPortfolioError("");
    try {
      const ownedTokens = await readBscTokenBalances(targetAddress, sourceCatalog);
      const enriched = await mapLimit(ownedTokens, 6, async (token) => {
        const [statusResult, dynamicResult] = await Promise.allSettled([
          fetchAssetStatus(token),
          fetchDynamicData(token),
        ]);
        const dynamic = dynamicResult.status === "fulfilled" ? dynamicResult.value : null;
        const status = statusResult.status === "fulfilled"
          ? statusResult.value
          : dynamic?.statusInfo || null;
        const dynamicMultiplier = dynamic?.tokenInfo?.sharesMultiplier ?? null;
        const multiplier = dynamicMultiplier ?? token.multiplier ?? null;
        const numericMultiplier = numericValue(multiplier);
        const tokenPrice = numericValue(dynamic?.tokenInfo?.price);
        const liveStatus = status || null;
        return {
          ...token,
          dynamic,
          status: liveStatus,
          statusSource: statusResult.status === "fulfilled" ? "Binance asset market status" : "Binance dynamic v2",
          multiplier,
          dynamicMultiplier,
          multiplierSource: dynamicMultiplier === null ? "Binance stock list fallback" : "Binance dynamic v2",
          tokenPrice,
          perSharePrice: numericMultiplier && tokenPrice !== null ? tokenPrice / numericMultiplier : null,
          shareEquivalent: numericMultiplier !== null ? token.quantity * numericMultiplier : null,
          marketDataError: statusResult.status === "rejected" && dynamicResult.status === "rejected",
        };
      });

      const snapshot = {};
      const changes = [];
      enriched.forEach((position) => {
        const key = assetKey(position);
        const status = position.status || {};
        const hasStatus = Boolean(status.reasonCode || status.reasonMsg || typeof status.openState === "boolean" || status.marketStatus);
        const current = {
          reasonCode: status.reasonCode || null,
          reasonMsg: status.reasonMsg || null,
          multiplier: position.dynamicMultiplier,
          statusSource: position.statusSource,
          trackStatus: hasStatus,
        };
        const previous = snapshotsRef.current[key];
        if (previous) {
          changes.push(...compareMarketSnapshot(previous, current, {
            ticker: position.ticker,
            symbol: position.symbol,
            now: Date.now(),
          }));
        }
        snapshot[key] = current;
      });

      snapshotsRef.current = snapshot;
      writeLocal(STORAGE_KEYS.snapshots, snapshot);
      setPositions(enriched);
      setLastUpdated(Date.now());
      if (changes.length) addTimelineEvents(changes);
      loadEarnings(enriched.map((position) => position.ticker));
    } catch (error) {
      setPortfolioError(error.message || "Unable to read token balances from BSC.");
    } finally {
      refreshLock.current = false;
      setPortfolioLoading(false);
    }
  }, [addTimelineEvents, catalog, loadEarnings, walletAddress]);

  useEffect(() => {
    let active = true;
    fetchProxyHealth()
      .then((health) => { if (active) setProxyHealth(health); })
      .catch(() => { if (active) setProxyHealth({ ok: false, qwenConfigured: false, earningsConfigured: false }); });
    fetchTokenCatalog()
      .then((tokens) => {
        if (!active) return;
        setCatalog(tokens);
        setCatalogError("");
      })
      .catch((error) => { if (active) setCatalogError(error.message || "RWA token catalog could not be reached."); })
      .finally(() => { if (active) setCatalogLoading(false); });
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  /* Lenis smooth scroll (skipped for reduced motion). */
  useEffect(() => {
    if (reduced) return undefined;
    const lenis = new Lenis({ lerp: 0.09 });
    lenisRef.current = lenis;
    let raf = 0;
    const loop = (time) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [reduced]);

  /* Slow hero parallax (transform only). */
  useEffect(() => {
    if (reduced) return undefined;
    const host = heroRef.current;
    if (!host) return undefined;
    const media = host.querySelector(".hero-media img");
    if (!media) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      const shift = Math.min(window.scrollY, 1200) * 0.16;
      media.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      media.style.transform = "";
    };
  }, [reduced]);

  /* Scroll-progress fallback when CSS scroll timelines are unsupported. */
  useEffect(() => {
    if (reduced) return undefined;
    const el = progressRef.current;
    if (!el) return undefined;
    if (CSS.supports("animation-timeline: scroll()")) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      el.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  useEffect(() => {
    if (!walletAddress || !catalog.length) return undefined;
    refreshPortfolio(walletAddress, catalog);
    const timer = window.setInterval(() => refreshPortfolio(walletAddress, catalog), POLL_INTERVAL);
    return () => window.clearInterval(timer);
  }, [walletAddress, catalog, refreshPortfolio]);

  useEffect(() => {
    if (!simulatedEvent || clockNow < simulatedEvent.status.nextOpenTime) return;
    const ended = simulatedEvent;
    setSimulatedEvent(null);
    addTimelineEvents([makeTimelineEvent({
      kind: "simulation",
      ticker: ended.ticker,
      symbol: ended.symbol,
      title: "Corporate-action replay ended",
      message: "The simulated pause window has ended. Live market state was never changed.",
      source: "SIMULATION",
    })]);
  }, [addTimelineEvents, clockNow, simulatedEvent]);

  const simMatches = useCallback((asset) => {
    if (!simulatedEvent) return false;
    if (simulatedEvent.contractAddress && asset.contractAddress) {
      return simulatedEvent.contractAddress.toLowerCase() === asset.contractAddress.toLowerCase();
    }
    return String(simulatedEvent.symbol || "").toLowerCase() === String(asset.symbol || "").toLowerCase();
  }, [simulatedEvent]);

  const radarRows = useMemo(() => {
    const rows = positions.map((position) => simMatches(position)
      ? { ...position, status: simulatedEvent.status, isSimulated: true }
      : position);
    if (simulatedEvent && !rows.some((row) => simMatches(row))) {
      rows.push({
        ...simulatedEvent.asset,
        status: simulatedEvent.status,
        isSimulated: true,
        isScenarioOnly: true,
        balance: null,
        quantity: null,
        shareEquivalent: null,
        tokenPrice: null,
        perSharePrice: null,
      });
    }
    return rows;
  }, [positions, simMatches, simulatedEvent]);

  /* Pulse status pills only when a state actually changes. */
  useEffect(() => {
    const changed = {};
    radarRows.forEach((row) => {
      const key = assetKey(row);
      const state = resolveMarketState(row.status || {});
      const previous = statePulseRef.current[key];
      if (previous !== undefined && previous !== state) changed[key] = true;
      statePulseRef.current[key] = state;
    });
    if (!Object.keys(changed).length) return undefined;
    setPulseMap((previous) => ({ ...previous, ...changed }));
    const timer = setTimeout(() => setPulseMap({}), 1600);
    return () => window.clearTimeout(timer);
  }, [radarRows]);

  const selectedAsset = useMemo(() => radarRows.find((asset) => assetKey(asset) === selectedAssetKey) || radarRows[0] || null, [radarRows, selectedAssetKey]);
  const exposure = positions.reduce((total, position) => total + (position.quantity || 0) * (position.tokenPrice || 0), 0);
  const representedShares = positions.reduce((total, position) => total + (position.shareEquivalent || 0), 0);
  const exposureReady = Boolean(lastUpdated) && positions.every((position) => position.tokenPrice !== null);
  const sharesReady = Boolean(lastUpdated) && positions.every((position) => position.shareEquivalent !== null);
  const upcomingCount = positions.filter((position) => getUpcomingEarning(earningsByTicker[String(position.ticker || "").toUpperCase()], clockNow)).length;

  useEffect(() => {
    if (!selectedAsset && radarRows[0]) setSelectedAssetKey(assetKey(radarRows[0]));
    if (selectedAsset && !radarRows.some((asset) => assetKey(asset) === selectedAssetKey)) {
      setSelectedAssetKey(assetKey(radarRows[0]));
    }
  }, [radarRows, selectedAsset, selectedAssetKey]);

  function selectAsset(key) {
    if (key === selectedAssetKey) return;
    const apply = () => setSelectedAssetKey(key);
    if (!reduced && typeof document.startViewTransition === "function") {
      document.startViewTransition(apply);
    } else {
      apply();
    }
  }

  function scrollToSection(id) {
    setActiveNavigation(id);
    const el = document.getElementById(id);
    if (!el) return;
    if (lenisRef.current) lenisRef.current.scrollTo(el, { offset: -70, duration: 0.9 });
    else el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }

  function submitWallet(event) {
    event.preventDefault();
    const candidate = addressInput.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(candidate)) {
      setPortfolioError("Enter a valid BSC address: 0x followed by 40 hexadecimal characters.");
      return;
    }
    setPortfolioError("");
    writeLocal(STORAGE_KEYS.wallet, candidate);
    if (candidate.toLowerCase() === walletAddress.toLowerCase()) refreshPortfolio(candidate, catalog);
    else setWalletAddress(candidate);
  }

  function clearWallet() {
    writeLocal(STORAGE_KEYS.wallet, "");
    setWalletAddress("");
    setAddressInput("");
    setPositions([]);
    setLastUpdated(null);
    setPortfolioError("");
  }

  function replayCorporateAction() {
    const anchor = positions[0] || catalog[0] || { ticker: "SAMPLE", symbol: "SIM-STOCK", type: 0 };
    const now = Date.now();
    const simulation = {
      ticker: anchor.ticker || "SAMPLE",
      symbol: anchor.symbol || anchor.ticker || "SIM-STOCK",
      contractAddress: anchor.contractAddress || null,
      status: {
        openState: false,
        marketStatus: "paused",
        reasonCode: "ASSET_PAUSED",
        reasonMsg: "stock_split",
        nextOpenTime: now + 5 * 60 * 1000,
        nextCloseTime: null,
      },
      asset: {
        ticker: anchor.ticker || "SAMPLE",
        symbol: anchor.symbol || anchor.ticker || "SIM-STOCK",
        contractAddress: anchor.contractAddress || null,
        provider: positions.length ? providerName(anchor.type) : "Scenario only",
        type: anchor.type,
      },
    };
    setSimulatedEvent(simulation);
    if (!positions.some((position) => simMatches(position))) selectAsset(assetKey(simulation.asset));
    addTimelineEvents([makeTimelineEvent({
      kind: "simulation",
      ticker: simulation.ticker,
      symbol: simulation.symbol,
      title: "Simulated stock split pause",
      message: `${simulation.symbol} is replaying ASSET_PAUSED / stock_split. The five-minute window and all status values are synthetic.`,
      source: "SIMULATION",
    })]);
  }

  function endSimulation() {
    if (!simulatedEvent) return;
    const ended = simulatedEvent;
    setSimulatedEvent(null);
    addTimelineEvents([makeTimelineEvent({
      kind: "simulation",
      ticker: ended.ticker,
      symbol: ended.symbol,
      title: "Corporate-action replay ended",
      message: "Simulation cleared. The live Binance status remains unchanged.",
      source: "SIMULATION",
    })]);
  }

  function updateRule(key, value) {
    setRules((previous) => {
      const next = { ...previous, [key]: value };
      writeLocal(STORAGE_KEYS.rules, next);
      return next;
    });
  }

  function evaluateSelectedTrade(event) {
    event.preventDefault();
    if (!selectedAsset) return;
    const status = selectedAsset.status || null;
    const upcoming = getUpcomingEarning(earningsByTicker[String(selectedAsset.ticker || "").toUpperCase()], clockNow);
    const inputs = {
      action: tradeAction,
      ticker: selectedAsset.ticker,
      symbol: selectedAsset.symbol,
      contractAddress: selectedAsset.contractAddress || null,
      amount: Number(tradeAmount) || 0,
      simulated: Boolean(selectedAsset.isSimulated),
      source: selectedAsset.isSimulated ? "SIMULATION" : selectedAsset.statusSource || "Binance asset market status",
      status: {
        state: resolveMarketState(status),
        reasonCode: status?.reasonCode || null,
        reasonMsg: status?.reasonMsg || null,
      },
      earningsAt: upcoming?.date ?? null,
      earnings: upcoming ? { date: upcoming.timestamp, timing: upcoming.timing || "" } : null,
      now: clockNow,
    };
    const result = evaluateTradeIntent(inputs, rules);
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(clockNow).toISOString(),
      inputs: { ...inputs, rules: { ...rules } },
      result,
    };
    setLastVerdict(entry);
    setLedger((previous) => {
      const next = [entry, ...previous];
      writeLocal(STORAGE_KEYS.ledger, next);
      return next;
    });
  }

  function exportLedger() {
    const file = new Blob([JSON.stringify(ledger, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "holder-guard-decision-ledger.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function askQwen(event) {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt) return;
    setAssistantBusy(true);
    setAssistantError("");
    setAssistantAnswer("");
    const liveData = {
      sourceAt: lastUpdated ? new Date(lastUpdated).toISOString() : "No live holdings snapshot loaded",
      mode: simulatedEvent ? "LIVE_PLUS_SIMULATION" : positions.length ? "LIVE" : "NO_LIVE_DATA",
      positions: positions.map((position) => {
        const status = position.status || {};
        const upcoming = getUpcomingEarning(earningsByTicker[String(position.ticker || "").toUpperCase()], clockNow);
        return {
          ticker: position.ticker,
          symbol: position.symbol,
          balance: position.balance,
          shareEquivalent: position.shareEquivalent,
          tokenPrice: position.tokenPrice,
          perSharePrice: position.perSharePrice,
          multiplier: position.dynamicMultiplier,
          state: resolveMarketState(status),
          reasonCode: status.reasonCode,
          reasonMsg: status.reasonMsg,
          nextOpenTime: status.nextOpenTime,
          nextCloseTime: status.nextCloseTime,
          source: position.statusSource,
          earnings: upcoming ? { date: upcoming.timestamp, timing: upcoming.timing } : null,
        };
      }),
      timeline: timeline.slice(0, 10).map((item) => ({
        kind: item.kind,
        title: item.title,
        ticker: item.ticker,
        symbol: item.symbol,
        message: item.message,
        source: item.source,
        timestamp: item.timestamp,
      })),
      verdict: lastVerdict ? {
        ...lastVerdict.result,
        action: lastVerdict.inputs.action,
        ticker: lastVerdict.inputs.ticker,
        symbol: lastVerdict.inputs.symbol,
        state: lastVerdict.inputs.status.state,
        simulated: lastVerdict.inputs.simulated,
      } : null,
      simulatedScenario: simulatedEvent ? {
        active: true,
        ticker: simulatedEvent.ticker,
        symbol: simulatedEvent.symbol,
        reasonCode: simulatedEvent.status.reasonCode,
        reasonMsg: simulatedEvent.status.reasonMsg,
        nextOpenTime: simulatedEvent.status.nextOpenTime,
        source: "SIMULATION",
      } : null,
    };
    try {
      const response = await askExplainer({ question: prompt, liveData });
      setAssistantAnswer(response.answer || "No explanation was returned.");
    } catch (error) {
      setAssistantError(error.message || "The explainer could not be reached.");
    } finally {
      setAssistantBusy(false);
    }
  }

  const navigation = [
    { id: "overview", label: "Overview", icon: "grid" },
    { id: "holdings", label: "Holdings", icon: "wallet" },
    { id: "guard", label: "Guard rules", icon: "sliders" },
    { id: "timeline", label: "Event timeline", icon: "timeline" },
    { id: "explainer", label: "Explainer", icon: "spark" },
  ];

  const sectionMotion = reduced
    ? { initial: false }
    : { initial: "hidden", animate: "show", variants: listVariants };

  return (
    <div className="app-shell">
      <div className="hex-field" aria-hidden="true" />
      <div className="scroll-progress" ref={progressRef} aria-hidden="true" />

      <aside className="sidebar">
        <div className="brand-lockup">
          <BrandHex size={42} />
          <div className="brand-copy">
            <strong>Holder Guard</strong>
            <span>TOKENIZED STOCKS / BSC 56</span>
          </div>
        </div>

        <div className="side-network">
          <span className="network-mark" aria-hidden="true">56</span>
          <div><strong>BNB Smart Chain</strong><span>Mainnet / chain 56</span></div>
          <span className="network-live" aria-label="mainnet" />
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          <p className="nav-caption">Workspace</p>
          {navigation.map((item) => (
            <button
              className={`nav-item ${activeNavigation === item.id ? "nav-item-active" : ""}`}
              key={item.id}
              onClick={() => scrollToSection(item.id)}
              type="button"
            >
              <Icon name={item.icon} size={17} />
              <span>{item.label}</span>
              {activeNavigation === item.id && <span className="nav-active-mark" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="read-only-note">
            <span className="read-only-icon"><Icon name="lock" size={15} /></span>
            <div><strong>Read-only by design</strong><span>No keys, signatures or approvals. Address only.</span></div>
          </div>
          <p className="sidebar-disclaimer">Not investment advice. Market data can be delayed or unavailable.</p>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-breadcrumb"><span>Holder Guard</span><i>/</i><strong>Monitor</strong></div>
          <div className="topbar-right">
            <div className={`proxy-indicator ${proxyHealth?.ok ? "proxy-ok" : proxyHealth ? "proxy-offline" : ""}`}>
              <span className="pulse-dot" />
              <span>{proxyHealth?.ok ? "DATA PROXY ONLINE" : proxyHealth ? "PROXY OFFLINE" : "CHECKING PROXY"}</span>
            </div>
            <span className="topbar-separator" />
            <span className="topbar-chain"><span className="chain-hex">56</span>BSC MAINNET</span>
          </div>
        </header>

        <section className="hero" id="overview" ref={heroRef}>
          <div className="hero-media" aria-hidden="true">
            <img src={px(HERO_IMG, 2200)} srcSet={HERO_SRCSET} sizes="100vw" alt="" fetchPriority="high" />
            <div className="hero-duo" />
            <div className="hero-veil" />
          </div>

          <div className="hero-content">
            <div className="hero-copy">
              <motion.div
                className="hero-eyebrow"
                initial={reduced ? { opacity: 1 } : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.05 }}
              >
                <span className="eyebrow-hex" aria-hidden="true" />
                BNB SMART CHAIN / SPOT / READ-ONLY
              </motion.div>
              <HeadlineWords />
              <motion.p
                className="hero-sub"
                initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.66 }}
              >
                A read-only watchtower for bStocks, Ondo and xStocks holdings on BSC mainnet.
                Market windows, corporate actions and multiplier drift - tracked every two minutes,
                with a deterministic guard before any move.
              </motion.p>
              <motion.div
                className="freshness-line"
                initial={reduced ? { opacity: 1 } : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.8 }}
              >
                <span className={`freshness-dot ${lastUpdated ? "freshness-live" : ""}`} />
                <span>{lastUpdated ? `Live snapshot ${formatAge(lastUpdated, clockNow)}` : "No wallet snapshot yet"}</span>
                <span className="freshness-divider">/</span>
                <span>{catalogLoading ? "Loading RWA catalog" : `${catalog.length} BSC assets tracked`}</span>
                {simulatedEvent && <span className="simulated-chip"><span /> SIMULATED</span>}
              </motion.div>
            </div>

            <motion.div
              className="hero-side"
              initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
            >
              <form className="wallet-form" onSubmit={submitWallet}>
                <label htmlFor="wallet-address">Read-only wallet address</label>
                <div className="wallet-input-row">
                  <div className="wallet-input-wrap">
                    <Icon name="wallet" size={18} />
                    <input
                      id="wallet-address"
                      autoComplete="off"
                      spellCheck="false"
                      placeholder="0x... paste a BSC address"
                      value={addressInput}
                      onChange={(event) => setAddressInput(event.target.value)}
                    />
                    {walletAddress && <button className="input-clear" type="button" onClick={clearWallet} aria-label="Clear wallet"><Icon name="close" size={15} /></button>}
                  </div>
                  <Magnetic className="btn-primary" type="submit" disabled={catalogLoading || portfolioLoading}>
                    {portfolioLoading ? <span className="btn-spinner" /> : <Icon name="arrow" size={16} />}
                    <span>{walletAddress ? "Refresh" : "Load"}</span>
                  </Magnetic>
                </div>
                <div className="wallet-helper">
                  <span>{walletAddress ? `Monitoring ${formatShortAddress(walletAddress)}` : "Paste an address. No connection or signature needed."}</span>
                  <span>Address is used only for public, read-only balance calls.</span>
                </div>
              </form>

              <div className="hex-cluster" role="group" aria-label="Reference imagery">
                <figure className="hex-frame hex-lg">
                  <img src={px(CHART_IMG, 360)} srcSet={CHART_SRCSET} sizes="150px" loading="lazy" alt="Candlestick stock chart on a trading monitor screen" />
                  <figcaption className="visually-hidden">Stock chart screen</figcaption>
                </figure>
                <figure className="hex-frame hex-sm">
                  <img src={px(CLOCK_IMG, 360)} srcSet={CLOCK_SRCSET} sizes="112px" loading="lazy" alt="Desk calendar beside an alarm clock, standing in for market windows and earnings dates" />
                  <figcaption className="visually-hidden">Calendar and clock</figcaption>
                </figure>
              </div>
            </motion.div>
          </div>

          <div className="hero-scroll-cue" aria-hidden="true">
            <span className="cue-hex" />
            SCROLL TO MONITOR
          </div>
        </section>

        <div className="content-wrap">
          {(catalogError || portfolioError) && (
            <div className="error-banner" role="alert">
              <Icon name="alert" size={18} />
              <span>{portfolioError || catalogError}</span>
              {catalogError && <span className="error-helper">Start the local proxy to access Binance and BSC public data.</span>}
              <button className="error-retry" type="button" onClick={() => window.location.reload()}>Retry source</button>
            </div>
          )}

          <motion.section className="overview-metrics" aria-label="Portfolio summary" {...sectionMotion}>
            <motion.div className="metric-cell" variants={itemVariants}>
              <span className="metric-label">Tokenized exposure</span>
              <strong>{exposureReady ? <CountUp value={exposure} format={(v) => formatMoney(v)} /> : "N/A"}</strong>
              <small>{exposureReady ? "Using Binance per-token prices" : lastUpdated ? "A price is unavailable for one or more positions" : "Load an address to calculate"}</small>
            </motion.div>
            <motion.div className="metric-cell" variants={itemVariants}>
              <span className="metric-label">Positions held</span>
              <strong>{lastUpdated ? <CountUp value={positions.length} format={(v) => String(Math.round(v)).padStart(2, "0")} /> : "N/A"}</strong>
              <small>{lastUpdated ? "Non-zero ERC-20 balances" : "bStocks / Ondo / xStocks"}</small>
            </motion.div>
            <motion.div className="metric-cell" variants={itemVariants}>
              <span className="metric-label">Share equivalent</span>
              <strong>{sharesReady ? <CountUp value={representedShares} format={(v) => formatNumber(v, 4)} /> : "N/A"}</strong>
              <small>{sharesReady ? "Balance x live shares multiplier" : lastUpdated ? "A live multiplier is unavailable" : "Balance x live shares multiplier"}</small>
            </motion.div>
            <motion.div className="metric-source" variants={itemVariants}>
              <span className="source-rings" aria-hidden="true"><i /><i /><i /></span>
              <div>
                <strong>{lastUpdated ? "Synced from source" : "Awaiting first read"}</strong>
                <span>{lastUpdated ? new Date(lastUpdated).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Binance RWA / BSC RPC"}</span>
              </div>
            </motion.div>
          </motion.section>

          <div className="primary-grid">
            <motion.section className={`section-block holdings-card conic-card ${positions.length ? "conic-on" : ""}`} id="holdings" {...sectionMotion}>
              <motion.div className="section-heading" variants={itemVariants}>
                <div>
                  <div className="section-kicker">01 / Portfolio</div>
                  <h2>Holdings</h2>
                  <p>Live BSC balances with per-share reference pricing.</p>
                </div>
                <div className="section-actions">
                  {walletAddress && <span className="address-chip"><Icon name="lock" size={13} /> {formatShortAddress(walletAddress)}</span>}
                  <button className="icon-button" type="button" onClick={() => refreshPortfolio()} disabled={!walletAddress || portfolioLoading} aria-label="Refresh holdings">
                    <Icon name="refresh" size={16} />
                  </button>
                </div>
              </motion.div>

              {positions.length ? (
                <motion.div className="holdings-table-wrap" variants={itemVariants}>
                  <table className="holdings-table">
                    <thead><tr><th>Asset</th><th>Token balance</th><th className="col-shares">Share equiv.</th><th className="col-ref">Reference / share</th><th>Market</th></tr></thead>
                    <tbody>
                      {positions.map((position) => {
                        const state = resolveMarketState(position.status);
                        return (
                          <tr
                            key={assetKey(position)}
                            tabIndex={0}
                            aria-label={`Select ${position.symbol} for guard preview`}
                            onClick={() => selectAsset(assetKey(position))}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") selectAsset(assetKey(position));
                            }}
                            className={selectedAssetKey === assetKey(position) ? "selected-row" : ""}
                          >
                            <td>
                              <div className="asset-name-cell">
                                <div className="asset-avatar">{String(position.ticker || position.symbol || "?").slice(0, 1)}</div>
                                <div><strong>{position.ticker || position.symbol}</strong><span>{position.symbol} <i>/</i> {providerName(position.type)}</span></div>
                              </div>
                            </td>
                            <td><strong className="cell-primary">{formatNumber(position.quantity, 6)}</strong><span className="cell-secondary">{position.decimals} decimals / on-chain</span></td>
                            <td className="col-shares"><strong className="cell-primary">{formatNumber(position.shareEquivalent, 6)}</strong><span className="cell-secondary">multiplier {formatNumber(position.multiplier, 6)}</span></td>
                            <td className="col-ref"><strong className="cell-primary">{formatMoney(position.perSharePrice, 2)}</strong><span className="cell-secondary">token {formatMoney(position.tokenPrice, 2)} / multiplier</span></td>
                            <td><StatusPill state={state} pulse={pulseMap[assetKey(position)]} compact /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </motion.div>
              ) : (
                <motion.div className="empty-holdings" variants={itemVariants}>
                  <div className="empty-icon"><Icon name="wallet" size={22} /></div>
                  <div>
                    <strong>{portfolioLoading ? "Reading BSC token balances" : walletAddress ? "No listed stock tokens found" : "Your positions appear here"}</strong>
                    <p>{portfolioLoading ? "Checking listed ERC-20 balances with read-only eth_call." : walletAddress ? "This address has no non-zero balances in the current BSC RWA catalog." : "Paste a wallet address in the hero to scan bStocks, Ondo and xStocks."}</p>
                  </div>
                </motion.div>
              )}
              <motion.div className="table-footnote" variants={itemVariants}>
                <span>Price per share = token price / shares multiplier.</span>
                <span>Dynamic v2; list multiplier is fallback only.</span>
              </motion.div>
            </motion.section>

            <motion.section className="section-block radar-card conic-card" {...sectionMotion}>
              <motion.div className="section-heading" variants={itemVariants}>
                <div>
                  <div className="section-kicker">02 / Market window</div>
                  <h2>Status radar</h2>
                  <p>Asset-specific state and next transition.</p>
                </div>
                <div className="radar-count"><span className="pulse-dot" /> {radarRows.length} WATCHED</div>
              </motion.div>

              {radarRows.length ? (
                <motion.ul className="radar-list" layout={!reduced} variants={itemVariants}>
                  {radarRows.map((asset) => {
                    const status = asset.status || {};
                    const state = resolveMarketState(status);
                    const countdownTarget = getCountdown(status, state);
                    const key = assetKey(asset);
                    return (
                      <motion.li
                        layout={!reduced}
                        key={key}
                        tabIndex={0}
                        aria-label={`Select ${asset.ticker || asset.symbol} for guard preview`}
                        className={`radar-row ${asset.isSimulated ? "radar-simulated" : ""} ${selectedAssetKey === key ? "selected-row conic-card conic-on" : ""}`}
                        onClick={() => selectAsset(key)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") selectAsset(key);
                        }}
                      >
                        <div className="radar-asset">
                          <div className="radar-title-line">
                            <strong>{asset.ticker || asset.symbol}</strong>
                            {asset.isSimulated && <span className="mini-sim-label">SIMULATED</span>}
                          </div>
                          <span>{asset.symbol} <i>/</i> {asset.isScenarioOnly ? "Scenario only" : providerName(asset.type)}</span>
                          <small className="radar-reason">{status.reasonCode ? `${status.reasonCode} / ${humanizeReason(status.reasonCode, status.reasonMsg)}` : asset.marketDataError ? "Binance status unavailable" : "Waiting for status reason"}</small>
                        </div>
                        <div className="radar-state">
                          <StatusPill state={state} pulse={pulseMap[key]} />
                          <span className="countdown">{state === "open" ? "closes" : "opens"} {formatCountdown(countdownTarget, clockNow)}</span>
                        </div>
                      </motion.li>
                    );
                  })}
                </motion.ul>
              ) : (
                <motion.div className="radar-empty" variants={itemVariants}>
                  <div className="radar-empty-orbit" aria-hidden="true"><span /></div>
                  <strong>Radar is clear</strong>
                  <p>Load a wallet or replay a simulated corporate action to see an asset state.</p>
                </motion.div>
              )}
              <motion.div className="radar-legend" variants={itemVariants}>
                <span><i className="legend-open" />Open</span>
                <span><i className="legend-limited" />Limited</span>
                <span><i className="legend-paused" />Paused</span>
                <span><i className="legend-closed" />Closed</span>
              </motion.div>
            </motion.section>
          </div>

          <div className="secondary-grid">
            <motion.section className="section-block guard-section conic-card" id="guard" {...sectionMotion}>
              <motion.div className="section-heading" variants={itemVariants}>
                <div>
                  <div className="section-kicker">03 / Deterministic rules</div>
                  <h2>Guard</h2>
                  <p>Rules evaluate your preview intent. They never submit orders.</p>
                </div>
                <span className="engine-tag"><span aria-hidden="true" /> LOCAL ENGINE</span>
              </motion.div>

              <motion.div className="guard-rule-list" variants={itemVariants}>
                <label className="rule-row">
                  <input type="checkbox" checked={rules.noBuysBeforeEarnings} onChange={(event) => updateRule("noBuysBeforeEarnings", event.target.checked)} />
                  <span className="custom-check" />
                  <span className="rule-copy">Block buys before earnings</span>
                  <span className="rule-inline-control">within <input type="number" min="0" max="168" value={rules.hoursBeforeEarnings} disabled={!rules.noBuysBeforeEarnings} onChange={(event) => updateRule("hoursBeforeEarnings", Math.max(0, Math.min(168, Number(event.target.value))))} aria-label="Hours before earnings" /> h</span>
                </label>
                <label className="rule-row">
                  <input type="checkbox" checked={rules.warnOnSellsWhilePaused} onChange={(event) => updateRule("warnOnSellsWhilePaused", event.target.checked)} />
                  <span className="custom-check" />
                  <span className="rule-copy">Warn on sells while paused</span>
                  <span className="rule-state-note">WARN</span>
                </label>
                <label className="rule-row">
                  <input type="checkbox" checked={rules.blockBuysWhenUnavailable} onChange={(event) => updateRule("blockBuysWhenUnavailable", event.target.checked)} />
                  <span className="custom-check" />
                  <span className="rule-copy">Block buys unless market is open</span>
                  <span className="rule-state-note">BSC / SPOT</span>
                </label>
              </motion.div>

              <motion.form className="trade-preview" onSubmit={evaluateSelectedTrade} variants={itemVariants}>
                <div className="trade-form-heading"><span>Preview a trade intent</span><span>NO ORDER SUBMISSION</span></div>
                <div className="trade-controls">
                  <label className="visually-hidden" htmlFor="asset-select">Asset</label>
                  <select id="asset-select" value={selectedAsset ? assetKey(selectedAsset) : ""} onChange={(event) => selectAsset(event.target.value)} disabled={!radarRows.length}>
                    {!radarRows.length && <option value="">Load holdings or start replay</option>}
                    {radarRows.map((asset) => <option value={assetKey(asset)} key={assetKey(asset)}>{asset.ticker || asset.symbol}{asset.isSimulated ? " / simulated" : ""}</option>)}
                  </select>
                  <label className="visually-hidden" htmlFor="trade-amount">Token amount</label>
                  <input id="trade-amount" className="amount-input" type="number" min="0" step="any" value={tradeAmount} onChange={(event) => setTradeAmount(event.target.value)} />
                  <div className="action-segment" aria-label="Trade action">
                    <button type="button" className={tradeAction === "BUY" ? "action-active" : ""} onClick={() => setTradeAction("BUY")}>Buy</button>
                    <button type="button" className={tradeAction === "SELL" ? "action-active" : ""} onClick={() => setTradeAction("SELL")}>Sell</button>
                  </div>
                  <Magnetic className="btn-evaluate" type="submit" disabled={!selectedAsset}><span>Evaluate</span><Icon name="arrow" size={14} /></Magnetic>
                </div>
                <AnimatePresence mode="wait">
                  {lastVerdict ? (
                    <motion.div
                      key={lastVerdict.id}
                      className={`verdict-result verdict-${lastVerdict.result.verdict.toLowerCase()}`}
                      initial={reduced ? { opacity: 1 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
                      transition={{ duration: 0.28, ease: "easeOut" }}
                    >
                      <div className="verdict-stamp"><strong>{lastVerdict.result.verdict}</strong><span>{lastVerdict.inputs.action} / {lastVerdict.inputs.symbol}</span></div>
                      <div className="verdict-copy">
                        {lastVerdict.result.reasonCodes.map((code, index) => <p key={`${code}-${index}`}><code>{code}</code><span>{lastVerdict.result.reasons[index]}</span></p>)}
                      </div>
                      <time>{formatDate(lastVerdict.timestamp, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                    </motion.div>
                  ) : (
                    <motion.div key="verdict-empty" className="verdict-placeholder" initial={false} exit={reduced ? { opacity: 0 } : { opacity: 0 }}>
                      <Icon name="lock" size={14} />
                      <span>The verdict is a pure local function; Qwen cannot change it.</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.form>
            </motion.section>

            <motion.section className="section-block earnings-section conic-card" {...sectionMotion}>
              <motion.div className="section-heading" variants={itemVariants}>
                <div>
                  <div className="section-kicker">04 / Earnings overlay</div>
                  <h2>Coming up</h2>
                  <p>Calendar overlay for assets in this wallet.</p>
                </div>
                <div className="earnings-status">{proxyHealth?.earningsConfigured ? <><span className="provider-dot" />PROVIDER READY</> : <><span className="provider-dot provider-off" />OPTIONAL</>}</div>
              </motion.div>
              <LazyMount label="Loading earnings overlay">
                {positions.length ? (
                  <div className="earnings-list">
                    {positions.map((position) => {
                      const ticker = String(position.ticker || "").toUpperCase();
                      const response = earningsByTicker[ticker];
                      const upcoming = getUpcomingEarning(response, clockNow);
                      return (
                        <div className="earnings-row" key={`${ticker}-earnings`}>
                          <div className="earnings-ticker"><strong>{ticker}</strong><span>{position.symbol}</span></div>
                          <div className="earnings-date">
                            {upcoming
                              ? <><strong>{formatDate(upcoming.timestamp)}</strong><span>{upcoming.timing || (typeof upcoming.event === "string" ? upcoming.event : "Scheduled report")}</span></>
                              : <><strong>{response?.configured === false || proxyHealth?.earningsConfigured === false ? "Provider not configured" : response?.error ? "Calendar unavailable" : "No upcoming date returned"}</strong><span>{response ? "Checked via calendar proxy" : "Waiting for provider data"}</span></>}
                          </div>
                          <span className="earnings-arrow"><Icon name="arrow" size={15} /></span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="earnings-empty">
                    <div className="earnings-orbit" aria-hidden="true"><span /></div>
                    <strong>{proxyHealth?.earningsConfigured ? "No held assets to overlay" : "Calendar provider is pluggable"}</strong>
                    <p>{proxyHealth?.earningsConfigured ? "Upcoming reports appear here after a wallet scan." : "Add a provider URL and API key to the server environment. Its key never enters this browser."}</p>
                  </div>
                )}
                <div className="earnings-footnote">
                  <span>Events are provider-supplied and may change.</span>
                  <span>{upcomingCount ? `${upcomingCount} upcoming` : "No upcoming dates"}</span>
                </div>
              </LazyMount>
            </motion.section>
          </div>

          <motion.section className="section-block timeline-section" id="timeline" {...sectionMotion}>
            <motion.div className="section-heading timeline-heading" variants={itemVariants}>
              <div>
                <div className="section-kicker">05 / Observability</div>
                <h2>Event timeline</h2>
                <p>Reason-code and multiplier changes, polled every two minutes.</p>
              </div>
              <div className="timeline-actions">
                <span className="poll-frequency"><span className="pulse-dot" /> 2 MIN POLL</span>
                {simulatedEvent ? (
                  <button className="simulation-button simulation-active" type="button" onClick={endSimulation}><Icon name="close" size={15} /> End simulation</button>
                ) : (
                  <button className="simulation-button" type="button" onClick={replayCorporateAction}><Icon name="refresh" size={15} /> Replay stock split</button>
                )}
                <button className="quiet-button ghost-button" type="button" onClick={() => { writeLocal(STORAGE_KEYS.timeline, []); setTimeline([]); }}>Clear log</button>
              </div>
            </motion.div>

            <AnimatePresence>
              {simulatedEvent && (
                <motion.div
                  className="simulation-banner"
                  initial={reduced ? { opacity: 1 } : { opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <span className="simulation-tag">SIMULATED MODE</span>
                  <span>Stock split pause replay is active for {simulatedEvent.symbol}; live provider state is untouched.</span>
                  <strong>{formatCountdown(simulatedEvent.status.nextOpenTime, clockNow)}</strong>
                </motion.div>
              )}
            </AnimatePresence>

            <LazyMount label="Loading event timeline">
              {timeline.length ? (
                <div className="timeline-list">
                  {timeline.slice(0, 12).map((item) => (
                    <article className={`timeline-item timeline-${item.kind || "status"}`} key={item.id}>
                      <div className="timeline-marker" aria-hidden="true"><span /></div>
                      <div className="timeline-item-copy">
                        <div className="timeline-item-title"><strong>{item.title || "Market event"}</strong>{item.ticker && <span>{item.ticker}</span>}</div>
                        <p>{item.message}</p>
                      </div>
                      <div className="timeline-meta">
                        <time>{formatDate(item.timestamp, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                        <span>{item.source || "Source not recorded"}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="timeline-empty">
                  <span className="timeline-empty-line" aria-hidden="true" />
                  <div>
                    <strong>No changes recorded yet</strong>
                    <p>The first successful poll establishes a baseline. Changes to reasonCode, reasonMsg or the live multiplier are logged here with source and timestamp.</p>
                  </div>
                </div>
              )}
            </LazyMount>
          </motion.section>

          <motion.section className="decision-ledger-section view-reveal" {...sectionMotion}>
            <motion.div className="ledger-heading" variants={itemVariants}>
              <div>
                <div className="section-kicker">06 / Audit trail</div>
                <h2>Decision ledger</h2>
                <p>Every local guard verdict, with its exact inputs and rule snapshot.</p>
              </div>
              <div className="ledger-actions">
                <span>{ledger.length} saved {ledger.length === 1 ? "verdict" : "verdicts"}</span>
                <button className="ghost-button" type="button" onClick={exportLedger} disabled={!ledger.length}><Icon name="download" size={15} /> Export JSON</button>
              </div>
            </motion.div>
            <LazyMount label="Loading decision ledger">
              {ledger.length ? (
                <div className="ledger-table-wrap">
                  <table className="ledger-table">
                    <thead><tr><th>Timestamp</th><th>Intent</th><th>Asset</th><th>Verdict</th><th>Reason codes</th></tr></thead>
                    <tbody>
                      {ledger.slice(0, 5).map((entry) => (
                        <tr key={entry.id}>
                          <td>{formatDate(entry.timestamp, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                          <td>{entry.inputs.action} / {formatNumber(entry.inputs.amount, 6)} tokens</td>
                          <td>{entry.inputs.symbol || entry.inputs.ticker}</td>
                          <td><span className={`ledger-verdict ledger-${entry.result.verdict.toLowerCase()}`}>{entry.result.verdict}</span></td>
                          <td><code>{entry.result.reasonCodes.join(", ")}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="ledger-empty">A JSON record is added here whenever you evaluate a trade intent.</div>
              )}
            </LazyMount>
          </motion.section>

          <motion.section className="explainer-section view-reveal" id="explainer" {...sectionMotion}>
            <motion.div className="explainer-header" variants={itemVariants}>
              <div className="explainer-icon"><Icon name="spark" size={20} /></div>
              <div>
                <div className="section-kicker">07 / Qwen 3.8 Max</div>
                <h2>Make the feed make sense.</h2>
                <p>A plain-English layer over the current read-only snapshot.</p>
              </div>
              <span className="ai-readonly-tag"><Icon name="lock" size={13} /> EXPLAINS ONLY</span>
            </motion.div>
            <LazyMount label="Loading explainer">
              <motion.form className="explainer-form" onSubmit={askQwen} variants={itemVariants}>
                <label className="visually-hidden" htmlFor="holder-question">Question about your live data</label>
                <input id="holder-question" placeholder="Ask about a status, multiplier change or guard reason..." value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={800} />
                <Magnetic className="ask-button" type="submit" disabled={assistantBusy || !question.trim()}>
                  {assistantBusy ? <span className="btn-spinner" /> : <Icon name="arrow" size={16} />}
                  <span>{assistantBusy ? "Thinking" : "Ask Qwen"}</span>
                </Magnetic>
              </motion.form>
              <motion.div className="explainer-footnote" variants={itemVariants}>
                <span>{proxyHealth?.qwenConfigured ? "Server proxy configured / key stays server-side" : "Configure DASHSCOPE_API_KEY + QWEN_BASE_URL on the proxy to enable answers"}</span>
                <span>Cannot alter a guard verdict.</span>
              </motion.div>
              <AnimatePresence>
                {(assistantAnswer || assistantError) && (
                  <motion.div
                    key={assistantError ? "error" : "answer"}
                    className={`assistant-response ${assistantError ? "assistant-error" : ""}`}
                    role="status"
                    initial={reduced ? { opacity: 1 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                  >
                    <span className="assistant-response-mark"><Icon name={assistantError ? "alert" : "spark"} size={16} /></span>
                    <p>{assistantError || assistantAnswer}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </LazyMount>
          </motion.section>

          <footer className="page-footer">
            <div className="footer-main">
              <p className="footer-hack">Independent project built for BNB Hack: Tokenized Stocks Edition. Not affiliated with or endorsed by BNB Chain or Binance.</p>
              <p className="footer-credits">
                Photography: <a href="https://www.pexels.com/@enginakyurt" target="_blank" rel="noreferrer">Engin Akyurt</a> (hero),{" "}
                <a href="https://www.pexels.com/@alphatradezone" target="_blank" rel="noreferrer">AlphaTradeZone</a> (chart screen) and{" "}
                <a href="https://www.pexels.com/@fauzanfitria" target="_blank" rel="noreferrer">Fauzan Fitria</a> (calendar and clock), via Pexels.
              </p>
              <p className="footer-legal">
                Not investment advice / verify data with the original provider before acting.
                Data freshness: {lastUpdated ? `last snapshot ${formatAge(lastUpdated, clockNow)}` : "awaiting first read"} / read-only monitoring on BNB Smart Chain (chain 56).
              </p>
            </div>
            <div className="footer-mark" aria-hidden="true">
              <BrandHex size={30} />
              <span>HOLDER GUARD</span>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
