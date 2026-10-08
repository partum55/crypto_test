import type { CoinDetail, RuleCheck } from "@/lib/types";

// Labels for the object form of `passes` (the backend owns them in the array form).
const RULE_LABELS: Record<string, string> = {
  market_cap: "Market cap > 0",
  fdv: "FDV < $100M",
  volume: "24h volume > $50k",
  supply: "Max supply = total supply",
  tvl: "TVL > $50k",
  preview_listing: "On CoinGecko's preview listing",
};

type Series = [number, number | null][];
type Raw = {
  project?: CoinDetail["project"];
  passes?: RuleCheck[] | Record<string, boolean>;
  chart?: { days: number; prices: Series; volumes?: Series; total_volumes?: Series } | null;
  chart_error?: string | null;
  meta?: { chart_error?: string | null };
};

const clean = (s: Series | undefined): [number, number][] =>
  (s ?? []).filter((p): p is [number, number] => typeof p[1] === "number" && Number.isFinite(p[1]));

/**
 * Accepts both the agreed shape (passes as an ordered array, chart.total_volumes, top-level chart_error)
 * and the shape the backend shipped (passes as an object, chart.volumes, meta.chart_error).
 * Null price/volume points are dropped. Returns null when the body isn't a coin detail at all.
 */
export function normalizeCoin(body: Raw | null): CoinDetail | null {
  if (!body?.project || !body.passes || typeof body.passes !== "object") return null;
  const passes = Array.isArray(body.passes)
    ? body.passes
    : Object.entries(body.passes).map(([key, passed]) => ({ key, label: RULE_LABELS[key] ?? key, passed }));
  const c = body.chart;
  return {
    project: body.project,
    passes,
    chart: c ? { days: c.days, prices: clean(c.prices), total_volumes: clean(c.total_volumes ?? c.volumes) } : null,
    chart_error: body.chart_error ?? body.meta?.chart_error ?? null,
  };
}
