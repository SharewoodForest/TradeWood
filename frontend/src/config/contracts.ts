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

// Uniswap V4 (official deployment, Uniswap sdk-core ROBINHOOD_ADDRESSES; verified on-chain)
export const UNISWAP_V4_POOL_MANAGER: Address = getAddress("0x8366a39cc670b4001a1121b8f6a443a643e40951");
export const UNISWAP_V4_QUOTER: Address = getAddress("0x8dc178efb8111bb0973dd9d722ebeff267c98f94");
export const UNISWAP_V4_STATE_VIEW: Address = getAddress("0xf3334192d15450cdd385c8b70e03f9a6bd9e673b");
/** Hookless V4 pools at the standard fee/tick-spacing pairs. */
export const V4_STANDARD_TIERS = [
  { fee: 100, tickSpacing: 1 },
  { fee: 500, tickSpacing: 10 },
  { fee: 3000, tickSpacing: 60 },
  { fee: 10000, tickSpacing: 200 },
] as const;
export type V4PoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };
/**
 * Curated hooked V4 pools worth routing through (deep liquidity, verified to swap through the Sherwood Router on a
 * mainnet fork). Only pools of pairs we list. fee 0x800000 = V4 dynamic-fee flag.
 */
export const V4_HOOKED_POOLS: { key: V4PoolKey; label: string }[] = [
  {
    label: "dynamic fee",
    key: {
      currency0: "0x0000000000000000000000000000000000000000",
      currency1: getAddress("0x5fc5360d0400a0fd4f2af552add042d716f1d168"),
      fee: 0x800000,
      tickSpacing: 10,
      hooks: getAddress("0x06a889870c8f83640d6816319f72e2aa579b6080"),
    },
  },
];

export const NATIVE = "0x0000000000000000000000000000000000000000" as const;

export type TokenCategory = "Crypto" | "Stablecoins" | "Stocks" | "Ecosystem";

export type Token = {
  symbol: string;
  name: string;
  address: Address; // NATIVE for ETH
  decimals: number;
  icon: string; // font-awesome class ("" = show the symbol's first letters)
  tone: string; // tailwind classes for the icon chip
  category?: TokenCategory;
  popular?: boolean; // shown as a quick-pick chip
  usdPegged?: boolean; // ~$1, used for the USD estimate under amounts
  imported?: boolean; // added by the user from a pasted address (not on our list)
  v2Only?: boolean; // WOOD: route through V2 (its pool + tax live there)
};

const st = (symbol: string, name: string, address: string, popular = false): Token => ({
  symbol, name: `${name} • Robinhood Token`, address: getAddress(address), decimals: 18, icon: "fa-solid fa-chart-line",
  tone: "bg-emerald-500/15 text-emerald-300", category: "Stocks", popular,
});

/**
 * Listed tokens. Every address was checked on Robinhood Chain (code, symbol, decimals) on 2026-10-21, and each
 * non-core token was bought and sold through the live Sherwood Router on a mainnet fork. Only tokens with a live
 * Uniswap pool are listed (LINK, PENDLE, 1INCH and SUSHI had none; syrupUSDG's pools
 * were too thin, ~98% price impact on $50). Stock tokens share one Robinhood proxy beacon.
 */
