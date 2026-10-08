import { test } from "node:test";
import assert from "node:assert/strict";
import { geometry, nearestIndex, type Point } from "./chart.ts";

const pts: Point[] = [[0, 5], [10, 2], [20, 9], [30, 4]];

test("chart geometry: min/max points, edges in percent, flat or short series", () => {
  const g = geometry(pts)!;
  assert.equal(g.minIdx, 1);
  assert.equal(g.maxIdx, 2);
  assert.equal(g.at(0).x, 0);
  assert.equal(g.at(3).x, 100);
  assert.ok(g.at(2).y > 0 && g.at(2).y < g.at(1).y, "max is above min and inside the box");
  assert.ok(g.area.endsWith("Z"));
  assert.ok(geometry([[0, 1], [1, 1]]), "flat series still draws");
  assert.equal(geometry([[0, 1]]), null);
});

test("nearest index by time, clamped", () => {
  assert.equal(nearestIndex(pts, 0), 0);
  assert.equal(nearestIndex(pts, 0.4), 1);
  assert.equal(nearestIndex(pts, 2), 3);
  assert.equal(nearestIndex([], 0.5), -1);
});
