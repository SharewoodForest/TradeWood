# TradeWood frontend

Next.js (App Router, static export) + Tailwind + wagmi v2 + viem + RainbowKit, for Robinhood Chain (4663).
Visual reference: `../design/tradewood_defi_dapp.html`. Contract interfaces: `../.context/project-state.md` §2.

## Develop
```bash
npm install --legacy-peer-deps
cp .env.example .env.local    # fill in public values
npm run dev                   # http://localhost:3000
npm run build                 # static site → out/
```

## Environment (all public, embedded in the site)
| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Mobile wallets (cloud.reown.com). **Set in `.env.production`** (it's a public ID, shipped in the site anyway). In the Reown dashboard, restrict allowed domains to `tradewood.app`. |
| `NEXT_PUBLIC_SHERWOOD_ROUTER` | SherwoodRouter address. Empty → swap button shows "launching soon" (quotes still live). |
| `NEXT_PUBLIC_WOOD_TOKEN` | WoodToken address. Empty → WOOD hidden from the token list. |
| `NEXT_PUBLIC_RPC_URL` | Optional RPC override |

## Deploy (Cloudflare Workers, static assets)
Config: `wrangler.jsonc` (Worker name `tradewood`, serves `out/`).

One-time setup in the Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository**:
- Repository: `SharewoodForest/TradeWood` · Branch: `main`
- **Root directory:** `frontend`
- **Build command:** `npm ci --legacy-peer-deps && npm run build`
- **Deploy command:** `npx wrangler deploy`
- Then Worker → **Settings → Domains & Routes → Add → Custom domain** → `tradewood.app` (and `www.tradewood.app`).

After that, every merge to `main` deploys automatically. Manual deploy: `npm run build && npx wrangler deploy` (needs `wrangler login`).

## What's live vs. placeholder
- **Live:** network ticker (block, gas, ETH price), wallet connect + balances, multi-venue quotes (Uniswap V2 + V3 0.05/0.3/1%, direct and via WETH), price impact, min-received, approve + swap via SherwoodRouter (once its address is set), referral link capture (`?ref=`).
- **Placeholder until contracts ship:** vault deposits, referral stats/claims, quests, protocol analytics.
