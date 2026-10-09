"use client";
import { useState } from "react";
import { Modal } from "./Modal";

const PRESETS = [10, 50, 100]; // bps

export function SlippageModal({ open, onClose, value, onChange }: { open: boolean; onClose: () => void; value: number; onChange: (bps: number) => void }) {
  const [custom, setCustom] = useState("");
  const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
  return (
    <Modal open={open} onClose={onClose} title="Slippage Settings">
      <p className="text-xs text-slate-400 mb-4">Your swap reverts if the price moves against you by more than this before it confirms.</p>
      <div className="grid grid-cols-4 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => {
              onChange(p);
              setCustom("");
            }}
            className={`py-2.5 rounded-xl font-mono text-sm font-bold border transition-all ${
              value === p ? "bg-emeraldGlow/20 text-neonGreen border-emeraldGlow/50" : "bg-panelCard text-slate-300 border-emeraldGlow/15 hover:border-emeraldGlow/40"
            }`}
          >
            {pct(p)}
          </button>
        ))}
        <div className="relative">
          <input
            inputMode="decimal"
            value={custom}
            placeholder="Custom"
            onChange={(e) => {
              setCustom(e.target.value);
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n > 0 && n <= 50) onChange(Math.round(n * 100));
            }}
            className="w-full h-full bg-panelCard border border-emeraldGlow/15 focus:border-neonGreen/60 rounded-xl px-2 text-center font-mono text-sm text-white outline-none"
          />
        </div>
      </div>
      {value > 300 && (
        <p className="mt-4 text-xs text-sherwoodGold">
          <i className="fa-solid fa-triangle-exclamation" /> High slippage. Your trade may be front-run.
        </p>
      )}
      <p className="mt-4 text-xs font-mono text-slate-400">
        Current: <span className="text-white">{pct(value)}</span>
      </p>
    </Modal>
  );
}
