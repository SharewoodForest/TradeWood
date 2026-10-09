# Tradewood — Project State (Source of Truth)

> Both agents read this first. Claude (contracts) owns Section 2 and Section 4. Gemini (frontend) reads them before building UI.
> Sources: Drive › "Initial design and development" (Gemini chat export), "TradeWood UI design" (`design/tradewood_defi_dapp.html`), Claude/Gemini role prompts.
> Last updated: 2026-10-08

## 1. Vision & Core Features

**tradewood.app — "The Sherwood Protocol"** *(naming: **Sherwood** = TradeWood's protocol/router/vaults; **Sharewood** = the separate Sharewood Forest gift app and the GitHub org. Keep them distinct.)* on Robinhood Chain. Standalone DeFi project, separate from T5D **and from Sharewood Forest** (gift-a-share dapp — gift wrapping is NOT part of Tradewood). Robin Hood / Sherwood Forest theme, dark cyber-forest UI.

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
| WoodToken ($WOOD) | **Written + tested** (18 unit tests, mainnet-fork buy/sell OK). Not deployed. | — | see 2.1 |
| WOOD/WETH pair | Created automatically by the WoodToken constructor (Uniswap V2) | — | `mainPair()` |
| SherwoodSeedSale (early buyers) | Spec only (Section 3) | — | — |
| SherwoodRouter (multi-venue, 0.10% fee) | **Written + tested** (11 unit tests; mainnet-fork swaps via live V2 + V3 OK). Not deployed. | — | see 2.2 |
| Vaults | Not started | — | — |
| Referral registry | Not started | — | — |
| Quests / Epoch claims | Not started | — | — |

### 2.1 WoodToken interface (`contracts/WoodToken.sol`)

Standard ERC-20 (name `TradeWood`, symbol `WOOD`, 18 decimals) + ERC-2612 `permit` + `burn` / `burnFrom`. Fixed supply 100M; **no mint function**.

**Read (frontend):** `balanceOf`, `totalSupply`, `mainPair()`, `tradingEnabled()`, `limitsInEffect()`, `maxTxAmount()`, `maxWalletAmount()`, `buyLpFeeBps()`, `buyTreasuryFeeBps()`, `sellLpFeeBps()`, `sellTreasuryFeeBps()` (basis points, 100 = 1%), `isFeeExempt(addr)`, `isLimitExempt(addr)`, `isAmmPair(addr)`, `treasury()`.

**Frontend rules:**
- Swaps of WOOD must use the router's `...SupportingFeeOnTransferTokens` functions, and quotes must deduct the buy/sell tax (default 3%).
- Max receive per buy = `maxTxAmount` (1M WOOD) while `limitsInEffect`. Wallets are capped at `maxWalletAmount` (2M).
- Wallet-to-wallet transfers are **untaxed**.
- Before `tradingEnabled`, only exempt addresses can move WOOD. Show a "Launching soon" state.

**Events:** `TradingEnabled`, `LimitsRemoved`, `FeesUpdated`, `SwapBack(tokensSwapped, tokensAddedToLp, ethAddedToLp, ethToTreasury)`, `TreasuryUpdated`, `AmmPairSet`.

**Known behavior (by design, standard for tax tokens):**
- Adding or removing liquidity on the WOOD/WETH pair directly also pays the 3% tax, because the pair can't tell an LP add from a sell. Little John's LP Vault will add liquidity as an exempt contract, so vault users avoid this.
- WOOD sent straight to the token contract (outside the tax) isn't tracked and stays there.

**Owner powers (all bounded):** tax capped at 5%/side · limits can't go below 0.5% tx / 1% wallet · `enableTrading` and `removeLimits` are one-way · can't withdraw accrued WOOD tax · two-step ownership transfer. Vault, sale and referral contracts must be set `isFeeExempt` + `isLimitExempt`.

### 2.2 SherwoodRouter interface (`contracts/SherwoodRouter.sol`)

One entry point: `swap(SwapParams p) payable returns (uint256 amountOut)`.

```
struct SwapParams {
  uint8   venue;        // 0 = Uniswap V2, 1 = Uniswap V3
  address tokenIn;      // 0x0 = native ETH
  address tokenOut;     // 0x0 = native ETH
  uint256 amountIn;     // for ETH in, msg.value must equal amountIn
  uint256 minAmountOut; // slippage floor, net of the router fee
  address[] v2Path;     // V2: [tokenIn|WETH, ..., tokenOut|WETH]
  bytes   v3Path;       // V3: abi.encodePacked(token, uint24 fee, token, ...)
  address recipient;
  uint256 deadline;     // unix seconds
  address referrer;     // Merry Men attribution (0x0 if none)
}
```

**Read:** `feeBps()` (default 10 = 0.10%, hard cap 30) · `quoteFee(amountIn) → (fee, netAmountIn)` · `paused()` · `treasury()`.
**Event:** `SherwoodSwap(user, referrer, venue, tokenIn, tokenOut, amountIn, amountOut, feeAmount, recipient)`. The referral indexer reads this.

**How the frontend picks the route ("multi-prong"):**
1. `quoteFee(amountIn)` → `net`.
2. Quote `net` on each venue in parallel:
   - V2: `getAmountsOut(net, path)` on the V2 router (deduct WOOD's 3% tax if WOOD is in the path)
   - V3: `quoteExactInput(path, net)` on the V3 Quoter `0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7`, trying the 0.05%, 0.3% and 1% tiers
3. Use the best output and set `minAmountOut = best × (1 − slippage)`.
4. The user approves SherwoodRouter for `tokenIn` (ERC-20 only), then calls `swap`.

Example from the fork, 0.5 ETH → USDG: V3 0.05% = 1,238.60 · V3 0.3% = 1,233.66 · V2 = 1,226.06. Picking the best route beats V2 alone by about 1%.

**Notes:** route WOOD through **V2** (its pool and tax live there). Do **not** make SherwoodRouter limit-exempt in WoodToken, or buys through it would skip the max-tx limit. V4 venue: planned for router v2 (via Universal Router).

## 3. $WOOD Tokenomics

- Total supply: **100,000,000 WOOD** (18 decimals)
- Allocation (UI): 50% community yield & vaults · 25% DEX liquidity · 15% Merry Men guild & ecosystem fund · 10% auto-burn
- Launch: **early-buyer sale first** (the $50–$100 micro-seed plan is dropped). See the Seed Sale proposal below.
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

### Sherwood Seed Sale — Early Buyers (PROPOSED numbers, 2026-10-08; see `.context/launch-research.md`)

| Setting | Value |
|---|---|
| Tokens for sale | 10M WOOD |
| Hard cap / soft cap | **$20,000 / $5,000** (soft cap = 25% of hard cap, the launchpad norm) |
| Sale price → launch price | **$0.002 → $0.0025** ($200K full-supply value). Drop to $0.001 if the router isn't live with volume yet. |
| Per wallet | min $25 · max $500 (whitelist round) · max $1,000 (public round) |
| Rounds | Founding Outlaws whitelist 48h (earned via Bounty Points), then public 72h |
| Payment | ETH or USDG at a rate fixed when the sale opens |
| Unlock | 50% at launch, 50% over 30 days |
| Funds | 70% → liquidity locked 12 months; 30% → treasury |
| Unsold | Burned |
| **Order** | **Router + Bounty Points live first, then the sale ("ship before you sell")** |

Earlier notes:

Goal: raise launch liquidity from early supporters instead of out of pocket, and reward them for coming in first.

- **Allocation:** from the 25M DEX Liquidity allocation, **10M WOOD for the sale** and **15M paired as launch liquidity**.
- **Price:** fixed sale price, set **below the planned launch price** (e.g. 20–25% discount) so early buyers start in profit when trading opens.
- **Payment:** ETH or USDG. Per-wallet min/max (e.g. $25–$1,000) so it isn't whaled. Optional whitelist round for "Founding Outlaws" first.
- **Use of funds (enforced by the contract):** ≥ 70% of the raise is paired with WOOD as liquidity, with LP tokens locked or owned by the treasury. ≤ 30% goes to the treasury (audit, operations).
- **Buyer protection:** soft cap. If it isn't reached, buyers claim a full refund. Tokens are claimable at launch; optional 50% at launch + 50% over 30 days.
- **Perks:** sale buyers get Founding Outlaw referral rates automatically and a quest bonus.
- **Mechanics:** WoodToken already supports this. The sale contract is fee- and limit-exempt and can hand out WOOD before `enableTrading()`.
- **Needs decisions:** hard cap and soft cap ($), sale price and launch price, per-wallet min/max, whitelist round yes/no, vesting yes/no.
- **Legal note:** token presales can raise securities and money-transmission questions depending on jurisdiction and marketing. Get legal input before opening the sale to the public.

### Launch Plan — Multi-Prong (PROPOSED 2026-10-08)

The Seed Sale is one path, not the only one. Revenue and growth run in parallel, and each launch path has a fallback.

**Prong 1 — Revenue that doesn't depend on WOOD:** ship the **Sherwood Router** early. It earns its 0.10% fee on *any* swap (ETH, USDG, stock tokens) using Uniswap's existing liquidity. The business earns even if WOOD's launch is slow.

**Prong 2 — Pre-launch demand (free, runs before and during the sale):**
- Pre-launch quests: follow, join, register a wallet, refer friends. Points convert to WOOD from the quests budget and to Founding Outlaw whitelist spots.
- Referral pre-registration, so links exist on day one and early recruiters lock in Founding rates.
- Co-marketing with other Robinhood Chain projects through sponsored or joint quests.

**Prong 3 — Launch-liquidity paths (pick based on the sale result):**

| Path | When | Upfront cash needed | How it works |
|---|---|---|---|
| **A. Seed Sale** | Default | ~$0 | Early buyers fund it; ≥70% of the raise goes to locked LP (Section 3) |
| **B. Single-sided Uniswap V3 launch** | Sale misses its soft cap | **$0** | Place WOOD-only liquidity in a price range above the start price; buyers' ETH fills the pool as they buy. Register the V3 pool with `setAmmPair` so tax applies. *Needs fork testing first.* |
| **C. Bonding-curve fair launch** | Alternative to B | $0 | A contract sells WOOD on a rising price curve; at a raise target it creates the Uniswap pool automatically and locks the LP |
| **D. Small owner seed + auto-LP** | Last resort | Whatever is comfortable | Launch limits protect the thin pool; the 2% auto-LP tax deepens it with volume |

**Prong 4 — Outside liquidity:** liquidity-mining rewards from the 50% community allocation (Little John's LP Vault) attract LPs who bring their own ETH. This is the main way the pool grows after launch.

**Decision rule:** if the sale reaches its soft cap, use Path A. If it misses, buyers get automatic refunds and launch switches to Path B or C within about a week, keeping the hype from the pre-launch quests. Prongs 1, 2 and 4 run no matter what.

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
| WETH (L2) | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` (official docs) · testnet `0x7943e237c7F95DA44E0301572D358911207852Fa` |
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (6 decimals, official docs) |
| Uniswap V2 Factory | `0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f` (~103K pairs) |
| **Uniswap V2 Router02** | `0x89e5db8b5aa49aa85ac63f691524311aeb649eba`: **official**, listed in Uniswap's SDK (`sdk-core/src/addresses.ts`, `V2_ROUTER_ADDRESSES[ROBINHOOD]`). Also verified on-chain: factory and WETH match, and it passes the mainnet-fork test. |
| Uniswap V3 Quoter / NonfungiblePositionManager | `0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7` / `0x73991a25c818bf1f1128deaab1492d45638de0d3` |
| Uniswap V4 Quoter / PositionManager / StateView | `0x8dc178efb8111bb0973dd9d722ebeff267c98f94` / `0x58daec3116aae6d93017baaea7749052e8a04fa7` / `0xf3334192d15450cdd385c8b70e03f9a6bd9e673b` |
| Uniswap V3 Factory / SwapRouter02 | `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA` / `0xcaf681a66d020601342297493863e78c959e5cb2` |
| Uniswap V4 PoolManager | `0x8366a39cc670b4001a1121b8f6a443a643e40951` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| ⚠️ Do NOT use | `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24` (from the Gemini chat). It has **no contract on Robinhood Chain**, and every taxed transfer would break. |
| Testnet RPC | `https://rpc.testnet.chain.robinhood.com` (46630). The testnet Uniswap router address is still unknown. |
| Tooling | Hardhat + OpenZeppelin v5 (chat) — Foundry also acceptable |
| Hosting | Cloudflare Workers (static assets) → tradewood.app; repo `SharewoodForest/TradeWood`, root `frontend` |

## 5. Frontend Plan

- Visual reference: `design/tradewood_defi_dapp.html` (static mock; balances, TVL, APYs and wallet connection are all fake data).
- Production stack: Next.js (App Router), TypeScript, Tailwind, Wagmi + Viem, RainbowKit/AppKit (MetaMask, Rabby, Coinbase, Robinhood Wallet & Trust via WalletConnect).
- Theme tokens from the mock: obsidian `#050807`, panel `#111A14`, neon green `#00E676`, emerald `#10B981`, Sherwood gold `#F59E0B`, robin red `#FF3B30`; fonts Outfit / Inter / Space Grotesk.

### 5.1 Frontend status (2026-10-08, branch `frontend/app`, built by Claude)
- `frontend/`: Next.js 15 static export, Tailwind (design tokens 1:1 from the mock), wagmi/viem/RainbowKit.
- **Live now:** network ticker; wallet connect (extensions; mobile via WalletConnect once the project ID is set); balances; **multi-venue quotes** against mainnet (V2 + V3 tiers, direct and via WETH) with best-route pick, Sherwood fee, WOOD tax, price impact and min-received; approve + `SherwoodRouter.swap` (enabled when `NEXT_PUBLIC_SHERWOOD_ROUTER` is set); `?ref=` capture.
- **Placeholders:** vaults, referral stats/claims, quests, analytics metrics.
- Design fixes applied: chain 4663 (not 7777), gas paid in ETH, no fake numbers, "on Robinhood Chain" wording, a non-affiliation footer.
- Verified: build passes, desktop (1440px) and mobile (390px) render with no horizontal scroll, live quotes load in a browser.
- Gemini: use this as the base for visual polish. Don't restart the scaffold.

## 6. Open Issues & Decisions Needed

1. ~~Scope conflict~~ — **Resolved 2026-10-08:** gift wrapping was a mix-up with Sharewood Forest. Tradewood = DEX + vaults + referrals + quests.
2. **UI mock errors to fix:** shows chain ID **7777**, "0% gas / $RH gas", and tokens `$RH`, `$rOKX`. The real chain is 4663 and gas is paid in ETH.
3. **Chat inconsistencies:** a later reply used RPC `rpc.robinhoodchain.org`, chain ID 1337 and a plain mint/burn token without taxes. Ignore those; use Section 4.
4. ~~Own DEX vs. existing~~ **Decided:** launch WOOD on Uniswap V2 (live on Robinhood Chain); the Sherwood Router fee layer comes next; own AMM pools in v2.
5. **Tax token caveats:** taxes apply only to AMM-pair trades. Trades through other venues (e.g. a V3/V4 pool) aren't taxed unless registered with `setAmmPair`. Plan: `removeLimits()` after launch settles; use a multisig owner.
6. **Secrets:** never commit `.env`, private keys or tokens. The chat's deploy script put the GitHub token in the git remote URL; don't do that.
7. Still needed: **treasury wallet address**, **owner multisig** (recommend Safe), and **Seed Sale numbers** (Section 3).
9. **Brand caution:** the UI uses "Robinhood Quest Board", "Robinhood Wallet (Featured) — Native 0% Fee Integration" and "Robinhood DEX". These could read as an official Robinhood partnership. Use "on Robinhood Chain" phrasing and avoid claims of integrations that don't exist.
8. **EIP-7702 warning:** the public Hardhat test keys have sweeper delegations on Robinhood Chain. Never fund or use them on a live network.

## 7. Milestones

- [x] Repo created (`SharewoodForest/TradeWood`)
- [x] Agent skill specs: `.context/claude-skills.md`, `.context/gemini-skills.md`
- [x] UI mock imported to `design/`
- [x] Scope: DEX + vaults + referrals + quests; referral v1 + fee tiers approved
- [x] Verified live Robinhood Chain DEX contracts (Section 4)
- [x] WoodToken.sol + 18 tests + mainnet-fork smoke test
- [ ] SherwoodSeedSale contract (after sale numbers are decided)
- [ ] Fork-test a single-sided V3 launch with WOOD's tax (fallback Path B)
- [ ] Pre-launch quests + referral pre-registration (off-chain OK for v0)
- [x] SherwoodRouter.sol (V2 + V3 venues, 0.10% fee) + 11 tests + mainnet-fork test
- [ ] **v1 contracts (cont.):** FriarTuckVault → MerryMenReferral → testnet (46630) → audit
- [ ] Router v2: add Uniswap V4 venue
- [ ] **v2:** Tradewood AMM pools, Little John LP vault, Outlaw auto-compounder, Quests/epoch claims
- [ ] **v3:** Launchpad, sponsored quests
- [x] Frontend v0 (Next.js + wagmi, chain 4663): layout, live multi-venue swap UI, placeholder pages (branch `frontend/app`)
- [x] WalletConnect project ID set (`frontend/.env.production`); restrict domains to tradewood.app in the Reown dashboard
- [x] **Live: https://tradewood.app** (+ www, + tradewood.tec5upor1.workers.dev). Cloudflare Worker `tradewood` (static assets), auto-deploys from `main` via Workers Builds (repo SharewoodForest/TradeWood, root `frontend`). Custom domains are set in `frontend/wrangler.jsonc`.
- [ ] Cloudflare Pages + tradewood.app DNS
- [ ] Mainnet launch
