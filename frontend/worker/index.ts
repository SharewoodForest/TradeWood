/**
 * TradeWood agent API (Cloudflare Worker, runs in front of the static site for /api/* only).
 *
 * Read-only: it never holds keys or sends transactions. It quotes swaps with the same engine as the site and returns
 * unsigned transactions ({ to, data, value, chainId }) that the agent's own wallet signs and sends.
 *
 *   GET /api                 index of endpoints
 *   GET /api/tokens          listed tokens (Uniswap token-list format)
 *   GET /api/quote           best route + ready-to-sign approve/swap transactions
 *   GET /api/seed            $WOOD seed sale status, a wallet's position, and buy/claim transactions
 *
 * Docs for agents: https://tradewood.app/agents.md · OpenAPI: https://tradewood.app/openapi.json
 */
import {
  type Address, type Hex, type PublicClient, BaseError, ContractFunctionRevertedError, createPublicClient,
  encodeFunctionData, formatUnits, getAddress, http, isAddress, parseAbi, parseUnits,
} from "viem";
import { robinhoodChain } from "@/config/chains";
import { NATIVE, TOKENS, type Token, USDG, WETH, WOOD_SEED, erc20Abi, sherwoodRouterAbi } from "@/config/contracts";
import { quoteSwap } from "@/lib/quote";

interface Env {
  SHERWOOD_ROUTER: string;
  SEED_SALE: string;
  RPC_URL?: string;
  ASSETS?: { fetch: (r: Request) => Promise<Response> };
}

const SITE = "https://tradewood.app";
const CHAIN_ID = robinhoodChain.id;
const DEFAULT_SLIPPAGE_BPS = 50;
const MAX_SLIPPAGE_BPS = 1_000; // 10%
const DEFAULT_DEADLINE_SEC = 1_200; // 20 min: long enough for an agent to sign, short enough to limit stale fills

const metaAbi = parseAbi(["function symbol() view returns (string)", "function name() view returns (string)", "function decimals() view returns (uint8)"]);
const routerReadAbi = parseAbi(["function paused() view returns (bool)", "function feeBps() view returns (uint256)"]);
const seedAbi = parseAbi([
  "function saleFinalized() view returns (bool)",
  "function totalRaised() view returns (uint256)",
  "function totalTokensAllocated() view returns (uint256)",
  "function unlockedBps() view returns (uint256)",
  "function isAccepted(address) view returns (bool)",
  "function participants(address) view returns (uint256 totalContributed, uint256 totalAllocated, uint256 totalClaimed)",
  "function getClaimableAmount(address) view returns (uint256)",
  "function buyTokens(address token, uint256 usdcAmount)",
  "function claimTokens()",
]);
const SEED = { priceUsd: 0.0075, minUsd: 10, maxUsdPerWallet: 200, hardCapUsd: 7_500, rateUsdcPerWood: 7_500n } as const;

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

// ───────────────────────────── helpers ─────────────────────────────

const json = (body: unknown, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cache,
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
      "x-robots-tag": "noindex",
    },
  });

const fmt = (v: bigint, d: number) => formatUnits(v, d);

function addressParam(u: URL, name: string, required = false): Address | undefined {
  const v = u.searchParams.get(name)?.trim();
  if (!v) {
    if (required) throw new ApiError(400, "missing_param", `"${name}" is required.`);
    return undefined;
  }
  if (!isAddress(v, { strict: false })) throw new ApiError(400, "bad_address", `"${name}" is not a valid 0x address.`);
  return getAddress(v.toLowerCase());
}

const publicToken = (t: Token) => ({
  symbol: t.symbol,
  name: t.name,
  address: t.address === NATIVE ? "ETH" : t.address,
  decimals: t.decimals,
  category: t.category ?? "Unlisted",
  listed: !t.imported,
  logoURI: t.logo ? SITE + t.logo : undefined,
});

