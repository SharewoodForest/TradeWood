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
  applicationName: "TradeWood",
  keywords: ["TradeWood", "Sherwood Protocol", "Robinhood Chain", "DEX", "swap", "best route", "Uniswap", "$WOOD", "DeFi", "stock tokens"],
  alternates: { canonical: "https://tradewood.app/" },
  openGraph: {
    title: "TradeWood | The Sherwood Protocol on Robinhood Chain",
    description: "Best-route swaps across Uniswap V2 and V3 on Robinhood Chain, plus $WOOD vaults, Merry Men referrals and quests.",
    url: "https://tradewood.app/",
    siteName: "TradeWood",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "TradeWood — The Sherwood Protocol on Robinhood Chain" }],
  },
  twitter: { card: "summary_large_image", title: "TradeWood | The Sherwood Protocol on Robinhood Chain", description: "Best-route swaps across Uniswap V2 and V3 on Robinhood Chain.", images: ["/og.png"] },
  robots: { index: true, follow: true },
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "TradeWood",
              alternateName: "The Sherwood Protocol",
              url: "https://tradewood.app/",
              applicationCategory: "FinanceApplication",
              operatingSystem: "Web",
              description: "Best-route token swaps across Uniswap V2 and V3 on Robinhood Chain, with $WOOD vaults, referrals and quests.",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            }),
          }}
        />
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
