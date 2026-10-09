# Tradewood — Project State (Source of Truth)

> Both agents read this first. Claude (contracts) owns Section 2 and Section 4. Gemini (frontend) reads them before building UI.
> Sources: Drive › "Initial design and development" (Gemini chat export), "TradeWood UI design" (`design/tradewood_defi_dapp.html`), Claude/Gemini role prompts.
> Last updated: 2026-10-08

## 1. Vision & Core Features

**tradewood.app — "The Sherwood Protocol"** on Robinhood Chain. Standalone DeFi project, separate from T5D **and from Sharewood Forest** (gift-a-share dapp — gift wrapping is NOT part of Tradewood). Robin Hood / Sherwood Forest theme, dark cyber-forest UI.

| Module (UI tab) | What it does |
|---|---|
| **The Forest Exchange** (Swap) | AMM DEX: swap $WOOD, ETH, USDC/USDG and Robinhood Chain stock tokens. Slippage settings, route breakdown, price chart, live trade feed. |
| **Yield Vaults** | Friar Tuck's Treasury (single-sided $WOOD, no lockup, paid from protocol fees) · Little John's LP Vault ($WOOD/ETH LP) · Outlaw Auto-Compounder (auto-reinvest). |
| **Merry Men** (Referrals) | On-chain referral links; referrers earn a share of fees from invited wallets; leaderboard; claimable rewards. |
| **Quests** | Bounty Points for on-chain tasks (first swap, stake, refer, add LP); converted to $WOOD at the end of each 14-day epoch. |
| **Analytics** | TVL, volume, burn, tokenomics breakdown. |

## 2. Shared Context Memory Bank (Contracts → Frontend)

_No contracts deployed yet. Claude updates this section with addresses, ABIs and function signatures as each contract lands._

| Contract | Status | Address (4663) | Key functions / events |
|---|---|---|---|
| WoodToken ($WOOD) | Draft spec only | — | — |
| Router / Pair | Not started | — | — |
| Vaults | Not started | — | — |
| Referral registry | Not started | — | — |
| Quests / Epoch claims | Not started | — | — |

## 3. $WOOD Tokenomics (as discussed — not final)

- Total supply: **100,000,000 WOOD** (18 decimals)
- Allocation (UI): 50% community yield & vaults · 25% DEX liquidity · 15% Merry Men guild & ecosystem fund · 10% auto-burn
- Launch: micro-seed of **$50–$100** ETH/USDC paired with WOOD
- Anti-whale: max tx **1%**, max wallet **2%**
- Trade tax **3%**: 2% auto-LP (liquidity locked) + 1% treasury
- Exclusions: owner, token contract, router, treasury

**Revenue streams:** swap fee 0.30% (0.25% LPs / 0.05% treasury) · WOOD trade tax · 10% vault performance fee · 2–5% early-unbond penalty · flash loans 0.09% · launchpad/listing fees · sponsored quests.

**Fee tiers (by staked WOOD):** Peasant 0 → 0.30% · Yeoman 1,000 → 0.20% · Outlaw 10,000 → 0.10% · Merry Man 50,000+ → 0% + rebates.

**Referrals:** chat says 15–20% of invitee fees, plus a 10% discount for 30 days for new users. UI docs say 5% tier 1 / 2% tier 2. **Needs a decision.**

## 4. Network & Contract Parameters

| Param | Value |
|---|---|
| Chain | Robinhood Chain Mainnet — ID **4663** (testnet **46630**) |
| RPC | `https://rpc.mainnet.chain.robinhood.com` |
| Explorer | `robinhoodchain.blockscout.com` |
| Gas | ETH |
| Base stablecoin | USDG |
| DEX router | **Unverified.** Chat used `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`; confirm it exists on Robinhood Chain before use. |
| Tooling | Hardhat + OpenZeppelin v5 (chat) — Foundry also acceptable |
| Hosting | Cloudflare Pages → tradewood.app; repo `SharewoodForest/TradeWood` |

## 5. Frontend Plan

- Visual reference: `design/tradewood_defi_dapp.html` (static mock; balances, TVL, APYs and wallet connection are all fake data).
- Production stack: Next.js (App Router), TypeScript, Tailwind, Wagmi + Viem, RainbowKit/AppKit (MetaMask, Rabby, Coinbase, Robinhood Wallet & Trust via WalletConnect).
- Theme tokens from the mock: obsidian `#050807`, panel `#111A14`, neon green `#00E676`, emerald `#10B981`, Sherwood gold `#F59E0B`, robin red `#FF3B30`; fonts Outfit / Inter / Space Grotesk.

## 6. Open Issues & Decisions Needed

1. ~~Scope conflict~~ — **Resolved 2026-10-08:** gift wrapping was a mix-up with Sharewood Forest. Tradewood = DEX + vaults + referrals + quests.
2. **UI mock errors to fix:** shows chain ID **7777**, "0% gas / $RH gas", and tokens `$RH`, `$rOKX`. The real chain is 4663 and gas is paid in ETH.
3. **Chat inconsistencies:** a later reply used RPC `rpc.robinhoodchain.org`, chain ID 1337 and a plain mint/burn token without taxes. Ignore those; use Section 4.
4. **Own DEX vs. existing DEX:** a full AMM, vaults and flash loans is a large audit surface. Option: launch WOOD on an existing Robinhood Chain DEX first and build Tradewood's own router later.
5. **Tax token caveats:** transfer taxes and max-wallet limits break many aggregators, vaults and CEX listings, and look like a honeypot to scanners. Need exemptions and owner-renounce/limits-off plans.
6. **Secrets:** never commit `.env`, private keys or tokens. The chat's deploy script put the GitHub token in the git remote URL; don't do that.
7. Referral % (Section 3), treasury wallet address, initial liquidity amount.

## 7. Milestones

- [x] Repo created (`SharewoodForest/TradeWood`)
- [x] Agent skill specs: `.context/claude-skills.md`, `.context/gemini-skills.md`
- [x] UI mock imported to `design/`
- [ ] Decide scope & resolve Section 6
- [ ] Contracts: WoodToken → tests → testnet (46630)
- [ ] Frontend scaffold (Next.js + Wagmi, chain 4663)
- [ ] Cloudflare Pages + tradewood.app DNS
- [ ] Mainnet launch
