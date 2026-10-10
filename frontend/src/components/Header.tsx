"use client";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Dot } from "./Dot";

export const NAV = [
  { href: "/", label: "Exchange", icon: "fa-solid fa-arrow-right-arrow-left", tone: "" },
  { href: "/vaults/", label: "Yield Vaults", icon: "fa-solid fa-vault", tone: "" },
  { href: "/bounty-bandits/", label: "Bounty Bandits", icon: "fa-solid fa-mask", tone: "text-sherwoodGold" },
  { href: "/quests/", label: "Quests", icon: "fa-solid fa-scroll", tone: "text-amber-400" },
  { href: "/analytics/", label: "Analytics", icon: "fa-solid fa-chart-line", tone: "" },
  { href: "/docs/", label: "Docs", icon: "fa-solid fa-book-open", tone: "" },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href.replace(/\/$/, "")));

export function Header() {
  const path = usePathname() || "/";
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 glass-card border-x-0 border-t-0 border-b border-emeraldGlow/20 px-4 lg:px-8 py-3.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 group shrink-0" onClick={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-mark.png"
            alt="TradeWood logo"
            width={44}
            height={56}
            className="h-11 sm:h-12 w-auto group-hover:scale-105 transition-transform duration-300"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-display font-black text-xl sm:text-2xl tracking-tight text-white">
                trade<span className="text-neonGreen">wood</span>
              </span>
              <span className="hidden sm:inline text-[10px] font-mono font-bold bg-emeraldGlow/15 text-neonGreen px-1.5 py-0.5 rounded border border-emeraldGlow/30 uppercase">.app</span>
            </div>
            <p className="hidden sm:block text-[10px] text-slate-400 font-medium tracking-wider uppercase font-mono">The Sherwood Protocol</p>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-1 bg-panelBg/90 p-1.5 rounded-2xl border border-emeraldGlow/20" aria-label="Main">
          {NAV.map((n) => {
            const active = isActive(path, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-2 ${
                  active ? "text-neonGreen bg-emeraldGlow/15 border border-emeraldGlow/30 shadow-sm" : "text-slate-400 hover:text-white border border-transparent"
                }`}
              >
                <i className={`${n.icon} ${active ? "" : n.tone}`} /> {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden xl:flex items-center gap-2 bg-emerald-950/80 border border-emeraldGlow/40 px-3 py-1.5 rounded-xl text-xs font-mono text-emerald-300">
            <Dot />
            <i className="fa-solid fa-feather text-sherwoodGold text-xs" />
            <span>Robinhood Chain</span>
          </div>
          <WalletButton />
          <button
            onClick={() => setOpen((o) => !o)}
            className="lg:hidden w-10 h-10 shrink-0 rounded-xl bg-panelCard border border-emeraldGlow/20 text-slate-200"
            aria-label="Open menu"
            aria-expanded={open}
          >
            <i className={`fa-solid ${open ? "fa-xmark" : "fa-bars"} text-lg`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden max-w-7xl mx-auto pt-4 pb-2 border-t border-emeraldGlow/10 mt-3 grid grid-cols-2 gap-2">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className={`p-3 rounded-xl bg-panelCard border text-left text-xs font-bold font-mono flex items-center gap-2 ${
                isActive(path, n.href) ? "border-emeraldGlow/50 text-neonGreen" : "border-emeraldGlow/10 text-white"
              }`}
            >
              <i className={`${n.icon} ${n.tone || "text-neonGreen"}`} /> {n.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}

export function WalletButton({ full = false }: { full?: boolean }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        const base = `btn-primary !rounded-xl px-4 py-2.5 text-xs ${full ? "w-full !rounded-2xl py-4 text-sm" : ""}`;
        if (!ready) return <button className={base} aria-hidden style={{ opacity: 0 }} />;
        if (!connected)
          return (
            <button onClick={openConnectModal} className={base}>
              <i className="fa-solid fa-wallet" /> {full ? "Connect Wallet" : <><span className="sm:hidden">Connect</span><span className="hidden sm:inline">Connect Wallet</span></>}
            </button>
          );
        if (chain.unsupported)
          return (
            <button onClick={openChainModal} className={`${base} !bg-none !bg-robinRed text-white`}>
              <i className="fa-solid fa-triangle-exclamation" /> {full ? "Switch to Robinhood Chain" : "Wrong network"}
            </button>
          );
        return (
          <button onClick={openAccountModal} className={base}>
            <i className="fa-solid fa-wallet" /> {account.displayName}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
