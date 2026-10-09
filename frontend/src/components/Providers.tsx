"use client";
import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { config } from "@/config/wagmi";
import { robinhoodChain } from "@/config/chains";
import { ToastProvider } from "./Toast";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={robinhoodChain}
          theme={darkTheme({ accentColor: "#00E676", accentColorForeground: "black", borderRadius: "large", overlayBlur: "small" })}
          appInfo={{ appName: "TradeWood" }}
        >
          <ToastProvider>{children}</ToastProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
