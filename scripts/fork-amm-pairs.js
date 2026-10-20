// Fork test for the untaxed-pool bypass and its fix, against the LIVE WoodToken on a Robinhood Chain fork.
// Runs twice from the same fork snapshot:
//   control: trading enabled with only the main pair flagged → a WOOD/USDG V2 pair and a V3 pool trade untaxed
//   fixed:   the Safe first executes the batch from scripts/register-amm-pools.js → both are taxed / blocked
// Run:
//   npx hardhat run scripts/register-amm-pools.js --network robinhood     (writes safe-batch-register-amm-pools.json)
//   FORK=1 npx hardhat run scripts/fork-amm-pairs.js                     (optional BATCH=<path to that json>)
const fs = require("fs");
const { ethers } = require("hardhat");

const WOOD = "0x92FC190e5ABAcc1D246C316aCC0EE283682b25fD";
const SAFE = "0xcE96e912A799d46FD28Ea2b3752296d58af70BAb";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const V2_ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba";
const V3_FACTORY = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA";
const E = (n) => ethers.parseEther(String(n));

async function mk() {
  // Fresh wallets: public Hardhat keys carry EIP-7702 sweeper delegations on live chains.
  const w = ethers.Wallet.createRandom().connect(ethers.provider);
  await ethers.provider.send("hardhat_setBalance", [w.address, "0x56BC75E2D63100000"]); // 100 ETH
  return w;
}

async function scenario(applyFix, batch) {
  await ethers.provider.send("hardhat_impersonateAccount", [SAFE]);
  await ethers.provider.send("hardhat_setBalance", [SAFE, "0x56BC75E2D63100000"]);
  const safe = await ethers.getSigner(SAFE);
  const wood = await ethers.getContractAt("WoodToken", WOOD, safe);
  const router = await ethers.getContractAt(
    [
      "function WETH() view returns (address)",
      "function swapExactETHForTokens(uint,address[],address,uint) payable returns (uint[])",
      "function addLiquidity(address,address,uint,uint,uint,uint,address,uint) returns (uint,uint,uint)",
      "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint,uint,address[],address,uint)",
    ],
    V2_ROUTER
  );
  const weth = await router.WETH();
  const dl = (await ethers.provider.getBlock("latest")).timestamp + 3600;

  if (applyFix) for (const tx of batch.transactions) await safe.sendTransaction({ to: tx.to, data: tx.data });
  await wood.enableTrading();

  const attacker = await mk(), trader = await mk();
  await wood.transfer(attacker.address, E(1_500_000));
  const usdg = await ethers.getContractAt("MockERC20", USDG);

  // 1) WOOD/USDG Uniswap V2 pair opened by a third party after launch
  await router.connect(attacker).swapExactETHForTokens(0, [weth, USDG], attacker.address, dl, { value: E(2) });
  await wood.connect(attacker).approve(V2_ROUTER, ethers.MaxUint256);
  await usdg.connect(attacker).approve(V2_ROUTER, ethers.MaxUint256);
  await router
    .connect(attacker)
    .addLiquidity(WOOD, USDG, E(1_000_000), await usdg.balanceOf(attacker.address), 0, 0, attacker.address, dl);

  await router.connect(trader).swapExactETHForTokens(0, [weth, USDG], trader.address, dl, { value: E(0.2) });
  await usdg.connect(trader).approve(V2_ROUTER, ethers.MaxUint256);
  const taxBefore = await wood.balanceOf(WOOD);
  await router
    .connect(trader)
    .swapExactTokensForTokensSupportingFeeOnTransferTokens(await usdg.balanceOf(trader.address), 0, [USDG, WOOD], trader.address, dl);
  const taxed = (await wood.balanceOf(WOOD)) - taxBefore;
  const bought = await wood.balanceOf(trader.address);

  // 2) WOOD/WETH Uniswap V3 0.3% pool opened by a third party after launch
  const f3 = await ethers.getContractAt(
    ["function createPool(address,address,uint24) returns (address)", "function getPool(address,address,uint24) view returns (address)"],
    V3_FACTORY,
    attacker
  );
  await f3.createPool(WOOD, weth, 3000);
  const pool = await ethers.getContractAt(["function initialize(uint160)"], await f3.getPool(WOOD, weth, 3000), attacker);
  await pool.initialize(2n ** 96n);
  const wethC = await ethers.getContractAt(["function deposit() payable", "function approve(address,uint) returns (bool)"], weth, attacker);
  await wethC.deposit({ value: E(5) });
  const helper = await (await ethers.getContractFactory("V3PoolHelper", attacker)).deploy();
  await wood.connect(attacker).approve(await helper.getAddress(), ethers.MaxUint256);
  await wethC.approve(await helper.getAddress(), ethers.MaxUint256);
  let v3 = "liquidity added (untaxed pool is live)";
  try {
    await (await helper.mint(await pool.getAddress(), -887220, 887220, E(1))).wait();
  } catch {
    v3 = "liquidity add REVERTED (pool unusable)";
  }

  return {
    "V2 WOOD/USDG buy, WOOD bought": ethers.formatEther(bought),
    "V2 WOOD/USDG buy, tax collected": ethers.formatEther(taxed),
    "V3 WOOD/WETH 0.3%": v3,
  };
}

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  if (chainId !== 4663n || !process.env.FORK) throw new Error("Run with FORK=1 (forks Robinhood Chain mainnet).");
  const batch = JSON.parse(fs.readFileSync(process.env.BATCH || "safe-batch-register-amm-pools.json", "utf8"));

  const snap = await ethers.provider.send("evm_snapshot", []);
  const control = await scenario(false, batch);
  await ethers.provider.send("evm_revert", [snap]);
  const fixed = await scenario(true, batch);

  console.log("CONTROL (only main pair flagged):", control);
  console.log("FIXED (Safe batch executed first):", fixed);
  const ok =
    control["V2 WOOD/USDG buy, tax collected"] === "0.0" &&
    fixed["V2 WOOD/USDG buy, tax collected"] !== "0.0" &&
    fixed["V3 WOOD/WETH 0.3%"].includes("REVERTED");
  console.log(ok ? "\nPASS: the bypass exists without the batch and is closed with it." : "\nFAIL: check the output above.");
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
