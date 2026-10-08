import { formatUsdCompact } from "@/lib/format";
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
};

const field =
  "border-b-2 border-rule bg-transparent px-1 font-semibold text-ink placeholder:font-normal placeholder:text-muted/70 focus:border-accent focus:outline-none";

export default function Controls(p: Props) {
  const fdvInvalid = p.maxFdv.trim() !== "" && p.fdvLimit === null;

  return (
    <form
      className="mt-6 max-w-4xl text-xl leading-[2.4] sm:text-2xl"
      onSubmit={(e) => e.preventDefault()}
      role="search"
    >
      <label htmlFor="q">Show projects matching </label>
      <input
        id="q"
        type="search"
        value={p.query}
        onChange={(e) => p.onQuery(e.target.value)}
        placeholder="any name"
        autoComplete="off"
        className={`${field} w-40 sm:w-52`}
      />
      <label htmlFor="fdv"> with FDV under $</label>
      <input
        id="fdv"
        inputMode="decimal"
        value={p.maxFdv}
        onChange={(e) => p.onMaxFdv(e.target.value)}
        placeholder="no limit"
        autoComplete="off"
        aria-invalid={fdvInvalid}
        aria-describedby="fdv-hint"
        className={`${field} w-40 tabular-nums sm:w-52 ${fdvInvalid ? "border-error" : ""}`}
      />
      <label htmlFor="sort-key">, by </label>
      <select
        id="sort-key"
        value={p.sortKey}
        onChange={(e) => p.onSortKey(e.target.value as SortKey)}
        className={field}
      >
        <option value="market_cap">market cap</option>
        <option value="total_volume">24h volume</option>
      </select>{" "}
      <label htmlFor="sort-dir" className="sr-only">
        Sort direction
      </label>
      <select
        id="sort-dir"
        value={p.sortDir}
        onChange={(e) => p.onSortDir(e.target.value as SortDir)}
        className={field}
      >
        <option value="desc">high to low</option>
        <option value="asc">low to high</option>
      </select>
      .
      <p id="fdv-hint" className={`text-sm leading-normal ${fdvInvalid ? "text-error" : "text-muted"}`}>
        {fdvInvalid
          ? "FDV limit is not a valid positive number, so it is ignored."
          : p.fdvLimit !== null
            ? `FDV limit: ${formatUsdCompact(p.fdvLimit)}. Projects without an FDV are hidden.`
            : "FDV in US dollars, e.g. 500000000 for $500M."}
      </p>
    </form>
  );
}
