import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
export const metadata: Metadata = { title: "Analytics | TradeWood" };

const ALLOC = [
  { k: "Community Yield & Staking Vaults", pct: 50, color: "bg-neonGreen" },
  { k: "DEX Liquidity & Seed Sale", pct: 25, color: "bg-emeraldGlow" },
  { k: "Merry Men Guild & Ecosystem Fund", pct: 15, color: "bg-sherwoodGold" },
  { k: "Deflationary Burn Reserve", pct: 10, color: "bg-robinRed" },
];
const REVENUE = [
  ["Sherwood Router fee", "0.10% of routed volume", "v1"],
  ["$WOOD trade tax", "1% treasury + 2% auto-liquidity", "v1"],
  ["Protocol-owned liquidity", "LP fees on treasury-owned WOOD/ETH", "v1"],
  ["Vault fees", "10% of harvested yield", "v1–v2"],
  ["TradeWood AMM pools", "0.06% treasury cut", "v2"],
  ["Launchpad & sponsored quests", "Listing + campaign fees", "v3"],
];

export default function Analytics() {
  return (
    <div className="space-y-8">
      <PageHero pill="Protocol transparency" pillIcon="fa-chart-line" title="Sherwood Analytics" sub="Live protocol metrics appear here once contracts deploy. Below are the published token and revenue designs." />
      <div className="grid sm:grid-cols-4 gap-4">
        {["Routed volume", "Protocol revenue", "TVL", "$WOOD burned"].map((k) => (
          <div key={k} className="glass-card rounded-2xl p-5">
            <p className="text-[10px] font-mono uppercase text-slate-400">{k}</p>
            <p className="text-2xl font-mono font-bold text-white mt-1">—</p>
            <p className="text-[10px] text-slate-500 mt-1">Live at launch</p>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-3xl p-6">
          <h3 className="font-display font-bold text-white text-lg mb-1">$WOOD Tokenomics</h3>
          <p className="text-xs text-slate-400 mb-5">100,000,000 fixed supply. No mint function.</p>
          <div className="flex h-3 rounded-full overflow-hidden mb-6" role="img" aria-label="Allocation: 50% vaults, 25% liquidity and sale, 15% guild, 10% burn">
            {ALLOC.map((a) => <div key={a.k} className={a.color} style={{ width: `${a.pct}%` }} />)}
          </div>
          <ul className="space-y-3">
            {ALLOC.map((a) => (
              <li key={a.k} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-300"><span className={`w-2.5 h-2.5 rounded-sm ${a.color}`} />{a.k}</span>
                <span className="font-mono text-white">{a.pct}% <span className="text-slate-500 text-xs">({(a.pct * 1_000_000).toLocaleString("en-US")})</span></span>
              </li>
            ))}
          </ul>
        </div>
        <div className="glass-card rounded-3xl p-6">
          <h3 className="font-display font-bold text-white text-lg mb-1">Revenue Engine</h3>
          <p className="text-xs text-slate-400 mb-5">No reward pays out more cash than the activity behind it brings in.</p>
          <ul className="divide-y divide-emeraldGlow/10">
            {REVENUE.map(([k, v, phase]) => (
              <li key={k} className="py-3 flex items-center justify-between gap-3 text-sm">
                <div><p className="text-white font-semibold">{k}</p><p className="text-xs text-slate-400">{v}</p></div>
                <span className="pill !text-[10px] shrink-0">{phase}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
