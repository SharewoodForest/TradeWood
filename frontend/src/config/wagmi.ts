import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  rabbyWallet,
  coinbaseWallet,
  injectedWallet,
  walletConnectWallet,
  trustWallet,
  rainbowWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { robinhoodChain } from "./chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

// Without a WalletConnect project ID, only browser-extension wallets are offered (no crash, no mobile deep links).
const wallets = projectId
  ? [
      { groupName: "Popular", wallets: [metaMaskWallet, rabbyWallet, coinbaseWallet, walletConnectWallet] },
      { groupName: "Mobile", wallets: [trustWallet, rainbowWallet, injectedWallet] },
    ]
  : [{ groupName: "Browser wallets", wallets: [injectedWallet, coinbaseWallet] }];

const connectors = connectorsForWallets(wallets, {
  appName: "TradeWood",
  appUrl: "https://tradewood.app",
  projectId: projectId || "tradewood-no-walletconnect",
});

export const config = createConfig({
  chains: [robinhoodChain],
  connectors,
  transports: { [robinhoodChain.id]: http(undefined, { retryCount: 4, retryDelay: 400 }) },
  ssr: true,
});

export const hasWalletConnect = Boolean(projectId);
