import type { SortDir, SortKey } from "@/lib/types";

/** List view state that survives navigating to a coin and back, kept in the URL. */
export type ListState = {
  query: string;
  maxFdv: string;
  sortKey: SortKey;
  sortDir: SortDir;
  requirePreview: boolean;
};

export const DEFAULT_LIST_STATE: ListState = {
  query: "",
  maxFdv: "",
  sortKey: "market_cap",
  sortDir: "desc",
  requirePreview: true,
};

type Params = { get(key: string): string | null };

/** Unknown or invalid values fall back to the defaults. */
export function readListState(sp: Params): ListState {
  const sort = sp.get("sort");
  const dir = sp.get("dir");
  return {
    query: sp.get("q") ?? "",
    maxFdv: sp.get("fdv") ?? "",
    sortKey: sort === "total_volume" ? "total_volume" : "market_cap",
    sortDir: dir === "asc" ? "asc" : "desc",
    requirePreview: sp.get("preview") !== "ignore",
  };
}

/** Query string without defaults ("" when everything is default). */
export function listStateToQuery(s: ListState): string {
  const p = new URLSearchParams();
  if (s.query) p.set("q", s.query);
  if (s.maxFdv) p.set("fdv", s.maxFdv);
  if (s.sortKey !== DEFAULT_LIST_STATE.sortKey) p.set("sort", s.sortKey);
  if (s.sortDir !== DEFAULT_LIST_STATE.sortDir) p.set("dir", s.sortDir);
  if (!s.requirePreview) p.set("preview", "ignore");
  return p.toString();
}
