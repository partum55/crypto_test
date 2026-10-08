import type { Metadata } from "next";
import { Suspense } from "react";
import CoinDetail, { CoinDetailFallback } from "@/components/CoinDetail";

export const metadata: Metadata = { title: "Coin details | Low-cap crypto screen" };

// The id is read on the client with useParams(); under cacheComponents that needs a Suspense boundary.
export default function CoinPage() {
  return (
    <Suspense fallback={<CoinDetailFallback />}>
      <CoinDetail />
    </Suspense>
  );
}
