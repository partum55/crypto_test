import type { ApiError } from "@/lib/api";
import type { ProjectsResponse } from "@/lib/types";

type Props = {
  data: ProjectsResponse | null;
  error: ApiError | null;
  visibleCount: number;
  onRetry: () => void;
  onClearFilters: () => void;
};

const button =
  "mt-3 rounded border-2 border-ink px-3 py-1 text-sm font-semibold hover:bg-ink hover:text-paper";

export default function StatusBanner({ data, error, visibleCount, onRetry, onClearFilters }: Props) {
  const meta = data?.meta;

  return (
    <div className="mt-6 max-w-2xl space-y-3 empty:hidden">
      {error && (
        <div role="alert" className="border-l-4 border-error pl-4">
          <p className="font-semibold text-error">Could not load projects.</p>
          <p>{error.message}</p>
          {error.status === 503 && <p className="text-sm text-muted">Retrying automatically every 5 s.</p>}
          {data && <p className="text-sm text-muted">Showing the last loaded data.</p>}
          <button type="button" onClick={onRetry} className={button}>
            Retry
          </button>
        </div>
      )}

      {!data && !error && (
        <p role="status" className="text-muted">
          <Dot /> Loading projects. The first load can take a minute while the backend scans the market.
        </p>
      )}

      {meta && (meta.refreshing || meta.stale) && (
        <p role="status" className="text-sm text-muted">
          <Dot />{" "}
          {meta.refreshing
            ? "The backend is refreshing data. This list updates automatically."
            : "This data may be outdated. A refresh will start on the next request."}
        </p>
      )}

      {data && data.items.length === 0 && (
        <div role="status">
          <p className="font-semibold">0 projects matched all criteria.</p>
          <p className="text-muted">
            Scanned {meta?.scanned ?? "?"} coins; {meta?.after_prefilter ?? "?"} passed the market filters and{" "}
            {meta?.after_details ?? "?"} passed the listing and TVL checks. The criteria are strict, so an empty
            list is a valid result.
          </p>
        </div>
      )}

      {data && data.items.length > 0 && visibleCount === 0 && (
        <div role="status">
          <p className="font-semibold">No project matches your search and FDV limit.</p>
          <p className="text-muted">{data.items.length} projects are loaded; your filters hide all of them.</p>
          <button type="button" onClick={onClearFilters} className={button}>
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      className="mr-1 inline-block size-2 rounded-full bg-signal align-middle motion-safe:animate-pulse"
    />
  );
}
