"use client";
import { useEffect, useMemo, useState } from "react";
import { type Address, getAddress, isAddress } from "viem";
import { usePublicClient } from "wagmi";
import { explorerAddress, robinhoodChain } from "@/config/chains";
import { TOKENS, type Token, type TokenCategory, WOOD_SEED, erc20Abi } from "@/config/contracts";
import { safeStorage, shortAddr } from "@/lib/format";
import { Modal } from "./Modal";
import { TokenIcon } from "./TokenIcon";

const CATEGORIES: { id: "All" | TokenCategory; label: string }[] = [
  { id: "All", label: "All" },
  { id: "Stocks", label: "Stock Tokens" },
  { id: "Stablecoins", label: "Stablecoins" },
  { id: "Crypto", label: "Crypto & DeFi" },
  { id: "Ecosystem", label: "Ecosystem" },
];

const IMPORT_KEY = "tw:imported-tokens:v1";
const metaAbi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
const clean = (s: string, max: number) => s.replace(/[^\x20-\x7E]/g, "").trim().slice(0, max);

function loadImported(): Token[] {
  try {
    const raw = JSON.parse(safeStorage().get(IMPORT_KEY) || "[]") as Token[];
    return raw.filter((t) => isAddress(t.address) && Number.isInteger(t.decimals)).map((t) => ({ ...t, imported: true }));
  } catch {
    return [];
  }
}

/** All tokens the picker knows about: the listed ones plus any this browser imported. */
export function useKnownTokens() {
  const [imported, setImported] = useState<Token[]>([]);
  useEffect(() => setImported(loadImported()), []);
  const add = (t: Token) =>
    setImported((prev) => {
      const next = [t, ...prev.filter((p) => p.address !== t.address)].slice(0, 20);
      safeStorage().set(IMPORT_KEY, JSON.stringify(next));
      return next;
    });
  return { imported, add };
}

