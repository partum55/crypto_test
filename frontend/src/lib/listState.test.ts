import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LIST_STATE, listStateToQuery, readListState } from "./listState.ts";

test("list state: defaults stay out of the URL, values round-trip, junk falls back", () => {
  assert.equal(listStateToQuery(DEFAULT_LIST_STATE), "");
  const s = { query: "eth coin", maxFdv: "50M", sortKey: "total_volume", sortDir: "asc", requirePreview: false } as const;
  assert.deepEqual(readListState(new URLSearchParams(listStateToQuery(s))), s);
  assert.deepEqual(readListState(new URLSearchParams("sort=price&dir=up&preview=yes")), DEFAULT_LIST_STATE);
});
