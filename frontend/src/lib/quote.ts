import { type Address, type Hex, type PublicClient, encodeAbiParameters, encodePacked, keccak256 } from "viem";
import {
  NATIVE, type Token, UNISWAP_V2_ROUTER, UNISWAP_V3_QUOTER_V2, UNISWAP_V4_QUOTER, UNISWAP_V4_STATE_VIEW, V3_FEE_TIERS,
  V4_HOOKED_POOLS, V4_STANDARD_TIERS, type V4PoolKey, WETH, WOOD_TOKEN, quoterV2Abi, v2RouterAbi, v4HopsParam,
  v4QuoterAbi, v4StateViewAbi,
} from "@/config/contracts";

// Plain quoting engine (no React), shared by the site (hooks/useSwapQuotes) and the agent API (worker/).

export type Venue = 0 | 1 | 2; // Uniswap V2 / V3 / V4

/** One way through the market. `quoteAt` re-quotes it at another size (used by the split optimizer). */
export type Route = {
  venue: Venue;
  label: string;
  hops: string;
  pools: string[]; // pool identities, so a split never sends two legs through the same pool
  data: Hex; // Sherwood Router leg data
  amountOut: bigint; // output for the full post-fee input (after WOOD tax estimate)
  quoteAt: (amountIn: bigint) => Promise<bigint>;
};

export type PlanLeg = { route: Route; weightBps: number; amountOut: bigint };

/** What the Sherwood Router will actually execute: one leg, or a split across up to 3 venues. */
export type Plan = {
  legs: PlanLeg[];
  amountOut: bigint;
  split: boolean;
  /** extra output vs the best single route (0 when not split) */
  splitGain: bigint;
  label: string;
};

export type QuoteResult = {
  routes: Route[];
  best?: Route;
  plan?: Plan;
  fee: bigint;
  net: bigint;
  feeBps: bigint;
  woodTaxBps: bigint; // tax applied to this trade (0 if WOOD not involved)
  priceImpactPct?: number;
  /** how much better the plan is than a plain Uniswap V2 swap of the same pair (%), if V2 has a route */
  vsV2Pct?: number;
};

export const VENUE_NAMES = ["Uniswap V2", "Uniswap V3", "Uniswap V4"] as const;

export const work = (a: Address) => (a === NATIVE ? WETH : a);
const lc = (a: Address) => a.toLowerCase();
const sortPair = (a: Address, b: Address): [Address, Address] => (lc(a) < lc(b) ? [a, b] : [b, a]);

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

const poolIdOf = (k: V4PoolKey): Hex =>
  keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks],
    ),
  );

/** V4 currencies a listed token can trade as: ETH can be native or WETH. */
const v4Currencies = (a: Address): Address[] => (a === NATIVE ? [NATIVE, WETH] : [a]);

// ───────────────────────────── Split optimizer ─────────────────────────────

const STEPS = 10; // allocate in 10% slices
const MAX_SPLIT_ROUTES = 3;
/** a split must beat the best single route by at least this much (covers the extra gas of more legs) */
const MIN_SPLIT_GAIN_BPS = 2n;

/**
 * Greedy marginal allocation: hand out the input in 10% slices, each to the route whose *next* slice adds the most
 * output. Exact for concave output curves (AMM pools). Routes that share a pool are never combined.
 */
async function optimizeSplit(routes: Route[], amountIn: bigint): Promise<Plan | undefined> {
  const picked: Route[] = [];
  const used = new Set<string>();
  for (const r of routes) {
    if (r.pools.some((p) => used.has(p))) continue;
    picked.push(r);
    r.pools.forEach((p) => used.add(p));
    if (picked.length === MAX_SPLIT_ROUTES) break;
  }
  if (picked.length < 2) return undefined;

  // curves[i][k] = output of route i for k/STEPS of the input (k = 0..STEPS)
  const curves = await Promise.all(
    picked.map(async (r) => {
      const pts = await Promise.all(
        Array.from({ length: STEPS - 1 }, (_, k) => r.quoteAt((amountIn * BigInt(k + 1)) / BigInt(STEPS)).catch(() => 0n)),
      );
      return [0n, ...pts, r.amountOut];
    }),
  );

  const alloc = picked.map(() => 0);
  for (let s = 0; s < STEPS; s++) {
    let bestI = 0;
    let bestGain = -1n;
    picked.forEach((_, i) => {
      if (alloc[i] >= STEPS) return;
      const gain = curves[i][alloc[i] + 1] - curves[i][alloc[i]];
      if (gain > bestGain) {
        bestGain = gain;
        bestI = i;
      }
    });
    alloc[bestI]++;
  }

  const legs: PlanLeg[] = picked
    .map((route, i) => ({ route, weightBps: alloc[i] * (10_000 / STEPS), amountOut: curves[i][alloc[i]] }))
    .filter((l) => l.weightBps > 0);
  if (legs.length < 2) return undefined;
  const amountOut = legs.reduce((a, l) => a + l.amountOut, 0n);
  return { legs, amountOut, split: true, splitGain: 0n, label: legs.map((l) => `${l.weightBps / 100}% ${shortLabel(l.route)}`).join(" + ") };
}

