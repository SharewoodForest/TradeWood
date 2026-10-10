"use client";
import { useState } from "react";
import { useAccount } from "wagmi";
import { WalletButton } from "@/components/Header";
import { ComingSoon, PageHero } from "@/components/PageHero";
import { useToast } from "@/components/Toast";

const PHASES = [
  { name: "Founding Outlaws", when: "Epochs 1–6 (~12 weeks)", t1: "25%", t2: "5%", pool: "400,000" },
  { name: "Growth", when: "Epochs 7–13 (~14 weeks)", t1: "20%", t2: "5%", pool: "200,000" },
  { name: "Steady", when: "Epoch 14+", t1: "15%", t2: "3%", pool: "~56,400" },
];

export function BountyBanditsView() {
  const { address, isConnected } = useAccount();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const link = address ? `https://tradewood.app/?ref=${address}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast({ kind: "success", title: "Referral link copied" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ kind: "error", title: "Couldn't copy", body: "Select the link and copy it manually." });
    }
  };
  return (
    <div className="space-y-8">
      <PageHero gold pill="Bounty Bandits" pillIcon="fa-mask" title={<>Recruit your crew. <span className="gradient-gold-text">Split the bounty.</span></>}
        sub="Earn a share of Sherwood fees on every swap your recruits make, plus $WOOD bonuses from a fixed guild budget." />

      <div className="glass-card-gold rounded-3xl p-6 max-w-3xl mx-auto">
        <p className="text-xs font-mono text-goldLight uppercase tracking-wider mb-3">Your Sherwood referral link</p>
        {isConnected ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <input readOnly value={link} aria-label="Your referral link" className="flex-1 min-w-0 bg-panelBg border border-sherwoodGold/30 rounded-xl px-4 py-3 font-mono text-xs text-white outline-none" onFocus={(e) => e.target.select()} />
            <button onClick={copy} className="px-5 py-3 rounded-xl bg-gradient-to-r from-sherwoodGold to-goldLight text-black font-extrabold text-xs font-mono uppercase tracking-wider shadow-gold-glow active:scale-95">
              <i className={`fa-solid ${copied ? "fa-check" : "fa-copy"}`} /> {copied ? "Copied" : "Copy Link"}
            </button>
          </div>
        ) : (
          <div className="max-w-xs"><WalletButton full /></div>
        )}
        <p className="text-[11px] text-slate-400 mt-3">Links work now. Swaps made through them are tagged to you on-chain, and rewards start when the program launches.</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 glass-card rounded-3xl p-6">
          <h3 className="font-display font-bold text-white text-lg mb-1">Reward phases</h3>
          <p className="text-xs text-slate-400 mb-5">Cash share comes from the treasury&apos;s cut of fees on your recruits&apos; trades. The treasury always keeps at least 70%.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="text-slate-400 text-[10px] uppercase border-b border-emeraldGlow/10">
                <tr><th className="text-left pb-2">Phase</th><th className="text-right pb-2">Direct</th><th className="text-right pb-2">2nd level</th><th className="text-right pb-2">$WOOD / epoch</th></tr>
              </thead>
              <tbody className="divide-y divide-emeraldGlow/5">
                {PHASES.map((p, i) => (
                  <tr key={p.name}>
                    <td className="py-3"><p className={`font-bold ${i === 0 ? "text-goldLight" : "text-white"}`}>{p.name}</p><p className="text-[10px] text-slate-500">{p.when}</p></td>
                    <td className="text-right text-neonGreen font-bold">{p.t1}</td>
                    <td className="text-right text-white">{p.t2}</td>
                    <td className="text-right text-white">{p.pool}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-5 space-y-2 text-xs text-slate-300">
            <li><i className="fa-solid fa-gift text-sherwoodGold w-5" /> New recruits get <b className="text-white">10% of their swap fees back in $WOOD</b> for 30 days.</li>
            <li><i className="fa-solid fa-lock text-neonGreen w-5" /> Founding referrers keep Founding rates on existing recruits for 12 months.</li>
            <li><i className="fa-solid fa-shield-halved text-sky-300 w-5" /> No self-referrals. Trades count from $10, and rewards start after $50 of recruit volume.</li>
          </ul>
        </div>
        <div className="lg:col-span-2 glass-card rounded-3xl p-6 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display font-bold text-white text-lg">Your Guild</h3>
            <ComingSoon />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[["Recruits", "—"], ["Recruit volume", "—"], ["Claimable", "—"], ["Rank", "—"]].map(([k, v]) => (
              <div key={k} className="bg-panelCard/70 rounded-2xl p-4 border border-emeraldGlow/10">
                <p className="text-[10px] font-mono text-slate-400 uppercase">{k}</p>
                <p className="text-xl font-mono font-bold text-white mt-1">{v}</p>
              </div>
            ))}
          </div>
          <button disabled className="btn-primary w-full py-3 text-xs !rounded-xl mt-auto pt-3">Claim rewards</button>
        </div>
      </div>
    </div>
  );
}
