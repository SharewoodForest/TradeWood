"use client";
import { useQuery } from "@tanstack/react-query";
import { type Address, type Hex, encodePacked } from "viem";
import { usePublicClient, useReadContracts } from "wagmi";
import {
  DEFAULT_ROUTER_FEE_BPS, NATIVE, SHERWOOD_ROUTER, type Token, UNISWAP_V2_ROUTER, UNISWAP_V3_QUOTER_V2,
  V3_FEE_TIERS, WETH, WOOD_TOKEN, quoterV2Abi, sherwoodRouterAbi, v2RouterAbi, woodTokenAbi,
} from "@/config/contracts";
import { robinhoodChain } from "@/config/chains";

export type Route = {
  venue: 0 | 1; // 0 = Uniswap V2, 1 = Uniswap V3
  label: string;
  hops: string;
  v2Path: Address[];
  v3Path: Hex;
  amountOut: bigint; // what the user receives (after router fee + WOOD tax estimate)
};

export type QuoteResult = {
  routes: Route[];
  best?: Route;
  fee: bigint;
  net: bigint;
  feeBps: bigint;
  woodTaxBps: bigint; // tax applied to this trade (0 if WOOD not involved)
  priceImpactPct?: number;
};

const work = (a: Address) => (a === NATIVE ? WETH : a);
const v3PathOf = (tokens: Address[], fees: number[]): Hex => {
  const types: ("address" | "uint24")[] = [];
  const values: (Address | number)[] = [];
  tokens.forEach((t, i) => {
    types.push("address");
    values.push(t);
    if (i < fees.length) {
      types.push("uint24");
      values.push(fees[i]);
    }
  });
  return encodePacked(types, values);
};

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
 * Multi-venue quoting ("multi-prong"): quotes Uniswap V2 (direct + via WETH) and Uniswap V3
 * (all fee tiers, direct + via WETH) in parallel against live Robinhood Chain liquidity.
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
    queryFn: async () => {
      const fee = (amountIn * feeBps) / 10_000n;
      const net = amountIn - fee;
      const a = work(tokenIn.address);
      const b = work(tokenOut.address);
      const isWoodIn = Boolean(WOOD_TOKEN) && a === WOOD_TOKEN;
      const isWoodOut = Boolean(WOOD_TOKEN) && b === WOOD_TOKEN;
      const woodTaxBps = isWoodIn ? tax.sellBps : isWoodOut ? tax.buyBps : 0n;
      const v2Only = Boolean(tokenIn.v2Only || tokenOut.v2Only);
      const viaWeth = a !== WETH && b !== WETH;
      // Selling WOOD: the pair receives `net` minus the sell tax.
      const venueIn = isWoodIn ? (net * (10_000n - woodTaxBps)) / 10_000n : net;
      const afterOutTax = (out: bigint) => (isWoodOut ? (out * (10_000n - woodTaxBps)) / 10_000n : out);

      const candidates: Promise<Route | null>[] = [];

      const v2 = (path: Address[], hops: string) =>
        client!
          .readContract({ address: UNISWAP_V2_ROUTER, abi: v2RouterAbi, functionName: "getAmountsOut", args: [venueIn, path] })
          .then((amts) => ({ venue: 0 as const, label: "Uniswap V2", hops, v2Path: path, v3Path: "0x" as Hex, amountOut: afterOutTax(amts[amts.length - 1]) }))
          .catch(() => null);
      candidates.push(v2([a, b], "direct"));
      if (viaWeth) candidates.push(v2([a, WETH, b], "via WETH"));

      if (!v2Only) {
        const v3 = (tokens: Address[], fees: number[], hops: string) => {
          const path = v3PathOf(tokens, fees);
          return client!
            .simulateContract({ address: UNISWAP_V3_QUOTER_V2, abi: quoterV2Abi, functionName: "quoteExactInput", args: [path, venueIn] })
            .then((r) => ({ venue: 1 as const, label: `Uniswap V3 · ${fees.map((f) => f / 10_000 + "%").join(" → ")}`, hops, v2Path: [] as Address[], v3Path: path, amountOut: r.result[0] }))
            .catch(() => null);
        };
        for (const f of V3_FEE_TIERS) candidates.push(v3([a, b], [f], "direct"));
        if (viaWeth) for (const f of [500, 3000]) candidates.push(v3([a, WETH, b], [f, f], "via WETH"));
      }

      const routes = (await Promise.all(candidates)).filter((r): r is Route => !!r && r.amountOut > 0n).sort((x, y) => (y.amountOut > x.amountOut ? 1 : -1));
      const best = routes[0];

      // Price impact: compare best route's rate against a 1/1000-size quote on the same route.
      let priceImpactPct: number | undefined;
      if (best && venueIn > 1000n) {
        const small = venueIn / 1000n;
        try {
          let smallOut: bigint;
          if (best.venue === 0) {
            const amts = await client!.readContract({ address: UNISWAP_V2_ROUTER, abi: v2RouterAbi, functionName: "getAmountsOut", args: [small, best.v2Path] });
            smallOut = afterOutTax(amts[amts.length - 1]);
          } else {
            const r = await client!.simulateContract({ address: UNISWAP_V3_QUOTER_V2, abi: quoterV2Abi, functionName: "quoteExactInput", args: [best.v3Path, small] });
            smallOut = r.result[0];
          }
          if (smallOut > 0n) {
            const ideal = Number(smallOut) * 1000;
            priceImpactPct = Math.max(0, ((ideal - Number(best.amountOut)) / ideal) * 100);
          }
        } catch {
          /* leave undefined */
        }
      }
      return { routes, best, fee, net, feeBps, woodTaxBps, priceImpactPct };
    },
  });
}
