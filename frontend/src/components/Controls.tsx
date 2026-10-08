import { formatUsdFull } from "@/lib/format";
import type { SortDir, SortKey } from "@/lib/types";

type Props = {
  query: string;
  onQuery: (v: string) => void;
  maxFdv: string;
  onMaxFdv: (v: string) => void;
  fdvLimit: number | null;
  sortKey: SortKey;
  onSortKey: (v: SortKey) => void;
  sortDir: SortDir;
  onSortDir: (v: SortDir) => void;
  disabled: boolean;
  shown: string | null;
  requirePreview: boolean;
  onRequirePreview: (v: boolean) => void;
};

/** Opt-in deviation from the spec: ask the backend to skip only the preview_listing rule. */
export function PreviewToggle(p: { id: string; requirePreview: boolean; onChange: (requirePreview: boolean) => void }) {
  return (
    <label htmlFor={p.id} className="inline-flex cursor-pointer items-start gap-2">
      <input
        id={p.id}
        type="checkbox"
        checked={!p.requirePreview}
        onChange={(e) => p.onChange(!e.target.checked)}
        className="mt-1 size-4 shrink-0 accent-accent"
      />
      <span>Ignore preview-listing requirement (deviates from spec)</span>
    </label>
  );
}

const label = "mb-1 block text-sm font-medium text-muted";
const control =
  "h-10 rounded-md border border-line bg-surface px-3 text-ink placeholder:text-muted/80 disabled:cursor-not-allowed disabled:border-rule disabled:bg-paper disabled:text-muted";

export default function Controls(p: Props) {
  const fdvInvalid = p.maxFdv.trim() !== "" && p.fdvLimit === null;

  return (
    <form
      role="search"
      onSubmit={(e) => e.preventDefault()}
      className="mt-10 grid gap-4 border-t border-rule pt-6 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_15rem_auto]"
    >
      <div>
        <label htmlFor="q" className={label}>
          Search name or symbol
        </label>
        <input
          id="q"
          type="search"
          value={p.query}
          onChange={(e) => p.onQuery(e.target.value)}
          placeholder="e.g. eth"
          autoComplete="off"
          disabled={p.disabled}
          className={`${control} w-full`}
        />
      </div>

      <div>
        <label htmlFor="fdv" className={label}>
          Max FDV (USD)
        </label>
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
            $
          </span>
          <input
            id="fdv"
            inputMode="decimal"
            value={p.maxFdv}
            onChange={(e) => p.onMaxFdv(e.target.value)}
            placeholder="e.g. 50M"
            autoComplete="off"
            disabled={p.disabled}
            aria-invalid={fdvInvalid}
            aria-describedby="fdv-hint"
            className={`${control} w-full pl-7 tabular-nums ${fdvInvalid ? "border-error" : ""}`}
          />
        </div>
        <p id="fdv-hint" aria-live="polite" className={`mt-1 text-sm ${fdvInvalid ? "text-error" : "text-muted"}`}>
          {fdvInvalid
            ? "Use a number like 500k, 100M or 1.5B. Ignored for now."
            : p.fdvLimit !== null
              ? `Under ${formatUsdFull(p.fdvLimit)}`
              : "Shorthand works: 500k, 100M, 1.5B"}
        </p>
      </div>

      <fieldset className="sm:col-span-2 lg:col-span-1">
        <legend className={label}>Sort by</legend>
        <div className="flex gap-2">
          <select
            aria-label="Sort column"
            value={p.sortKey}
            onChange={(e) => p.onSortKey(e.target.value as SortKey)}
            disabled={p.disabled}
            className={`${control} min-w-0 flex-1 lg:w-36 lg:flex-none`}
          >
            <option value="market_cap">Market cap</option>
            <option value="total_volume">24h volume</option>
          </select>
          <select
            aria-label="Sort direction"
            value={p.sortDir}
            onChange={(e) => p.onSortDir(e.target.value as SortDir)}
            disabled={p.disabled}
            className={`${control} min-w-0 flex-1 lg:w-36 lg:flex-none`}
          >
            <option value="desc">High to low</option>
            <option value="asc">Low to high</option>
          </select>
        </div>
        {p.shown && (
          <p aria-live="polite" className="mt-1 text-sm text-muted tabular-nums">
            {p.shown}
          </p>
        )}
      </fieldset>

      <div className="sm:col-span-2 lg:col-span-3">
        <PreviewToggle id="preview-toolbar" requirePreview={p.requirePreview} onChange={p.onRequirePreview} />
      </div>
    </form>
  );
}
