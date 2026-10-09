"use client";
import { useMemo, useState } from "react";
import { BaseError, ContractFunctionRevertedError, formatUnits, maxUint256, parseUnits } from "viem";
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { explorerTx, robinhoodChain } from "@/config/chains";
import { NATIVE, SHERWOOD_ROUTER, TOKENS, type Token, erc20Abi, sherwoodRouterAbi } from "@/config/contracts";
import { useDebounced } from "@/hooks/useDebounced";
import { useEthPrice } from "@/hooks/useEthPrice";
import { Dot } from "./Dot";
import { useReferrer } from "@/hooks/useReferrer";
import { type QuoteResult, useSwapQuotes } from "@/hooks/useSwapQuotes";
import { fmtAmount, fmtUsd } from "@/lib/format";
import { WalletButton } from "./Header";
import { SlippageModal } from "./SlippageModal";
import { useToast } from "./Toast";
import { TokenIcon } from "./TokenIcon";
import { TokenModal } from "./TokenModal";

const ETH_GAS_BUFFER = parseUnits("0.0005", 18);

export function useSwapState() {
  const [tokenIn, setTokenIn] = useState<Token>(TOKENS[0]);
  const [tokenOut, setTokenOut] = useState<Token>(TOKENS[1]);
  const [amountStr, setAmountStr] = useState("");
  const amountIn = useMemo(() => {
    try {
      return amountStr ? parseUnits(amountStr, tokenIn.decimals) : 0n;
    } catch {
      return 0n;
    }
  }, [amountStr, tokenIn.decimals]);
  const debounced = useDebounced(amountIn);
  const quotes = useSwapQuotes(tokenIn, tokenOut, debounced);
  return { tokenIn, setTokenIn, tokenOut, setTokenOut, amountStr, setAmountStr, amountIn, debounced, quotes };
}

type SwapState = ReturnType<typeof useSwapState>;

