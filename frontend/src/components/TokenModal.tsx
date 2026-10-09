"use client";
import { useMemo, useState } from "react";
import { TOKENS, type Token } from "@/config/contracts";
import { Modal } from "./Modal";
import { TokenIcon } from "./TokenIcon";

export function TokenModal({ open, onClose, onSelect, exclude }: { open: boolean; onClose: () => void; onSelect: (t: Token) => void; exclude?: Token }) {
  const [q, setQ] = useState("");
  const list = useMemo(
    () => TOKENS.filter((t) => `${t.symbol} ${t.name} ${t.address}`.toLowerCase().includes(q.toLowerCase())),
    [q],
  );
  return (
    <Modal open={open} onClose={onClose} title="Select Token">
      <div className="relative mb-4">
        <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, symbol or address"
          className="w-full bg-panelCard border border-emeraldGlow/20 focus:border-neonGreen/60 rounded-xl pl-9 pr-3 py-3 text-sm text-white outline-none placeholder:text-slate-500"
        />
      </div>
      <ul className="space-y-1.5">
        {list.map((t) => {
          const disabled = exclude?.address === t.address;
          return (
            <li key={t.address}>
              <button
                disabled={disabled}
                onClick={() => {
                  onSelect(t);
                  onClose();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-2xl bg-panelCard/60 hover:bg-panelHover border border-transparent hover:border-emeraldGlow/30 transition-all disabled:opacity-40 text-left"
              >
                <TokenIcon token={t} size="w-9 h-9 text-sm" />
                <div className="min-w-0">
                  <p className="font-bold text-white text-sm font-mono">{t.symbol}</p>
                  <p className="text-xs text-slate-400 truncate">{t.name}</p>
                </div>
                {t.v2Only && <span className="ml-auto pill !text-[9px] !px-2">3% tax</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-slate-500 mt-4 leading-relaxed">
        Stock tokens and $WOOD appear here once their verified addresses are added.
      </p>
    </Modal>
  );
}
