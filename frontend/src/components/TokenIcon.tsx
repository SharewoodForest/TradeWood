"use client";
import { useState } from "react";
import type { Token } from "@/config/contracts";

export function TokenIcon({ token, size = "w-6 h-6 text-xs" }: { token: Token; size?: string }) {
  const [brokenSrc, setBrokenSrc] = useState<string>();
  if (token.logo && brokenSrc !== token.logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static export, tiny self-hosted icons
      <img src={token.logo} alt="" loading="lazy" onError={() => setBrokenSrc(token.logo)} className={`${size} rounded-full object-cover shrink-0 bg-white/5`} />
    );
  }
  return (
    <span className={`${size} rounded-full flex items-center justify-center font-bold shrink-0 ${token.tone}`}>
      {token.icon ? <i className={token.icon} /> : <span className="font-mono text-[0.7em] leading-none">{token.symbol.slice(0, 2)}</span>}
    </span>
  );
}
