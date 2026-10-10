import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { PageHero } from "@/components/PageHero";
import { UNISWAP_V2_ROUTER, UNISWAP_V3_QUOTER_V2, USDG, WETH } from "@/config/contracts";
import { explorerAddress } from "@/config/chains";
export const metadata: Metadata = pageMeta("/docs/", "Docs | TradeWood", "How TradeWood works: the Sherwood Router, the $WOOD token, Bounty Bandits referrals, vaults, quests, risks and contract addresses.");

const SECTIONS = [
  { h: "1. Sherwood Router", icon: "fa-route", p: "A swap router that quotes every Uniswap V2 and V3 pool on Robinhood Chain and executes on the best one. It takes a 0.10% protocol fee (hard-capped at 0.30% in the contract), enforces your minimum output after fees, and holds no funds between transactions." },
  { h: "2. $WOOD token", icon: "fa-tree", p: "Fixed 100M supply with no mint function. Buys and sells on the WOOD/ETH pool pay 3%: 2% becomes treasury-owned liquidity and 1% goes to the treasury. Wallet-to-wallet transfers are untaxed. Launch limits cap trades at 1% and wallets at 2%. The tax can never exceed 5%, trading can't be paused, and the owner can't withdraw accrued tax." },
  { h: "3. Bounty Bandits referrals", icon: "fa-users", p: "Referrers earn a capped share of the treasury's fee cut on their recruits' swaps (25% / 5% two-level at launch, stepping down over time), plus $WOOD bonuses from a fixed 6M guild budget split per 14-day epoch." },
  { h: "4. Vaults & quests", icon: "fa-vault", p: "Friar Tuck's Treasury (stake $WOOD, earn protocol fees), Little John's LP Vault and the Outlaw Auto-Compounder. Quests award Bounty Points that convert to $WOOD each epoch." },
  { h: "5. Risks", icon: "fa-triangle-exclamation", p: "Smart contracts can have bugs; audits reduce but don't remove risk. Token prices can fall to zero. Tax tokens can be incompatible with some aggregators. Only use funds you can afford to lose. TradeWood is independent and not affiliated with Robinhood Markets, Inc." },
];

const ADDRS = [
  ["WETH", WETH], ["USDG", USDG], ["Uniswap V2 Router02", UNISWAP_V2_ROUTER], ["Uniswap V3 QuoterV2", UNISWAP_V3_QUOTER_V2],
];

export default function Docs() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHero pill="Whitepaper overview" pillIcon="fa-book-open" title="The Sherwood Protocol" sub="How TradeWood works, in plain language." />
      {SECTIONS.map((s) => (
        <section key={s.h} className="glass-card rounded-3xl p-6">
          <h2 className="font-display font-bold text-white text-lg flex items-center gap-2"><i className={`fa-solid ${s.icon} text-neonGreen`} /> {s.h}</h2>
          <p className="text-sm text-slate-300 mt-2 leading-relaxed">{s.p}</p>
        </section>
      ))}
      <section className="glass-card rounded-3xl p-6">
        <h2 className="font-display font-bold text-white text-lg mb-3">Contract addresses (Robinhood Chain, 4663)</h2>
        <ul className="space-y-2 text-xs font-mono">
          {ADDRS.map(([k, v]) => (
            <li key={k} className="flex flex-col sm:flex-row sm:justify-between gap-1">
              <span className="text-slate-400">{k}</span>
              <a href={explorerAddress(v)} target="_blank" rel="noreferrer" className="text-neonGreen hover:underline break-all">{v}</a>
            </li>
          ))}
          <li className="flex justify-between text-slate-400"><span>SherwoodRouter / WoodToken</span><span className="text-goldLight">Not deployed yet</span></li>
        </ul>
      </section>
    </div>
  );
}
