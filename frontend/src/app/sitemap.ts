import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const BASE = "https://tradewood.app";
const PAGES: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
  { path: "/", priority: 1.0, changeFrequency: "daily" },
  { path: "/vaults/", priority: 0.8, changeFrequency: "weekly" },
  { path: "/bounty-bandits/", priority: 0.8, changeFrequency: "weekly" },
  { path: "/quests/", priority: 0.7, changeFrequency: "weekly" },
  { path: "/analytics/", priority: 0.6, changeFrequency: "weekly" },
  { path: "/docs/", priority: 0.7, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.map((p) => ({ url: `${BASE}${p.path}`, lastModified, changeFrequency: p.changeFrequency, priority: p.priority }));
}
