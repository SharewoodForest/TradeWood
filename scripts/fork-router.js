// Sherwood Router on a local fork of Robinhood Chain mainnet: ETH→USDG via live V3 and live V2, then USDG→ETH.
// Run: FORK=1 npx hardhat run scripts/fork-router.js
const { ethers } = require("hardhat");
const A = {
  WETH: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  USDG: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  V2: "0x89e5db8b5aa49aa85ac63f691524311aeb649eba",
  V3: "0xcaf681a66d020601342297493863e78c959e5cb2",
};
const E = (n) => ethers.parseEther(String(n));
async function main() {
  const mk = async () => {
    const w = ethers.Wallet.createRandom().connect(ethers.provider);
    await ethers.provider.send("hardhat_setBalance", [w.address, "0x56BC75E2D63100000"]);
    return w;
  };
  const owner = await mk(), treasury = await mk(), alice = await mk();
  const sr = await (await ethers.getContractFactory("SherwoodRouter", owner)).deploy(A.WETH, A.V2, A.V3, treasury.address, owner.address);
  await sr.waitForDeployment();
  const usdg = await ethers.getContractAt("IERC20", A.USDG, alice);
  const dl = (await ethers.provider.getBlock("latest")).timestamp + 600;
  const base = { tokenIn: ethers.ZeroAddress, tokenOut: A.USDG, amountIn: E("0.5"), minAmountOut: 0n,
    v2Path: [], v3Path: "0x", recipient: alice.address, deadline: dl, referrer: ethers.ZeroAddress };

  for (const fee of [500, 3000]) {
    const before = await usdg.balanceOf(alice.address);
    const path = ethers.solidityPacked(["address", "uint24", "address"], [A.WETH, fee, A.USDG]);
    await (await sr.connect(alice).swap({ ...base, venue: 1, v3Path: path }, { value: E("0.5") })).wait();
    console.log(`V3 (${fee / 10000}% pool) 0.5 ETH → ${ethers.formatUnits((await usdg.balanceOf(alice.address)) - before, 6)} USDG`);
  }
  const b2 = await usdg.balanceOf(alice.address);
  await (await sr.connect(alice).swap({ ...base, venue: 0, v2Path: [A.WETH, A.USDG] }, { value: E("0.5") })).wait();
  console.log(`V2           0.5 ETH → ${ethers.formatUnits((await usdg.balanceOf(alice.address)) - b2, 6)} USDG`);

  const all = await usdg.balanceOf(alice.address);
  await usdg.approve(await sr.getAddress(), all);
  const ethBefore = await ethers.provider.getBalance(alice.address);
  const path = ethers.solidityPacked(["address", "uint24", "address"], [A.USDG, 500, A.WETH]);
  await (await sr.connect(alice).swap({ ...base, venue: 1, tokenIn: A.USDG, tokenOut: ethers.ZeroAddress, amountIn: all, v3Path: path })).wait();
  console.log(`V3 back: ${ethers.formatUnits(all, 6)} USDG → ~${ethers.formatEther((await ethers.provider.getBalance(alice.address)) - ethBefore)} ETH (net of gas)`);
  console.log(`Treasury fees: ${ethers.formatEther(await ethers.provider.getBalance(treasury.address) - E(100))} ETH + ${ethers.formatUnits(await usdg.balanceOf(treasury.address), 6)} USDG`);
  console.log(`Router dust: ${ethers.formatEther(await ethers.provider.getBalance(await sr.getAddress()))} ETH, ${await usdg.balanceOf(await sr.getAddress())} USDG`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
