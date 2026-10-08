import { formatPrice, formatUsdCompact } from "@/lib/format";
import type { Project, SortDir, SortKey } from "@/lib/types";

type Props = { items: Project[]; sortKey: SortKey; sortDir: SortDir };

const COLUMNS: { label: string; key?: SortKey }[] = [
  { label: "Price" },
  { label: "Market cap", key: "market_cap" },
  { label: "FDV" },
  { label: "24h volume", key: "total_volume" },
  { label: "TVL" },
];

export default function ProjectsTable({ items, sortKey, sortDir }: Props) {
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left text-muted">
            <th scope="col" className="py-2 pr-4 font-medium">
              Project
            </th>
            {COLUMNS.map((c) => {
              const active = c.key === sortKey;
              return (
                <th
                  key={c.label}
                  scope="col"
                  aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                  className={`py-2 pl-4 text-right font-medium ${active ? "text-accent" : ""}`}
                >
                  {c.label}
                  {active && <span aria-hidden> {sortDir === "asc" ? "↑" : "↓"}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {items.map((p) => (
            <tr key={p.id} className="border-b border-rule">
              <th scope="row" className="py-3 pr-4 text-left font-normal">
                <span className="flex items-center gap-3">
                  {p.image ? (
                    // Static logo from CoinGecko's CDN (not an API call); next/image would need remotePatterns.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" width={24} height={24} loading="lazy" className="size-6 rounded-full" />
                  ) : (
                    <span className="size-6 rounded-full bg-rule" aria-hidden />
                  )}
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-muted uppercase">{p.symbol}</span>
                </span>
              </th>
              <td className="py-3 pl-4 text-right">{formatPrice(p.current_price)}</td>
              <td className="py-3 pl-4 text-right">{formatUsdCompact(p.market_cap)}</td>
              <td className="py-3 pl-4 text-right">{formatUsdCompact(p.fully_diluted_valuation)}</td>
              <td className="py-3 pl-4 text-right">{formatUsdCompact(p.total_volume)}</td>
              <td className="py-3 pl-4 text-right">{formatUsdCompact(p.total_value_locked)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
