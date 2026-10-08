"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError, fetchProjects } from "@/lib/api";
import { listStateToQuery, readListState } from "@/lib/listState";
import { filterByMaxFdv, filterByName, parseMaxFdv, sortProjects } from "@/lib/query";
import { getPhase } from "@/lib/status";
import type { ProjectsResponse, SortDir, SortKey } from "@/lib/types";
import Controls, { PreviewToggle } from "@/components/Controls";
import Funnel from "@/components/Funnel";
import ProjectsTable from "@/components/ProjectsTable";
import StatusBanner, { EmptyAfterFilters, EmptyFromBackend, StatusPill } from "@/components/StatusBanner";

const POLL_MS = 5_000;

export default function ProjectsView() {
  const [data, setData] = useState<ProjectsResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Search/sort/toggle start from the URL, so coming back from a coin page restores them.
  const searchParams = useSearchParams();
  const [initial] = useState(() => readListState(searchParams));
  const [query, setQuery] = useState(initial.query);
  const [maxFdv, setMaxFdv] = useState(initial.maxFdv);
  const [sortKey, setSortKey] = useState<SortKey>(initial.sortKey);
  const [sortDir, setSortDir] = useState<SortDir>(initial.sortDir);
  // Default true = the spec.
  const [requirePreview, setRequirePreview] = useState(initial.requirePreview);

  // Mirror the state into the URL without a navigation (Next keeps useSearchParams in sync).
  const listQuery = listStateToQuery({ query, maxFdv, sortKey, sortDir, requirePreview });
  useEffect(() => {
    const url = listQuery ? `?${listQuery}` : window.location.pathname;
    if (window.location.search !== (listQuery ? `?${listQuery}` : "")) window.history.replaceState(null, "", url);
  }, [listQuery]);

  // One fetch loop per mount/retry. Polls while the backend is refreshing or warming up (503 "warming").
  // Cleanup aborts the request and the pending timer, so StrictMode's double mount leaves one loop.
  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const res = await fetchProjects(ctrl.signal, requirePreview);
        setData(res);
        setError(null);
        if (res.meta.refreshing) timer = setTimeout(load, POLL_MS);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        const e = err instanceof ApiError ? err : new ApiError("Something went wrong while loading projects.");
        setError(e);
        if (e.warming) timer = setTimeout(load, POLL_MS);
      }
    };

    load();
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [reloadKey, requirePreview]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const fdvLimit = parseMaxFdv(maxFdv);
  const visible = useMemo(
    () => sortProjects(filterByMaxFdv(filterByName(items, query), fdvLimit), sortKey, sortDir),
    [items, query, fdvLimit, sortKey, sortDir],
  );

  const phase = getPhase(data, error);
  const meta = data?.meta ?? null;
  const settled = data !== null && phase !== "scanning";

  const retry = () => {
    setError(null);
    setReloadKey((k) => k + 1);
  };
  // A different result set: drop the old one so it is never shown under the wrong label.
  const changeRequirePreview = (v: boolean) => {
    setData(null);
    setError(null);
    setRequirePreview(v);
  };
  const clearFilters = () => {
    setQuery("");
    setMaxFdv("");
  };
  // Header click: same column flips direction, a new column starts high to low.
  const sortBy = (key: SortKey) => {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  let empty = null;
  if (phase === "error" && !data)
    empty = <p className="text-muted">No data yet. Projects appear here once the backend responds.</p>;
  else if (settled && items.length === 0) empty = (
      <EmptyFromBackend
        meta={data.meta}
        toggle={<PreviewToggle id="preview-empty" requirePreview={requirePreview} onChange={changeRequirePreview} />}
      />
    );
  else if (settled && visible.length === 0)
    empty = <EmptyAfterFilters total={items.length} query={query} fdvLimit={fdvLimit} onClear={clearFilters} />;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-14">
      <header>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.01em] sm:text-4xl">Low-cap crypto screen</h1>
          <StatusPill phase={phase} meta={meta} />
        </div>
        <p className="mt-3 max-w-[60ch] text-muted">
          Coins from CoinGecko that pass six strict filters, shown step by step below. Usually only a handful pass,
          and often none.
        </p>
      </header>

      <StatusBanner
        phase={phase}
        error={error}
        fetchedAt={data ? meta?.fetched_at : undefined}
        requirePreview={requirePreview}
        onRetry={retry}
      />

      <Funnel meta={meta} scanning={phase === "scanning"} requirePreview={requirePreview} />

      <Controls
        query={query}
        onQuery={setQuery}
        maxFdv={maxFdv}
        onMaxFdv={setMaxFdv}
        fdvLimit={fdvLimit}
        sortKey={sortKey}
        onSortKey={setSortKey}
        sortDir={sortDir}
        onSortDir={setSortDir}
        disabled={!settled || items.length === 0}
        shown={settled && items.length > 0 ? `${visible.length} of ${items.length} shown` : null}
        requirePreview={requirePreview}
        onRequirePreview={changeRequirePreview}
      />

      <ProjectsTable
        rows={settled ? visible : null}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={sortBy}
        detailHref={(id) => `/coins/${encodeURIComponent(id)}${listQuery ? `?${listQuery}` : ""}`}
        empty={empty}
      />
    </main>
  );
}