export const shortLabel = (r: Route) => r.label.replace("Uniswap ", "");

/** The quoting engine behind useSwapQuotes and /api/quote. */
export async function quoteSwap(
  client: PublicClient,
  tokenIn: Token,
  tokenOut: Token,
  amountIn: bigint,
  feeBps: bigint,
  tax: { buyBps: bigint; sellBps: bigint },
): Promise<QuoteResult> {
      const c = client;
      const fee = (amountIn * feeBps) / 10_000n;
      const net = amountIn - fee;
      const a = work(tokenIn.address);
      const b = work(tokenOut.address);
      const isWoodIn = Boolean(WOOD_TOKEN) && a === WOOD_TOKEN;
      const isWoodOut = Boolean(WOOD_TOKEN) && b === WOOD_TOKEN;
      const woodTaxBps = isWoodIn ? tax.sellBps : isWoodOut ? tax.buyBps : 0n;
      const v2Only = Boolean(tokenIn.v2Only || tokenOut.v2Only);
      const viaWeth = a !== WETH && b !== WETH;
      // Selling WOOD: the pair receives the amount minus the sell tax.
      const taxIn = (x: bigint) => (isWoodIn ? (x * (10_000n - woodTaxBps)) / 10_000n : x);
      const afterOutTax = (out: bigint) => (isWoodOut ? (out * (10_000n - woodTaxBps)) / 10_000n : out);

      type Candidate = Omit<Route, "amountOut">;
      const candidates: Candidate[] = [];

      // ── Uniswap V2 ──
      const v2 = (path: Address[], hops: string): Candidate => ({
        venue: 0, label: "Uniswap V2", hops,
        pools: path.slice(1).map((t, i) => `v2:${sortPair(path[i], t).map(lc).join("-")}`),
        data: encodeAbiParameters([{ type: "address[]" }], [path]),
        quoteAt: async (x) => {
          const amts = await c.readContract({ address: UNISWAP_V2_ROUTER, abi: v2RouterAbi, functionName: "getAmountsOut", args: [taxIn(x), path] });
          return afterOutTax(amts[amts.length - 1]);
        },
      });
      candidates.push(v2([a, b], "direct"));
      if (viaWeth) candidates.push(v2([a, WETH, b], "via WETH"));

      if (!v2Only) {
        // ── Uniswap V3 ──
        const v3 = (tokens: Address[], fees: number[], hops: string): Candidate => {
          const path = v3PathOf(tokens, fees);
          return {
            venue: 1, label: `Uniswap V3 · ${fees.map((f) => f / 10_000 + "%").join(" → ")}`, hops,
            pools: tokens.slice(1).map((t, i) => `v3:${sortPair(tokens[i], t).map(lc).join("-")}:${fees[i]}`),
            data: path,
            quoteAt: async (x) => (await c.simulateContract({ address: UNISWAP_V3_QUOTER_V2, abi: quoterV2Abi, functionName: "quoteExactInput", args: [path, x] })).result[0],
          };
        };
        for (const f of V3_FEE_TIERS) candidates.push(v3([a, b], [f], "direct"));
        if (viaWeth) for (const f of [500, 3000]) candidates.push(v3([a, WETH, b], [f, f], "via WETH"));

        // ── Uniswap V4 ── find pools that exist (one multicall of StateView.getLiquidity), then quote them
        candidates.push(...(await v4Candidates(c, tokenIn.address, tokenOut.address)));
      }

      const quoted = await Promise.all(
        candidates.map((cand) => cand.quoteAt(net).then((amountOut) => ({ ...cand, amountOut })).catch(() => null)),
      );
      const routes = quoted.filter((r): r is Route => !!r && r.amountOut > 0n).sort((x, y) => (y.amountOut > x.amountOut ? 1 : -1));
      const best = routes[0];

      let plan: Plan | undefined = best
        ? { legs: [{ route: best, weightBps: 10_000, amountOut: best.amountOut }], amountOut: best.amountOut, split: false, splitGain: 0n, label: shortLabel(best) }
        : undefined;
      if (best && routes.length > 1) {
        const s = await optimizeSplit(routes, net).catch(() => undefined);
        if (s && s.amountOut * 10_000n > best.amountOut * (10_000n + MIN_SPLIT_GAIN_BPS)) {
          plan = { ...s, splitGain: s.amountOut - best.amountOut };
        }
      }

      // Price impact: the plan's rate vs a 1/1000-size quote on the best route.
      let priceImpactPct: number | undefined;
      if (best && plan && net > 1000n) {
        try {
          const smallOut = await best.quoteAt(net / 1000n);
          if (smallOut > 0n) {
            const ideal = Number(smallOut) * 1000;
            priceImpactPct = Math.max(0, ((ideal - Number(plan.amountOut)) / ideal) * 100);
          }
        } catch {
          /* leave undefined */
        }
      }
      const v2Best = routes.find((r) => r.venue === 0);
      const vsV2Pct = plan && v2Best && v2Best !== best ? (Number(plan.amountOut - v2Best.amountOut) / Number(v2Best.amountOut)) * 100 : undefined;

      return { routes, best, plan, fee, net, feeBps, woodTaxBps, priceImpactPct, vsV2Pct };
}