/** "ETH", a listed symbol (case-insensitive) or any 0x address (unlisted ones need allowUnlisted=true). */
async function resolveToken(c: PublicClient, raw: string | null, name: string, allowUnlisted: boolean): Promise<Token> {
  const v = raw?.trim();
  if (!v) throw new ApiError(400, "missing_param", `"${name}" is required: "ETH", a listed symbol (see /api/tokens) or a token address.`);
  const bySym = TOKENS.filter((t) => t.symbol.toLowerCase() === v.toLowerCase());
  if (bySym.length === 1) return bySym[0];
  if (!isAddress(v, { strict: false })) throw new ApiError(400, "unknown_token", `"${v}" is not a listed symbol or a 0x address. See /api/tokens.`);
  const a = getAddress(v.toLowerCase());
  if (a === NATIVE) return TOKENS[0];
  const listed = TOKENS.find((t) => t.address === a);
  if (listed) return listed;
  if (a === WOOD_SEED.address)
    throw new ApiError(409, "wood_not_trading", "$WOOD can't be swapped yet: trading opens after the seed round. Use /api/seed to join the seed sale.", { seed: `${SITE}/api/seed` });
  if (!allowUnlisted)
    throw new ApiError(400, "unlisted_token", `${a} is not on TradeWood's list. Anyone can create a token with any name. Re-send with allowUnlisted=true only if you have verified this address.`);
  try {
    const [symbol, tokenName, decimals] = await Promise.all([
      c.readContract({ address: a, abi: metaAbi, functionName: "symbol" }),
      c.readContract({ address: a, abi: metaAbi, functionName: "name" }),
      c.readContract({ address: a, abi: metaAbi, functionName: "decimals" }),
    ]);
    return { symbol: String(symbol).slice(0, 16), name: String(tokenName).slice(0, 48), address: a, decimals: Number(decimals), icon: "", tone: "", imported: true };
  } catch {
    throw new ApiError(400, "not_erc20", `No ERC-20 token found at ${a} on Robinhood Chain.`);
  }
}

function amountParam(u: URL, t: Token): bigint {
  const raw = u.searchParams.get("amountIn")?.trim();
  const human = u.searchParams.get("amount")?.trim();
  let v: bigint;
  try {
    if (raw) {
      if (!/^\d+$/.test(raw)) throw new Error();
      v = BigInt(raw);
    } else if (human) {
      if (!/^\d*\.?\d+$/.test(human)) throw new Error();
      v = parseUnits(human, t.decimals);
    } else throw new ApiError(400, "missing_param", `Give "amount" (decimal, e.g. 0.05) or "amountIn" (integer base units).`);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "bad_amount", `Invalid amount for ${t.symbol} (${t.decimals} decimals).`);
  }
  if (v <= 0n) throw new ApiError(400, "bad_amount", "Amount must be greater than 0.");
  return v;
}

function revertReason(e: unknown): string {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError) return r.data?.errorName ?? r.reason ?? r.shortMessage;
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}

// ───────────────────────────── /api/quote ─────────────────────────────

