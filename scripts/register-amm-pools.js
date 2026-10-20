// Build a Safe Transaction Builder batch that registers every likely $WOOD pool as an AMM pair in WoodToken,
// so trades through them pay the 3% tax and respect max-tx. READ-ONLY: this script sends no transactions.
//
// Why: WoodToken only taxes transfers that touch an address flagged in isAmmPair, and the constructor flags only
// the WOOD/WETH Uniswap V2 pair. After enableTrading() anyone could open a WOOD pool elsewhere (a WOOD/USDG V2 pair,
// a V3 pool, a V4 pool) and trade tax-free. Pool addresses are deterministic (CREATE2), so they can be flagged
// BEFORE the pools exist. Run this, then have the Safe execute the batch BEFORE calling enableTrading().
//
// Effect per venue once flagged:
//   - Uniswap V2 pairs: taxed exactly like the main pair (fee-on-transfer aware).
//   - Uniswap V3 pools: V3 checks that the full payment arrived, so taxed liquidity adds and sells revert. Anyone who
//     overpays to cover the tax still pays it. Either way no untaxed trading.
//   - Uniswap V4 PoolManager (a singleton that holds every V4 pool's tokens): WoodToken only sees WOOD transfers, so
//     this only affects WOOD moving in or out of V4. Underpaid settles revert; overpaid ones pay the tax.
//
// Usage:
//   npx hardhat run scripts/register-amm-pools.js --network robinhood
//   Optional env: EXTRA_QUOTE_TOKENS=0xA,0xB   (also cover WOOD pairs against these tokens)
//                 OUT=safe-batch-register-amm-pools.json
// Then in the Safe app: Apps → Transaction Builder → drag in the JSON → review → create → sign (2 of 3) → execute.
const fs = require("fs");
const hre = require("hardhat");
const { ethers } = hre;

const WOOD = "0x92FC190e5ABAcc1D246C316aCC0EE283682b25fD";
const SAFE = "0xcE96e912A799d46FD28Ea2b3752296d58af70BAb";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const V3_SWAP_ROUTER = "0xcaf681a66d020601342297493863e78c959e5cb2";
const V4_POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";

// Canonical Uniswap init code hashes. Both are re-checked below against pools that already exist on-chain.
const V2_PAIR_INIT_CODE_HASH = "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f";
const V3_POOL_INIT_CODE_HASH = "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";
const V3_CANDIDATE_FEES = [100, 500, 2500, 3000, 10000];

const sortPair = (a, b) => (BigInt(a) < BigInt(b) ? [a, b] : [b, a]);

function v2PairAddress(factory, a, b) {
  const [t0, t1] = sortPair(a, b);
  const salt = ethers.keccak256(ethers.solidityPacked(["address", "address"], [t0, t1]));
  return ethers.getCreate2Address(factory, salt, V2_PAIR_INIT_CODE_HASH);
}

