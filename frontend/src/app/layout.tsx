import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import "./globals.css";

const sans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Low-cap crypto screen",
  description: "Coins from CoinGecko that pass six strict filters, with search, FDV limit and sorting.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
