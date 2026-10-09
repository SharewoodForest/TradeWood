import type { ReactNode } from "react";
export function PageHero({ pill, pillIcon, title, sub, gold }: { pill: string; pillIcon: string; title: ReactNode; sub: string; gold?: boolean }) {
  return (
    <div className="text-center max-w-2xl mx-auto space-y-2 mb-8">
      <span className={gold ? "pill !bg-sherwoodGold/10 !text-goldLight !border-sherwoodGold/30" : "pill"}>
        <i className={`fa-solid ${pillIcon}`} /> {pill}
      </span>
      <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white">{title}</h1>
      <p className="text-slate-400 text-xs sm:text-sm">{sub}</p>
    </div>
  );
}

export function ComingSoon({ label = "Opens at launch" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-goldLight bg-sherwoodGold/10 border border-sherwoodGold/30 px-2.5 py-1 rounded-full">
      <i className="fa-solid fa-hourglass-half" /> {label}
    </span>
  );
}
