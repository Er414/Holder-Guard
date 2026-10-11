import test from "node:test";
import assert from "node:assert/strict";
import { handleVercelApi } from "../lib/vercel-api.js";

 test("Vercel health endpoint exposes read-only service status", async () => {
  const response = await handleVercelApi(new Request("https://example.vercel.app/api/health"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.chainId, 56);
  assert.equal(typeof body.qwenConfigured, "boolean");
  assert.equal(typeof body.earningsConfigured, "boolean");
});

test("Vercel status endpoint validates BSC chain and contract before upstream access", async () => {
  const response = await handleVercelApi(new Request("https://example.vercel.app/api/rwa/status?chainId=1&contractAddress=invalid"));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /BSC chainId/);
});

test("unknown Vercel API routes return a JSON 404", async () => {
  const response = await handleVercelApi(new Request("https://example.vercel.app/api/not-a-route"));
  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /Endpoint not found/);
});

test("Vercel RPC endpoint rejects malformed JSON with a client error", async () => {
  const response = await handleVercelApi(new Request("https://example.vercel.app/api/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not-json}",
  }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /valid JSON/);
});