export function SwapCard({ s }: { s: SwapState }) {
  const { tokenIn, setTokenIn, tokenOut, setTokenOut, amountStr, setAmountStr, amountIn, debounced, quotes } = s;
  const { address, isConnected } = useAccount();
  const client = usePublicClient({ chainId: robinhoodChain.id });
  const referrer = useReferrer(address);
  const toast = useToast();
  const { writeContractAsync } = useWriteContract();

  const [slippageBps, setSlippageBps] = useState(50);
  const [picker, setPicker] = useState<"in" | "out" | null>(null);
  const [slipOpen, setSlipOpen] = useState(false);
  const [busy, setBusy] = useState<"approving" | "swapping" | null>(null);

  const { data: ethPrice } = useEthPrice();
  const usd = (t: Token, v?: bigint) => {
    if (v === undefined || v === 0n) return undefined;
    const n = Number(formatUnits(v, t.decimals));
    if (t.symbol === "USDG") return n;
    if ((t.symbol === "ETH" || t.symbol === "WETH") && ethPrice) return n * ethPrice;
    return undefined;
  };
  const balIn = useTokenBalance(tokenIn, address);
  const balOut = useTokenBalance(tokenOut, address);

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenIn.address === NATIVE ? undefined : tokenIn.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && SHERWOOD_ROUTER ? [address, SHERWOOD_ROUTER] : undefined,
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(address && SHERWOOD_ROUTER && tokenIn.address !== NATIVE) },
  });

  const q: QuoteResult | undefined = debounced === amountIn ? quotes.data : undefined;
  const best = q?.best;
  const minOut = best ? (best.amountOut * BigInt(10_000 - slippageBps)) / 10_000n : undefined;
  const stale = amountIn > 0n && (debounced !== amountIn || quotes.isFetching) && !q;

  const setFraction = (f: number) => {
    if (balIn === undefined) return;
    let v = (balIn * BigInt(Math.round(f * 100))) / 100n;
    if (tokenIn.address === NATIVE && f === 1) v = v > ETH_GAS_BUFFER ? v - ETH_GAS_BUFFER : 0n;
    setAmountStr(trimZeros(formatUnits(v, tokenIn.decimals)));
  };
  const flip = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountStr("");
  };
  const choose = (t: Token) => {
    if (picker === "in") {
      if (t.address === tokenOut.address) setTokenOut(tokenIn);
      setTokenIn(t);
    } else {
      if (t.address === tokenIn.address) setTokenIn(tokenOut);
      setTokenOut(t);
    }
    setAmountStr("");
  };

  const wrapPair = (tokenIn.symbol === "ETH" && tokenOut.symbol === "WETH") || (tokenIn.symbol === "WETH" && tokenOut.symbol === "ETH");
  const insufficient = balIn !== undefined && amountIn > balIn;
  const needsApproval = Boolean(SHERWOOD_ROUTER) && tokenIn.address !== NATIVE && amountIn > 0n && (allowance as bigint | undefined ?? 0n) < amountIn;

  async function approve() {
    if (!SHERWOOD_ROUTER || !client) return;
    try {
      setBusy("approving");
      const hash = await writeContractAsync({ address: tokenIn.address, abi: erc20Abi, functionName: "approve", args: [SHERWOOD_ROUTER, maxUint256], chainId: robinhoodChain.id });
      await client.waitForTransactionReceipt({ hash });
      await refetchAllowance();
      toast({ kind: "success", title: `${tokenIn.symbol} approved`, href: explorerTx(hash) });
    } catch (e) {
      toast({ kind: "error", title: "Approval failed", body: humanError(e) });
    } finally {
      setBusy(null);
    }
  }

  async function swap() {
    if (!SHERWOOD_ROUTER || !client || !address || !best || minOut === undefined) return;
    try {
      setBusy("swapping");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      const hash = await writeContractAsync({
        address: SHERWOOD_ROUTER,
        abi: sherwoodRouterAbi,
        functionName: "swap",
        chainId: robinhoodChain.id,
        value: tokenIn.address === NATIVE ? amountIn : 0n,
        args: [
          {
            venue: best.venue,
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            amountIn,
            minAmountOut: minOut,
            v2Path: best.v2Path,
            v3Path: best.v3Path,
            recipient: address,
            deadline,
            referrer,
          },
        ],
      });
      const rc = await client.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error("Transaction reverted");
      toast({ kind: "success", title: `Swapped ${tokenIn.symbol} → ${tokenOut.symbol}`, body: `via ${best.label}`, href: explorerTx(hash) });
      setAmountStr("");
    } catch (e) {
      toast({ kind: "error", title: "Swap failed", body: humanError(e) });
    } finally {
      setBusy(null);
    }
  }

  let action: { label: string; icon: string; onClick?: () => void; disabled: boolean };
  if (!SHERWOOD_ROUTER) action = { label: "Sherwood Router launching soon", icon: "fa-hourglass-half", disabled: true };
  else if (wrapPair) action = { label: "Wrap/unwrap not routed here", icon: "fa-ban", disabled: true };
  else if (amountIn === 0n) action = { label: "Enter an amount", icon: "fa-keyboard", disabled: true };
  else if (insufficient) action = { label: `Insufficient ${tokenIn.symbol}`, icon: "fa-circle-exclamation", disabled: true };
  else if (stale) action = { label: "Finding best route…", icon: "fa-spinner fa-spin", disabled: true };
  else if (!best) action = { label: "No route available", icon: "fa-circle-xmark", disabled: true };
  else if (busy === "approving") action = { label: `Approving ${tokenIn.symbol}…`, icon: "fa-spinner fa-spin", disabled: true };
  else if (needsApproval) action = { label: `Approve ${tokenIn.symbol}`, icon: "fa-unlock", onClick: approve, disabled: false };
  else if (busy === "swapping") action = { label: "Swapping…", icon: "fa-spinner fa-spin", disabled: true };
  else action = { label: "Execute Sherwood Swap", icon: "fa-bolt", onClick: swap, disabled: false };

  return (
    <div className="glass-card-glow rounded-3xl p-5 sm:p-6 shadow-2xl relative">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Dot size="w-2.5 h-2.5" />
          <h2 className="font-display text-lg font-bold text-white">Swap Tokens</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSlipOpen(true)} className="h-8 px-2.5 rounded-xl bg-panelCard hover:bg-panelHover border border-emeraldGlow/20 text-slate-300 flex items-center gap-1.5 text-[11px] font-mono" title="Slippage settings">
            <i className="fa-solid fa-sliders text-xs" /> {(slippageBps / 100).toFixed(slippageBps % 100 ? 1 : 0)}%
          </button>
          <button onClick={() => quotes.refetch()} className="w-8 h-8 rounded-xl bg-panelCard hover:bg-panelHover border border-emeraldGlow/20 text-slate-300 flex items-center justify-center" title="Refresh quotes" aria-label="Refresh quotes">
            <i className={`fa-solid fa-arrows-rotate text-xs ${quotes.isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Pay */}
      <div className="bg-panelCard p-4 rounded-2xl border border-emeraldGlow/15 hover:border-emeraldGlow/40 focus-within:border-emeraldGlow/50 transition-all">
        <div className="flex items-center justify-between mb-2 text-xs text-slate-400">
          <span className="font-medium">You Pay</span>
          <span>
            Balance: <span className="font-mono text-white">{isConnected ? fmtAmount(balIn, tokenIn.decimals) : "—"}</span>
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={amountStr}
            onChange={(e) => {
              const v = e.target.value.replace(",", ".");
              if (/^\d*\.?\d*$/.test(v)) setAmountStr(v);
            }}
            aria-label="Amount to pay"
            className="w-full min-w-0 bg-transparent text-2xl font-mono font-bold text-white outline-none placeholder:text-slate-600"
          />
          <TokenButton token={tokenIn} onClick={() => setPicker("in")} />
        </div>
        <div className="flex justify-between items-center mt-2 gap-1.5">
          <span className="text-xs font-mono text-slate-400">{usd(tokenIn, amountIn) !== undefined ? `~${fmtUsd(usd(tokenIn, amountIn))}` : "\u00a0"}</span>
          <div className="flex items-center gap-1.5">
          {[0.25, 0.5, 1].map((f) => (
            <button
              key={f}
              disabled={!isConnected}
              onClick={() => setFraction(f)}
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded transition-colors disabled:opacity-40 ${
                f === 1 ? "bg-emeraldGlow/20 text-neonGreen" : "bg-white/5 hover:bg-neonGreen/20 hover:text-neonGreen text-slate-400"
              }`}
            >
              {f === 1 ? "MAX" : `${f * 100}%`}
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* Flip */}
      <div className="relative my-2 flex justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-emeraldGlow/10" />
        </div>
        <button onClick={flip} aria-label="Flip tokens" className="relative w-10 h-10 rounded-xl bg-panelBg border border-emeraldGlow/30 hover:border-neonGreen text-neonGreen flex items-center justify-center shadow-lg hover:scale-110 active:rotate-180 transition-all duration-300">
          <i className="fa-solid fa-arrow-down text-xs" />
        </button>
      </div>

      {/* Receive */}
      <div className="bg-panelCard p-4 rounded-2xl border border-emeraldGlow/15">
        <div className="flex items-center justify-between mb-2 text-xs text-slate-400">
          <span className="font-medium">You Receive</span>
          <span>
            Balance: <span className="font-mono text-white">{isConnected ? fmtAmount(balOut, tokenOut.decimals) : "—"}</span>
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className={`w-full min-w-0 text-2xl font-mono font-bold truncate ${best ? "text-neonGreen" : "text-slate-600"}`} aria-live="polite">
            {stale ? <span className="inline-block h-7 w-32 rounded-lg bg-panelHover animate-pulse align-middle" /> : best ? fmtAmount(best.amountOut, tokenOut.decimals) : "0.0"}
          </div>
          <TokenButton token={tokenOut} onClick={() => setPicker("out")} />
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs font-mono text-slate-400">{best && usd(tokenOut, best.amountOut) !== undefined ? `~${fmtUsd(usd(tokenOut, best.amountOut))}` : "\u00a0"}</span>
          <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
            <i className="fa-solid fa-shield-halved" /> Sherwood Router
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="mt-4 p-3.5 rounded-xl bg-panelBg/80 border border-emeraldGlow/10 text-xs space-y-2 font-mono">
        <Row label="Rate" value={best && q ? `1 ${tokenIn.symbol} = ${rate(q.net, best.amountOut, tokenIn, tokenOut)} ${tokenOut.symbol}` : "—"} />
        <Row label="Best Route" value={best ? `${best.label}${best.hops === "via WETH" ? " (via WETH)" : ""}` : "—"} tone="text-neonGreen" />
        <Row label={`Sherwood Fee (${q ? Number(q.feeBps) / 100 : 0.1}%)`} value={q ? `${fmtAmount(q.fee, tokenIn.decimals)} ${tokenIn.symbol}` : "—"} />
        {q && q.woodTaxBps > 0n && <Row label="$WOOD Tax (auto-LP + treasury)" value={`${Number(q.woodTaxBps) / 100}%`} tone="text-goldLight" />}
        <Row
          label="Price Impact"
          value={q?.priceImpactPct === undefined ? "—" : q.priceImpactPct < 0.01 ? "< 0.01%" : `${q.priceImpactPct.toFixed(2)}%`}
          tone={q?.priceImpactPct !== undefined && q.priceImpactPct > 3 ? "text-robinRed" : "text-emerald-400"}
        />
        <Row label="Minimum Received" value={minOut !== undefined ? `${fmtAmount(minOut, tokenOut.decimals)} ${tokenOut.symbol}` : "—"} />
        <Row label="Network Fee" value="Paid in ETH" />
      </div>

      {/* Action */}
      <div className="mt-5">
        {!isConnected ? (
          <WalletButton full />
        ) : (
          <button onClick={action.onClick} disabled={action.disabled} className="btn-primary w-full py-4 text-sm">
            <i className={`fa-solid ${action.icon}`} /> {action.label}
          </button>
        )}
      </div>
      {!SHERWOOD_ROUTER && (
        <p className="text-[11px] text-slate-400 text-center mt-3">Quotes are live from Robinhood Chain. Swapping unlocks when the Sherwood Router deploys.</p>
      )}

      <TokenModal open={picker !== null} onClose={() => setPicker(null)} onSelect={choose} exclude={picker === "in" ? tokenIn : tokenOut} />
      <SlippageModal open={slipOpen} onClose={() => setSlipOpen(false)} value={slippageBps} onChange={setSlippageBps} />
    </div>
  );
}

