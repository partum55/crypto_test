const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const smallUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumSignificantDigits: 4,
});

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** $12.3M style. */
export const formatUsdCompact = (v: number | null | undefined) => (isNum(v) ? compactUsd.format(v) : "—");

const wholeUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const count = new Intl.NumberFormat("en-US");

/** $50,000,000 style, for echoing a typed amount back in full. */
export const formatUsdFull = (v: number | null | undefined) => (isNum(v) ? wholeUsd.format(v) : "—");

/** 2,750 style. */
export const formatCount = (v: number | null | undefined) => (isNum(v) ? count.format(v) : "—");

/** Full price; more digits for sub-dollar coins. */
export const formatPrice = (v: number | null | undefined) =>
  isNum(v) ? (Math.abs(v) < 1 ? smallUsd : usd).format(v) : "—";

/** Local time of an ISO datetime. Call only on the client (time zone differs from the server). */
export function formatTime(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";
}
