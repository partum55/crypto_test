"use client";

import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { geometry, H, nearestIndex, W } from "@/lib/chart";
import { formatChartDate, formatPrice, formatUsdCompact } from "@/lib/format";
import type { PriceChart as Chart } from "@/lib/types";

type Label = { i: number; text: string; below: boolean };

/** Line + area price chart in inline SVG; labels, hover and tooltip are HTML positioned in percent. */
export default function PriceChart({ chart }: { chart: Chart }) {
  const points = chart.prices;
  const geo = useMemo(() => geometry(points), [points]);
  const [active, setActive] = useState<number | null>(null);

  if (!geo) return <p className="text-muted">Not enough price data for this range.</p>;

  const last = points.length - 1;
  // High above its point, low below it: they can't collide. Last sits in the header, so it never overlaps them.
  const labels = mergeLabels([
    { i: geo.maxIdx, text: "High", below: false },
    { i: geo.minIdx, text: "Low", below: true },
  ]);
  const first = points[0][1];
  const change = first ? ((points[last][1] - first) / first) * 100 : null;
  const lastAt = geo.at(last);
  const summary = `Price over ${chart.days} day${chart.days > 1 ? "s" : ""}: low ${formatPrice(points[geo.minIdx][1])}, high ${formatPrice(points[geo.maxIdx][1])}, last ${formatPrice(points[last][1])}.`;

  const onPointer = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setActive(nearestIndex(points, (e.clientX - box.left) / box.width));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (step) setActive((a) => Math.min(last, Math.max(0, (a ?? last) + step)));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else return;
    e.preventDefault();
  };

  const hover = active !== null ? geo.at(active) : null;

  return (
    <figure>
      <p className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm text-muted">Last</span>
        <span className="text-2xl font-semibold tabular-nums">{formatPrice(points[last][1])}</span>
        {change !== null && (
          <span className="text-sm text-muted tabular-nums">
            {change >= 0 ? "+" : "−"}
            {Math.abs(change).toFixed(1)}% over {chart.days}D
          </span>
        )}
      </p>
      <div
        tabIndex={0}
        role="group"
        aria-label={`${summary} Use the arrow keys to read individual prices.`}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        // A touch ends with pointerleave; keep the tapped point until the chart loses focus.
        onPointerLeave={(e) => e.pointerType !== "touch" && setActive(null)}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        className="relative h-56 touch-pan-y select-none sm:h-72"
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full">
          <path d={geo.area} className="fill-ink/[0.07]" />
          <path d={geo.line} fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" className="stroke-ink" />
        </svg>

        {hover === null && <Dot x={lastAt.x} y={lastAt.y} />}
        {hover === null &&
          labels.map((l) => {
            const p = geo.at(l.i);
            return (
              <div key={l.i} aria-hidden>
                <Dot x={p.x} y={p.y} />
                <span
                  className="absolute rounded bg-paper/90 px-1 text-xs whitespace-nowrap text-ink tabular-nums"
                  style={{
                    left: `${p.x}%`,
                    top: `${p.y}%`,
                    transform: `translate(${p.x > 85 ? "-100%" : p.x < 15 ? "0" : "-50%"}, ${l.below ? "8px" : "calc(-100% - 8px)"})`,
                  }}
                >
                  <span className="text-muted">{l.text}</span> {formatPrice(points[l.i][1])}
                </span>
              </div>
            );
          })}

        {hover && active !== null && (
          <>
            <div aria-hidden className="absolute inset-y-0 w-px bg-muted/60" style={{ left: `${hover.x}%` }} />
            <Dot x={hover.x} y={hover.y} />
            <div
              className="absolute top-0 z-10 rounded-md border border-rule bg-surface px-2.5 py-1.5 text-sm whitespace-nowrap shadow-sm"
              style={{ left: `${hover.x}%`, transform: `translateX(${hover.x > 70 ? "calc(-100% - 8px)" : "8px"})` }}
            >
              <p className="text-muted">{formatChartDate(points[active][0], chart.days)}</p>
              <p className="font-semibold tabular-nums">{formatPrice(points[active][1])}</p>
            </div>
          </>
        )}
        <p aria-live="polite" className="sr-only">
          {active !== null &&
            `${formatChartDate(points[active][0], chart.days)}: ${formatPrice(points[active][1])}`}
        </p>
      </div>

      {chart.total_volumes && chart.total_volumes.length > 1 && <VolumeBars volumes={chart.total_volumes} />}
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}

function Dot({ x, y }: { x: number; y: number }) {
  return (
    <span
      aria-hidden
      className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-surface"
      style={{ left: `${x}%`, top: `${y}%` }}
    />
  );
}

/** High, low and last can be the same point: show one label for it. */
function mergeLabels(labels: Label[]): Label[] {
  const byIdx = new Map<number, Label>();
  for (const l of labels) {
    const seen = byIdx.get(l.i);
    byIdx.set(l.i, seen ? { ...seen, text: `${seen.text}, ${l.text.toLowerCase()}` } : l);
  }
  return [...byIdx.values()];
}

/** Rolling 24h volume at each chart point, as thin bars under the price line. */
function VolumeBars({ volumes }: { volumes: [number, number][] }) {
  const max = Math.max(...volumes.map(([, v]) => v)) || 1;
  const t0 = volumes[0][0];
  const span = volumes[volumes.length - 1][0] - t0 || 1;
  const bw = Math.max(1, (W / volumes.length) * 0.6);
  return (
    <div className="mt-2">
      <svg viewBox={`0 0 ${W} 48`} preserveAspectRatio="none" aria-hidden className="h-10 w-full">
        {volumes.map(([t, v]) => {
          const h = (v / max) * 48;
          return <rect key={t} x={((t - t0) / span) * (W - bw)} y={48 - h} width={bw} height={h} className="fill-line/50" />;
        })}
      </svg>
      <p className="mt-1 text-xs text-muted tabular-nums">24h volume, peak {formatUsdCompact(max)}</p>
    </div>
  );
}
