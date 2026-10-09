"use client";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { robinhoodChain } from "@/config/chains";
import { WOOD_TOKEN, erc20Abi } from "@/config/contracts";
import { fmtAmount, shortAddr } from "@/lib/format";

/** Connected-wallet banner from the design, showing only real balances. */
export function WalletHud() {
  const { address, isConnected, connector } = useAccount();
  const { data: eth } = useBalance({ address, chainId: robinhoodChain.id, query: { enabled: isConnected } });
  const { data: wood } = useReadContract({
    address: WOOD_TOKEN, abi: erc20Abi, functionName: "balanceOf", args: address ? [address] : undefined, chainId: robinhoodChain.id,
    query: { enabled: isConnected && Boolean(WOOD_TOKEN) },
  });
  if (!isConnected) return null;
  return (
    <div className="bg-gradient-to-r from-emerald-950/90 via-panelBg to-forestDark border-b border-emeraldGlow/30 py-2.5 px-4 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-slate-400">ACCOUNT:</span>
          <span className="text-neonGreen font-bold bg-emeraldGlow/10 px-2 py-0.5 rounded border border-emeraldGlow/30">{shortAddr(address)}</span>
          {connector?.name && (
            <span className="hidden sm:inline text-slate-400">
              | PROVIDER: <span className="text-goldLight font-bold">{connector.name}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-6">
          <div>
            <span className="text-slate-400">ETH:</span>
            <span className="text-white font-bold ml-1">{eth ? fmtAmount(eth.value, 18, 5) : "—"}</span>
          </div>
          <div>
            <span className="text-slate-400">$WOOD:</span>
            <span className="text-neonGreen font-bold ml-1">{WOOD_TOKEN ? fmtAmount(wood as bigint | undefined, 18, 2) : "Launching soon"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
