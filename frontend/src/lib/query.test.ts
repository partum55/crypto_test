// Run: npm test  (Node strips the TypeScript types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Project } from "./types.ts";
import { filterByMaxFdv, filterByName, parseMaxFdv, sortProjects } from "./query.ts";

const p = (id: string, name: string, symbol: string, mcap: number | null, vol: number | null, fdv: number | null) =>
  ({ id, name, symbol, market_cap: mcap, total_volume: vol, fully_diluted_valuation: fdv }) as Project;

const items = [
  p("eth", "Ethereum", "eth", 300, 30, 300),
  p("btc", "Bitcoin", "btc", 1000, 50, 1000),
  p("x", "Nulled", "nul", null, null, null),
];

test("search is trimmed, case-insensitive, partial, name or symbol", () => {
  assert.deepEqual(filterByName(items, "  ETH ").map((x) => x.id), ["eth"]);
  assert.deepEqual(filterByName(items, "coin").map((x) => x.id), ["btc"]);
  assert.deepEqual(filterByName(items, "nul").map((x) => x.id), ["x"]);
  assert.equal(filterByName(items, " ").length, 3);
});

test("max FDV: strict <, null FDV excluded, invalid input ignored", () => {
  assert.deepEqual(filterByMaxFdv(items, 1000).map((x) => x.id), ["eth"]);
  assert.equal(parseMaxFdv(""), null);
  assert.equal(parseMaxFdv("abc"), null);
  assert.equal(parseMaxFdv("-5"), null);
  assert.equal(parseMaxFdv("1,000,000"), 1_000_000);
  assert.equal(filterByMaxFdv(items, parseMaxFdv("abc")).length, 3);
});

test("max FDV accepts k/M/B shorthand, case-insensitive, with $ and commas", () => {
  assert.equal(parseMaxFdv("500k"), 500_000);
  assert.equal(parseMaxFdv("100M"), 100_000_000);
  assert.equal(parseMaxFdv("1.5b"), 1_500_000_000);
  assert.equal(parseMaxFdv(" $2.5 m "), 2_500_000);
  assert.equal(parseMaxFdv("1,500K"), 1_500_000);
  assert.equal(parseMaxFdv(".5M"), 500_000);
  for (const bad of ["1.5x", "M", "1e9", "1.2.3", "5MM", "-5k"]) assert.equal(parseMaxFdv(bad), null, bad);
});

test("sort copies, both directions, nulls last", () => {
  const before = items.map((x) => x.id);
  assert.deepEqual(sortProjects(items, "market_cap", "desc").map((x) => x.id), ["btc", "eth", "x"]);
  assert.deepEqual(sortProjects(items, "market_cap", "asc").map((x) => x.id), ["eth", "btc", "x"]);
  assert.deepEqual(sortProjects(items, "total_volume", "asc").map((x) => x.id), ["eth", "btc", "x"]);
  assert.deepEqual(items.map((x) => x.id), before);
});
