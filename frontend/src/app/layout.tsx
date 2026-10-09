import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Marquee } from "@/components/Marquee";
import { Header } from "@/components/Header";
import { WalletHud } from "@/components/WalletHud";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "TradeWood | The Sherwood Protocol on Robinhood Chain",
  description: "Best-route swaps across Uniswap V2 and V3 on Robinhood Chain, plus $WOOD vaults, Merry Men referrals and quests.",
  metadataBase: new URL("https://tradewood.app"),
  openGraph: { title: "TradeWood", description: "The Sherwood Protocol on Robinhood Chain", url: "https://tradewood.app" },
};
export const viewport: Viewport = { themeColor: "#050807", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@500;600;700&display=swap"
        />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
      </head>
      <body className="min-h-screen flex flex-col selection:bg-neonGreen selection:text-black">
        <Providers>
          <Marquee />
          <Header />
          <WalletHud />
          <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 w-full flex-grow">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
