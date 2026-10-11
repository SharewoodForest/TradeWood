"use client";
import type { Token } from "@/config/contracts";
import { type QuoteResult, VENUE_NAMES, shortLabel } from "@/hooks/useSwapQuotes";

const VENUE_TONE = ["bg-sky-500/15 text-sky-300", "bg-pink-500/15 text-pink-300", "bg-violet-500/15 text-violet-300"];
const VENUE_BAR = ["bg-sky-400", "bg-pink-400", "bg-violet-400"];
import { fmtAmount } from "@/lib/format";
import { Dot } from "./Dot";

export function RoutePanel({ data, loading, tokenOut, hasAmount }: { data?: QuoteResult; loading: boolean; tokenOut: Token; hasAmount: boolean }) {
  const best = data?.best?.amountOut;
  return (
    <div className="glass-card rounded-3xl p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="text-lg font-bold font-display text-white flex items-center gap-2">
            <i className="fa-solid fa-route text-neonGreen" /> Multi-Venue Route Scan
          </h3>
          <p className="text-xs text-slate-400 mt-1">Live quotes from every Uniswap V2, V3 and V4 pool on Robinhood Chain. The best one wins, or we split across them.</p>
        </div>
        <span className="pill self-start">
          <Dot size="w-1.5 h-1.5" tone={loading ? "bg-sherwoodGold" : "bg-neonGreen"} /> {loading ? "Scanning" : "Live"}
        </span>
      </div>

      {!hasAmount ? (
        <Empty icon="fa-keyboard" text="Enter an amount to scan routes." />
      ) : loading && !data ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-2xl bg-panelCard/70 animate-pulse" />
          ))}
        </div>
      ) : !data?.routes.length ? (
        <Empty icon="fa-circle-xmark" text="No liquidity found for this pair." />
      ) : (
        <>
        {data.plan?.split && (
          <div className="mb-4 p-4 rounded-2xl bg-sherwoodGold/10 border border-sherwoodGold/30">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-sm font-bold text-goldLight flex items-center gap-2">
                <i className="fa-solid fa-code-branch" /> Sherwood Split
              </p>
              <p className="text-xs font-mono text-goldLight">
                +{fmtAmount(data.plan.splitGain, tokenOut.decimals)} {tokenOut.symbol} vs best single pool
              </p>
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 mb-3" aria-hidden>
              {data.plan.legs.map((l) => (
                <span key={l.route.label + l.route.hops} className={VENUE_BAR[l.route.venue]} style={{ width: `${l.weightBps / 100}%` }} />
              ))}
            </div>
            <ul className="space-y-1 font-mono text-xs">
              {data.plan.legs.map((l) => (
                <li key={l.route.label + l.route.hops} className="flex justify-between gap-3">
                  <span className="text-slate-300 truncate">
                    <span className="text-white font-bold">{l.weightBps / 100}%</span> → {shortLabel(l.route)}
                    {l.route.hops !== "direct" && <span className="text-slate-500"> · {l.route.hops}</span>}
                  </span>
                  <span className="text-slate-400 shrink-0">{fmtAmount(l.amountOut, tokenOut.decimals)} {tokenOut.symbol}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.vsV2Pct !== undefined && data.vsV2Pct > 0.01 && data.vsV2Pct < 50 && (
          <p className="mb-3 text-[11px] font-mono text-emerald-400">
            <i className="fa-solid fa-arrow-trend-up" /> {data.vsV2Pct.toFixed(2)}% more than a plain {VENUE_NAMES[0]} swap
          </p>
        )}
        <ul className="space-y-2">
          {data.routes.map((r, i) => {
            const diff = best && i > 0 ? (Number(best - r.amountOut) / Number(best)) * 100 : 0;
            const worst = data.routes[data.routes.length - 1].amountOut;
            const span = best && best > worst ? Number(best - worst) : 0;
            // Bar: 35% baseline + share of the best-vs-worst spread, so small differences are still visible
            const width = span ? 35 + (65 * Number(r.amountOut - worst)) / span : 100;
            return (
              <li
                key={r.label + r.hops}
                className={`relative overflow-hidden flex items-center justify-between gap-3 p-3.5 rounded-2xl border font-mono text-xs ${
                  i === 0 ? "bg-emeraldGlow/10 border-neonGreen/40" : "bg-panelCard/60 border-emeraldGlow/10"
                }`}
              >
                <span aria-hidden className={`absolute left-0 bottom-0 h-0.5 ${i === 0 ? "bg-neonGreen" : "bg-emeraldGlow/40"}`} style={{ width: `${width}%` }} />
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-[10px] font-bold ${VENUE_TONE[r.venue]}`}>
                    V{r.venue + 2}
                  </span>
                  <div className="min-w-0">
                    <p className="text-white font-bold truncate">{r.label}</p>
                    <p className="text-slate-500 text-[10px] uppercase">{r.hops}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={i === 0 ? "text-neonGreen font-bold" : "text-white"}>
                    {fmtAmount(r.amountOut, tokenOut.decimals)} {tokenOut.symbol}
                  </p>
                  <p className="text-[10px] text-slate-500">{i === 0 ? <span className="text-neonGreen">{data.plan?.split ? "BEST SINGLE" : "BEST ROUTE"}</span> : `−${diff.toFixed(2)}%`}</p>
                </div>
              </li>
            );
          })}
        </ul>
        </>
      )}
    </div>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="h-48 rounded-2xl border border-dashed border-emeraldGlow/20 flex flex-col items-center justify-center gap-2 text-slate-500 text-sm">
      <i className={`fa-solid ${icon} text-2xl`} />
      {text}
    </div>
  );
}
