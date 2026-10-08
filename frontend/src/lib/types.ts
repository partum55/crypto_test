// The API contract. Mirrors backend/app/schemas.py field for field; change both together.
// datetime fields arrive as ISO strings.

export type Project = {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  coingecko_url: string;
  // Always set for list items (they passed the filters); may be null on the detail
  // endpoint, which serves any scanned coin.
  current_price: number | null;
  market_cap: number | null;
  fully_diluted_valuation: number | null;
  total_volume: number | null;
  total_supply: number | null;
  max_supply: number | null;
  total_value_locked: number | null;
  /** null = details never checked (coin failed the market filters). */
  preview_listing: boolean | null;
};

/** The six criteria, in pipeline order (backend `RuleKey`). */
export type RuleKey = "market_cap" | "fdv" | "volume" | "supply" | "tvl" | "preview_listing";
export type FunnelKey = "scanned" | "market_filters" | "tvl" | "preview_listing";

export type FunnelStep = {
  key: FunnelKey;
  /** Built by the backend from its configured thresholds. */
  label: string;
  /** Coins remaining after this step (cumulative). */
  passed: number;
};

export type RuleCheck = {
  key: RuleKey;
  /** Built by the backend from its configured thresholds. */
  label: string;
  passed: boolean;
};

export type Meta = {
  scanned: number;
  pages_fetched: number;
  after_prefilter: number;
  preview_listed: number;
  tvl_above_min: number;
  /** Passed all six criteria (independent of require_preview). */
  after_details: number;
  details_fetched: number;
  detail_errors: number;
  fetched_at: string;
  age_seconds: number;
  /** Older than the backend's cache TTL. */
  stale: boolean;
  /** A background refresh is running. */
  refreshing: boolean;
  last_error: string | null;
  /** Echo of ?require_preview; false = the preview_listing rule was skipped. */
  require_preview: boolean;
  funnel: FunnelStep[];
};

/** GET /api/projects[?require_preview=false] */
export type ProjectsResponse = {
  count: number;
  items: Project[];
  meta: Meta;
};

export type StoredDetails = {
  preview_listing: boolean;
  tvl_usd: number | null;
  checked_at: string;
};

/** [unix ms, usd] pairs. Points with a null value are dropped by the backend. */
export type PriceChart = {
  days: number;
  prices: [number, number][];
  total_volumes: [number, number][];
};

export type CoinDetailMeta = {
  fetched_at: string;
  chart_cached: boolean;
};

/** GET /api/projects/{id}?days=1|7|30 */
export type CoinDetail = {
  project: Project;
  /** null if the coin was never checked via CoinGecko's /coins/{id}. */
  details: StoredDetails | null;
  /** All six criteria, in pipeline order. */
  passes: RuleCheck[];
  /** null when the chart couldn't be loaded; the reason is in chart_error. */
  chart: PriceChart | null;
  chart_error: string | null;
  meta: CoinDetailMeta;
};

export type SortKey = "market_cap" | "total_volume";
export type SortDir = "asc" | "desc";
