// Deploy WoodToken. Usage:
//   npm run deploy:testnet   (Robinhood Chain Testnet, 46630)
//   npm run deploy:mainnet   (Robinhood Chain Mainnet, 4663)
// Requires .env: DEPLOYER_PRIVATE_KEY, TREASURY_WALLET_ADDRESS, (optional) OWNER_ADDRESS, ROUTER_ADDRESS
const hre = require("hardhat");

// Uniswap V2 Router02 on Robinhood Chain mainnet — verified on-chain 2026-10-08:
// factory() = 0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f (UniswapV2Factory), WETH() = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73
const MAINNET_V2_ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba";

async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  const [deployer] = await hre.ethers.getSigners();
  const router = process.env.ROUTER_ADDRESS || (chainId === 4663n ? MAINNET_V2_ROUTER : "");
  const treasury = process.env.TREASURY_WALLET_ADDRESS;
  const owner = process.env.OWNER_ADDRESS || deployer.address;
  if (!router) throw new Error("ROUTER_ADDRESS required on this network (no default known for testnet).");
  if (!treasury) throw new Error("TREASURY_WALLET_ADDRESS required.");

  const code = await hre.ethers.provider.getCode(router);
  if (code === "0x") throw new Error(`No contract at router ${router} on chain ${chainId}.`);

  console.log(`Chain ${chainId} | deployer ${deployer.address}`);
  console.log(`Balance: ${hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address))} ETH`);
  console.log(`Router ${router} | treasury ${treasury} | owner ${owner}`);

  const Wood = await hre.ethers.getContractFactory("WoodToken");
  const wood = await Wood.deploy(router, treasury, owner);
  await wood.waitForDeployment();

  console.log("\n==========================================");
  console.log("WoodToken ($WOOD):", await wood.getAddress());
  console.log("WOOD/WETH pair:   ", await wood.mainPair());
  console.log("==========================================");
  console.log("Next: seed liquidity (owner), configure sale contract exemptions, then enableTrading().");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
