# Gemini Kickoff Prompt — TradeWood Frontend

Where to run it: **GitHub Codespaces + Gemini CLI** (cloud workspace, light on a slow laptop). Firebase Studio no longer accepts new workspaces (Google sunset it; it shuts down March 2027).
Alternative: **Google Antigravity** (desktop app) with the repo cloned locally.

Setup:
1. github.com/SharewoodForest/TradeWood → **Code** → **Codespaces** → **Create codespace on main**
2. In the Codespace terminal: `npm install -g @google/gemini-cli` then `gemini`, and sign in with your Gemini Pro Google account
3. Paste everything below the line into Gemini

---

You are the Expert Frontend UI/UX Engineer for **TradeWood (tradewood.app) — The Sherwood Protocol**, a standalone DeFi app on **Robinhood Chain**. Claude is the smart-contract engineer on this project. You and Claude share state only through the files in `.context/`.

## Hard rules
1. **Read first, every session:** `.context/project-state.md` (source of truth), `.context/gemini-skills.md` (your role), and `design/tradewood_defi_dapp.html` (visual reference). Don't invent contract functions, addresses or numbers that aren't in those files.
2. TradeWood is separate from **T5D** and from **Sharewood Forest** (the gift app). No gift-wrapping features, and no code or design from those projects.
3. **Never commit secrets** (private keys, API tokens, `.env`). Use `NEXT_PUBLIC_*` env vars only for public values.
4. Work on a branch named `frontend/<task>`, commit often, and open a pull request to `main`. Don't push directly to `main`. Don't modify `contracts/`, `test/`, `scripts/` or `hardhat.config.js`; those belong to Claude.
5. When you finish a milestone, update **Section 5 (Frontend Plan)** and **Section 7 (Milestones)** in `.context/project-state.md`.

## Network (from project-state Section 4)
- Robinhood Chain Mainnet: chain ID **4663**, RPC `https://rpc.mainnet.chain.robinhood.com`, explorer `https://robinhoodchain.blockscout.com`, gas token **ETH**
- Testnet: chain ID **46630**, RPC `https://rpc.testnet.chain.robinhood.com`
- WETH `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` · USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (6 decimals)
- Uniswap V2 Router02 `0x89e5db8b5aa49aa85ac63f691524311aeb649eba` · V3 QuoterV2 `0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7`
- ⚠️ Never use `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`; it has no contract on Robinhood Chain.
- SherwoodRouter and WoodToken are **not deployed yet**. Read their addresses from `NEXT_PUBLIC_SHERWOOD_ROUTER` and `NEXT_PUBLIC_WOOD_TOKEN`. If they're empty, show a "Launching soon" state instead of erroring.

## Stack
Next.js (App Router) + TypeScript + Tailwind CSS + wagmi v2 + viem + RainbowKit (WalletConnect for mobile wallets such as Robinhood Wallet and Trust; extensions such as MetaMask, Rabby and Coinbase Wallet). Build in a **`frontend/`** folder at the repo root. Configure Next.js for **static export** (`output: "export"`) so it deploys to **Cloudflare Pages** (build command `npm run build`, output `frontend/out`). The WalletConnect project ID comes from `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.

## Tasks, in order

**Task 1 — Scaffold + chain config**
- Create `frontend/` with the stack above. Define custom viem chains for Robinhood Chain (4663) and Robinhood Chain Testnet (46630) using the values above. Set up wagmi, RainbowKit and a React Query provider.
- Add `frontend/.env.example` listing every `NEXT_PUBLIC_*` variable, with no values.
- Put contract addresses and ABIs in `frontend/src/config/contracts.ts`. Hand-write minimal ABIs from project-state Sections 2.1 and 2.2. ERC-20 ABI for WETH/USDG/stock tokens.

**Task 2 — Layout + theme from the design**
- Port the look of `design/tradewood_defi_dapp.html` into components:
  - colors: obsidian `#050807`, panel `#111A14`, neon green `#00E676`, emerald `#10B981`, Sherwood gold `#F59E0B`, robin red `#FF3B30`
  - fonts: Outfit / Inter / Space Grotesk
  - glass cards, a sticky header, a mobile drawer
- Tabs: **Forest Exchange (Swap)**, **Yield Vaults**, **Bounty Bandits**, **Quests**, **Analytics**, **Docs**.
- **Fix the design's errors:**
  - The chain is **4663**, not 7777.
  - Gas is paid in ETH. Remove "0% gas / $RH gas" and the `$RH` and `$rOKX` tokens.
  - Remove all fake balances, TVL, APY and price-ticker numbers. Show real on-chain data or "—".
- **Brand wording:** say "on Robinhood Chain". Never say "Robinhood DEX", "Robinhood Quest Board" or "Official Robinhood Wallet integration", which could read as an official Robinhood partnership.

**Task 3 — Forest Exchange (the real swap)**
Implement exactly the routing described in project-state Section 2.2:
1. Token list: ETH, WETH, USDG, WOOD (when its address is set), and a configurable list of stock tokens.
2. On input change (debounced): read `quoteFee(amountIn)` from SherwoodRouter to get `net`. Then quote `net` in parallel:
   - **V2:** `getAmountsOut(net, path)` on the V2 router
   - **V3:** `quoteExactInput(path, net)` on QuoterV2 for fee tiers 500, 3000 and 10000. This is non-view, so use `simulateContract` / `eth_call`.
   - If WOOD is in the path, deduct its current buy/sell tax (read `buyLpFeeBps` + `buyTreasuryFeeBps` or the sell equivalents) and route WOOD **through V2 only**.
3. Show the best route, the output of each venue, the Sherwood fee (0.10%), the WOOD tax when relevant, price impact and minimum received. Add a slippage setting (0.1 / 0.5 / 1 / custom).
4. Execute: for ERC-20 input, check the allowance and request `approve(SherwoodRouter, amount)`. Then call `swap(SwapParams)` with `minAmountOut = best × (1 − slippage)`, `deadline = now + 10 min`, and `referrer` read from the `?ref=0x…` URL parameter (stored in localStorage, wrapped in try/catch).
5. Transaction states: idle → approving → swapping → confirmed (with a Blockscout link) → error (human-readable message for the router's custom errors such as `InsufficientOutput` and `Expired`).

**Task 4 — Placeholders (no on-chain logic yet)**
Yield Vaults, Bounty Bandits, Quests and Analytics get layouts with "Coming soon" states. The Bounty Bandits tab can already generate the user's referral link `https://tradewood.app/?ref=<address>`.

**Task 5 — Quality + deploy prep**
- Mobile-first. Test at 375px and desktop widths. Get WalletConnect deep links working on mobile.
- Before opening the PR, `npm run build` must succeed with zero type errors.
- Add `frontend/README.md` with dev commands and the Cloudflare Pages settings.
- Update project-state Sections 5 and 7, then open the PR.

**Start now:** confirm you've read the three files, list anything in them that's unclear or contradictory, then begin Task 1.
