import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RULES, evaluateTradeIntent } from "../src/lib/guard.js";

const NOW = Date.parse("2026-07-18T12:00:00.000Z");

test("blocks a buy inside the configured earnings window", () => {
  const result = evaluateTradeIntent({
    action: "BUY",
    status: { state: "open" },
    earningsAt: NOW + 23 * 60 * 60 * 1000,
    now: NOW,
  }, DEFAULT_RULES);

  assert.equal(result.verdict, "BLOCK");
  assert.ok(result.reasonCodes.includes("EARNINGS_BLACKOUT"));
});

test("treats a date-only earnings event as active through that calendar day", () => {
  const dayStart = Date.parse("2026-07-18T00:00:00.000Z");
  const result = evaluateTradeIntent({
    action: "BUY",
    status: { state: "open" },
    earningsAt: "2026-07-18",
    now: dayStart + 12 * 60 * 60 * 1000,
  }, DEFAULT_RULES);

  assert.equal(result.verdict, "BLOCK");
  assert.ok(result.reasonCodes.includes("EARNINGS_BLACKOUT"));
});

test("allows an open-market buy outside the earnings window", () => {
  const result = evaluateTradeIntent({
    action: "BUY",
    status: { state: "open" },
    earningsAt: NOW + 30 * 60 * 60 * 1000,
    now: NOW,
  }, DEFAULT_RULES);

  assert.deepEqual(result, {
    verdict: "ALLOW",
    reasonCodes: ["RULES_CLEAR"],
    reasons: ["No configured guard rule was triggered."],
  });
});

test("warns on a sell while paused without blocking it", () => {
  const result = evaluateTradeIntent({ action: "SELL", status: { state: "paused" }, now: NOW }, DEFAULT_RULES);
  assert.equal(result.verdict, "WARN");
  assert.deepEqual(result.reasonCodes, ["SELL_WHILE_PAUSED"]);
});

test("blocks buys when the asset is not open", () => {
  const result = evaluateTradeIntent({ action: "BUY", status: { state: "limited" }, now: NOW }, DEFAULT_RULES);
  assert.equal(result.verdict, "BLOCK");
  assert.ok(result.reasonCodes.includes("MARKET_NOT_OPEN"));
});

test("repeats the same verdict for the same complete input", () => {
  const input = { action: "SELL", status: { state: "paused" }, now: NOW };
  assert.deepEqual(evaluateTradeIntent(input, DEFAULT_RULES), evaluateTradeIntent(input, DEFAULT_RULES));
});