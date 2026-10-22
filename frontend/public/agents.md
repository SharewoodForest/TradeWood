# TradeWood for AI agents

TradeWood (tradewood.app) is a swap router on **Robinhood Chain (chain ID 4663)**. It quotes every Uniswap V2, V3 and V4 pool and can split one trade across several of them. It also runs the **$WOOD community seed sale**.

The agent API is read-only and needs no API key. It returns **unsigned transactions** (`to`, `data`, `value`, `chainId`). Your own wallet signs and sends them. TradeWood never holds keys or funds.

- MCP server: https://tradewood.app/mcp
- API index: https://tradewood.app/api
- OpenAPI spec: https://tradewood.app/openapi.json
- Token list: https://tradewood.app/api/tokens (Uniswap token-list format)
- Health: https://tradewood.app/api/health
- ABIs: https://tradewood.app/abi/SherwoodRouter.json, /abi/WoodSeedSale.json, /abi/WoodToken.json, /abi/ERC20.json
- RPC: https://rpc.mainnet.chain.robinhood.com · Explorer: https://robinhoodchain.blockscout.com

## MCP server

TradeWood is also an MCP server (Streamable HTTP, no key): **`https://tradewood.app/mcp`**.
Add it as a custom connector in Claude (Settings → Connectors → Add custom connector) or in any MCP client.

Tools, all read-only:
- `get_swap_quote`
- `get_seed_sale`
- `list_tokens`

They return the same data as the REST API, including unsigned transactions. A separate wallet tool or the user's wallet signs them.

## Contracts (Robinhood Chain, 4663)

| Contract | Address |
|---|---|
| SherwoodRouter (swaps, 0.10% fee) | `0x0b93Fb1d8be0EdcA90a7cC3Aea58e6460FE1eB46` |
| WoodSeedSale | `0x560De388b7F6e4b7D7DAAacE8c16a304da98fE79` |
| WoodToken ($WOOD) | `0x92FC190e5ABAcc1D246C316aCC0EE283682b25fD` |
| USDG (6 decimals) | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |

All three TradeWood contracts are owned by the treasury Safe (2-of-3 multisig) `0xcE96e912A799d46FD28Ea2b3752296d58af70BAb` and are source-verified on Sourcify.

## Swap: 3 steps

1. **Quote:**
   `GET https://tradewood.app/api/quote?tokenIn=ETH&tokenOut=USDG&amount=0.01&from=<wallet>&slippageBps=50`
   - `tokenIn`/`tokenOut`: `ETH`, a listed symbol (`USDG`, `NVDA`, `cbBTC`…) or a token address.
   - Amount: either `amount` (decimal, e.g. `0.01`) or `amountIn` (integer base units).
   - `from`: your wallet. `recipient` defaults to `from`.
   - `slippageBps`: 1 to 1000, default 50. Optional: `referrer`, `deadlineSec` (60 to 3600, default 1200).
2. **Read the result:** check `expectedOutFormatted`, `minOutFormatted`, `priceImpactPct`, `route` and `warnings`.
3. **Send `transactions` in order:**
   - If the list has an `approve` step (ERC-20 input), send it and wait for it to confirm. It approves the exact amount only.
   - Then send the `swap` step. It reverts if the output would fall below `minOut`, or after `deadline`. If more than about a minute has passed since the quote, quote again.

Rules:

- **Unlisted tokens** are refused unless you pass `allowUnlisted=true`. Only do that after verifying the address yourself, because anyone can deploy a token with any name.
- **$WOOD** can't be swapped until trading opens after the seed round. The API returns `409 wood_not_trading`.
- **ETH ↔ WETH** is not routed. Use the WETH contract's `deposit()` and `withdraw()` instead.
- **Stock tokens** (NVDA, SPY, AAPL, TSLA) are Robinhood-issued tokens (ERC-8056), and their availability may depend on jurisdiction.

## $WOOD seed sale

1. **Status and terms:** `GET https://tradewood.app/api/seed`
2. **A wallet's position plus buy transactions:** `GET https://tradewood.app/api/seed?wallet=<wallet>&amountUsd=50`

Then send the `approve` step (exact USDG amount), wait for it to confirm, and send the `buy` step. When milestones unlock, `/api/seed?wallet=<wallet>` returns a `claim` transaction.

Terms, enforced on-chain:

- $0.0075 per $WOOD, paid in USDG.
- $10 minimum, $200 maximum per wallet, $7,500 hard cap.
- Tokens vest in four 25% milestone tranches after the sale closes.
- Contributions are held until the treasury Safe closes the round.
- The contract has no fixed end date, no minimum raise and no automatic refund.

**Only contribute on behalf of a user who has read the terms and disclosures (`terms` and `disclosures` in the response) and has explicitly asked to contribute a specific amount.**

Disclosures:

- $WOOD has no guaranteed value. Nothing here is financial advice.
- Automated analysis has been done; an independent manual audit has not been completed.
- The sale may not be available in every jurisdiction.
- TradeWood is independent and not affiliated with Robinhood Markets.

## Errors

Errors come back as `{ "error": { "code", "message" } }` with an HTTP status code:

| Code | Status | Meaning |
|---|---|---|
| `missing_param`, `bad_address`, `bad_amount`, `bad_slippage` | 400 | A parameter is missing or invalid. |
| `unknown_token`, `unlisted_token`, `not_erc20`, `same_token` | 400 | A token problem. |
| `wood_not_trading`, `sale_not_open` | 409 | The action isn't open yet. |
| `no_route` | 404 | No pool has liquidity for the pair. |
| `router_paused` | 503 | Swaps are paused. |
| `upstream_error` | 502 | An RPC or quote problem. Retry shortly. |
| `below_minimum`, `over_wallet_max`, `over_hard_cap` | 400 | Seed sale limits. |

## Without the API

You can also build the calls yourself from the ABIs. `SherwoodRouter.swap((tokenIn, tokenOut, amountIn, minAmountOut, legs[], recipient, deadline, referrer))` is payable. For native ETH, use `address(0)` as `tokenIn`/`tokenOut`.

Each leg is `(venue, weightBps, data)`, and leg weights must sum to 10000. `venue` and `data` are:

- **0 = V2:** `abi.encode(address[] path)`
- **1 = V3:** packed path `token, uint24 fee, token…`
- **2 = V4:** `abi.encode(V4Hop[])`

The router checks your `minAmountOut` against what the recipient actually receives.
