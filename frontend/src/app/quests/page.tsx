import type { Metadata } from "next";
import { ComingSoon, PageHero } from "@/components/PageHero";
export const metadata: Metadata = { title: "Quests | TradeWood" };

const QUESTS = [
  { t: "Robin Hood's First Swap", d: "Make a $50+ swap through the Sherwood Router.", pts: 50, icon: "fa-bolt", tone: "text-neonGreen bg-emeraldGlow/15 border-emeraldGlow/30" },
  { t: "Friar Tuck's Blessing", d: "Stake any amount of $WOOD in Friar Tuck's Treasury.", pts: 150, icon: "fa-tree", tone: "text-neonGreen bg-emeraldGlow/15 border-emeraldGlow/30" },
  { t: "Recruit an Outlaw", d: "Invite a friend whose swaps reach $50 through your link.", pts: 300, icon: "fa-user-plus", tone: "text-goldLight bg-sherwoodGold/15 border-sherwoodGold/30" },
  { t: "Sherwood Treasury Supporter", d: "Add liquidity through Little John's LP Vault.", pts: 300, icon: "fa-water", tone: "text-sky-300 bg-sky-500/15 border-sky-400/30" },
];

export default function Quests() {
  return (
    <div className="space-y-8">
      <PageHero gold pill="Bounty Board" pillIcon="fa-scroll" title="Sherwood Quest Board"
        sub="Complete on-chain tasks to earn Bounty Points. Points convert to $WOOD at the end of each 14-day epoch and unlock Founding Outlaw whitelist spots." />
      <div className="grid sm:grid-cols-2 gap-5 max-w-4xl mx-auto">
        {QUESTS.map((q) => (
          <div key={q.t} className="glass-card rounded-3xl p-5 flex gap-4 items-start hover:border-emeraldGlow/40 transition-all">
            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-lg shrink-0 ${q.tone}`}><i className={`fa-solid ${q.icon}`} /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display font-bold text-white">{q.t}</h3>
                <span className="text-xs font-mono font-bold text-neonGreen bg-emeraldGlow/10 border border-emeraldGlow/30 px-2 py-0.5 rounded-full shrink-0">+{q.pts}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">{q.d}</p>
              <div className="mt-3"><ComingSoon label="Opens with Bounty Points" /></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