async function quote(c: PublicClient, u: URL, env: Env) {
  const router = getAddress(env.SHERWOOD_ROUTER);
  const allowUnlisted = u.searchParams.get("allowUnlisted") === "true";
  const [tokenIn, tokenOut] = await Promise.all([
    resolveToken(c, u.searchParams.get("tokenIn"), "tokenIn", allowUnlisted),
    resolveToken(c, u.searchParams.get("tokenOut"), "tokenOut", allowUnlisted),
  ]);
  const wi = tokenIn.address === NATIVE ? WETH : tokenIn.address;
  const wo = tokenOut.address === NATIVE ? WETH : tokenOut.address;
  if (wi === wo) throw new ApiError(400, "same_token", "tokenIn and tokenOut are the same asset (ETH and WETH count as the same; wrap/unwrap with the WETH contract directly).");
  const amountIn = amountParam(u, tokenIn);

  const slippageBps = Number(u.searchParams.get("slippageBps") ?? DEFAULT_SLIPPAGE_BPS);
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > MAX_SLIPPAGE_BPS)
    throw new ApiError(400, "bad_slippage", `slippageBps must be an integer from 1 to ${MAX_SLIPPAGE_BPS}.`);
  const from = addressParam(u, "from");
  const recipient = addressParam(u, "recipient") ?? from;
  const referrer = addressParam(u, "referrer") ?? NATIVE;
  const deadlineSec = Number(u.searchParams.get("deadlineSec") ?? DEFAULT_DEADLINE_SEC);
  if (!Number.isInteger(deadlineSec) || deadlineSec < 60 || deadlineSec > 3_600) throw new ApiError(400, "bad_deadline", "deadlineSec must be 60 to 3600.");

  const [paused, feeBps] = await Promise.all([
    c.readContract({ address: router, abi: routerReadAbi, functionName: "paused" }),
    c.readContract({ address: router, abi: routerReadAbi, functionName: "feeBps" }),
  ]);
  if (paused) throw new ApiError(503, "router_paused", "The Sherwood Router is paused. Try again later.");

  const q = await quoteSwap(c, tokenIn, tokenOut, amountIn, feeBps, { buyBps: 0n, sellBps: 0n });
  if (!q.plan) throw new ApiError(404, "no_route", `No Uniswap V2/V3/V4 route with liquidity for ${tokenIn.symbol} → ${tokenOut.symbol} on Robinhood Chain.`);
  const plan = q.plan;
  const minOut = (plan.amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
  const warnings: string[] = [];
  if (tokenIn.imported || tokenOut.imported) warnings.push("Unlisted token: TradeWood has not checked it. It may be a copy of a real token or have transfer taxes that make the swap revert.");
  if (q.priceImpactPct !== undefined && q.priceImpactPct > 3) warnings.push(`High price impact: ${q.priceImpactPct.toFixed(2)}%. Consider a smaller amount.`);

  const route = {
    label: plan.label,
    split: plan.split,
    legs: plan.legs.map((l) => ({ venue: ["UniswapV2", "UniswapV3", "UniswapV4"][l.route.venue], weightBps: l.weightBps, label: l.route.label, hops: l.route.hops, expectedOut: l.amountOut })),
  };
  const body: Record<string, unknown> = {
    chainId: CHAIN_ID,
    router,
    tokenIn: publicToken(tokenIn),
    tokenOut: publicToken(tokenOut),
    amountIn,
    amountInFormatted: fmt(amountIn, tokenIn.decimals),
    protocolFee: { bps: Number(feeBps), amount: q.fee, formatted: fmt(q.fee, tokenIn.decimals), token: tokenIn.symbol },
    expectedOut: plan.amountOut,
    expectedOutFormatted: fmt(plan.amountOut, tokenOut.decimals),
    minOut,
    minOutFormatted: fmt(minOut, tokenOut.decimals),
    slippageBps,
    priceImpactPct: q.priceImpactPct === undefined ? null : Number(q.priceImpactPct.toFixed(4)),
    route,
    quotedAt: new Date().toISOString(),
    warnings,
  };

  if (!recipient) {
    body.transactions = [];
    body.next = "Add from=<your wallet address> to get ready-to-sign transactions.";
    return body;
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSec);
  const swapData = encodeFunctionData({
    abi: sherwoodRouterAbi,
    functionName: "swap",
    args: [{
      tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn, minAmountOut: minOut,
      legs: plan.legs.map((l) => ({ venue: l.route.venue, weightBps: l.weightBps, data: l.route.data })),
      recipient, deadline, referrer,
    }],
  });
  const value = tokenIn.address === NATIVE ? amountIn : 0n;
  const txs: Record<string, unknown>[] = [];
  let needsApproval = false;

  if (from) {
    const bal = tokenIn.address === NATIVE ? await c.getBalance({ address: from }) : await c.readContract({ address: tokenIn.address, abi: erc20Abi, functionName: "balanceOf", args: [from] });
    if (bal < amountIn) warnings.push(`Insufficient ${tokenIn.symbol}: wallet has ${fmt(bal, tokenIn.decimals)}, swap needs ${fmt(amountIn, tokenIn.decimals)}${tokenIn.address === NATIVE ? " plus gas" : ""}.`);
    if (tokenIn.address !== NATIVE) {
      const allowance = await c.readContract({ address: tokenIn.address, abi: erc20Abi, functionName: "allowance", args: [from, router] });
      if (allowance < amountIn) {
        needsApproval = true;
        txs.push({
          step: "approve",
          description: `Allow the Sherwood Router to spend exactly ${fmt(amountIn, tokenIn.decimals)} ${tokenIn.symbol}. Wait for it to confirm before sending the swap.`,
          chainId: CHAIN_ID, from, to: tokenIn.address, value: "0",
          data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [router, amountIn] }),
        });
      }
    }
    if (!needsApproval && bal >= amountIn) {
      try {
        const gas = await c.estimateGas({ account: from, to: router, data: swapData, value });
        body.gasEstimate = gas;
      } catch (e) {
        warnings.push(`Simulating the swap from ${from} failed (${revertReason(e)}). It would likely revert; re-quote before sending.`);
      }
    }
  }

  txs.push({
    step: "swap",
    description: `Swap ${fmt(amountIn, tokenIn.decimals)} ${tokenIn.symbol} for at least ${fmt(minOut, tokenOut.decimals)} ${tokenOut.symbol} via ${plan.label}. Reverts if the output would be lower, or after the deadline.`,
    chainId: CHAIN_ID, ...(from ? { from } : {}), to: router, value: value.toString(), data: swapData as Hex,
  });
  body.recipient = recipient;
  body.deadline = deadline;
  body.transactions = txs;
  body.next = needsApproval
    ? "Send the approve transaction, wait for confirmation, then send the swap. If more than a minute passes, call /api/quote again for a fresh swap transaction."
    : "Sign and send the swap transaction from your wallet before the deadline.";
  return body;
}

