import type { Token } from "@/config/contracts";
export function TokenIcon({ token, size = "w-6 h-6 text-xs" }: { token: Token; size?: string }) {
  return (
    <span className={`${size} rounded-full flex items-center justify-center font-bold shrink-0 ${token.tone}`}>
      {token.icon ? <i className={token.icon} /> : <span className="font-mono text-[0.7em] leading-none">{token.symbol.slice(0, 2)}</span>}
    </span>
  );
}
