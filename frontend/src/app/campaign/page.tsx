import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { PageHero } from "@/components/PageHero";
import { explorerAddress } from "@/config/chains";
export const metadata: Metadata = pageMeta("/campaign/", "Campaign verification | TradeWood", "Verifiable TradeWood actions on Robinhood Chain: the exact contract calls and events a rewards platform can check. No rewards are promised by TradeWood.");

const SEED_SALE = "0x560De388b7F6e4b7D7DAAacE8c16a304da98fE79";

type Status = "Live now" | "Later" | "After router launch";
const ACTIONS: { t: string; status: Status; how: string; detail: string }[] = [
  { t: "Contribute $10+ in the $WOOD seed sale", status: "Live now", how: "On-chain call", detail: "WoodSeedSale.participants(address) returns (totalContributed, totalAllocated, totalClaimed). Eligible when totalContributed >= 10000000 (6 decimals, so 10000000 = $10). Selector 0x09e69ede." },
  { t: "Seed sale purchase", status: "Live now", how: "On-chain event", detail: "TokensPurchased(address indexed buyer, address indexed token, uint256 paymentAmount, uint256 woodAmount), topic0 0x6faf9323…053a7b. The buyer is topic1." },
  { t: "Claim unlocked $WOOD", status: "Later", how: "On-chain event", detail: "TokensClaimed(address indexed participant, uint256 amount) and MilestoneUnlocked(uint256 newUnlockedBps). Only possible after the sale is finalized and a milestone is unlocked." },
  { t: "Make a swap through the Sherwood Router", status: "After router launch", how: "On-chain event", detail: "SherwoodSwap(user indexed, referrer indexed, tokenIn, tokenOut, amountIn, amountOut, feeAmount, recipient, venueMask, legs), topic0 0xe24c9cfc…29f9. The router address will be published here once it is deployed." },
  { t: "Refer a swapper", status: "After router launch", how: "On-chain event", detail: "The referrer field of SherwoodSwap (topic2). Referral links look like tradewood.app/?ref=<wallet address>." },
  { t: "Join the community Telegram group", status: "Live now", how: "Verified by the platform", detail: "t.me/TradeWoodApp" },
  { t: "Visit the seed sale page", status: "Live now", how: "Verified by the platform", detail: "tradewood.app/seed/" },
];

const TONE: Record<Status, string> = {
  "Live now": "text-neonGreen bg-emeraldGlow/10 border-emeraldGlow/30",
  Later: "text-slate-300 bg-slate-500/10 border-slate-400/30",
  "After router launch": "text-goldLight bg-sherwoodGold/10 border-sherwoodGold/30",
};

export default function Campaign() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHero pill="For campaign platforms" pillIcon="fa-clipboard-check" title="Verifiable TradeWood actions" sub="The exact contract calls and events on Robinhood Chain (4663) that a quest or rewards platform can check." />
      <section className="glass-card rounded-3xl p-6 text-sm text-slate-300 leading-relaxed space-y-2">
        <p>This page only describes what can be verified. TradeWood does not promise any reward or amount. Reward terms, eligibility and distribution are set by the campaign operator. A machine-readable version is at <a className="text-neonGreen hover:underline" href="/campaign.json">/campaign.json</a>.</p>
        <p className="text-xs text-slate-400">$WOOD has no guaranteed value and nothing here is financial advice. Automated analysis has been done; an independent manual audit has not been completed. TradeWood is independent and not affiliated with Robinhood Markets, Inc.</p>
      </section>
      {ACTIONS.map((a) => (
        <section key={a.t} className="glass-card rounded-3xl p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display font-bold text-white">{a.t}</h2>
            <span className={`text-[11px] font-mono font-bold border px-2 py-0.5 rounded-full shrink-0 ${TONE[a.status]}`}>{a.status}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">{a.how}</p>
          <p className="text-xs text-slate-300 mt-2 leading-relaxed break-words">{a.detail}</p>
        </section>
      ))}
      <section className="glass-card rounded-3xl p-6">
        <h2 className="font-display font-bold text-white text-lg mb-3">Contracts (Robinhood Chain, 4663)</h2>
        <ul className="space-y-2 text-xs font-mono">
          <li className="flex flex-col sm:flex-row sm:justify-between gap-1"><span className="text-slate-400">WoodSeedSale</span><a href={explorerAddress(SEED_SALE)} target="_blank" rel="noreferrer" className="text-neonGreen hover:underline break-all">{SEED_SALE}</a></li>
          <li className="flex justify-between text-slate-400"><span>SherwoodRouter</span><span className="text-goldLight">Not deployed yet</span></li>
        </ul>
      </section>
    </div>
  );
}