function v3PoolAddress(factory, a, b, fee) {
  const [t0, t1] = sortPair(a, b);
  const salt = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "address", "uint24"], [t0, t1, fee]));
  return ethers.getCreate2Address(factory, salt, V3_POOL_INIT_CODE_HASH);
}

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  if (chainId !== 4663n) throw new Error(`Refusing to run on chain ${chainId}: this script is for Robinhood Chain mainnet (4663).`);

  const wood = new ethers.Contract(
    WOOD,
    [
      "function owner() view returns (address)",
      "function router() view returns (address)",
      "function mainPair() view returns (address)",
      "function tradingEnabled() view returns (bool)",
      "function isAmmPair(address) view returns (bool)",
      "function setAmmPair(address,bool)",
    ],
    ethers.provider
  );
  const owner = await wood.owner();
  if (owner.toLowerCase() !== SAFE.toLowerCase()) throw new Error(`WoodToken owner is ${owner}, expected the Safe ${SAFE}.`);
  if (await wood.tradingEnabled()) {
    console.warn("WARNING: trading is already enabled. Untaxed pools may already exist; execute this batch immediately.");
  }

  const v2Router = new ethers.Contract(await wood.router(), ["function factory() view returns (address)"], ethers.provider);
  const v3Router = new ethers.Contract(V3_SWAP_ROUTER, ["function factory() view returns (address)"], ethers.provider);
  const v2Factory = await v2Router.factory();
  const v3Factory = await v3Router.factory();
  const F2 = new ethers.Contract(v2Factory, ["function getPair(address,address) view returns (address)"], ethers.provider);
  const F3 = new ethers.Contract(
    v3Factory,
    ["function getPool(address,address,uint24) view returns (address)", "function feeAmountTickSpacing(uint24) view returns (int24)"],
    ethers.provider
  );

  // ── Self-checks: the CREATE2 formulas must reproduce real addresses or we refuse to output anything. ──
  const mainPair = await wood.mainPair();
  if (v2PairAddress(v2Factory, WOOD, WETH).toLowerCase() !== mainPair.toLowerCase()) {
    throw new Error("V2 init code hash check failed against WOOD/WETH mainPair. Do not use this output.");
  }
  const realV2 = await F2.getPair(WETH, USDG);
  if (realV2 !== ethers.ZeroAddress && v2PairAddress(v2Factory, WETH, USDG).toLowerCase() !== realV2.toLowerCase()) {
    throw new Error("V2 init code hash check failed against WETH/USDG. Do not use this output.");
  }
  const fees = [];
  for (const fee of V3_CANDIDATE_FEES) if ((await F3.feeAmountTickSpacing(fee)) !== 0n) fees.push(fee);
  let v3Checked = false;
  for (const fee of fees) {
    const real = await F3.getPool(WETH, USDG, fee);
    if (real === ethers.ZeroAddress) continue;
    if (v3PoolAddress(v3Factory, WETH, USDG, fee).toLowerCase() !== real.toLowerCase()) {
      throw new Error(`V3 init code hash check failed against WETH/USDG ${fee}. Do not use this output.`);
    }
    v3Checked = true;
  }
  if (!v3Checked) throw new Error("No existing WETH/USDG V3 pool to check the V3 init code hash against.");

  const extra = (process.env.EXTRA_QUOTE_TOKENS || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const t of extra) if (!ethers.isAddress(t)) throw new Error(`Bad EXTRA_QUOTE_TOKENS entry ${t}`);
  const quotes = [WETH, USDG, ...extra.map((t) => ethers.getAddress(t))];

  // ── Candidate pools ──
  const targets = [];
  for (const q of quotes) {
    const sym = q === WETH ? "WETH" : q === USDG ? "USDG" : q;
    const p2 = v2PairAddress(v2Factory, WOOD, q);
    if (p2.toLowerCase() !== mainPair.toLowerCase()) targets.push({ label: `Uniswap V2 WOOD/${sym}`, address: p2 });
    for (const fee of fees) targets.push({ label: `Uniswap V3 WOOD/${sym} ${fee / 10000}%`, address: v3PoolAddress(v3Factory, WOOD, q, fee) });
  }
  targets.push({ label: "Uniswap V4 PoolManager (all WOOD V4 pools)", address: ethers.getAddress(V4_POOL_MANAGER) });

  const todo = [];
  console.log(`Chain ${chainId} | WoodToken ${WOOD} | owner ${owner}`);
  console.log(`V2 factory ${v2Factory} | V3 factory ${v3Factory} | V3 fee tiers ${fees.join(", ")} | init code hashes verified\n`);
  for (const t of targets) {
    const flagged = await wood.isAmmPair(t.address);
    const code = (await ethers.provider.getCode(t.address)) !== "0x";
    console.log(`${flagged ? "already flagged" : "TO FLAG       "}  ${t.address}  ${t.label}${code ? "" : " (not created yet)"}`);
    if (!flagged) todo.push(t);
  }
  if (!todo.length) return console.log("\nEverything is already flagged. Nothing to do.");

  const iface = wood.interface;
  const batch = {
    version: "1.0",
    chainId: chainId.toString(),
    createdAt: Date.now(),
    meta: {
      name: "WoodToken: register WOOD pools as AMM pairs",
      description: "setAmmPair(pool, true) for every WOOD V2 pair / V3 pool address and the V4 PoolManager. Run before enableTrading().",
      txBuilderVersion: "1.16.5",
      createdFromSafeAddress: SAFE,
      createdFromOwnerAddress: "",
    },
    transactions: todo.map((t) => ({
      to: WOOD,
      value: "0",
      data: iface.encodeFunctionData("setAmmPair", [t.address, true]),
      contractMethod: {
        inputs: [
          { internalType: "address", name: "pair", type: "address" },
          { internalType: "bool", name: "value", type: "bool" },
        ],
        name: "setAmmPair",
        payable: false,
      },
      contractInputsValues: { pair: t.address, value: "true" },
    })),
  };
  const out = process.env.OUT || "safe-batch-register-amm-pools.json";
  fs.writeFileSync(out, JSON.stringify(batch, null, 2));
  console.log(`\nWrote ${todo.length} setAmmPair calls to ${out}. Load it in the Safe Transaction Builder and execute BEFORE enableTrading().`);
  console.log("After launch, watch for WOOD pools on other DEXes and flag them with setAmmPair(pool, true).");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
