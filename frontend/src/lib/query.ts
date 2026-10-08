import type { Project, SortDir, SortKey } from "@/lib/types";

/** Trimmed, case-insensitive substring match on name or symbol. */
export function filterByName(items: Project[], query: string): Project[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (p) => p.name.toLowerCase().includes(q) || p.symbol.toLowerCase().includes(q),
  );
}

/** USD amount from user input; null (= no filter) for empty, invalid or negative input. */
export function parseMaxFdv(input: string): number | null {
  const s = input.replace(/[,\s_]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Keeps projects with FDV strictly below max. Null FDV is excluded while the filter is active. */
export function filterByMaxFdv(items: Project[], max: number | null): Project[] {
  if (max === null) return items;
  return items.filter((p) => p.fully_diluted_valuation != null && p.fully_diluted_valuation < max);
}

/** Sorted copy; nulls go last in both directions. */
export function sortProjects(items: Project[], key: SortKey, dir: SortDir): Project[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x == null) return y == null ? 0 : 1;
    if (y == null) return -1;
    return (x - y) * sign;
  });
}