export function TokenModal({ open, onClose, onSelect, exclude }: { open: boolean; onClose: () => void; onSelect: (t: Token) => void; exclude?: Token }) {
  const client = usePublicClient({ chainId: robinhoodChain.id });
  const { imported, add } = useKnownTokens();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"All" | TokenCategory>("All");
  const [found, setFound] = useState<Token | null>(null);
  const [lookup, setLookup] = useState<"idle" | "loading" | "error">("idle");
  const [ack, setAck] = useState(false);

  const all = useMemo(() => [...TOKENS, ...imported.filter((i) => !TOKENS.some((t) => t.address === i.address))], [imported]);
  const query = q.trim().toLowerCase();
  const list = useMemo(
    () =>
      all.filter(
        (t) =>
          (cat === "All" || t.category === cat || (cat === "Ecosystem" && t.imported)) &&
          `${t.symbol} ${t.name} ${t.address}`.toLowerCase().includes(query),
      ),
    [all, cat, query],
  );
  const popular = TOKENS.filter((t) => t.popular);
  const woodListed = TOKENS.some((t) => t.symbol === "WOOD");
  const showWoodSeed =
    !woodListed && (cat === "All" || cat === "Ecosystem") && (!query || `wood tradewood ${WOOD_SEED.address}`.toLowerCase().includes(query));

  // A pasted address that isn't listed: read its ERC-20 metadata from Robinhood Chain.
  const raw = q.trim();
  const pasted = isAddress(raw, { strict: false }) ? getAddress(raw.toLowerCase()) : undefined;
  const pastedIsWood = pasted === WOOD_SEED.address && !woodListed;
  const needsLookup = Boolean(pasted && !pastedIsWood && !all.some((t) => t.address === pasted));
  useEffect(() => {
    setFound(null);
    setAck(false);
    if (!needsLookup || !pasted || !client) return setLookup("idle");
    let live = true;
    setLookup("loading");
    (async () => {
      try {
        if (!(await client.getCode({ address: pasted }))) throw new Error("no code");
        const [symbol, name, decimals] = await Promise.all(
          (["symbol", "name", "decimals"] as const).map((fn) => client.readContract({ address: pasted as Address, abi: metaAbi, functionName: fn })),
        );
        await client.readContract({ address: pasted, abi: erc20Abi, functionName: "balanceOf", args: [pasted] });
        const d = Number(decimals);
        if (!Number.isInteger(d) || d > 36) throw new Error("bad decimals");
        if (live)
          setFound({
            symbol: clean(String(symbol), 12) || "TOKEN",
            name: clean(String(name), 40) || "Imported token",
            address: pasted,
            decimals: d,
            icon: "",
            tone: "bg-slate-500/20 text-slate-200",
            category: "Ecosystem",
            imported: true,
          });
        if (live) setLookup("idle");
      } catch {
        if (live) setLookup("error");
      }
    })();
    return () => {
      live = false;
    };
  }, [needsLookup, pasted, client]);

  const pick = (t: Token) => {
    onSelect(t);
    setQ("");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Select Token">
      <div className="relative mb-3">
        <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, symbol or paste a 0x address"
          className="w-full bg-panelCard border border-emeraldGlow/20 focus:border-neonGreen/60 rounded-xl pl-9 pr-3 py-3 text-sm text-white outline-none placeholder:text-slate-500"
        />
      </div>

      {/* Quick picks */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {popular.map((t) => (
          <button
            key={t.address}
            disabled={exclude?.address === t.address}
            onClick={() => pick(t)}
            className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-xl bg-panelCard hover:bg-panelHover border border-emeraldGlow/20 hover:border-emeraldGlow/40 text-xs font-mono font-bold text-white disabled:opacity-40 transition-colors"
          >
            <TokenIcon token={t} size="w-5 h-5 text-[10px]" />
            {t.symbol}
          </button>
        ))}
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
              cat === c.id ? "bg-neonGreen text-black" : "bg-panelCard text-slate-300 hover:text-white border border-emeraldGlow/15"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <ul className="space-y-1.5">
        {showWoodSeed && (
          <li>
            <a
              href={WOOD_SEED.href}
              className="w-full flex items-center gap-3 p-3 rounded-2xl bg-panelCard/60 hover:bg-panelHover border border-sherwoodGold/30 hover:border-sherwoodGold/60 transition-all text-left"
            >
              <span className="w-9 h-9 rounded-full flex items-center justify-center bg-neonGreen/20 text-neonGreen shrink-0">
                <i className="fa-solid fa-tree" />
              </span>
              <div className="min-w-0">
                <p className="font-bold text-white text-sm font-mono">WOOD</p>
                <p className="text-xs text-slate-400 truncate">{WOOD_SEED.name}</p>
              </div>
              <span className="ml-auto pill !text-[9px] !px-2 text-goldLight">Join seed →</span>
            </a>
          </li>
        )}
        {list.map((t) => {
          const disabled = exclude?.address === t.address;
          return (
            <li key={t.address}>
              <div className="flex items-center gap-1">
                <button
                  disabled={disabled}
                  onClick={() => pick(t)}
                  className="flex-1 min-w-0 flex items-center gap-3 p-3 rounded-2xl bg-panelCard/60 hover:bg-panelHover border border-transparent hover:border-emeraldGlow/30 transition-all disabled:opacity-40 text-left"
                >
                  <TokenIcon token={t} size="w-9 h-9 text-sm" />
                  <div className="min-w-0">
                    <p className="font-bold text-white text-sm font-mono">{t.symbol}</p>
                    <p className="text-xs text-slate-400 truncate">{t.name}</p>
                  </div>
                  <span className="ml-auto flex items-center gap-1.5 shrink-0">
                    {t.v2Only && <span className="pill !text-[9px] !px-2">3% tax</span>}
                    {t.imported ? (
                      <span className="pill !text-[9px] !px-2 !text-robinRed">Unverified</span>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">{t.address === "0x0000000000000000000000000000000000000000" ? "Native" : shortAddr(t.address)}</span>
                    )}
                  </span>
                </button>
                {t.address !== "0x0000000000000000000000000000000000000000" && (
                  <a href={explorerAddress(t.address)} target="_blank" rel="noreferrer" className="w-8 h-8 shrink-0 flex items-center justify-center rounded-xl text-slate-500 hover:text-neonGreen" aria-label={`${t.symbol} on Blockscout`}>
                    <i className="fa-solid fa-arrow-up-right-from-square text-[11px]" />
                  </a>
                )}
              </div>
            </li>
          );
        })}

        {pastedIsWood && (
          <li className="p-3 rounded-2xl border border-sherwoodGold/30 text-xs text-slate-300">
            That's $WOOD. It can't be swapped until trading opens after the seed round. <a href={WOOD_SEED.href} className="text-neonGreen hover:underline">Join the seed sale →</a>
          </li>
        )}
        {needsLookup && lookup === "loading" && (
          <li className="p-4 text-center text-xs text-slate-400"><i className="fa-solid fa-spinner fa-spin mr-1.5" />Reading the contract on Robinhood Chain…</li>
        )}
        {needsLookup && lookup === "error" && (
          <li className="p-4 text-center text-xs text-robinRed">No ERC-20 token found at that address on Robinhood Chain.</li>
        )}
        {found && (
          <li className="p-4 rounded-2xl border border-robinRed/40 bg-robinRed/5 space-y-3">
            <div className="flex items-center gap-3">
              <TokenIcon token={found} size="w-9 h-9 text-sm" />
              <div className="min-w-0">
                <p className="font-bold text-white text-sm font-mono">{found.symbol} <span className="text-slate-400 font-sans font-normal">· {found.decimals} decimals</span></p>
                <a href={explorerAddress(found.address)} target="_blank" rel="noreferrer" className="text-xs text-slate-400 hover:text-neonGreen truncate block">{found.name} · {shortAddr(found.address)} ↗</a>
              </div>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              This token isn't on TradeWood's list. Anyone can create a token with any name, including copies of real ones. Check the address on the explorer before you trade it.
            </p>
            <label className="flex items-start gap-2 text-[11px] text-slate-300 cursor-pointer">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 accent-emerald-500" />
              I understand this token is unverified and I may lose what I trade.
            </label>
            <button
              disabled={!ack}
              onClick={() => {
                add(found);
                pick(found);
              }}
              className="btn-primary w-full py-2.5 text-xs disabled:opacity-40"
            >
              Import {found.symbol}
            </button>
          </li>
        )}
        {!list.length && !showWoodSeed && !needsLookup && !pastedIsWood && (
          <li className="p-4 text-center text-xs text-slate-500">No tokens match. Paste a contract address to import one.</li>
        )}
      </ul>
      <p className="text-[11px] text-slate-500 mt-4 leading-relaxed">
        Listed tokens are checked on Robinhood Chain and have live Uniswap liquidity. Stock tokens are issued by Robinhood; their availability may depend on where you live. TradeWood is not affiliated with Robinhood Markets.
      </p>
    </Modal>
  );
}
