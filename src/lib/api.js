import { formatUnits, numericValue } from "./market.js";

const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function assertBinanceSuccess(payload) {
  if (payload?.code !== "000000" || payload?.success !== true) {
    throw new Error(payload?.message || "Binance RWA data did not return a successful response.");
  }
  return payload.data;
}

export async function fetchProxyHealth() {
  return request("/health");
}

export async function fetchTokenCatalog() {
  const data = assertBinanceSuccess(await request("/rwa/tokens"));
  const tokens = Array.isArray(data) ? data : [];
  const seen = new Set();
  return tokens.filter((token) => {
    const address = String(token.contractAddress || "");
    const key = address.toLowerCase();
    if (String(token.chainId) !== "56" || !/^0x[a-fA-F0-9]{40}$/.test(address) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tokenQuery(token) {
  const query = new URLSearchParams({
    chainId: "56",
    contractAddress: token.contractAddress,
  });
  return query.toString();
}

export async function fetchAssetStatus(token) {
  return assertBinanceSuccess(await request(`/rwa/status?${tokenQuery(token)}`));
}

export async function fetchDynamicData(token) {
  return assertBinanceSuccess(await request(`/rwa/dynamic?${tokenQuery(token)}`));
}

export async function fetchEarnings(ticker) {
  return request(`/earnings?ticker=${encodeURIComponent(ticker)}`);
}

export async function askExplainer(payload) {
  return request("/explain", { method: "POST", body: JSON.stringify(payload) });
}

function chunk(values, size) {
  const groups = [];
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size));
  return groups;
}

function balanceOfCall(owner) {
  return `0x70a08231${owner.slice(2).toLowerCase().padStart(64, "0")}`;
}

export async function readBscTokenBalances(owner, tokens) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(owner)) throw new Error("Enter a valid 42-character BSC address.");
  const network = await request("/rpc/chain");
  if (network.chainId !== 56) throw new Error(`BSC RPC is on chain ${network.chainId ?? "unknown"}; Holder Guard requires mainnet chain 56.`);
  const operations = tokens.flatMap((token, index) => [
    { index, kind: "balance", to: token.contractAddress, data: balanceOfCall(owner) },
    { index, kind: "decimals", to: token.contractAddress, data: "0x313ce567" },
  ]);
  const results = [];

  for (const group of chunk(operations, 80)) {
    const response = await request("/rpc", { method: "POST", body: JSON.stringify({ calls: group }) });
    if (!Array.isArray(response.results) || response.results.length !== group.length) {
      throw new Error("The BSC RPC proxy returned an unexpected response.");
    }
    results.push(...response.results);
  }

  let failedReads = 0;
  const byToken = tokens.map((token, index) => {
    const balanceResult = results[index * 2];
    const decimalsResult = results[index * 2 + 1];
    if (balanceResult?.error || decimalsResult?.error || !balanceResult?.result || !decimalsResult?.result) {
      failedReads += 1;
      return null;
    }
    try {
      const rawBalance = BigInt(balanceResult.result);
      const decimals = Number(BigInt(decimalsResult.result));
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
        failedReads += 1;
        return null;
      }
      const balance = formatUnits(rawBalance, decimals);
      const quantity = numericValue(balance);
      if (rawBalance <= 0n) return null;
      if (quantity === null) {
        failedReads += 1;
        return null;
      }
      return { ...token, balance, quantity, decimals };
    } catch {
      failedReads += 1;
      return null;
    }
  });

  if (tokens.length && failedReads === tokens.length) throw new Error("The public BSC RPC could not decode any listed token balances.");
  return byToken.filter(Boolean);
}
