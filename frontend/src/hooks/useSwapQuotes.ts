"use client";
import { useQuery } from "@tanstack/react-query";
import type { PublicClient } from "viem";
import { usePublicClient, useReadContracts } from "wagmi";
import { DEFAULT_ROUTER_FEE_BPS, SHERWOOD_ROUTER, type Token, WOOD_TOKEN, sherwoodRouterAbi, woodTokenAbi } from "@/config/contracts";
import { robinhoodChain } from "@/config/chains";
import { type QuoteResult, quoteSwap, work } from "@/lib/quote";

export { VENUE_NAMES, quoteSwap, shortLabel } from "@/lib/quote";
export type { Plan, PlanLeg, QuoteResult, Route, Venue } from "@/lib/quote";

export function useWoodTax() {
  const enabled = Boolean(WOOD_TOKEN);
  const { data } = useReadContracts({
    allowFailure: true,
    contracts: enabled
      ? (["buyLpFeeBps", "buyTreasuryFeeBps", "sellLpFeeBps", "sellTreasuryFeeBps"] as const).map((fn) => ({
          address: WOOD_TOKEN!, abi: woodTokenAbi, functionName: fn, chainId: robinhoodChain.id,
        }))
      : [],
    query: { enabled, staleTime: 60_000 },
  });
  const n = (i: number) => BigInt((data?.[i]?.result as number | undefined) ?? 0);
  return { buyBps: n(0) + n(1), sellBps: n(2) + n(3) };
}

export function useRouterFeeBps(): bigint {
  const { data } = useReadContracts({
    allowFailure: true,
    contracts: SHERWOOD_ROUTER
      ? [{ address: SHERWOOD_ROUTER, abi: sherwoodRouterAbi, functionName: "feeBps", chainId: robinhoodChain.id }]
      : [],
    query: { enabled: Boolean(SHERWOOD_ROUTER), staleTime: 60_000 },
  });
  const v = data?.[0]?.result as bigint | undefined;
  return v ?? DEFAULT_ROUTER_FEE_BPS;
}

/**
 * Multi-venue quoting ("multi-prong"): quotes Uniswap V2 (direct + via WETH), Uniswap V3 (all fee tiers, direct +
 * via WETH) and Uniswap V4 (standard tiers + curated hooked pools, native ETH and WETH, direct + via ETH) in parallel
 * against live Robinhood Chain liquidity, then searches for a split across venues that beats the best single route.
 */
export function useSwapQuotes(tokenIn: Token, tokenOut: Token, amountIn: bigint) {
  const client = usePublicClient({ chainId: robinhoodChain.id });
  const feeBps = useRouterFeeBps();
  const tax = useWoodTax();

  return useQuery<QuoteResult>({
    queryKey: ["quotes", tokenIn.address, tokenOut.address, amountIn.toString(), feeBps.toString(), tax.buyBps.toString(), tax.sellBps.toString()],
    enabled: Boolean(client) && amountIn > 0n && work(tokenIn.address) !== work(tokenOut.address),
    refetchInterval: 15_000,
    staleTime: 10_000,
    queryFn: () => quoteSwap(client as PublicClient, tokenIn, tokenOut, amountIn, feeBps, tax),
  });
}

