import type { Metadata } from "next";

const SITE = "https://tradewood.app";

/** Per-page metadata: title, description, canonical URL and social previews. */
export function pageMeta(path: string, title: string, description: string): Metadata {
  const url = `${SITE}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "TradeWood", type: "website", images: [{ url: "/og.png", width: 1200, height: 630, alt: "TradeWood — The Sherwood Protocol on Robinhood Chain" }] },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  };
}