/** V4 routes for a pair: direct pools (standard tiers + curated hooked pools) and two-hop routes via native ETH. */
async function v4Candidates(c: PublicClient, tokenIn: Address, tokenOut: Address) {
  type Hop = { key: V4PoolKey; label: string };
  const pairPools = (x: Address, y: Address): Hop[] => {
    const out: Hop[] = [];
    for (const cx of v4Currencies(x))
      for (const cy of v4Currencies(y)) {
        if (cx === cy) continue;
        const [currency0, currency1] = sortPair(cx, cy);
        for (const t of V4_STANDARD_TIERS)
          out.push({ key: { currency0, currency1, fee: t.fee, tickSpacing: t.tickSpacing, hooks: NATIVE }, label: `${t.fee / 10_000}%` });
        for (const h of V4_HOOKED_POOLS)
          if (lc(h.key.currency0) === lc(currency0) && lc(h.key.currency1) === lc(currency1)) out.push({ key: h.key, label: h.label });
      }
    return out;
  };

  const direct = pairPools(tokenIn, tokenOut).map((h) => [h]);
  const viaEth =
    tokenIn !== NATIVE && tokenOut !== NATIVE && work(tokenIn) !== WETH && work(tokenOut) !== WETH
      ? pairPools(tokenIn, NATIVE).filter((h) => h.key.currency0 === NATIVE).flatMap((h1) =>
          pairPools(NATIVE, tokenOut).filter((h) => h.key.currency0 === NATIVE).map((h2) => [h1, h2]))
      : [];

  // Which pools exist with liquidity?
  const allHops = [...new Map([...direct, ...viaEth].flat().map((h) => [poolIdOf(h.key), h])).entries()];
  const liq = await c.multicall({
    allowFailure: true,
    contracts: allHops.map(([id]) => ({ address: UNISWAP_V4_STATE_VIEW, abi: v4StateViewAbi, functionName: "getLiquidity", args: [id] }) as const),
  });
  const live = new Set(allHops.filter((_, i) => liq[i].status === "success" && (liq[i].result as bigint) > 0n).map(([id]) => id));

  const routes = [...direct, ...viaEth.slice(0, 6)].filter((hops) => hops.every((h) => live.has(poolIdOf(h.key))));
  return routes.map((hops) => {
    // exactCurrency: the route's starting currency (native ETH or WETH for ETH input)
    const k0 = hops[0].key;
    const start: Address = tokenIn === NATIVE ? (k0.currency0 === NATIVE ? NATIVE : WETH) : tokenIn;
    const path: { intermediateCurrency: Address; fee: number; tickSpacing: number; hooks: Address; hookData: Hex }[] = [];
    let cur = start;
    for (const h of hops) {
      const next = lc(cur) === lc(h.key.currency0) ? h.key.currency1 : h.key.currency0;
      path.push({ intermediateCurrency: next, fee: h.key.fee, tickSpacing: h.key.tickSpacing, hooks: h.key.hooks, hookData: "0x" });
      cur = next;
    }
    const usesWeth = hops.some((h) => h.key.currency0 === WETH || h.key.currency1 === WETH);
    return {
      venue: 2 as const,
      label: `Uniswap V4 · ${hops.map((h) => h.label).join(" → ")}`,
      hops: hops.length > 1 ? "via ETH" : usesWeth && (tokenIn === NATIVE || tokenOut === NATIVE) ? "WETH pool" : "direct",
      pools: hops.map((h) => `v4:${poolIdOf(h.key)}`),
      data: encodeAbiParameters(v4HopsParam, [hops.map((h) => ({ key: h.key, hookData: "0x" as Hex }))]),
      quoteAt: async (x: bigint) =>
        (await c.simulateContract({ address: UNISWAP_V4_QUOTER, abi: v4QuoterAbi, functionName: "quoteExactInput", args: [{ exactCurrency: start, path, exactAmount: x }] })).result[0],
    };
  });
}
