# TradeWood (tradewood.app)

**The Sherwood Protocol on Robinhood Chain.** $WOOD token, Forest Exchange, yield vaults, Merry Men referrals and quests.

> Agents and contributors: read [`.context/project-state.md`](.context/project-state.md) first. It's the source of truth.

## Layout
| Path | What |
|---|---|
| `.context/` | Shared state + agent skill specs (Claude = contracts, Gemini = frontend) |
| `contracts/WoodToken.sol` | $WOOD ERC-20: 3% buy/sell tax (2% auto-LP → treasury-owned, 1% treasury), launch limits, bounded owner powers |
| `test/` | Hardhat tests against real Uniswap V2 contracts |
| `scripts/deploy.js` | Deploy to Robinhood Chain testnet (46630) or mainnet (4663) |
| `scripts/fork-smoke.js` | Buy/sell test on a local fork of mainnet through the live Uniswap V2 router |
| `design/` | UI design mock (static, fake data) |

## Commands
```bash
npm install --legacy-peer-deps
npx hardhat test                                  # unit tests
FORK=1 npx hardhat run scripts/fork-smoke.js      # mainnet-fork smoke test
cp .env.example .env                              # then fill in, never commit
npm run deploy:testnet
```
