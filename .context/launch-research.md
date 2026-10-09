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

## Sources
- Pons: datawallet.com/crypto/pons-explained · coingabbar.com (Pons V2 model)
- Pons vs Pools Trade: airdropalert.com/blogs/pons-family-vs-pools-trade
- PinkSale presale rules: docs.pinksale.finance/launchpads/create-a-launchpad
- Launch frameworks: mangabeira.net/publications/defi-launch-frameworks
- Ecosystem: kucoin.com/news/flash/robinhood-chain-ecosystem-overview-key-projects-to-watch
- Chain stats: datawallet.com/crypto/robinhood-chain-statistics
- Aerodrome launch: theblock.co/post/247698
