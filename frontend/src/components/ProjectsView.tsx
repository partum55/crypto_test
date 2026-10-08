"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError, fetchProjects } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { filterByMaxFdv, filterByName, parseMaxFdv, sortProjects } from "@/lib/query";
import type { ProjectsResponse, SortDir, SortKey } from "@/lib/types";
import Controls from "@/components/Controls";
import ProjectsTable from "@/components/ProjectsTable";
import StatusBanner from "@/components/StatusBanner";

const POLL_MS = 5_000;

export default function ProjectsView() {
  const [data, setData] = useState<ProjectsResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [query, setQuery] = useState("");
  const [maxFdv, setMaxFdv] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("market_cap");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // One fetch loop per mount/retry. Polls while the backend is refreshing or warming up (503).
  // Cleanup aborts the request and the pending timer, so StrictMode's double mount leaves one loop.
  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const res = await fetchProjects(ctrl.signal);
        setData(res);
        setError(null);
        if (res.meta.refreshing) timer = setTimeout(load, POLL_MS);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        const e = err instanceof ApiError ? err : new ApiError("Something went wrong while loading projects.");
        setError(e);
        if (e.status === 503) timer = setTimeout(load, POLL_MS);
      }
    };

    load();
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [reloadKey]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const fdvLimit = parseMaxFdv(maxFdv);
  const visible = useMemo(
    () => sortProjects(filterByMaxFdv(filterByName(items, query), fdvLimit), sortKey, sortDir),
    [items, query, fdvLimit, sortKey, sortDir],
  );

  const retry = () => {
    setError(null);
    setReloadKey((k) => k + 1);
  };
  const clearFilters = () => {
    setQuery("");
    setMaxFdv("");
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Crypto projects</h1>
        {data && (
          <p className="text-sm text-muted">
            {visible.length} of {items.length} shown, updated {formatTime(data.meta.fetched_at)}
          </p>
        )}
      </header>

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
      />

      <StatusBanner
        data={data}
        error={error}
        visibleCount={visible.length}
        onRetry={retry}
        onClearFilters={clearFilters}
      />

      {visible.length > 0 && <ProjectsTable items={visible} sortKey={sortKey} sortDir={sortDir} />}
    </main>
  );
}
