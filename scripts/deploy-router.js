// Deploy SherwoodRouter (V2 + V3 + V4 split router). Usage:
//   npm run deploy:router            (Robinhood Chain Mainnet, 4663)
// Requires .env: DEPLOYER_PRIVATE_KEY, TREASURY_WALLET_ADDRESS, OWNER_ADDRESS
//   TREASURY_WALLET_ADDRESS = the treasury Safe (receives the 0.10% router fee)
//   OWNER_ADDRESS           = the treasury Safe (the constructor sets the owner directly: there is no acceptOwnership step)
// The deployer only pays gas and ends up owning nothing. The router holds no funds, so it is never funded.
// Set DRY_RUN=1 to run every check and print the constructor arguments without sending a transaction.
const hre = require("hardhat");

// Verified Robinhood Chain mainnet (4663) addresses. The script re-checks that code exists at each one.
const A = {
  WETH: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  V2_ROUTER: "0x89e5db8b5aa49aa85ac63f691524311aeb649eba",
  V3_SWAP_ROUTER: "0xcaf681a66d020601342297493863e78c959e5cb2",
  V4_POOL_MANAGER: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
};

async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  if (chainId !== 4663n) throw new Error(`Refusing to run on chain ${chainId}: this script is for Robinhood Chain mainnet (4663).`);
  const [deployer] = await hre.ethers.getSigners();
  const treasury = process.env.TREASURY_WALLET_ADDRESS;
  const owner = process.env.OWNER_ADDRESS;
  if (!treasury || !owner) throw new Error("TREASURY_WALLET_ADDRESS and OWNER_ADDRESS are required (use the Safe for both).");
  if (!hre.ethers.isAddress(treasury) || !hre.ethers.isAddress(owner)) throw new Error("Treasury/owner must be valid addresses.");
  if (owner.toLowerCase() === deployer.address.toLowerCase()) throw new Error("OWNER_ADDRESS is the deployer. Use the Safe so the deployer keeps no powers.");

  for (const [name, addr] of Object.entries(A)) {
    if ((await hre.ethers.provider.getCode(addr)) === "0x") throw new Error(`No contract at ${name} ${addr}.`);
  }
  // The Safe must be a contract (a mistyped EOA here would be a costly mistake).
  for (const [name, addr] of Object.entries({ treasury, owner })) {
    if ((await hre.ethers.provider.getCode(addr)) === "0x") throw new Error(`${name} ${addr} has no code: expected the Safe.`);
  }

  const args = [A.WETH, A.V2_ROUTER, A.V3_SWAP_ROUTER, A.V4_POOL_MANAGER, treasury, owner];
  const Factory = await hre.ethers.getContractFactory("SherwoodRouter");
  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Chain ${chainId} | deployer ${deployer.address} | balance ${hre.ethers.formatEther(bal)} ETH`);
  console.log("Constructor args (weth, v2Router, v3SwapRouter02, v4PoolManager, treasury, owner):");
  console.log(JSON.stringify(args, null, 2));

  const deployTx = await Factory.getDeployTransaction(...args);
  const gas = await hre.ethers.provider.estimateGas({ ...deployTx, from: deployer.address });
  const fee = await hre.ethers.provider.getFeeData();
  const price = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
  console.log(`Estimated deploy gas: ${gas} | est. cost ~ ${hre.ethers.formatEther(gas * price)} ETH`);
  if (process.env.DRY_RUN) return console.log("DRY_RUN set: nothing sent.");
  if (bal < gas * price) throw new Error("Deployer balance is below the estimated deploy cost.");

  const router = await Factory.deploy(...args);
  await router.waitForDeployment();
  const addr = await router.getAddress();
  console.log("\n==========================================");
  console.log("SherwoodRouter:", addr);
  console.log("owner():", await router.owner(), "| treasury():", await router.treasury(), "| feeBps():", (await router.feeBps()).toString());
  console.log("==========================================");
  console.log("Next: verify on Sourcify + Blockscout with the args above, set NEXT_PUBLIC_SHERWOOD_ROUTER in Cloudflare,");
  console.log("redeploy the site, then run small ETH <> USDG test swaps before announcing. Do NOT make the router fee/limit-exempt in WoodToken.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
