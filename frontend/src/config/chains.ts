import { defineChain } from "viem";

// Values from .context/project-state.md §4 (verified on-chain 2026-10-08)
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com"] } },
  testnet: true,
});

export const explorerTx = (hash: string) => `https://robinhoodchain.blockscout.com/tx/${hash}`;
export const explorerAddress = (addr: string) => `https://robinhoodchain.blockscout.com/address/${addr}`;