// ───────────────────────────── /api/seed ─────────────────────────────

async function seed(c: PublicClient, u: URL, env: Env) {
  const sale = getAddress(env.SEED_SALE);
  const wallet = addressParam(u, "wallet") ?? addressParam(u, "from");
  const amountUsdRaw = u.searchParams.get("amountUsd")?.trim();

  const [finalized, raised, unlockedBps, usdgAccepted] = await Promise.all([
    c.readContract({ address: sale, abi: seedAbi, functionName: "saleFinalized" }),
    c.readContract({ address: sale, abi: seedAbi, functionName: "totalRaised" }),
    c.readContract({ address: sale, abi: seedAbi, functionName: "unlockedBps" }),
    c.readContract({ address: sale, abi: seedAbi, functionName: "isAccepted", args: [USDG] }),
  ]);
  const hardCap = BigInt(SEED.hardCapUsd) * 1_000_000n;
  const remainingCap = hardCap > raised ? hardCap - raised : 0n;
  const open = !finalized && usdgAccepted && remainingCap > 0n;

  const body: Record<string, unknown> = {
    chainId: CHAIN_ID,
    saleContract: sale,
    woodToken: WOOD_SEED.address,
    paymentToken: { symbol: "USDG", address: USDG, decimals: 6 },
    status: finalized ? "closed" : remainingCap === 0n ? "sold_out" : open ? "open" : "paused",
    terms: {
      priceUsdPerWood: SEED.priceUsd,
      minContributionUsd: SEED.minUsd,
      maxContributionUsdPerWallet: SEED.maxUsdPerWallet,
      hardCapUsd: SEED.hardCapUsd,
      vesting: "Four 25% milestone tranches after the sale closes; the treasury Safe unlocks each tranche (unlockedBps).",
      refunds: "Contributions are held until the treasury Safe (2-of-3 multisig) closes the round. The contract has no fixed end date, no minimum raise and no automatic refund.",
      page: `${SITE}/seed/`,
    },
    disclosures: [
      "$WOOD has no guaranteed value. Nothing here is financial advice.",
      "Automated analysis has been done; an independent manual audit has not been completed.",
      "The sale may not be available in every jurisdiction. Participate only where permitted.",
      "TradeWood is independent and not affiliated with Robinhood Markets.",
    ],
    agentNote: "Only buy on behalf of a user who has read these terms and explicitly asked to contribute a specific amount.",
    totalRaisedUsd: fmt(raised, 6),
    remainingCapUsd: fmt(remainingCap, 6),
    unlockedBps: Number(unlockedBps),
  };
  if (!wallet) {
    body.next = "Add wallet=<address> (and amountUsd=<10-200>) to get this wallet's position and ready-to-sign transactions.";
    return body;
  }

  const [[contributed, allocated, claimed], claimable, usdgBal, allowance] = await Promise.all([
    c.readContract({ address: sale, abi: seedAbi, functionName: "participants", args: [wallet] }),
    c.readContract({ address: sale, abi: seedAbi, functionName: "getClaimableAmount", args: [wallet] }),
    c.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }),
    c.readContract({ address: USDG, abi: erc20Abi, functionName: "allowance", args: [wallet, sale] }),
  ]);
  const maxLeft = BigInt(SEED.maxUsdPerWallet) * 1_000_000n - contributed;
  const canAdd = maxLeft < remainingCap ? maxLeft : remainingCap;
  body.wallet = {
    address: wallet,
    contributedUsd: fmt(contributed, 6),
    allocatedWood: fmt(allocated, 18),
    claimedWood: fmt(claimed, 18),
    claimableWood: fmt(claimable, 18),
    canStillContributeUsd: fmt(canAdd > 0n ? canAdd : 0n, 6),
    usdgBalance: fmt(usdgBal, 6),
  };

  const txs: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  if (claimable > 0n)
    txs.push({ step: "claim", description: `Claim ${fmt(claimable, 18)} unlocked $WOOD.`, chainId: CHAIN_ID, from: wallet, to: sale, value: "0", data: encodeFunctionData({ abi: seedAbi, functionName: "claimTokens" }) });

  if (amountUsdRaw) {
    if (!open) throw new ApiError(409, "sale_not_open", `The seed sale is ${body.status}; it isn't taking contributions.`, body);
    if (!/^\d+(\.\d{1,6})?$/.test(amountUsdRaw)) throw new ApiError(400, "bad_amount", "amountUsd must be a dollar amount like 50 or 25.5.");
    const usd = parseUnits(amountUsdRaw, 6);
    const newTotal = contributed + usd;
    if (newTotal < BigInt(SEED.minUsd) * 1_000_000n) throw new ApiError(400, "below_minimum", `Minimum total contribution is $${SEED.minUsd}.`);
    if (usd > maxLeft) throw new ApiError(400, "over_wallet_max", `This wallet can add at most $${fmt(maxLeft > 0n ? maxLeft : 0n, 6)} more ($${SEED.maxUsdPerWallet} per wallet).`);
    if (usd > remainingCap) throw new ApiError(400, "over_hard_cap", `Only $${fmt(remainingCap, 6)} is left before the hard cap.`);
    if (usdgBal < usd) warnings.push(`Wallet holds ${fmt(usdgBal, 6)} USDG; needs ${amountUsdRaw}. Swap for USDG first (/api/quote?tokenOut=USDG).`);
    const wood = (usd * 10n ** 18n) / SEED.rateUsdcPerWood;
    if (allowance < usd)
      txs.push({ step: "approve", description: `Allow the seed sale contract to take exactly ${amountUsdRaw} USDG. Wait for it to confirm before buying.`, chainId: CHAIN_ID, from: wallet, to: USDG, value: "0", data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [sale, usd] }) });
    txs.push({
      step: "buy",
      description: `Contribute ${amountUsdRaw} USDG for ${fmt(wood, 18)} $WOOD, vested in four milestone tranches. Not refundable by the contract.`,
      chainId: CHAIN_ID, from: wallet, to: sale, value: "0",
      data: encodeFunctionData({ abi: seedAbi, functionName: "buyTokens", args: [USDG, usd] }),
    });
    body.purchase = { amountUsd: amountUsdRaw, woodAllocated: fmt(wood, 18) };
  }
  body.transactions = txs;
  body.warnings = warnings;
  return body;
}

