// Sherwood Router against LIVE Robinhood Chain liquidity on a local anvil fork: V4 (hookless + hooked dynamic-fee
// pool), V3, V2, and split routes across them.
// Run:  anvil --fork-url https://rpc.mainnet.chain.robinhood.com --chain-id 4663 &
//       npx hardhat run scripts/fork-v4.js --network anvil
const { ethers } = require("hardhat");
const A = {
  WETH: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  USDG: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  V2: "0x89e5db8b5aa49aa85ac63f691524311aeb649eba",
  V3: "0xcaf681a66d020601342297493863e78c959e5cb2",
  PM: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
  V4_QUOTER: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94",
};
const ZERO = ethers.ZeroAddress;
const E = (n) => ethers.parseEther(String(n));
const coder = ethers.AbiCoder.defaultAbiCoder();
const HOP = "tuple(tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key, bytes hookData)[]";
const POOLS = {
  "V4 ETH/USDG 0.01%": { currency0: ZERO, currency1: A.USDG, fee: 100, tickSpacing: 1, hooks: ZERO },
  "V4 ETH/USDG dynamic-fee hook": { currency0: ZERO, currency1: A.USDG, fee: 0x800000, tickSpacing: 10, hooks: "0x06a889870C8f83640D6816319f72e2aA579b6080" },
};
const v4Leg = (k, w = 10_000) => ({ venue: 2, weightBps: w, data: coder.encode([HOP], [[{ key: k, hookData: "0x" }]]) });
const v3Leg = (fee, a, b, w = 10_000) => ({ venue: 1, weightBps: w, data: ethers.solidityPacked(["address", "uint24", "address"], [a, fee, b]) });
const v2Leg = (path, w = 10_000) => ({ venue: 0, weightBps: w, data: coder.encode(["address[]"], [path]) });

async function main() {
  const mk = async () => {
    const w = ethers.Wallet.createRandom().connect(ethers.provider);
    await ethers.provider.send("anvil_setBalance", [w.address, "0x3635C9ADC5DEA00000"]); // 1,000 ETH
    return w;
  };
  const owner = await mk(), treasury = await mk(), alice = await mk();
  const F = await ethers.getContractFactory("SherwoodRouter", owner);
  const sr = await F.deploy(A.WETH, A.V2, A.V3, A.PM, treasury.address, owner.address);
  await sr.waitForDeployment();
  const srA = await sr.getAddress();
  const usdg = await ethers.getContractAt("IERC20", A.USDG, alice);
  const dl = (await ethers.provider.getBlock("latest")).timestamp + 3600;
  // each comparison runs from the same chain state (snapshot/revert), so trades don't move each other's prices
  const run = async (label, legs, value = E(1), keep = false) => {
    const snap = keep ? null : await ethers.provider.send("evm_snapshot", []);
    const b = await usdg.balanceOf(alice.address);
    const tx = await sr.connect(alice).swap({ tokenIn: ZERO, tokenOut: A.USDG, amountIn: value, minAmountOut: 0n, legs,
      recipient: alice.address, deadline: dl, referrer: ZERO }, { value });
    const r = await tx.wait();
    console.log(`${label.padEnd(44)} ${ethers.formatEther(value)} ETH → ${ethers.formatUnits((await usdg.balanceOf(alice.address)) - b, 6).padStart(12)} USDG  gas ${r.gasUsed}`);
    if (snap) await ethers.provider.send("evm_revert", [snap]);
  };
  for (const [label, k] of Object.entries(POOLS)) await run(label, [v4Leg(k)]);
  await run("V3 WETH/USDG 0.05%", [v3Leg(500, A.WETH, A.USDG)]);
  await run("V2 WETH/USDG", [v2Leg([A.WETH, A.USDG])]);
  console.log("— 25 ETH trades —");
  await run("V4 hook only", [v4Leg(POOLS["V4 ETH/USDG dynamic-fee hook"])], E(25));
  await run("V4 0.01% only", [v4Leg(POOLS["V4 ETH/USDG 0.01%"])], E(25));
  await run("Split 70% V4 hook / 30% V4 0.01%", [v4Leg(POOLS["V4 ETH/USDG dynamic-fee hook"], 7_000), v4Leg(POOLS["V4 ETH/USDG 0.01%"], 3_000)], E(25));
  await run("Split 60/25/15 V4 hook / V4 0.01% / V3", [v4Leg(POOLS["V4 ETH/USDG dynamic-fee hook"], 6_000), v4Leg(POOLS["V4 ETH/USDG 0.01%"], 2_500), v3Leg(500, A.WETH, A.USDG, 1_500)], E(25));

  await run("(keep) V4 hook, to fund the return trip", [v4Leg(POOLS["V4 ETH/USDG dynamic-fee hook"])], E(5), true);
  // and back: all USDG → native ETH via V4 hooked pool + V3 split
  const all = await usdg.balanceOf(alice.address);
  await (await usdg.approve(srA, all)).wait();
  const bob = ethers.Wallet.createRandom().address;
  await (await sr.connect(alice).swap({ tokenIn: A.USDG, tokenOut: ZERO, amountIn: all, minAmountOut: 0n,
    legs: [v4Leg(POOLS["V4 ETH/USDG dynamic-fee hook"], 8_000), v3Leg(500, A.USDG, A.WETH, 2_000)],
    recipient: bob, deadline: dl, referrer: ZERO })).wait();
  console.log(`Back: ${ethers.formatUnits(all, 6)} USDG → ${ethers.formatEther(await ethers.provider.getBalance(bob))} ETH (80% V4 hook / 20% V3)`);
  const weth = await ethers.getContractAt("IERC20", A.WETH);
  console.log(`Treasury: ${ethers.formatEther((await ethers.provider.getBalance(treasury.address)) - E(1000))} ETH + ${ethers.formatUnits(await usdg.balanceOf(treasury.address), 6)} USDG`);
  console.log(`Router dust: ${await ethers.provider.getBalance(srA)} wei ETH, ${await weth.balanceOf(srA)} WETH, ${await usdg.balanceOf(srA)} USDG`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
