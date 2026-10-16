"use client";
import { RoutePanel } from "@/components/RoutePanel";
import { SwapCard, useSwapState } from "@/components/SwapCard";
import { PageHero } from "@/components/PageHero";

export function ExchangeView() {
  const s = useSwapState();
  return (
    <>
      <a
        href="/seed/"
        className="group mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-sherwoodGold/40 bg-gradient-to-r from-neonGreen/10 to-sherwoodGold/10 px-5 py-4 hover:border-sherwoodGold transition-colors"
      >
        <div className="flex items-center gap-3">
          <i className="fa-solid fa-seedling text-sherwoodGold text-xl" />
          <div>
            <p className="font-display font-bold text-white">The $WOOD seed round is open</p>
            <p className="text-xs text-slate-300">$0.0075 per WOOD · $10 minimum · $200 per wallet. Early supporters will be rewarded.</p>
          </div>
        </div>
        <span className="shrink-0 rounded-xl bg-sherwoodGold px-4 py-2 text-sm font-bold text-forestDark group-hover:brightness-110">
          Join the seed round <i className="fa-solid fa-arrow-right ml-1" />
        </span>
      </a>
      <PageHero
        pill="Best-route DEX on Robinhood Chain"
        pillIcon="fa-shield-halved"
        title="The Forest Exchange"
        sub="Every swap is scanned across every Uniswap V2, V3 and V4 pool, then routed to whichever pays you the most, or split across several when that pays more."
      />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5 mx-auto w-full max-w-md lg:max-w-none">
          <SwapCard s={s} />
        </div>
        <div className="lg:col-span-7 space-y-6">
          <RoutePanel data={s.debounced === s.amountIn ? s.quotes.data : undefined} loading={s.quotes.isFetching || s.debounced !== s.amountIn} tokenOut={s.tokenOut} hasAmount={s.amountIn > 0n} />
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: "fa-route", t: "Multi-venue routing", d: "Every Uniswap V2, V3 and V4 pool scanned live, and big trades split across venues for a better price." },
              { icon: "fa-shield-halved", t: "Slippage-guarded", d: "The contract reverts if you'd receive less than your minimum." },
              { icon: "fa-mask", t: "Bounty Bandits rewards", d: "Swaps made through a referral link earn your recruiter rewards." },
            ].map((c) => (
              <div key={c.t} className="glass-card rounded-2xl p-4">
                <i className={`fa-solid ${c.icon} text-neonGreen`} />
                <p className="font-display font-bold text-white text-sm mt-2">{c.t}</p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
