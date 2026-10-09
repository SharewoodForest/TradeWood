"use client";
import { useQuery } from "@tanstack/react-query";
import { encodePacked, formatUnits, parseEther } from "viem";
import { usePublicClient } from "wagmi";
import { robinhoodChain } from "@/config/chains";
import { UNISWAP_V3_QUOTER_V2, USDG, WETH, quoterV2Abi } from "@/config/contracts";

/** ETH price in USDG from the live Uniswap V3 0.05% pool. */
export function useEthPrice() {
  const client = usePublicClient({ chainId: robinhoodChain.id });
  return useQuery({
    queryKey: ["eth-usdg"],
    enabled: Boolean(client),
    refetchInterval: 30_000,
    staleTime: 20_000,
    queryFn: async () => {
      const path = encodePacked(["address", "uint24", "address"], [WETH, 500, USDG]);
      const r = await client!.simulateContract({ address: UNISWAP_V3_QUOTER_V2, abi: quoterV2Abi, functionName: "quoteExactInput", args: [path, parseEther("1")] });
      return Number(formatUnits(r.result[0], 6));
    },
  });
}
