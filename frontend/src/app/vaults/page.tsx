import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { ComingSoon, PageHero } from "@/components/PageHero";
export const metadata: Metadata = pageMeta("/vaults/", "Yield Vaults | TradeWood", "Stake $WOOD or provide liquidity in Sherwood vaults that pay from real protocol revenue on Robinhood Chain.");

const VAULTS = [
  { name: "Friar Tuck's Treasury", kind: "Single-asset $WOOD", icon: "fa-tree", tone: "bg-emeraldGlow/15 border-emeraldGlow/30 text-neonGreen",
    desc: "Stake $WOOD with no lockup and earn a share of Sherwood protocol fees.", terms: [["Lockup", "None"], ["Paid in", "Protocol fees"], ["Performance fee", "10%"]] },
  { name: "Little John's LP Vault", kind: "$WOOD / ETH liquidity", icon: "fa-water", tone: "bg-sky-500/15 border-sky-400/30 text-sky-300", featured: true,
    desc: "Provide $WOOD/ETH liquidity through the vault (tax-exempt adds) and earn trading fees plus $WOOD liquidity rewards.", terms: [["Lockup", "None"], ["Earns", "LP fees + $WOOD"], ["Performance fee", "10%"]] },
  { name: "Outlaw Auto-Compounder", kind: "Locked, auto-compounding", icon: "fa-mask", tone: "bg-sherwoodGold/15 border-sherwoodGold/30 text-goldLight",
    desc: "Lock for boosted rewards that reinvest automatically, using Robinhood Chain's low gas to compound often.", terms: [["Lockup", "Fixed term"], ["Early exit", "3% fee"], ["Performance fee", "10%"]] },
];

export default function Vaults() {
  return (
    <div className="space-y-8">
      <div className="glass-card-glow rounded-3xl p-6 lg:p-8 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-neonGreen/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative">
          <div className="space-y-2">
            <span className="pill"><i className="fa-solid fa-seedling" /> Sherwood Staking & Yield</span>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white">Redistribute Yield to the Hood</h1>
            <p className="text-slate-300 max-w-xl text-xs sm:text-sm">Non-custodial vaults that pay $WOOD holders and liquidity providers from real protocol revenue, not just new emissions.</p>
          </div>
          <div className="bg-panelCard border border-emeraldGlow/30 rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-6 shrink-0">
            <div>
              <span className="text-xs text-slate-400 block font-mono">Total Staked</span>
              <span className="text-2xl font-mono font-bold text-white">—</span>
            </div>
            <div className="sm:border-l sm:border-emeraldGlow/20 sm:pl-6">
              <span className="text-xs text-slate-400 block font-mono">Your Unclaimed Yield</span>
              <span className="text-2xl font-mono font-bold text-sherwoodGold">—</span>
            </div>
            <ComingSoon />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {VAULTS.map((v) => (
          <div key={v.name} className={`${v.featured ? "glass-card-glow" : "glass-card"} rounded-3xl p-6 flex flex-col justify-between group hover:border-emeraldGlow/50 transition-all`}>
            <div>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-xl group-hover:scale-110 transition-transform ${v.tone}`}>
                    <i className={`fa-solid ${v.icon}`} />
                  </div>
                  <div>
                    <h3 className="font-bold font-display text-lg text-white leading-tight">{v.name}</h3>
                    <span className="text-xs text-slate-400 font-mono">{v.kind}</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-5 leading-relaxed">{v.desc}</p>
              <dl className="space-y-2 text-xs font-mono mb-6">
                <div className="flex justify-between"><dt className="text-slate-400">APY</dt><dd className="text-white">— (live at launch)</dd></div>
                {v.terms.map(([k, val]) => (
                  <div key={k} className="flex justify-between"><dt className="text-slate-400">{k}</dt><dd className="text-white">{val}</dd></div>
                ))}
              </dl>
            </div>
            <button disabled className="btn-primary w-full py-3 text-xs !rounded-xl">
              <i className="fa-solid fa-hourglass-half" /> Opens at launch
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
