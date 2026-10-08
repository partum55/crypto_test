// Contract for GET /api/projects (agreed with the backend).
// Numeric fields are typed nullable so the UI never assumes a value is present.

export type Project = {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  current_price: number | null;
  market_cap: number | null;
  fully_diluted_valuation: number | null;
  total_volume: number | null;
  total_supply: number | null;
  max_supply: number | null;
  total_value_locked: number | null;
  preview_listing: boolean;
};

export type Meta = {
  scanned: number;
  pages_fetched: number;
  after_prefilter: number;
  after_details: number;
  cached?: boolean;
  fetched_at: string; // ISO datetime
  stale?: boolean;
  refreshing?: boolean;
};

export type ProjectsResponse = {
  count: number;
  items: Project[];
  meta: Meta;
};

export type SortKey = "market_cap" | "total_volume";
export type SortDir = "asc" | "desc";
