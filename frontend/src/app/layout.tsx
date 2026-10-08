import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const sans = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Crypto projects",
  description: "Coins that pass the market criteria, with search, FDV filter and sorting.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
