"use client";
import { formatGwei } from "viem";
import { useBlockNumber, useGasPrice } from "wagmi";
import { robinhoodChain } from "@/config/chains";
import { useEthPrice } from "@/hooks/useEthPrice";
import { Dot } from "./Dot";

/** Live network ticker — every number here is read from Robinhood Chain. */
export function Marquee() {
  const { data: block } = useBlockNumber({ chainId: robinhoodChain.id, watch: { enabled: true, pollingInterval: 6000 } });
  const { data: gas } = useGasPrice({ chainId: robinhoodChain.id, query: { refetchInterval: 15000 } });
  const { data: ethPrice } = useEthPrice();

  const items = (
    <>
      <Item dot label="NETWORK" value="Robinhood Chain · ID 4663" />
      <Item label="ETH / USDG" value={ethPrice ? `$${ethPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"} tone="text-neonGreen" />
      <Item label="BLOCK" value={block ? `#${block.toLocaleString("en-US")}` : "—"} />
      <Item label="GAS" value={gas ? `${Number(formatGwei(gas)).toFixed(4)} gwei (ETH)` : "—"} tone="text-emeraldGlow" />
      <Item label="$WOOD" value="Launching soon" tone="text-goldLight" />
      <Item dot label="SHERWOOD ROUTER" value="Uniswap V2 + V3 best-route engine" />
    </>
  );
  return (
    <div className="bg-forestDark/90 border-b border-emeraldGlow/20 py-2 text-xs font-mono overflow-hidden whitespace-nowrap">
      <div className="flex w-max animate-marquee">
        <div className="flex items-center gap-10 pr-10">{items}</div>
        <div className="flex items-center gap-10 pr-10" aria-hidden>{items}</div>
      </div>
    </div>
  );
}

function Item({ label, value, tone = "text-white", dot }: { label: string; value: string; tone?: string; dot?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {dot && <Dot />}
      <span className="text-slate-400">{label}:</span>
      <span className={`font-bold ${tone}`}>{value}</span>
    </div>
  );
}
