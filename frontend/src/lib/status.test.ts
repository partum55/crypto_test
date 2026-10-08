import { test } from "node:test";
import assert from "node:assert/strict";
import type { ProjectsResponse } from "./types.ts";
import { activeSteps, bottleneck, getPhase } from "./status.ts";

const res = (n: number, meta: Partial<ProjectsResponse["meta"]> = {}) =>
  ({ count: n, items: Array(n).fill({}), meta }) as ProjectsResponse;
const warm = { warming: true };
const fail = { warming: false };

test("phase: warm-up is not an error, real failures are", () => {
  assert.equal(getPhase(null, null), "loading");
  assert.equal(getPhase(null, warm), "warming");
  assert.equal(getPhase(null, fail), "error");
  assert.equal(getPhase(res(2), fail), "error");
});

test("phase: empty while refreshing is a scan in progress, not a final empty result", () => {
  assert.equal(getPhase(res(0, { refreshing: true }), null), "scanning");
  assert.equal(getPhase(res(3, { refreshing: true }), null), "refreshing");
  assert.equal(getPhase(res(0, { stale: true }), null), "stale");
  assert.equal(getPhase(res(0), null), "live");
});

const FUNNEL = [
  { key: "scanned", label: "Scanned", passed: 2747 },
  { key: "market_filters", label: "Market", passed: 691 },
  { key: "tvl", label: "TVL", passed: 108 },
  { key: "preview_listing", label: "Preview", passed: 0 },
];

test("bottleneck: first step that drops to 0, honouring the preview toggle", () => {
  assert.deepEqual(bottleneck(activeSteps(FUNNEL, true)), { before: FUNNEL[2], step: FUNNEL[3] });
  assert.equal(activeSteps(FUNNEL, false).length, 3);
  assert.equal(bottleneck(activeSteps(FUNNEL, false)), null);
  assert.equal(bottleneck(activeSteps(undefined, true)), null);
});
