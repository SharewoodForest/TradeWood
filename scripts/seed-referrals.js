// Bounty Bandits seed referrals: totals each referrer's reward from on-chain data.
//
// The seed page appends "TWRF" + the referrer's address to buyTokens calldata (see frontend/public/seed/index.html).
// This script reads every TokensPurchased event, pulls each transaction's input, reads the tag, and prints a
// CSV of rewards: 10% of referred contributions, paid in WOOD at the $0.0075 seed price.
//
// Usage:  node scripts/seed-referrals.js > seed-referrals.csv
// Optional env: RPC_URL (defaults to the public Robinhood Chain RPC), FROM_BLOCK, TO_BLOCK.
// Read-only: needs no keys.

const { ethers } = require("ethers");

const RPC_URL = process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const SALE = "0x560De388b7F6e4b7D7DAAacE8c16a304da98fE79";
const SALE_DEPLOY_BLOCK = 90206211;
const FROM_BLOCK = Number(process.env.FROM_BLOCK || SALE_DEPLOY_BLOCK);
const TO_BLOCK = process.env.TO_BLOCK ? Number(process.env.TO_BLOCK) : "latest";
const LOG_CHUNK = 50_000;

const REWARD_BPS = 1000n;        // 10% of the referred contribution
const SEED_PRICE_MICRO = 7500n;  // $0.0075 in 6-decimal units
const REF_TAG = "54575246";      // "TWRF"

const iface = new ethers.Interface([
  "event TokensPurchased(address indexed buyer, address indexed token, uint256 paymentAmount, uint256 woodAmount)",
  "function buyTokens(address token, uint256 usdcAmount)",
]);
const SELECTOR = iface.getFunction("buyTokens").selector.slice(2);
const BASE_LEN = 8 + 64 * 2; // selector + two 32-byte args, in hex chars

/** Returns the referrer tagged in a buyTokens calldata, or null. */
function readTag(input) {
  const hex = input.slice(2).toLowerCase();
  if (!hex.startsWith(SELECTOR) || hex.length !== BASE_LEN + 8 + 40) return null;
  if (hex.slice(BASE_LEN, BASE_LEN + 8) !== REF_TAG) return null;
  return ethers.getAddress("0x" + hex.slice(BASE_LEN + 8));
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL, 4663);
  const end = TO_BLOCK === "latest" ? await provider.getBlockNumber() : TO_BLOCK;
  const topic = iface.getEvent("TokensPurchased").topicHash;

  const logs = [];
  for (let from = FROM_BLOCK; from <= end; from += LOG_CHUNK) {
    const to = Math.min(from + LOG_CHUNK - 1, end);
    logs.push(...(await provider.getLogs({ address: SALE, topics: [topic], fromBlock: from, toBlock: to })));
  }

  const totals = new Map(); // referrer -> { usd: bigint (6 dec), buys: number }
  let tagged = 0, selfRefs = 0;
  for (const log of logs) {
    const { buyer, paymentAmount } = iface.parseLog(log).args;
    const tx = await provider.getTransaction(log.transactionHash);
    const ref = readTag(tx.data);
    if (!ref) continue;
    if (ref === ethers.getAddress(buyer)) { selfRefs++; continue; }
    tagged++;
    const t = totals.get(ref) || { usd: 0n, buys: 0 };
    t.usd += paymentAmount; // the contract counts contributions in 6-decimal dollars
    t.buys += 1;
    totals.set(ref, t);
  }

  console.log("referrer,referred_buys,referred_usd,reward_wood");
  for (const [ref, t] of [...totals].sort((a, b) => (b[1].usd > a[1].usd ? 1 : -1))) {
    const rewardWood = (t.usd * REWARD_BPS * 10n ** 18n) / (10_000n * SEED_PRICE_MICRO);
    console.log([ref, t.buys, ethers.formatUnits(t.usd, 6), ethers.formatUnits(rewardWood, 18)].join(","));
  }
  console.error(`Purchases scanned: ${logs.length}. Referred: ${tagged}. Self-referrals skipped: ${selfRefs}. Blocks ${FROM_BLOCK}-${end}.`);
}

module.exports = { readTag, REF_TAG };

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
