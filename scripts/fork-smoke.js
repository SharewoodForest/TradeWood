// Deploys WoodToken on a local fork of Robinhood Chain mainnet and does a buy + sell
// through the live Uniswap V2 router. Run: FORK=1 npx hardhat run scripts/fork-smoke.js
const { ethers } = require("hardhat");
const ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba";
const E = (n) => ethers.parseEther(String(n));
async function main() {
  // Fresh wallets: the public Hardhat test keys carry EIP-7702 sweeper delegations on live chains.
  const mk = async () => {
    const w = ethers.Wallet.createRandom().connect(ethers.provider);
    await ethers.provider.send("hardhat_setBalance", [w.address, "0x56BC75E2D63100000"]); // 100 ETH
    return w;
  };
  const owner = await mk(), treasury = await mk(), alice = await mk();
  const router = await ethers.getContractAt([
    "function WETH() view returns (address)",
    "function addLiquidityETH(address,uint,uint,uint,address,uint) payable returns (uint,uint,uint)",
    "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint,address[],address,uint) payable",
    "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint,uint,address[],address,uint)",
  ], ROUTER, owner);
  const weth = await router.WETH();
  const wood = await (await ethers.getContractFactory("WoodToken", owner)).deploy(ROUTER, treasury.address, owner.address);
  await wood.waitForDeployment();
  const dl = (await ethers.provider.getBlock("latest")).timestamp + 3600;
  await wood.approve(ROUTER, ethers.MaxUint256);
  await router.addLiquidityETH(await wood.getAddress(), E(20_000_000), 0, 0, owner.address, dl, { value: E(10) });
  await wood.enableTrading();
  await wood.setSwapSettings(true, E(1000), E(100000));
  await router.connect(alice).swapExactETHForTokensSupportingFeeOnTransferTokens(0, [weth, await wood.getAddress()], alice.address, dl, { value: E(0.3) });
  const bal = await wood.balanceOf(alice.address);
  const tBefore = await ethers.provider.getBalance(treasury.address);
  await wood.connect(alice).approve(ROUTER, ethers.MaxUint256);
  const tx = await router.connect(alice).swapExactTokensForETHSupportingFeeOnTransferTokens(bal / 2n, 0, [await wood.getAddress(), weth], alice.address, dl);
  const rc = await tx.wait();
  const swapBack = rc.logs.map((l) => { try { return wood.interface.parseLog(l); } catch { return null; } }).find((x) => x && x.name === "SwapBack");
  console.log("WOOD deployed (fork):", await wood.getAddress());
  console.log("pair:", await wood.mainPair());
  console.log("alice bought:", ethers.formatEther(bal), "WOOD");
  console.log("SwapBack:", swapBack ? swapBack.args.map(String) : "none");
  console.log("treasury ETH gained:", ethers.formatEther((await ethers.provider.getBalance(treasury.address)) - tBefore));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
