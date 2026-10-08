import type { ReactNode } from "react";
import { formatPrice, formatUsdCompact } from "@/lib/format";
import type { Project, SortDir, SortKey } from "@/lib/types";

type Props = {
  /** null renders skeleton rows (same footprint as data, so nothing jumps when it arrives). */
  rows: Project[] | null;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  /** Shown below the header instead of rows; kept outside the scroll box so it wraps on mobile. */
  empty?: ReactNode;
};

const COLUMNS: { label: string; key?: SortKey }[] = [
  { label: "Price" },
  { label: "Market cap", key: "market_cap" },
  { label: "FDV" },
  { label: "24h volume", key: "total_volume" },
  { label: "TVL" },
];

const SKELETON_ROWS = 5;
// Sticky first column: on narrow screens the numbers scroll under the project name.
const firstCol = "sticky left-0 z-10 bg-surface py-3 px-4 text-left max-sm:border-r max-sm:border-rule";
const cell = "py-3 px-4 text-right";

export default function ProjectsTable({ rows, sortKey, sortDir, onSort, empty }: Props) {
  return (
    <div className="mt-6 border border-rule bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse">
          <thead>
            <tr className="border-b border-ink text-sm text-muted">
              <th scope="col" className={`${firstCol} font-medium`}>
                Project
              </th>
              {COLUMNS.map((c) => {
                const active = c.key === sortKey;
                return (
                  <th
                    key={c.label}
                    scope="col"
                    aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                    className={`${cell} font-medium`}
                  >
                    {c.key ? (
                      <button
                        type="button"
                        onClick={() => onSort(c.key!)}
                        className={`-mx-1 rounded px-1 font-medium whitespace-nowrap hover:text-ink ${active ? "text-accent" : ""}`}
                      >
                        {c.label}{" "}
                        <span aria-hidden className="inline-block w-3">
                          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          {!empty && (
            <tbody className="tabular-nums" aria-busy={rows === null}>
              {rows === null
                ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                    <tr key={i} aria-hidden className="border-b border-rule last:border-0">
                      <td className={firstCol}>
                        <span className="flex items-center gap-3">
                          <span className="size-6 rounded-full bg-rule/60" />
                          <span className="h-3 w-28 rounded bg-rule/60" />
                        </span>
                      </td>
                      {COLUMNS.map((c) => (
                        <td key={c.label} className={cell}>
                          <span className="ml-auto block h-3 w-14 rounded bg-rule/60" />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.map((p) => (
                    <tr key={p.id} className="border-b border-rule last:border-0">
                      <th scope="row" className={`${firstCol} font-normal`}>
                        <span className="flex items-center gap-3">
                          {p.image ? (
                            // Static logo from CoinGecko's CDN (not an API call); next/image would need remotePatterns.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image} alt="" width={24} height={24} loading="lazy" className="size-6 rounded-full" />
                          ) : (
                            <span className="size-6 rounded-full bg-rule" aria-hidden />
                          )}
                          <span className="font-semibold whitespace-nowrap">{p.name}</span>
                          <span className="text-sm text-muted uppercase">{p.symbol}</span>
                        </span>
                      </th>
                      <td className={cell}>{formatPrice(p.current_price)}</td>
                      <td className={cell}>{formatUsdCompact(p.market_cap)}</td>
                      <td className={cell}>{formatUsdCompact(p.fully_diluted_valuation)}</td>
                      <td className={cell}>{formatUsdCompact(p.total_volume)}</td>
                      <td className={cell}>{formatUsdCompact(p.total_value_locked)}</td>
                    </tr>
                  ))}
            </tbody>
          )}
        </table>
      </div>
      {empty && <div className="px-4 py-8 sm:px-6">{empty}</div>}
    </div>
  );
}
