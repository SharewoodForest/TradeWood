import { type Address, getAddress, parseAbi } from "viem";

const envAddr = (v: string | undefined): Address | undefined => {
  try {
    return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? getAddress(v) : undefined;
  } catch {
    return undefined;
  }
};

// ── Protocol contracts (not deployed yet → undefined → UI shows "Launching soon") ──
export const SHERWOOD_ROUTER = envAddr(process.env.NEXT_PUBLIC_SHERWOOD_ROUTER);
export const WOOD_TOKEN = envAddr(process.env.NEXT_PUBLIC_WOOD_TOKEN);

// ── Robinhood Chain mainnet infrastructure (project-state §4) ──
export const WETH: Address = getAddress("0x0bd7d308f8e1639fab988df18a8011f41eacad73");
export const USDG: Address = getAddress("0x5fc5360d0400a0fd4f2af552add042d716f1d168");
export const UNISWAP_V2_ROUTER: Address = getAddress("0x89e5db8b5aa49aa85ac63f691524311aeb649eba");
export const UNISWAP_V3_QUOTER_V2: Address = getAddress("0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7");
export const V3_FEE_TIERS = [500, 3000, 10000] as const;

export const NATIVE = "0x0000000000000000000000000000000000000000" as const;

export type Token = {
  symbol: string;
  name: string;
  address: Address; // NATIVE for ETH
  decimals: number;
  icon: string; // font-awesome class
  tone: string; // tailwind classes for the icon chip
  v2Only?: boolean; // WOOD: route through V2 (its pool + tax live there)
};

export const TOKENS: Token[] = [
  { symbol: "ETH", name: "Ether", address: NATIVE, decimals: 18, icon: "fa-brands fa-ethereum", tone: "bg-indigo-500/20 text-indigo-300" },
  { symbol: "USDG", name: "Global Dollar", address: USDG, decimals: 6, icon: "fa-solid fa-dollar-sign", tone: "bg-blue-500/20 text-blue-300" },
  { symbol: "WETH", name: "Wrapped Ether", address: WETH, decimals: 18, icon: "fa-brands fa-ethereum", tone: "bg-slate-500/20 text-slate-300" },
  ...(WOOD_TOKEN
    ? [{ symbol: "WOOD", name: "TradeWood", address: WOOD_TOKEN, decimals: 18, icon: "fa-solid fa-tree", tone: "bg-neonGreen/20 text-neonGreen", v2Only: true }]
    : []),
  // Stock tokens: add verified addresses from docs.robinhood.com/chain/contracts (Stock Tokens table) here.
];

// ── ABIs (minimal, hand-written from contracts/ and project-state §2) ──
export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
]);

export const v2RouterAbi = parseAbi([
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
]);

export const quoterV2Abi = parseAbi([
  "function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
]);

export const sherwoodRouterAbi = [
  {
    type: "function",
    name: "swap",
    stateMutability: "payable",
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "venue", type: "uint8" },
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "minAmountOut", type: "uint256" },
          { name: "v2Path", type: "address[]" },
          { name: "v3Path", type: "bytes" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "referrer", type: "address" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  { type: "function", name: "feeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "error", name: "Expired", inputs: [] },
  { type: "error", name: "InvalidAmount", inputs: [] },
  { type: "error", name: "InvalidPath", inputs: [] },
  { type: "error", name: "SameToken", inputs: [] },
  { type: "error", name: "EnforcedPause", inputs: [] },
  { type: "error", name: "InsufficientOutput", inputs: [{ name: "amountOut", type: "uint256" }, { name: "minAmountOut", type: "uint256" }] },
] as const;

export const woodTokenAbi = parseAbi([
  "function tradingEnabled() view returns (bool)",
  "function buyLpFeeBps() view returns (uint16)",
  "function buyTreasuryFeeBps() view returns (uint16)",
  "function sellLpFeeBps() view returns (uint16)",
  "function sellTreasuryFeeBps() view returns (uint16)",
  "function maxTxAmount() view returns (uint256)",
  "function limitsInEffect() view returns (bool)",
]);

// Router fee when the router isn't deployed yet (shown in quotes; read live from feeBps() once deployed)
export const DEFAULT_ROUTER_FEE_BPS = 10n;
