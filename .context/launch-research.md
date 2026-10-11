# Launch Research: What Comparable Projects Did (2026-10-08)

## 1. Robinhood Chain launch norms
- **Launchpads dominate new-token launches.** Pons had ~$1.75–1.86B lifetime volume and 250K+ tokens by August; Pools Trade went live Aug 5, 2026.
- **Pons:** the entire supply starts on a bonding curve, with no presale and no creator allocation. V1 graduated at **4.2 ETH**; V2 graduates when the curve sells out. Liquidity is then **permanently locked** (V1 in Uniswap V3, V2 in V4). 1% trade fee. **Anti-snipe:** a 99% buy tax that decays to 0 over 5 seconds. Stuck launches can be refunded after 7 days.
- **Pools Trade:** "Crowd Launch" is a 4-hour bid window; **bidders are refunded if it doesn't reach $10K FDV**. 1B fixed supply, liquidity permanently locked.
- **Serious protocols use points or community allocations, not public presales:** Lighter runs points redeemable for LIT ($11M committed to the Robinhood community); Arcus reserves tokens for its community; Native has no token at all.
- **Chain activity:** ~$1.6B daily DEX volume (Sept 1), ~$738M TVL, Uniswap V3/V4 the top DEX. Stock tokens are **78% of RWA volume**, and memecoin pairs fell to 12% in August. The 90-day gas waiver ended late September.

## 2. Presale norms (PinkSale, the largest presale launchpad)
- Soft cap **≥ 25% of hard cap**.
- **51–100%** of the raise goes to liquidity.
- Listing price set **above** the presale price.
- Liquidity locked (any duration; 30 days is the example).
- Optional vesting, optional whitelist; refund if the soft cap is missed; unsold tokens can be burned.

## 3. Outcomes and risks
- One industry write-up reports **84.7% of 2025 token launches traded below their launch valuation**, and bots capturing large shares of early liquidity on standard DEX launches. *(The source sells launch services and the figures are loosely sourced; treat them as directional.)*
- Successful DEX tokens (e.g., Aerodrome on Base) launched by **airdropping to an aligned community (40% of initial supply to veVELO holders) plus liquidity incentives**, not public presales.

## 4. What this means for TradeWood
1. **Ship before you sell.** Launch the Sherwood Router plus a points program first. A sale backed by a working product that already earns revenue stands out from launchpad tokens.
2. **Points first (like Lighter):** "Bounty Points" for swaps through the Sherwood Router, quests and referrals. They convert to whitelist spots and a WOOD allocation.
3. **Seed Sale adjustments:** soft cap **$5K** (25% of the $20K hard cap, matching the norm). Everything else in our plan already meets or beats the norms: 70% to liquidity (norm 51%+), 12-month lock (norm ~30 days), launch price 25% above sale price, refund on miss, burn unsold.
4. **Valuation check:** at $0.002, the sale prices the full 100M supply at $200K, far above typical launchpad starts (Pons V1 graduated at 4.2 ETH). That's justified only if the router is already live with volume. Otherwise, consider $0.001 ($100K).
5. **Anti-snipe at launch:** sale buyers are already holding before trading opens. Keep max-tx/max-wallet on and consider a short whitelist-only window at open. WoodToken caps tax at 5%, so we can't copy Pons' 99% decaying tax without a contract change.
6. **Lean into stock tokens:** they're where Robinhood Chain volume is, so the router and UI should feature them.
7. Launchpads like Pons and Pools Trade mint their own standard tokens, so they **can't launch WoodToken** (custom tax). Fallback Path C means our own curve contract.

## 5. Competitor note: Fables (fables.fi), checked 2026-10-11
A ve(3,3) exchange built on Uniswap V4 hooks (the same PoolManager 0x8366…0951). It has about $37.7M total deposits, $2.76B lifetime volume and 65 markets. We are **not** integrating its tokens. Takeaways:
- **V4 holds the deepest liquidity.** The Fables ETH/USDG pool has about $24M TVL and about $11.7M/day volume (pool id 0xbac3aa3b…e551, hook 0x06a88987…6080, tick spacing 10). Sherwood Router only routes V2/V3, so it misses this pool → add a V4 venue (quote via V4 Quoter / StateView 0xf3334192d15450cdd385c8b70e03f9a6bd9e673b).
- **Dynamic fees.** A keeper sets each pool's fee from measured volatility (ETH/USDG ranges 0.07%–0.6%; about 1,100 changes a week). It also uses "calendar" hooks for stock tokens (market hours) and "flat" hooks for memes. Idea for a future WOOD pool hook.
- **Time-boxed points season** on LP swap-fee earnings (ends 19 Oct), plus "additional weekly rewards" on some pools distributed through **Merkl** (api.merkl.xyz). We could use Merkl for WOOD LP and quest incentives instead of a custom distributor.
- **Per-market pages** show TVL, 24h vol/fees, APR, current fee, pool balances, pool id/hook, and recent transactions with explorer links. This is a good template for our Analytics and Vaults pages.
- **Creator fee** on markets, which suggests a fee share for token teams that bring liquidity (a possible Bounty Bandits / partner angle).
- **Compliance:** geo-blocks deposits ("not available in your region") and has a Terms page. Withdraw/claim stays open. This is relevant to the Seed Sale and legal review.
- **Distribution:** listed on DefiLlama (protocol "fables"). Uses robin.etherscan.io as its explorer. Ecosystem partners linked: Frax (frxUSD), Arrow (aUSD), Own (eUSD), Saffron, Crossbow, Throne, Route, Hookr, Goldstein, MCDAO, earnonhood, mosh.trade. These are outreach targets.
- Official Robinhood stock tokens (name suffix "• Robinhood Token", e.g. NVDA 0xd0601ce1…9eec, SPY 0x117cc213…4c0c) already have Uniswap V2 pairs that our router can reach, if we ever want stock pairs in the token list.

## Sources
- Pons: datawallet.com/crypto/pons-explained · coingabbar.com (Pons V2 model)
- Pons vs Pools Trade: airdropalert.com/blogs/pons-family-vs-pools-trade
- PinkSale presale rules: docs.pinksale.finance/launchpads/create-a-launchpad
- Launch frameworks: mangabeira.net/publications/defi-launch-frameworks
- Ecosystem: kucoin.com/news/flash/robinhood-chain-ecosystem-overview-key-projects-to-watch
- Chain stats: datawallet.com/crypto/robinhood-chain-statistics
- Aerodrome launch: theblock.co/post/247698