export const TOKENS: Token[] = [
  { symbol: "ETH", name: "Ether", address: NATIVE, decimals: 18, icon: "fa-brands fa-ethereum", tone: "bg-indigo-500/20 text-indigo-300", category: "Crypto", popular: true },
  { symbol: "USDG", name: "Global Dollar", address: USDG, decimals: 6, icon: "fa-solid fa-dollar-sign", tone: "bg-blue-500/20 text-blue-300", category: "Stablecoins", popular: true, usdPegged: true },
  { symbol: "WETH", name: "Wrapped Ether", address: WETH, decimals: 18, icon: "fa-brands fa-ethereum", tone: "bg-slate-500/20 text-slate-300", category: "Crypto" },
  ...(WOOD_TOKEN
    ? [{ symbol: "WOOD", name: "TradeWood", address: WOOD_TOKEN, decimals: 18, icon: "fa-solid fa-tree", tone: "bg-neonGreen/20 text-neonGreen", category: "Ecosystem" as const, popular: true, v2Only: true }]
    : []),
  // Robinhood stock tokens
  st("NVDA", "NVIDIA", "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", true),
  st("SPY", "SPDR S&P 500 ETF", "0x117cc2133c37b721f49de2a7a74833232b3b4c0c", true),
  st("AAPL", "Apple", "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9"),
  st("TSLA", "Tesla", "0x322F0929c4625eD5bAd873c95208D54E1c003b2d"),
  // Crypto
  { symbol: "cbBTC", name: "Coinbase Wrapped BTC", address: getAddress("0xCEC185eB182c47d1bA1EFc84e6959e18cd620Be4"), decimals: 8, icon: "fa-brands fa-bitcoin", tone: "bg-orange-500/20 text-orange-300", category: "Crypto", popular: true },
  { symbol: "VIRTUAL", name: "Virtuals Protocol", address: getAddress("0xc6911796042b15d7Fa4F6CDe69e245DdCd3d9c31"), decimals: 18, icon: "fa-solid fa-robot", tone: "bg-violet-500/20 text-violet-300", category: "Crypto" },
  // Stablecoins
  { symbol: "USDe", name: "Ethena USDe", address: getAddress("0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34"), decimals: 18, icon: "fa-solid fa-dollar-sign", tone: "bg-slate-500/20 text-slate-200", category: "Stablecoins", usdPegged: true },
  { symbol: "UUSD", name: "Unity USD", address: getAddress("0x61a10E8556BEd032eA176330e7F17D6a12a10000"), decimals: 18, icon: "fa-solid fa-dollar-sign", tone: "bg-teal-500/20 text-teal-300", category: "Stablecoins", usdPegged: true },
  // Ecosystem
  { symbol: "CASHCAT", name: "Cash Cat", address: getAddress("0x020bfC650A365f8BB26819deAAbF3E21291018b4"), decimals: 18, icon: "fa-solid fa-cat", tone: "bg-yellow-500/20 text-yellow-300", category: "Ecosystem", popular: true },
  { symbol: "PONS", name: "Pons", address: getAddress("0x39dBED3a2bd333467115dE45665cC57F813C4571"), decimals: 18, icon: "fa-solid fa-bridge", tone: "bg-purple-500/20 text-purple-300", category: "Ecosystem" },
  { symbol: "PENGU", name: "Pudgy Penguins", address: getAddress("0x74BE72AFFAFbC8de30F0C11247814036314D625f"), decimals: 18, icon: "fa-solid fa-snowflake", tone: "bg-sky-500/20 text-sky-300", category: "Ecosystem" },
];

/** $WOOD before launch: shown in the picker as a link to the seed sale (it can't be swapped until trading opens). */
export const WOOD_SEED = { symbol: "WOOD", name: "TradeWood • seed sale open", address: getAddress("0x92FC190e5ABAcc1D246C316aCC0EE283682b25fD"), href: "/seed/" };

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

const poolKeyComponents = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;

export const v4QuoterAbi = [
  {
    type: "function",
    name: "quoteExactInput",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "exactCurrency", type: "address" },
          {
            name: "path",
            type: "tuple[]",
            components: [
              { name: "intermediateCurrency", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
              { name: "hookData", type: "bytes" },
            ],
          },
          { name: "exactAmount", type: "uint128" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }, { name: "gasEstimate", type: "uint256" }],
  },
] as const;

export const v4StateViewAbi = parseAbi(["function getLiquidity(bytes32 poolId) view returns (uint128)"]);

/** Sherwood Router leg data for V4: abi.encode(V4Hop[]) */
export const v4HopsParam = [
  {
    type: "tuple[]",
    components: [
      { name: "key", type: "tuple", components: poolKeyComponents },
      { name: "hookData", type: "bytes" },
    ],
  },
] as const;

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
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "minAmountOut", type: "uint256" },
          {
            name: "legs",
            type: "tuple[]",
            components: [
              { name: "venue", type: "uint8" },
              { name: "weightBps", type: "uint16" },
              { name: "data", type: "bytes" },
            ],
          },
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
  { type: "error", name: "InvalidLegs", inputs: [] },
  { type: "error", name: "PartialFill", inputs: [] },
  { type: "error", name: "NoOutput", inputs: [] },
  { type: "error", name: "InvalidRecipient", inputs: [] },
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
