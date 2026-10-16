// After deploy-seed.js: move the unsold WOOD supply and admin control from the hot deployer to the treasury Safe.
//   WOOD_ADDRESS=0x… SALE_ADDRESS=0x… npx hardhat run scripts/handover.js --network robinhood
// Requires .env: DEPLOYER_PRIVATE_KEY (token owner), TREASURY_WALLET_ADDRESS (the Safe)
// What it does:
//   1. transfers all remaining WOOD from the deployer to the treasury (treasury is fee/limit exempt from construction)
//   2. starts the two-step ownership transfer of WoodToken to the treasury
//   3. starts the ownership transfer of WoodSeedSale to the treasury (if SALE_ADDRESS is given and the deployer owns it)
// The Safe must then ACCEPT token ownership (acceptOwnership) with a Safe transaction. Until it does, the deployer still owns the token.
const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const [deployer] = await ethers.getSigners();
  const woodAddress = process.env.WOOD_ADDRESS;
  const saleAddress = process.env.SALE_ADDRESS;
  const treasury = process.env.TREASURY_WALLET_ADDRESS;
  if (!woodAddress || !treasury) throw new Error("WOOD_ADDRESS and TREASURY_WALLET_ADDRESS required.");
  if (deployer.address.toLowerCase() === treasury.toLowerCase()) throw new Error("Deployer and treasury are the same address.");
  if ((await ethers.provider.getCode(treasury)) === "0x") throw new Error("Treasury has no code; expected a Safe.");

  const wood = await ethers.getContractAt("WoodToken", woodAddress, deployer);
  if ((await wood.owner()).toLowerCase() !== deployer.address.toLowerCase()) throw new Error("Deployer is not the WoodToken owner.");
  if (!(await wood.isFeeExempt(treasury))) throw new Error("Treasury is not fee-exempt; transfers would fail before launch.");

  const bal = await wood.balanceOf(deployer.address);
  console.log(`Moving ${ethers.formatUnits(bal, 18)} WOOD to ${treasury}`);
  await (await wood.transfer(treasury, bal)).wait();

  await (await wood.transferOwnership(treasury)).wait();
  console.log("WoodToken ownership transfer started. The Safe must call acceptOwnership() on", woodAddress);

  if (saleAddress) {
    const sale = await ethers.getContractAt("WoodSeedSale", saleAddress, deployer);
    if ((await sale.owner()).toLowerCase() === deployer.address.toLowerCase()) {
      await (await sale.transferOwnership(treasury)).wait();
      console.log("WoodSeedSale ownership transferred to", treasury, "(single-step: done).");
    } else console.log("Deployer does not own the sale; skipped.");
  }
  console.log("Deployer WOOD balance now:", ethers.formatUnits(await wood.balanceOf(deployer.address), 18));
}

module.exports = main;
if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1; });
