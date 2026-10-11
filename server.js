import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.PROXY_HOST || "127.0.0.1";
const BINANCE_BASE = "https://www.binance.com/bapi/defi";
const BSC_RPC_URL = process.env.BSC_RPC_URL || "https://bsc-dataseed.bnbchain.org";
const ALLOWED_ORIGINS = new Set(
  String(process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8787")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const explainCalls = new Map();

const RWA_ENDPOINTS = Object.freeze({
  tokens: "/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai",
  status: "/v1/public/wallet-direct/buw/wallet/market/token/rwa/asset/market/status/ai",
  dynamic: "/v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai",
});

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function cors(request, response) {
  const origin = request.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readJson(request, maxBytes = 512_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("Request body is too large."), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

function checkBinanceResponse(payload) {
  if (payload?.code !== "000000" || payload?.success !== true) {
    throw new Error("The public RWA endpoint returned an unsuccessful response.");
  }
  return payload;
}

async function binanceGet(path, params = {}) {
  const url = new URL(`${BINANCE_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const upstream = await fetch(url, {
    headers: {
      "Accept-Encoding": "identity",
      "User-Agent": "binance-web3/1.1 (Skill)",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!upstream.ok) throw new Error(`Binance public data returned ${upstream.status}.`);
  return checkBinanceResponse(await upstream.json());
}

async function rpcRequest(body) {
  const upstream = await fetch(BSC_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(18_000),
  });
  if (!upstream.ok) throw new Error(`Public BSC RPC returned ${upstream.status}.`);
  return upstream.json();
}

async function callRpcIndividually(calls) {
  const output = new Array(calls.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < calls.length) {
      const index = nextIndex++;
      try {
        const result = await rpcRequest({
          jsonrpc: "2.0",
          id: index + 1,
          method: "eth_call",
          params: [{ to: calls[index].to, data: calls[index].data }, "latest"],
        });
        output[index] = result.error
          ? { error: { message: String(result.error.message || "RPC call failed") } }
          : { result: result.result || null };
      } catch (error) {
        output[index] = { error: { message: error.message || "RPC call failed" } };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, calls.length) }, worker));
  return output;
}

async function readRpcCalls(calls) {
  if (calls.length === 1) return callRpcIndividually(calls);
  const batch = calls.map((call, index) => ({
    jsonrpc: "2.0",
    id: index + 1,
    method: "eth_call",
    params: [{ to: call.to, data: call.data }, "latest"],
  }));
  try {
    const response = await rpcRequest(batch);
    if (!Array.isArray(response)) return callRpcIndividually(calls);
    const byId = new Map(response.map((item) => [item.id, item]));
    return calls.map((_, index) => {
      const item = byId.get(index + 1);
      if (!item) return { error: { message: "Missing RPC batch response." } };
      return item.error
        ? { error: { message: String(item.error.message || "RPC call failed") } }
        : { result: item.result || null };
    });
  } catch {
    return callRpcIndividually(calls);
  }
}

function checkExplainRate(request, response) {
  const key = request.socket.remoteAddress || "unknown";
  const now = Date.now();
  const current = explainCalls.get(key) || { start: now, count: 0 };
  if (now - current.start >= 60_000) {
    current.start = now;
    current.count = 0;
  }
  current.count += 1;
  explainCalls.set(key, current);
  if (current.count <= 12) return true;
  response.setHeader("Retry-After", "60");
  sendJson(response, 429, { error: "The explainer is limited to 12 questions per minute." });
  return false;
}

function cleanLiveData(input = {}) {
  const positions = Array.isArray(input.positions)
    ? input.positions.filter((item) => item && typeof item === "object").slice(0, 40)
    : [];
  const timeline = Array.isArray(input.timeline)
    ? input.timeline.filter((event) => event && typeof event === "object").slice(0, 12)
    : [];
  return {
    chainId: 56,
    sourceAt: String(input.sourceAt || "unknown").slice(0, 40),
    mode: ["LIVE", "SIMULATED", "LIVE_PLUS_SIMULATION", "NO_LIVE_DATA"].includes(input.mode) ? input.mode : "NO_LIVE_DATA",
    positions: positions.map((item) => ({
      ticker: String(item.ticker || "").slice(0, 16),
      symbol: String(item.symbol || "").slice(0, 32),
      balance: String(item.balance ?? "unknown").slice(0, 40),
      shareEquivalent: item.shareEquivalent ?? null,
      tokenPrice: item.tokenPrice ?? null,
      perSharePrice: item.perSharePrice ?? null,
      multiplier: item.multiplier ?? null,
      state: String(item.state || "unknown").slice(0, 16),
      reasonCode: String(item.reasonCode || "").slice(0, 48),
      reasonMsg: String(item.reasonMsg || "").slice(0, 120),
      nextOpenTime: item.nextOpenTime ?? null,
      nextCloseTime: item.nextCloseTime ?? null,
      source: String(item.source || "").slice(0, 48),
      earnings: item.earnings && typeof item.earnings === "object"
        ? { date: item.earnings.date ?? null, timing: String(item.earnings.timing || "").slice(0, 80) }
        : null,
    })),
    timeline: timeline.map((event) => ({
      kind: String(event.kind || "").slice(0, 20),
      title: String(event.title || "").slice(0, 80),
      ticker: String(event.ticker || "").slice(0, 16),
      symbol: String(event.symbol || "").slice(0, 32),
      message: String(event.message || "").slice(0, 240),
      source: String(event.source || "unknown").slice(0, 48),
      timestamp: String(event.timestamp || "unknown").slice(0, 40),
    })),
    verdict: input.verdict && typeof input.verdict === "object"
      ? {
          verdict: String(input.verdict.verdict || "").slice(0, 12),
          action: String(input.verdict.action || "").slice(0, 12),
          ticker: String(input.verdict.ticker || "").slice(0, 16),
          symbol: String(input.verdict.symbol || "").slice(0, 32),
          state: String(input.verdict.state || "unknown").slice(0, 16),
          simulated: Boolean(input.verdict.simulated),
          reasonCodes: Array.isArray(input.verdict.reasonCodes) ? input.verdict.reasonCodes.slice(0, 8).map((code) => String(code).slice(0, 64)) : [],
          reasons: Array.isArray(input.verdict.reasons) ? input.verdict.reasons.slice(0, 8).map((reason) => String(reason).slice(0, 160)) : [],
        }
      : null,
    simulatedScenario: input.simulatedScenario && typeof input.simulatedScenario === "object"
      ? {
          active: Boolean(input.simulatedScenario.active),
          ticker: String(input.simulatedScenario.ticker || "").slice(0, 16),
          symbol: String(input.simulatedScenario.symbol || "").slice(0, 32),
          reasonCode: String(input.simulatedScenario.reasonCode || "").slice(0, 48),
          reasonMsg: String(input.simulatedScenario.reasonMsg || "").slice(0, 120),
          nextOpenTime: input.simulatedScenario.nextOpenTime ?? null,
          source: "SIMULATION",
        }
      : null,
  };
}

function earningsEvents(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["events", "earnings", "results", "data", "upcoming"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  for (const key of ["events", "earnings", "results", "upcoming"]) {
    if (Array.isArray(payload?.data?.[key])) return payload.data[key];
  }
  return [];
}

async function handleEarnings(url, response) {
  const ticker = String(url.searchParams.get("ticker") || "").toUpperCase();
  if (!/^[A-Z0-9.-]{1,16}$/.test(ticker)) return sendJson(response, 400, { error: "A valid ticker is required." });
  const configuredUrl = process.env.EARNINGS_CALENDAR_URL;
  const apiKey = process.env.EARNINGS_API_KEY;
  if (!configuredUrl || !apiKey) return sendJson(response, 200, { configured: false, ticker, events: [] });

  try {
    const urlText = configuredUrl.includes("{ticker}")
      ? configuredUrl.replaceAll("{ticker}", encodeURIComponent(ticker))
      : configuredUrl;
    const providerUrl = new URL(urlText);
    if (!configuredUrl.includes("{ticker}")) {
      providerUrl.searchParams.set(process.env.EARNINGS_TICKER_PARAM || "ticker", ticker);
    }
    const headerName = process.env.EARNINGS_API_KEY_HEADER || "Authorization";
    const prefix = process.env.EARNINGS_API_KEY_PREFIX ?? "Bearer ";
    const upstream = await fetch(providerUrl, {
      headers: { Accept: "application/json", [headerName]: `${prefix}${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!upstream.ok) throw new Error(`Calendar provider returned ${upstream.status}.`);
    const payload = await upstream.json();
    return sendJson(response, 200, { configured: true, ticker, events: earningsEvents(payload) });
  } catch {
    return sendJson(response, 502, { configured: true, ticker, events: [], error: "Calendar provider request failed." });
  }
}

async function handleExplain(request, response) {
  if (!checkExplainRate(request, response)) return;
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY;
  const baseUrl = process.env.QWEN_BASE_URL;
  if (!apiKey || !baseUrl) {
    return sendJson(response, 503, { error: "Qwen proxy is not configured. Set DASHSCOPE_API_KEY and QWEN_BASE_URL on the server." });
  }

  try {
    const body = await readJson(request, 64_000);
    const question = String(body.question || "").trim().slice(0, 800);
    if (!question) return sendJson(response, 400, { error: "Ask a question about the current snapshot." });
    const snapshot = cleanLiveData(body.liveData || {});
    const endpoint = /\/chat\/completions\/?$/.test(baseUrl)
      ? baseUrl
      : `${baseUrl.replace(/\/$/, "")}/chat/completions`;
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.QWEN_MODEL || "qwen3.8-max",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "You are Holder Guard's plain-English market-data explainer. Use only facts in the supplied snapshot; distinguish LIVE from SIMULATED values. If the snapshot does not contain an answer, say that it is unavailable. Do not predict prices, recommend a trade, or claim to verify anything outside the snapshot. A supplied guard verdict is read-only: you may explain its reason codes but must never revise or override it. Answer in one concise paragraph. This is not investment advice.",
          },
          {
            role: "user",
            content: `Read-only snapshot: ${JSON.stringify(snapshot)}\n\nHolder question: ${question}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(35_000),
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return sendJson(response, 502, { error: "Qwen could not answer this request." });
    const answer = payload?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) return sendJson(response, 502, { error: "Qwen returned an empty answer." });
    return sendJson(response, 200, { answer: answer.trim(), model: process.env.QWEN_MODEL || "qwen3.8-max" });
  } catch (error) {
    return sendJson(response, error.status || 502, { error: error.status ? error.message : "The explainer request failed." });
  }
}

const server = createServer(async (request, response) => {
  cors(request, response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    return response.end();
  }

  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      return sendJson(response, 200, {
        ok: true,
        chainId: 56,
        qwenConfigured: Boolean((process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY) && process.env.QWEN_BASE_URL),
        earningsConfigured: Boolean(process.env.EARNINGS_CALENDAR_URL && process.env.EARNINGS_API_KEY),
      });
    }

    if (request.method === "GET" && url.pathname === "/api/rpc/chain") {
      const result = await rpcRequest({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] });
      if (result.error || !result.result) return sendJson(response, 502, { error: "The public RPC did not return a chain ID." });
      return sendJson(response, 200, { chainId: Number(BigInt(result.result)) });
    }

    if (request.method === "GET" && url.pathname === "/api/rwa/tokens") {
      return sendJson(response, 200, await binanceGet(RWA_ENDPOINTS.tokens));
    }

    if (request.method === "GET" && url.pathname === "/api/rwa/status") {
      const chainId = url.searchParams.get("chainId");
      const contractAddress = url.searchParams.get("contractAddress");
      if (chainId !== "56" || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress || "")) {
        return sendJson(response, 400, { error: "A BSC chainId and valid contractAddress are required." });
      }
      return sendJson(response, 200, await binanceGet(RWA_ENDPOINTS.status, { chainId, contractAddress }));
    }

    if (request.method === "GET" && url.pathname === "/api/rwa/dynamic") {
      const chainId = url.searchParams.get("chainId");
      const contractAddress = url.searchParams.get("contractAddress");
      if (chainId !== "56" || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress || "")) {
        return sendJson(response, 400, { error: "A BSC chainId and valid contractAddress are required." });
      }
      return sendJson(response, 200, await binanceGet(RWA_ENDPOINTS.dynamic, { chainId, contractAddress }));
    }

    if (request.method === "POST" && url.pathname === "/api/rpc") {
      const body = await readJson(request, 256_000);
      const calls = body.calls;
      if (!Array.isArray(calls) || calls.length > 100) return sendJson(response, 400, { error: "Provide up to 100 read-only eth_call operations." });
      if (calls.some((call) => !/^0x[a-fA-F0-9]{40}$/.test(call.to || "") || !/^0x[0-9a-fA-F]{8,2048}$/.test(call.data || ""))) {
        return sendJson(response, 400, { error: "Only valid ERC-20 eth_call data is accepted." });
      }
      const results = await readRpcCalls(calls);
      return sendJson(response, 200, { results });
    }

    if (request.method === "GET" && url.pathname === "/api/earnings") return handleEarnings(url, response);
    if (request.method === "POST" && url.pathname === "/api/explain") return handleExplain(request, response);
    return sendJson(response, 404, { error: "Endpoint not found." });
  } catch (error) {
    return sendJson(response, error.status || 502, { error: error.status ? error.message : error.message || "Upstream request failed." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Holder Guard read-only proxy listening on http://${HOST}:${PORT}`);
});