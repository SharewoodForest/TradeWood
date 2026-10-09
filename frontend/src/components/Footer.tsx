import Link from "next/link";

export function Footer() {
  return (
    <footer className="glass-card border-x-0 border-b-0 border-t border-emeraldGlow/20 py-8 px-4 lg:px-8 mt-12">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-tree text-neonGreen" />
          <span className="font-display font-bold text-white">tradewood.app</span>
          <span>· The Sherwood Protocol on Robinhood Chain</span>
        </div>
        <div className="flex items-center gap-5 font-mono">
          <Link href="/docs/" className="hover:text-neonGreen">Docs</Link>
          <a href="https://github.com/SharewoodForest/TradeWood" target="_blank" rel="noreferrer" className="hover:text-neonGreen">
            <i className="fa-brands fa-github" /> GitHub
          </a>
          <a href="https://robinhoodchain.blockscout.com" target="_blank" rel="noreferrer" className="hover:text-neonGreen">Explorer</a>
        </div>
      </div>
      <p className="max-w-7xl mx-auto mt-4 text-[11px] text-slate-500 leading-relaxed">
        TradeWood is an independent project built on Robinhood Chain and is not affiliated with or endorsed by Robinhood Markets, Inc.
        Swaps route through Uniswap liquidity. DeFi carries risk; nothing here is financial advice.
      </p>
    </footer>
  );
}
