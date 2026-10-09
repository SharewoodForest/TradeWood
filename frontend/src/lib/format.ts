import { formatUnits } from "viem";

export function fmtAmount(v: bigint | undefined, decimals: number, maxFrac = 6): string {
  if (v === undefined) return "—";
  const n = Number(formatUnits(v, decimals));
  if (n === 0) return "0";
  if (n < 1 / 10 ** maxFrac) return `<${(1 / 10 ** maxFrac).toFixed(maxFrac)}`;
  const frac = n >= 1000 ? 2 : n >= 1 ? 4 : maxFrac;
  return n.toLocaleString("en-US", { maximumFractionDigits: frac });
}

export function fmtUsd(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 4 : 2 });
}

export const shortAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function safeStorage() {
  return {
    get(k: string): string | null {
      try {
        return window.localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k: string, v: string) {
      try {
        window.localStorage.setItem(k, v);
      } catch {
        /* storage unavailable (private mode) — ignore */
      }
    },
  };
}
