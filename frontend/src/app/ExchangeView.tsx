"use client";
import { RoutePanel } from "@/components/RoutePanel";
import { SwapCard, useSwapState } from "@/components/SwapCard";
import { PageHero } from "@/components/PageHero";

export function ExchangeView() {
  const s = useSwapState();
  return (
    <>
      <PageHero
        pill="Best-route DEX on Robinhood Chain"
        pillIcon="fa-shield-halved"
        title="The Forest Exchange"
        sub="Every swap is scanned across Uniswap V2 and every V3 pool tier, then routed to whichever pays you the most."
      />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5 mx-auto w-full max-w-md lg:max-w-none">
          <SwapCard s={s} />
        </div>
        <div className="lg:col-span-7 space-y-6">
          <RoutePanel data={s.debounced === s.amountIn ? s.quotes.data : undefined} loading={s.quotes.isFetching || s.debounced !== s.amountIn} tokenOut={s.tokenOut} hasAmount={s.amountIn > 0n} />
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: "fa-route", t: "Multi-venue routing", d: "V2 + V3 (0.05%, 0.3%, 1%) scanned live, direct and via WETH." },
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