// ───────────────────────────── /api/tokens, /api ─────────────────────────────

function tokenList() {
  return {
    name: "TradeWood (Robinhood Chain)",
    timestamp: "2026-10-21T00:00:00Z",
    version: { major: 1, minor: 1, patch: 0 },
    logoURI: `${SITE}/logo-mark.png`,
    keywords: ["tradewood", "robinhood chain"],
    nativeCurrency: { symbol: "ETH", decimals: 18, use: 'pass "ETH" as tokenIn/tokenOut' },
    tokens: TOKENS.filter((t) => t.address !== NATIVE).map((t) => ({
      chainId: CHAIN_ID, address: t.address, symbol: t.symbol, name: t.name, decimals: t.decimals,
      ...(t.logo ? { logoURI: SITE + t.logo } : {}), tags: [t.category?.toLowerCase() ?? "listed"],
    })),
  };
}

const index = (env: Env) => ({
  name: "TradeWood agent API",
  description: "Read-only API for AI agents and bots on Robinhood Chain (4663). Returns unsigned transactions; your wallet signs and sends them. No API key.",
  chainId: CHAIN_ID,
  rpc: "https://rpc.mainnet.chain.robinhood.com",
  contracts: { sherwoodRouter: env.SHERWOOD_ROUTER, woodToken: WOOD_SEED.address, woodSeedSale: env.SEED_SALE, usdg: USDG, weth: WETH },
  endpoints: {
    "GET /api/tokens": "Listed tokens (Uniswap token-list format).",
    "GET /api/quote?tokenIn=ETH&tokenOut=USDG&amount=0.01&from=0x…&slippageBps=50": "Best route across Uniswap V2/V3/V4 plus ready-to-sign approve/swap transactions.",
    "GET /api/seed?wallet=0x…&amountUsd=50": "$WOOD seed sale terms, status, wallet position and approve/buy/claim transactions.",
  },
  docs: { agents: `${SITE}/agents.md`, openapi: `${SITE}/openapi.json`, llms: `${SITE}/llms.txt`, abis: `${SITE}/abi/` },
});

