"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, fetchCoin } from "@/lib/api";
import { formatCompact, formatPrice, formatUsdCompact } from "@/lib/format";
import type { CoinDetail as Detail, Project } from "@/lib/types";
import PriceChart from "@/components/PriceChart";

const RANGES = [
  { days: 1, label: "1D" },
  { days: 7, label: "7D" },
  { days: 30, label: "30D" },
];
const POLL_MS = 5_000;

const button =
  "h-9 rounded-md bg-ink px-4 text-sm font-semibold text-paper hover:bg-accent active:translate-y-px";

export default function CoinDetail() {
  const { id } = useParams<{ id: string }>();
  // The detail URL carries the list's query string, so "back" restores search, sort and the preview toggle.
  const listQuery = useSearchParams().toString();
  const backHref = listQuery ? `/?${listQuery}` : "/";

  const [days, setDays] = useState(7);
  const [res, setRes] = useState<{ days: number; data: Detail } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Refetch on coin, range or retry. Keeps the previous data on screen while a new range loads.
  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const data = await fetchCoin(id, days, ctrl.signal);
        setRes({ days, data });
        setError(null);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        const e = err instanceof ApiError ? err : new ApiError("Something went wrong while loading this coin.");
        setError(e);
        if (e.warming) timer = setTimeout(load, POLL_MS);
      }
    };
    load();
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [id, days, reloadKey]);

  const retry = () => {
    setError(null);
    setReloadKey((k) => k + 1);
  };

  const back = (
    <Link href={backHref} className="inline-block rounded text-sm font-medium text-accent hover:underline">
      ← Back to the screen
    </Link>
  );

  let body;
  if (error?.status === 404) {
    body = (
      <div role="alert" className="mt-8 max-w-[62ch]">
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.01em]">Coin not found in the current scan</h1>
        <p className="mt-3 text-muted">
          “{id}” isn&apos;t among the coins in the backend&apos;s latest scan. It may have dropped out of the market
          filters since the list was loaded, or the link is wrong.
        </p>
      </div>
    );
  } else if (!res) {
    body = error ? <ErrorNotice error={error} onRetry={retry} /> : <DetailSkeleton />;
  } else {
    const { project, passes, chart, chart_error } = res.data;
    const failed = passes.filter((r) => !r.passed);
    body = (
      <>
        {error && <ErrorNotice error={error} onRetry={retry} />}
        <header className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          {project.image ? (
            // Static logo from CoinGecko's CDN (not an API call); next/image would need remotePatterns.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={project.image} alt="" width={40} height={40} className="size-10 rounded-full" />
          ) : (
            <span aria-hidden className="size-10 rounded-full bg-rule" />
          )}
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.01em] sm:text-4xl">{project.name}</h1>
          <span className="text-lg text-muted uppercase">{project.symbol}</span>
        </header>

        <Stats project={project} />

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
          <section aria-labelledby="criteria" className="lg:order-last">
            <h2 id="criteria" className="text-xl font-semibold">
              Criteria
            </h2>
            <p className="mt-2 text-muted">
              {failed.length === 0
                ? `Passes all ${passes.length} rules, so it's in the strict list.`
                : `Fails ${failed.length} of ${passes.length} rules, so it's not in the strict list.`}
            </p>
            <ul className="mt-4 divide-y divide-rule border-y border-rule">
              {passes.map((r) => (
                <li key={r.key} className="flex items-start gap-3 py-2.5">
                  <span
                    aria-hidden
                    className={`w-4 shrink-0 text-center font-bold ${r.passed ? "text-ink" : "text-error"}`}
                  >
                    {r.passed ? "✓" : "✗"}
                  </span>
                  <span className={r.passed ? "" : "font-semibold"}>
                    {r.label}
                    <span className="sr-only">{r.passed ? ": passes" : ": fails"}</span>
                  </span>
                  {!r.passed && <span className="ml-auto text-sm text-error">Fails</span>}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="price" className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="price" className="text-xl font-semibold">
                Price
              </h2>
              <div role="group" aria-label="Chart range" className="flex rounded-md border border-line bg-surface p-0.5">
                {RANGES.map((r) => (
                  <button
                    key={r.days}
                    type="button"
                    aria-pressed={days === r.days}
                    onClick={() => setDays(r.days)}
                    className={`h-8 min-w-12 rounded px-3 text-sm font-semibold ${days === r.days ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={`mt-4 transition-opacity ${res.days !== days ? "opacity-40" : ""}`} aria-busy={res.days !== days}>
              {chart ? (
                <PriceChart chart={chart} />
              ) : (
                <p className="flex h-56 items-center justify-center border border-dashed border-rule px-4 text-center text-muted sm:h-72">
                  Price chart unavailable{chart_error ? `: ${chart_error.replace(/[.\s]*$/, "")}.` : "."} The rest of this page
                  is current.
                </p>
              )}
            </div>
          </section>
        </div>
      </>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
      {back}
      {body}
    </main>
  );
}

function Stats({ project: p }: { project: Project }) {
  const stats = [
    ["Price", formatPrice(p.current_price)],
    ["Market cap", formatUsdCompact(p.market_cap)],
    ["FDV", formatUsdCompact(p.fully_diluted_valuation)],
    ["24h volume", formatUsdCompact(p.total_volume)],
    ["TVL", formatUsdCompact(p.total_value_locked)],
    ["Max supply", formatCompact(p.max_supply)],
    ["Total supply", formatCompact(p.total_supply)],
  ];
  return (
    <dl className="mt-6 grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-4 lg:grid-cols-7">
      {stats.map(([label, value]) => (
        // The 7th stat fills the row's leftover space in the 2- and 4-column layouts.
        <div key={label} className="bg-surface px-4 py-3 last:max-lg:col-span-2">
          <dt className="text-sm text-muted">{label}</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ErrorNotice({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  if (error.warming) {
    return (
      <p className="mt-6 max-w-2xl border-l-4 border-signal-dot pl-4">
        The backend is warming up: its first scan of CoinGecko can take several minutes. This page updates by
        itself.
      </p>
    );
  }
  return (
    <div role="alert" className="mt-6 max-w-2xl border-l-4 border-error bg-surface py-3 pr-4 pl-4">
      <p className="font-semibold text-error">Can&apos;t load this coin</p>
      <p className="mt-1">{error.message}</p>
      <button type="button" onClick={onRetry} className={`${button} mt-3`}>
        Retry
      </button>
    </div>
  );
}

/** Same footprint as the loaded page. Also the Suspense fallback, so it uses no hooks. */
export function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading coin">
      <div className="mt-6 flex items-center gap-4">
        <span className="size-10 rounded-full bg-rule/60" />
        <span className="h-8 w-56 rounded bg-rule/60" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="bg-surface px-4 py-3 last:max-lg:col-span-2">
            <span className="block h-3 w-16 rounded bg-rule/60" />
            <span className="mt-2 block h-5 w-20 rounded bg-rule/60" />
          </div>
        ))}
      </div>
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <div className="h-56 rounded bg-rule/40 sm:h-72 lg:order-first" />
        <div className="h-56 rounded bg-rule/40" />
      </div>
    </div>
  );
}

/** Suspense fallback for the route: back link and skeleton, no hooks. */
export function CoinDetailFallback() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
      <span className="text-sm text-muted">Loading…</span>
      <DetailSkeleton />
    </main>
  );
}
