# TradeWood (tradewood.app)

**The Sherwood Protocol on Robinhood Chain.** $WOOD token, Forest Exchange, yield vaults, Merry Men referrals and quests.

> Agents and contributors: read [`.context/project-state.md`](.context/project-state.md) first. It's the source of truth.

## Layout
| Path | What |
|---|---|
| `.context/` | Shared state + agent skill specs (Claude = contracts, Gemini = frontend) |
| `contracts/WoodToken.sol` | $WOOD ERC-20: 3% buy/sell tax (2% auto-LP → treasury-owned, 1% treasury), launch limits, bounded owner powers |
| `contracts/SherwoodRouter.sol` | Multi-venue swap router (Uniswap V2 + V3), 0.10% protocol fee, referral attribution |
| `test/` | Hardhat tests against real Uniswap V2 contracts |
| `scripts/deploy.js` | Deploy to Robinhood Chain testnet (46630) or mainnet (4663) |
| `scripts/fork-smoke.js` | Buy/sell test on a local fork of mainnet through the live Uniswap V2 router |
| `design/` | UI design mock (static, fake data) |

## Commands
```bash
npm install --legacy-peer-deps
npx hardhat test                                  # unit tests
FORK=1 npx hardhat run scripts/fork-smoke.js      # WOOD buy/sell on mainnet fork
FORK=1 npx hardhat run scripts/fork-router.js     # Sherwood Router via live V2 + V3
cp .env.example .env                              # then fill in, never commit
npm run deploy:testnet
```
