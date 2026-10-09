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

### Revenue Engine (APPROVED 2026-10-08)

**Solvency rule:** no reward pays out more cash than the same activity brings in. Cash referral payouts are a capped slice of fees on referred trades. Every WOOD incentive comes from pre-minted allocations, so nothing is open-ended.

| # | Stream | Mechanic | Treasury take | Phase |
|---|---|---|---|---|
| 1 | **Sherwood Router fee** | Routes swaps through the best available Robinhood Chain DEX liquidity (and Tradewood pools once live); adds a protocol fee on top | **0.10%** of routed volume | v1 |
| 2 | **$WOOD trade tax** | 1% treasury + 2% auto-LP on WOOD buys/sells (Section 3) | 1% in ETH | v1 |
| 3 | **Protocol-owned liquidity** | Auto-LP tokens are minted to the treasury, so it earns LP fees on its own liquidity and the pool keeps deepening | 0.24% LP fee on the POL share of the pool | v1 |
| 4 | **Vault fees** | 10% performance fee on harvested yield; 3% early-exit fee on lockup vaults (Outlaw) | 10% of yield / 3% of early exits | v1 (Friar Tuck), v2 (others) |
| 5 | **Tradewood AMM swap fee** | Own pools: 0.30% fee = 0.24% LPs / 0.06% treasury | 0.06% | v2 |
| 6 | **Launchpad & listing** | Robinhood Chain projects list or presell through Tradewood | $500–$2,500 flat or 2–5% of raise | v3 |
| 7 | **Sponsored quests** | Projects pay for featured quests on the Quest Board | $250–$1,000+ per campaign | v3 |
| — | Flash loans | **Deferred**: high audit risk, near-zero revenue on thin liquidity | — | later |

**Why the router comes first:** a $50–$100 seeded pool can't generate meaningful swap fees. A router fee earns from day one on every trade, including stock tokens and ETH/USDG, using liquidity that already exists. **To verify:** which DEXs and aggregators are live on Robinhood Chain (4663), and their router addresses.

**Costs to plan for:** a security audit is the main expense (budget roughly $5k–$30k depending on scope). Gas on Robinhood Chain and Cloudflare Pages hosting cost very little.

**Illustration only, not a forecast.** At $500K/month routed volume and $100K/month of WOOD trading: router $500 + WOOD tax $1,000 + POL fees (small) ≈ **$1,500/mo**, minus referral cash on referred trades (≤ $150 at Founding rates).

**Fee tiers (by staked WOOD, approved):** Peasant 0 → 0.30% · Yeoman 1,000 → 0.25% · Outlaw 10,000 → 0.20% · Merry Man 50,000+ → 0.10% + WOOD rebates. (Original chat: 0.30 / 0.20 / 0.10 / 0%.) Discounts come out of the LP + treasury split proportionally.

### Merry Men Referral Program (APPROVED v1 — 2026-10-08)

Design rule: **cash rewards come only from the treasury's cut, on referred volume only, and the treasury always keeps ≥70%.** Excitement comes from a **fixed $WOOD budget** carved from the Guild fund, so the program can never overspend.

**Swap fee split (proposed change):** 0.30% total = **0.24% LPs / 0.06% treasury** (was 0.25 / 0.05).

**A. Cash share (ETH/USDC, paid from the treasury's 0.06%)**

| Phase | Epochs (14 days each) | Tier 1 (direct) | Tier 2 | Treasury keeps |
|---|---|---|---|---|
| Founding Outlaws | 1–6 (~84 days) | 25% | 5% | 70% |
| Growth | 7–13 (~98 days) | 20% | 5% | 75% |
| Steady | 14+ | 15% | 3% | 82% |

Contract hard caps: Tier 1 ≤ 25%, Tier 1 + Tier 2 ≤ 30% of the treasury cut. Rate changes go through a 48h timelock. Founding referrers keep Founding rates on the wallets they already referred for 12 months.

**B. $WOOD bonus (from the Guild fund, fixed budget)**

- Referral budget: **6,000,000 WOOD** (40% of the 15M Merry Men Guild & Ecosystem Fund). The other 9M stays for quests and ecosystem.
- Fixed pool per epoch, split pro-rata by each referrer's referred volume:
  - Founding (epochs 1–6): **400,000 WOOD/epoch** → 2.4M
  - Growth (epochs 7–13): **200,000 WOOD/epoch** → 1.4M
  - Steady (epochs 14–52): **~56,400 WOOD/epoch** → 2.2M (program ends at ~2 years unless renewed)
- One wallet can take at most **5% of an epoch pool**.
- Claimed WOOD auto-stakes in Friar Tuck's Treasury for 14 days, which limits dumping and grows TVL.

**C. New-user welcome (instead of a fee discount)**

- For the first 30 days, referred users get **10% of their swap fees back in WOOD**, paid from the 6M referral budget. Their fee stays 0.30%, so LP and treasury income is unchanged.

**D. Anti-abuse**

- No self-referral. A referral binding is permanent once set.
- A swap must be worth at least **$10** to count. Rewards only start after the referred wallet reaches **$50 cumulative volume**.

**Worked example:** at $1M/month of referred volume, fees are $3,000. Treasury cut = $600, Founding cash payout = $180, treasury net = $420. All WOOD rewards come from the pre-set allocation, so no cash leaves.

**Related fix (approved):** the "Merry Man" tier is **0.10%** (not 0%), with rebates paid in WOOD from the quests budget.

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
7. Approve the referral program v1 and fee tiers (Section 3). Still needed: treasury wallet address and initial liquidity amount.

## 7. Milestones

- [x] Repo created (`SharewoodForest/TradeWood`)
- [x] Agent skill specs: `.context/claude-skills.md`, `.context/gemini-skills.md`
- [x] UI mock imported to `design/`
- [x] Scope: DEX + vaults + referrals + quests; referral v1 + fee tiers approved
- [ ] Verify live Robinhood Chain DEXs/routers (needed for Sherwood Router)
- [ ] **v1 contracts:** WoodToken → SherwoodRouter (fee) → FriarTuckVault → MerryMenReferral → tests → testnet (46630) → audit
- [ ] **v2:** Tradewood AMM pools, Little John LP vault, Outlaw auto-compounder, Quests/epoch claims
- [ ] **v3:** Launchpad, sponsored quests
- [ ] Frontend scaffold (Next.js + Wagmi, chain 4663)
- [ ] Cloudflare Pages + tradewood.app DNS
- [ ] Mainnet launch