function TokenButton({ token, onClick }: { token: Token; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 bg-panelBg border border-emeraldGlow/25 hover:border-emeraldGlow/50 px-3 py-2 rounded-xl transition-all shrink-0" aria-label={`Select token, current ${token.symbol}`}>
      <TokenIcon token={token} />
      <span className="font-bold text-sm text-white font-mono">{token.symbol}</span>
      <i className="fa-solid fa-chevron-down text-xs text-slate-400" />
    </button>
  );
}

function Row({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-4 text-slate-400">
      <span>{label}</span>
      <span className={`${tone} text-right truncate`}>{value}</span>
    </div>
  );
}

function useTokenBalance(token: Token, address?: `0x${string}`) {
  const native = useBalance({ address, chainId: robinhoodChain.id, query: { enabled: Boolean(address) && token.address === NATIVE, refetchInterval: 20_000 } });
  const erc = useReadContract({
    address: token.address === NATIVE ? undefined : token.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(address) && token.address !== NATIVE, refetchInterval: 20_000 },
  });
  return token.address === NATIVE ? native.data?.value : (erc.data as bigint | undefined);
}

function rate(net: bigint, out: bigint, a: Token, b: Token) {
  const n = Number(formatUnits(net, a.decimals));
  const o = Number(formatUnits(out, b.decimals));
  if (!n) return "—";
  const r = o / n;
  return r.toLocaleString("en-US", { maximumFractionDigits: r >= 100 ? 2 : r >= 1 ? 4 : 8 });
}

const trimZeros = (s: string) => (s.includes(".") ? s.replace(/\.?0+$/, "") : s);

const ROUTER_ERRORS: Record<string, string> = {
  InsufficientOutput: "Price moved beyond your slippage. Try again or raise slippage.",
  Expired: "The swap took too long and expired. Try again.",
  EnforcedPause: "Swaps are temporarily paused.",
  InvalidPath: "That route is no longer valid. Refresh quotes.",
  InvalidAmount: "Invalid amount.",
  SameToken: "Pick two different tokens.",
};

function humanError(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && ROUTER_ERRORS[name]) return ROUTER_ERRORS[name];
    }
    if (/user rejected|denied/i.test(e.message)) return "You rejected the request in your wallet.";
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}
