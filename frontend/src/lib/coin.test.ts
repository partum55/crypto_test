import { test } from "node:test";
import assert from "node:assert/strict";
import type { Project } from "./types.ts";
import { normalizeCoin } from "./coin.ts";

const project = { id: "x" } as Project;

test("coin detail: shipped backend shape (passes object, chart.volumes, meta.chart_error, null points)", () => {
  const d = normalizeCoin({
    project,
    passes: { market_cap: true, preview_listing: false },
    chart: { days: 7, prices: [[1, 2], [2, null], [3, 4]], volumes: [[1, 10], [3, null]] },
    meta: { chart_error: null },
  })!;
  assert.deepEqual(d.passes.map((r) => [r.key, r.passed]), [["market_cap", true], ["preview_listing", false]]);
  assert.equal(d.passes[1].label, "On CoinGecko's preview listing");
  assert.deepEqual(d.chart!.prices, [[1, 2], [3, 4]]);
  assert.deepEqual(d.chart!.total_volumes, [[1, 10]]);
});

test("coin detail: agreed shape passes through; chart null keeps its error; junk is rejected", () => {
  const passes = [{ key: "fdv", label: "FDV < $100M", passed: true }];
  const d = normalizeCoin({ project, passes, chart: null, chart_error: "CoinGecko 429" })!;
  assert.equal(d.passes, passes);
  assert.equal(d.chart, null);
  assert.equal(d.chart_error, "CoinGecko 429");
  assert.equal(normalizeCoin({ detail: "nope" } as never), null);
});
