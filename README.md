# Holder Guard

A React + Vite, spot-only dashboard for monitoring tokenized US stock holdings on BNB Smart Chain mainnet (chain ID 56). Wallet access is by address only. The app never requests a private key, signature, approval or transaction.

Independent project built for BNB Hack: Tokenized Stocks Edition. Not affiliated with or endorsed by BNB Chain or Binance.

## Visual theme

Premium dark UI using BNB Chain's brand yellow `#F0B90B` (verified against official brand references, Pantone 7406 C) strictly for primary actions, links, focus rings and key highlights. Statuses are non-yellow (open = green, limited = orange, paused = red, closed = grey) and always pair an icon with a text label. The interface uses hexagon motifs (clipped avatars, badges and imagery - generic geometry, no BNB or Binance logos), Playfair Display headlines, Inter UI text and JetBrains Mono tabular numerals, a faint animated hex grid, scroll-driven progress, View Transitions on card selection, Framer Motion (`motion`) for layout/stagger/presence, Lenis smooth scrolling, and a full `prefers-reduced-motion` fallback. Hero and supporting photos are Pexels (Engin Akyurt, AlphaTradeZone, Fauzan Fitria), requested as WebP via the Pexels CDN with `srcset` and `loading="lazy"`.

## Run Locally

Start the small Node proxy in one terminal. It uses Node's built-in HTTP server and `fetch`, so no extra backend dependency is required.

```sh
node server.js
```

Start Vite in a second terminal:

```sh
npm run dev
```

The browser uses `/api` by default. During local development, Vite forwards `/api/*` requests to the local Node proxy on `http://127.0.0.1:8787`; on Vercel, the files in `api/` provide serverless endpoints on the same domain. To use a separately hosted API, set the public `VITE_API_BASE_URL` before building. The local proxy allows the standard Vite development origins by default.

For the optional Qwen and earnings features, export their server-only environment variables before `node server.js`:

```sh
export DASHSCOPE_API_KEY="..."
export QWEN_BASE_URL="https://your-workspace.region.maas.aliyuncs.com/compatible-mode/v1"
export EARNINGS_CALENDAR_URL="https://your-provider.example/calendar?ticker={ticker}"
export EARNINGS_API_KEY="..."
node server.js
```

## Deploy to Vercel

Import the GitHub repository into Vercel and keep the project Root Directory at the repository root. The included `vercel.json` sets the build command to `npm run build` and the output directory to `dist`. The `api/` directory contains Vercel serverless functions, so `server.js` is only needed for local development.

Optional Qwen and earnings features need the server-only environment variables listed below in Vercel Project Settings → Environment Variables. Do not set `VITE_API_BASE_URL` to `http://localhost:8787/api` on Vercel; leave it unset or set it to `/api`. After changing environment variables, redeploy.

## Server Environment

The Binance RWA and public BSC RPC proxy routes work without API credentials. Optional features are configured on the server process only:

- `DASHSCOPE_API_KEY`: Qwen API key. `QWEN_API_KEY` is also accepted as an alias.
- `QWEN_BASE_URL`: OpenAI-compatible Model Studio base URL for your region/workspace. The proxy appends `/chat/completions` if needed.
- `QWEN_MODEL`: defaults to `qwen3.8-max`.
- `EARNINGS_CALENDAR_URL` and `EARNINGS_API_KEY`: optional calendar provider. Include `{ticker}` in the URL, or the proxy appends a ticker query parameter (configurable with `EARNINGS_TICKER_PARAM`). The provider key is sent in the `Authorization: Bearer ...` header by default; configure `EARNINGS_API_KEY_HEADER` and `EARNINGS_API_KEY_PREFIX` for another provider convention.
- `BSC_RPC_URL`: optional public BSC JSON-RPC endpoint override. `PROXY_HOST` defaults to loopback (`127.0.0.1`) for local development.
- `ALLOWED_ORIGINS`: comma-separated frontend origins for CORS.

Do not put provider credentials in a `VITE_` variable. Vite variables are bundled into browser code. The Qwen route sends a bounded, read-only snapshot to Qwen 3.8 Max and returns text only; the deterministic guard runs locally and the model cannot change its verdict. The optional earnings route normalizes common top-level event arrays; event records should include a date field such as `date`, `earningsDate` or `reportDate`.

The local proxy is intended for local development. Before exposing it publicly, put it behind authentication and production rate limits, and configure `ALLOWED_ORIGINS` for the exact frontend origin.

## Data Behavior

- Binance public RWA calls are made server-side so the required `Accept-Encoding: identity` and `User-Agent: binance-web3/1.1 (Skill)` headers can be sent reliably. Each response is checked for `code: "000000"` and `success: true`.
- The wallet catalog is filtered to BSC contracts. The RPC chain ID is checked against 56 before reading ERC-20 `balanceOf` and `decimals` through public `eth_call`; no token decimals or shares multipliers are assumed.
- Per-share reference price is Binance dynamic token price divided by `tokenInfo.sharesMultiplier`. The token-list multiplier is only a disclosed fallback when dynamic data is unavailable.
- Status and multiplier history is retained in browser local storage and updated on a two-minute polling interval. Decision-ledger entries are also local and can be exported as JSON.
- "Replay stock split" is an explicitly labelled, synthetic five-minute corporate-action scenario. It never edits the live status or multiplier data.
- The earnings calendar is pluggable because no provider was specified. With no server-side provider configured, the UI labels the overlay as unavailable instead of inventing dates.

## Tests

The deterministic guard and multiplier-change detector use Node's built-in test runner:

```sh
node --test tests/*.test.mjs
```

No test or backend dependency is needed.