import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { PageHero } from "@/components/PageHero";
import { UNISWAP_V2_ROUTER, UNISWAP_V3_QUOTER_V2, USDG, WETH } from "@/config/contracts";
import { explorerAddress } from "@/config/chains";
export const metadata: Metadata = pageMeta("/docs/", "Docs | TradeWood", "How TradeWood works: the Sherwood Router, the $WOOD token, Bounty Bandits referrals, vaults, quests, the $WOOD seed round, risks and contract addresses.");

const SECTIONS = [
  { h: "1. Sherwood Router", icon: "fa-route", p: "A swap router that quotes every Uniswap V2, V3 and V4 pool on Robinhood Chain and executes on the best one, or splits a large trade across up to three of them (the Sherwood Split) when that pays more. One minimum output is enforced across the whole trade. It takes a 0.10% protocol fee (hard-capped at 0.30% in the contract), enforces your minimum output after fees, and holds no funds between transactions. It is owned by the treasury Safe, its source is verified on Sourcify, and it has had automated analysis but no independent manual audit." },
  { h: "2. $WOOD token", icon: "fa-tree", p: "Fixed 100M supply with no mint function. Buys and sells on registered WOOD pools (starting with WOOD/ETH) pay 3%: 2% becomes treasury-owned liquidity and 1% goes to the treasury. Wallet-to-wallet transfers are untaxed. Launch limits cap trades at 1% and wallets at 2%. The tax can never exceed 5%, trading can't be paused, and the owner can't withdraw accrued tax." },
  { h: "3. Bounty Bandits referrals", icon: "fa-users", p: "Referrers earn a capped share of the treasury's fee cut on their recruits' swaps (25% / 5% two-level at launch, stepping down over time), plus $WOOD bonuses from a fixed 6M guild budget split per 14-day epoch." },
  { h: "4. Vaults & quests", icon: "fa-vault", p: "Friar Tuck's Treasury (stake $WOOD, earn protocol fees), Little John's LP Vault and the Outlaw Auto-Compounder. Quests award Bounty Points that convert to $WOOD each epoch." },
  { h: "5. $WOOD seed round", icon: "fa-seedling", p: "1,000,000 WOOD (1% of supply) is offered to early supporters at $0.0075 per WOOD, paid in USDG: $10 minimum, $200 per wallet, $7,500 hard cap. Tokens unlock in four 25% milestone tranches and are claimed from the sale contract. Contributions stay in the sale contract until the treasury Safe (2-of-3 multisig) closes the round, then go to the treasury, mostly to seed WOOD/ETH liquidity. The contract has no automatic refund. Early supporters will be rewarded. Join at tradewood.app/seed, and follow updates in the community Telegram group at t.me/TradeWoodApp. Campaign platforms can find the verifiable on-chain actions at tradewood.app/campaign." },
  { h: "6. Risks", icon: "fa-triangle-exclamation", p: "Smart contracts can have bugs; audits reduce but don't remove risk. Token prices can fall to zero. Tax tokens can be incompatible with some aggregators. Only use funds you can afford to lose. TradeWood is independent and not affiliated with Robinhood Markets, Inc." },
  { h: "7. For developers & AI agents", icon: "fa-robot", p: "TradeWood has a read-only API for bots and AI agents: tradewood.app/api/quote returns the best route plus ready-to-sign transactions, and tradewood.app/api/seed does the same for the seed sale. Your own wallet signs; TradeWood never holds keys or funds. Guide: tradewood.app/agents.md. OpenAPI: tradewood.app/openapi.json. Token list: tradewood.app/api/tokens. ABIs: tradewood.app/abi/." },
];

const ADDRS = [
  ["WETH", WETH], ["USDG", USDG], ["Uniswap V2 Router02", UNISWAP_V2_ROUTER], ["Uniswap V3 QuoterV2", UNISWAP_V3_QUOTER_V2],
  ["WoodToken ($WOOD)", "0x92FC190e5ABAcc1D246C316aCC0EE283682b25fD"], ["WoodSeedSale", "0x560De388b7F6e4b7D7DAAacE8c16a304da98fE79"], ["Treasury (Safe)", "0xcE96e912A799d46FD28Ea2b3752296d58af70BAb"],
  ["SherwoodRouter", "0x0b93Fb1d8be0EdcA90a7cC3Aea58e6460FE1eB46"],
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
        </ul>
      </section>
    </div>
  );
}
