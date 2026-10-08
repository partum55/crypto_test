import { formatCount } from "@/lib/format";
import type { FunnelStep, Meta } from "@/lib/types";

type Props = { meta: Meta | null; scanning: boolean; requirePreview: boolean };

// Placeholder rows until the first response; labels and thresholds only ever come from meta.funnel.
const SKELETON_STEPS = 4;

/** The screen as cumulative filter steps. Bar length is linear in the count, relative to the first step. */
export default function Funnel({ meta, scanning, requirePreview }: Props) {
  if (!meta) {
    return (
      <section aria-label="Screening steps" aria-busy="true" className="mt-8">
        <ol className="space-y-5">
          {Array.from({ length: SKELETON_STEPS }, (_, i) => (
            <li key={i} aria-hidden className={rowGrid}>
              <span className="mt-1 h-4 w-44 rounded bg-rule/60" />
              <span className="text-right text-xl font-semibold text-muted sm:order-last">—</span>
              <div className="col-span-2 sm:col-span-1 sm:pt-1.5">
                <Bar ratio={1} skeleton />
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  const total = meta.funnel[0]?.passed || 0;
  return (
    <section aria-label="Screening steps" className="mt-8">
      <ol className="space-y-5">
        {meta.funnel.map((step, i) => (
          <FunnelRow
            key={step.key}
            step={step}
            total={total}
            // While a scan runs, the last step isn't final yet.
            pending={scanning && i === meta.funnel.length - 1}
            skipped={step.key === "preview_listing" && !requirePreview}
          />
        ))}
      </ol>
    </section>
  );
}

const rowGrid = "grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 sm:grid-cols-[15rem_1fr_6rem]";

function FunnelRow({ step, total, pending, skipped }: { step: FunnelStep; total: number; pending: boolean; skipped: boolean }) {
  return (
    <li className={`${rowGrid} ${skipped ? "text-muted" : ""}`}>
      <div>
        <p className="font-medium">{step.label}</p>
        {skipped && <p className="text-sm">Ignored by your setting, so it doesn&apos;t limit the list</p>}
      </div>
      <p className="text-right text-xl font-semibold tabular-nums sm:order-last">
        {pending ? <span className="text-muted">—</span> : formatCount(step.passed)}
      </p>
      <div className="col-span-2 sm:col-span-1 sm:pt-1.5">
        {pending ? <Bar ratio={1} skeleton /> : <Bar ratio={total ? step.passed / total : 0} muted={skipped} />}
      </div>
    </li>
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