// ───────────────────────────── entry ─────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const u = new URL(req.url);
    if (!u.pathname.startsWith("/api")) return env.ASSETS ? env.ASSETS.fetch(req) : new Response("Not found", { status: 404 });
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" } });
    if (req.method !== "GET") return json({ error: { code: "method_not_allowed", message: "Use GET." } }, 405);
    const c = createPublicClient({ chain: robinhoodChain, transport: http(env.RPC_URL || undefined), batch: { multicall: true } }) as PublicClient;
    const path = u.pathname.replace(/\/+$/, "") || "/api";
    try {
      if (path === "/api") return json(index(env), 200, "public, max-age=300");
      if (path === "/api/tokens") return json(tokenList(), 200, "public, max-age=3600");
      if (path === "/api/quote") return json(await quote(c, u, env));
      if (path === "/api/seed") return json(await seed(c, u, env));
      throw new ApiError(404, "not_found", "Unknown endpoint. See /api.");
    } catch (e) {
      if (e instanceof ApiError) return json({ error: { code: e.code, message: e.message, ...(e.extra ? { details: e.extra } : {}) } }, e.status);
      return json({ error: { code: "upstream_error", message: `Robinhood Chain RPC or quote error: ${revertReason(e)}. Retry shortly.` } }, 502);
    }
  },
};
