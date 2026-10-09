"use client";
import { type ReactNode, useEffect } from "react";

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative glass-card-glow rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-6 shadow-glass max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-panelCard hover:bg-panelHover border border-emeraldGlow/20 text-slate-300" aria-label="Close">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
