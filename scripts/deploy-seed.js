// Deploy the $WOOD seed sale and wire it to the (already deployed) WoodToken. Usage:
//   WOOD_ADDRESS=0x… PAYMENT_TOKEN_ADDRESSES=0xUSDG,0xUSDC npx hardhat run scripts/deploy-seed.js --network robinhood
// Run scripts/deploy.js first to deploy WoodToken, then this script.
// Requires .env: DEPLOYER_PRIVATE_KEY (must be the WoodToken owner and hold the 1,000,000 $WOOD)
//   WOOD_ADDRESS            deployed WoodToken
//   PAYMENT_TOKEN_ADDRESSES comma-separated stablecoins backers can pay with (each 6 decimals, treated as $1)
//   SALE_OWNER_ADDRESS      (optional) owner of the sale contract, defaults to deployer
// This script never calls enableTrading(), never sets a pair, and never touches liquidity.
const hre = require("hardhat");
const { ethers } = hre;

const SEED_ALLOCATION = ethers.parseUnits("1000000", 18);

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer: set DEPLOYER_PRIVATE_KEY in .env");

  const woodAddress = process.env.WOOD_ADDRESS;
  const payAddresses = (process.env.PAYMENT_TOKEN_ADDRESSES || "").split(",").map((x) => x.trim()).filter(Boolean);
  const saleOwner = process.env.SALE_OWNER_ADDRESS || deployer.address;
  if (!woodAddress) throw new Error("WOOD_ADDRESS required (deploy WoodToken first with scripts/deploy.js).");
  if (!payAddresses.length) throw new Error("PAYMENT_TOKEN_ADDRESSES required. Confirm each stablecoin address on-chain first.");

  for (const [name, addr] of [["WoodToken", woodAddress], ...payAddresses.map((a) => ["Payment token", a])]) {
    if ((await ethers.provider.getCode(addr)) === "0x") throw new Error(`No contract at ${name} ${addr} on chain ${chainId}.`);
  }

  const wood = await ethers.getContractAt("WoodToken", woodAddress, deployer);
  const symbols = [];
  for (const addr of payAddresses) {
    const pay = await ethers.getContractAt(
      ["function decimals() view returns (uint8)", "function symbol() view returns (string)"], addr, deployer
    );
    const decimals = await pay.decimals();
    if (decimals !== 6n) throw new Error(`Payment token ${addr} has ${decimals} decimals; WoodSeedSale assumes 6.`);
    symbols.push(await pay.symbol());
  }

  // The deployer must own the token (to set exemptions) and hold the seed allocation (to fund the sale).
  if ((await wood.owner()).toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error("Deployer is not the WoodToken owner, so it cannot set exemptions. Run the exemption calls from the owner (Safe).");
  }
  const bal = await wood.balanceOf(deployer.address);
  if (bal < SEED_ALLOCATION) throw new Error(`Deployer holds ${ethers.formatUnits(bal, 18)} WOOD, needs 1,000,000.`);

  console.log(`Chain ${chainId} | deployer ${deployer.address}`);
  console.log(`WoodToken ${woodAddress} | payment ${symbols.join("/")} ${payAddresses.join(",")} | sale owner ${saleOwner}`);

  const Sale = await ethers.getContractFactory("WoodSeedSale", deployer);
  const sale = await Sale.deploy(woodAddress, payAddresses, saleOwner);
  await sale.waitForDeployment();
  const saleAddress = await sale.getAddress();
  console.log("WoodSeedSale:", saleAddress);

  // Before enableTrading() only fee-exempt addresses can move WOOD, so the sale must be exempt to pay out claims.
  await (await wood.setFeeExempt(saleAddress, true)).wait();
  await (await wood.setLimitExempt(saleAddress, true)).wait();
  console.log("Sale marked fee-exempt and limit-exempt.");

  await (await wood.transfer(saleAddress, SEED_ALLOCATION)).wait();
  const held = await wood.balanceOf(saleAddress);
  console.log("Sale holds:", ethers.formatUnits(held, 18), "WOOD");
  if (held !== SEED_ALLOCATION) throw new Error("Sale balance does not match the seed allocation.");

  console.log("\n==========================================");
  console.log("Set in frontend/public/seed/index.html:");
  console.log(`  SEED_CONTRACT_ADDRESS: "${saleAddress}",`);
  console.log(`  WOOD_TOKEN_ADDRESS: "${woodAddress}",`);
  console.log("(accepted stablecoins are read from the sale contract, nothing else to paste)");
  console.log("==========================================");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
