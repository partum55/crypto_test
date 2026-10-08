import type { ReactNode } from "react";
import type { ApiError } from "@/lib/api";
import { formatCount, formatTime, formatUsdCompact } from "@/lib/format";
import { activeSteps, bottleneck, type Phase } from "@/lib/status";
import type { Meta } from "@/lib/types";

const button =
  "h-9 rounded-md bg-ink px-4 text-sm font-semibold text-paper hover:bg-accent active:translate-y-px";

/** Small status line next to the title. Colour follows meaning: amber in progress, red failure. */
export function StatusPill({ phase, meta }: { phase: Phase; meta: Meta | null }) {
  const fetchedAt = meta?.fetched_at;
  const progress = meta?.progress;
  const text: Record<Phase, string> = {
    loading: "Connecting to backend",
    warming: "Warming up",
    scanning: "Scanning",
    refreshing: progress
      ? `Refreshing, ${formatCount(progress.checked)} of ${formatCount(progress.total)} checked`
      : "Refreshing",
    stale: `Data may be outdated, from ${formatTime(fetchedAt)}`,
    live: `Updated ${formatTime(fetchedAt)}`,
    error: "Not updating",
  };
  const busy = phase === "warming" || phase === "scanning" || phase === "refreshing";
  return (
    <p
      role="status"
      className={`flex items-center gap-2 text-sm ${busy ? "text-signal" : phase === "error" ? "text-error" : "text-muted"}`}
    >
      {(busy || phase === "error" || phase === "loading") && (
        <span
          aria-hidden
          className={`size-2 rounded-full ${busy ? "bg-signal-dot motion-safe:animate-pulse" : phase === "error" ? "bg-error" : "bg-rule"}`}
        />
      )}
      {text[phase]}
    </p>
  );
}

type BannerProps = {
  phase: Phase;
  error: ApiError | null;
  fetchedAt?: string;
  requirePreview: boolean;
  onRetry: () => void;
};

/** Notices under the intro: neutral for warm-up/scan, red with Retry only for real failures. */
export default function StatusBanner({ phase, error, fetchedAt, requirePreview, onRetry }: BannerProps) {
  return (
    <>
      {!requirePreview && (
        <p className="mt-6 max-w-2xl border-l-4 border-ink bg-surface py-3 pr-4 pl-4">
          <strong className="font-semibold">Preview-listing requirement ignored.</strong> This list deviates from
          the spec: it shows coins that pass the other five filters.
        </p>
      )}
      {phase === "error" && error && (
        <div role="alert" className="mt-6 max-w-2xl border-l-4 border-error bg-surface py-3 pr-4 pl-4">
          <p className="font-semibold text-error">Can&apos;t load projects</p>
          <p className="mt-1">{error.message}</p>
          {fetchedAt && <p className="mt-1 text-sm text-muted">Showing data from {formatTime(fetchedAt)}.</p>}
          <button type="button" onClick={onRetry} className={`${button} mt-3`}>
            Retry
          </button>
        </div>
      )}
      {(phase === "warming" || phase === "scanning") && (
        <p className="mt-6 max-w-2xl border-l-4 border-signal-dot pl-4 text-ink">
          {phase === "warming"
            ? "The backend is warming up: its first scan of CoinGecko can take several minutes."
            : "The backend is scanning CoinGecko. Results appear when the scan finishes."}{" "}
          This page updates by itself.
        </p>
      )}
    </>
  );
}

/** The backend's final answer was 0 projects: show the funnel path and where it hit zero. */
export function EmptyFromBackend({ meta, toggle }: { meta: Meta; toggle: ReactNode }) {
  const requirePreview = meta.require_preview ?? true;
  const steps = activeSteps(meta.funnel, requirePreview);
  const cut = bottleneck(steps);

  return (
    <div role="status" className="max-w-[66ch]">
      <p className="text-lg font-semibold">
        {requirePreview
          ? "No coin passes all six filters right now."
          : "No coin passes the five filters that remain."}
      </p>
      {steps.length > 0 && (
        <ol aria-label="Coins left after each step" className="mt-3 space-y-1 border-l-2 border-rule pl-3 text-sm">
          {steps.map((s) => (
            <li key={s.key} className={`flex gap-3 ${s === cut?.step ? "font-semibold text-ink" : "text-muted"}`}>
              <span className="w-12 shrink-0 text-right tabular-nums">{formatCount(s.passed)}</span>
              <span>{s.label}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-muted">
        {cut
          ? `${formatCount(cut.before.passed)} coins make it through “${cut.before.label}”, and none of them passes “${cut.step.label}”.`
          : `Of ${formatCount(meta.after_prefilter)} coins that pass the market filters, none passes the remaining checks.`}{" "}
        {requirePreview &&
          "Preview listings are tokens that haven't launched yet, so they rarely have the trading volume and TVL the other filters ask for."}
      </p>
      {requirePreview && <div className="mt-4">{toggle}</div>}
      <p className="mt-4 text-sm text-muted">The screen runs again when the backend refreshes its data.</p>
    </div>
  );
}

type FilteredProps = { total: number; query: string; fdvLimit: number | null; onClear: () => void };

/** Projects exist, but the user's own search/FDV limit hides all of them. */
export function EmptyAfterFilters({ total, query, fdvLimit, onClear }: FilteredProps) {
  const parts = [
    query.trim() && `match “${query.trim()}”`,
    fdvLimit !== null && `have FDV under ${formatUsdCompact(fdvLimit)}`,
  ].filter(Boolean);
  return (
    <div role="status">
      <p className="text-lg font-semibold">
        None of the {total} projects {parts.join(" and ")}.
      </p>
      <button type="button" onClick={onClear} className={`${button} mt-3`}>
        Clear filters
      </button>
    </div>
  );
}
