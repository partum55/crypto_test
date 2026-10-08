import { formatCount } from "@/lib/format";
import { PREVIEW_KEY } from "@/lib/status";
import type { Meta } from "@/lib/types";

type Props = { meta: Meta | null; scanning: boolean; requirePreview: boolean };
type Row = { key: string; label: string; note?: string; value: number | null };

// Placeholder rows while nothing is loaded, and the fallback when the backend sends no meta.funnel.
const SKELETON: Row[] = [
  { key: "scanned", label: "Scanned on CoinGecko markets", value: null },
  {
    key: "market_filters",
    label: "Pass market filters",
    note: "Market cap above 0, FDV under $100M, 24h volume over $50k, max supply equal to total supply",
    value: null,
  },
  { key: "tvl", label: "TVL over $50k", value: null },
  { key: PREVIEW_KEY, label: "On CoinGecko's preview listing", value: null },
];

function rowsFor(meta: Meta | null): Row[] {
  if (!meta) return SKELETON;
  if (meta.funnel?.length) return meta.funnel.map((s) => ({ key: s.key, label: s.label, value: s.passed }));
  return [
    { ...SKELETON[0], value: meta.scanned },
    { ...SKELETON[1], value: meta.after_prefilter },
    { key: "details", label: "Pass TVL and preview listing", value: meta.after_details },
  ];
}

/** The screen as cumulative filter steps. Bar length is linear in the count, relative to the first step. */
export default function Funnel({ meta, scanning, requirePreview }: Props) {
  const rows = rowsFor(meta);
  const total = rows[0].value || 0;
  const progress = scanning ? meta?.progress : undefined;

  return (
    <section aria-label="Screening steps" className="mt-8">
      <ol className="space-y-5">
        {rows.map((row, i) => {
          const last = i === rows.length - 1;
          const skipped = row.key === PREVIEW_KEY && !requirePreview;
          // While a scan runs, the last step isn't final yet: show progress instead of a count.
          const pending = row.value === null || (last && scanning);
          return (
            <li
              key={row.key}
              className={`grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 sm:grid-cols-[15rem_1fr_6rem] ${skipped ? "text-muted" : ""}`}
            >
              <div>
                <p className="font-medium">{row.label}</p>
                {skipped && <p className="text-sm">Ignored by your setting, so it doesn&apos;t limit the list</p>}
                {row.note && <p className="text-sm text-muted">{row.note}</p>}
              </div>
              <p className="text-right text-xl font-semibold tabular-nums sm:order-last">
                {pending ? <span className="text-muted">—</span> : formatCount(row.value)}
              </p>
              <div className="col-span-2 sm:col-span-1 sm:pt-1.5">
                {pending ? (
                  last && progress ? <Progress {...progress} /> : <Bar ratio={1} skeleton />
                ) : (
                  <Bar ratio={total ? (row.value ?? 0) / total : 0} muted={skipped} />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Bar({ ratio, skeleton, muted }: { ratio: number; skeleton?: boolean; muted?: boolean }) {
  const pct = Math.min(1, Math.max(0, ratio)) * 100;
  const fill = muted ? "bg-line" : "bg-ink";
  return (
    <div aria-hidden className="h-3 w-full">
      {skeleton ? (
        <div className="h-full w-full rounded-r bg-rule/60" />
      ) : pct > 0 ? (
        <div className={`h-full min-w-1 rounded-r ${fill}`} style={{ width: `${pct}%` }} />
      ) : (
        // Zero: a baseline tick, so "nothing passed" is visible rather than a missing bar.
        <div className={`h-full w-0.5 ${fill}`} />
      )}
    </div>
  );
}

function Progress({ checked, total }: { checked: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (checked / total) * 100) : 0;
  return (
    <div>
      <div
        role="progressbar"
        aria-label="Candidates checked"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={checked}
        className="h-3 w-full rounded-r bg-rule/60"
      >
        <div className="h-full rounded-r bg-signal transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-sm text-signal tabular-nums">
        Checked {formatCount(checked)} of {formatCount(total)} candidates
      </p>
    </div>
  );
}
