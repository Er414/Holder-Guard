import test from "node:test";
import assert from "node:assert/strict";
import { detectMultiplierChange } from "../src/lib/market.js";

test("ignores equivalent multiplier strings", () => {
  assert.equal(detectMultiplierChange("1.0100", "1.01"), null);
});

test("detects a small increase consistent with reinvestment", () => {
  const change = detectMultiplierChange("1", "1.0008");
  assert.equal(change.direction, "rose");
  assert.ok(Math.abs(change.percentChange - 0.08) < 1e-10);
  assert.match(change.message, /rose 0.08%/);
  assert.match(change.message, /consistent with dividend reinvestment/);
});

test("detects a large change without labeling it as a dividend", () => {
  const change = detectMultiplierChange("1", "5");
  assert.equal(change.percentChange, 400);
  assert.match(change.message, /split or token adjustment/);
  assert.doesNotMatch(change.message, /dividend reinvestment/);
});

test("detects decreases and safely ignores invalid values", () => {
  assert.equal(detectMultiplierChange("2", "1").direction, "fell");
  assert.equal(detectMultiplierChange("unknown", "1"), null);
});