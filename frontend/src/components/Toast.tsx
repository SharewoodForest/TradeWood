"use client";
import { createContext, type ReactNode, useCallback, useContext, useState } from "react";

type Toast = { id: number; kind: "success" | "error" | "info"; title: string; body?: string; href?: string };
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((s) => [...s, { ...t, id }]);
    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), 7000);
  }, []);
  const tone = { success: "border-neonGreen/40 text-neonGreen", error: "border-robinRed/50 text-robinRed", info: "border-sherwoodGold/40 text-goldLight" };
  const icon = { success: "fa-circle-check", error: "fa-triangle-exclamation", info: "fa-circle-info" };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 sm:w-96" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`glass-card rounded-2xl p-4 shadow-glass border ${tone[t.kind]}`}>
            <div className="flex items-start gap-3">
              <i className={`fa-solid ${icon[t.kind]} mt-0.5`} />
              <div className="min-w-0">
                <p className="font-bold text-sm text-white">{t.title}</p>
                {t.body && <p className="text-xs text-slate-300 mt-0.5 break-words">{t.body}</p>}
                {t.href && (
                  <a href={t.href} target="_blank" rel="noreferrer" className="text-xs font-mono text-neonGreen hover:underline mt-1 inline-block">
                    View on Blockscout <i className="fa-solid fa-arrow-up-right-from-square text-[10px]" />
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
