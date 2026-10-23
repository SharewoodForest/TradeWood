const { expect } = require("chai");
const { ethers } = require("hardhat");
const { readTag, REF_TAG } = require("../scripts/seed-referrals");

const U = (n) => ethers.parseUnits(String(n), 6);

// The seed page appends "TWRF" + referrer to buyTokens calldata. These tests prove the deployed
// WoodSeedSale accepts that exactly like a normal buy, and that the payout script reads the tag back.
describe("Seed referrals (calldata tag)", () => {
  async function setup() {
    const [owner, alice, bandit] = await ethers.getSigners();
    const wood = await (await ethers.getContractFactory("MockERC20")).deploy("TradeWood", "WOOD", 18);
    const usdg = await (await ethers.getContractFactory("MockERC20")).deploy("Global Dollar", "USDG", 6);
    const sale = await (await ethers.getContractFactory("WoodSeedSale")).deploy(await wood.getAddress(), [await usdg.getAddress()], owner.address);
    await usdg.mint(alice.address, U(1_000));
    await usdg.connect(alice).approve(await sale.getAddress(), ethers.MaxUint256);
    return { alice, bandit, usdg, sale };
  }

  const tagged = (sale, token, amt, ref) =>
    sale.interface.encodeFunctionData("buyTokens", [token, amt]) + REF_TAG + ref.slice(2).toLowerCase();

  it("tagged buy records the same contribution and allocation as a plain buy", async () => {
    const { alice, bandit, usdg, sale } = await setup();
    const data = tagged(sale, await usdg.getAddress(), U(50), bandit.address);
    const tx = await alice.sendTransaction({ to: await sale.getAddress(), data });
    const expectedWood = (U(50) * 10n ** 18n) / (await sale.USDC_PER_WOOD_RATE());
    await expect(tx).to.emit(sale, "TokensPurchased").withArgs(alice.address, await usdg.getAddress(), U(50), expectedWood);
    const p = await sale.participants(alice.address);
    expect(p.totalContributed).to.equal(U(50));
    expect(await sale.totalRaised()).to.equal(U(50));
  });

  it("payout script reads the referrer from the transaction input", async () => {
    const { alice, bandit, usdg, sale } = await setup();
    const tx = await alice.sendTransaction({ to: await sale.getAddress(), data: tagged(sale, await usdg.getAddress(), U(20), bandit.address) });
    const onchain = await ethers.provider.getTransaction(tx.hash);
    expect(readTag(onchain.data)).to.equal(bandit.address);
  });

  it("plain buys carry no referrer", async () => {
    const { alice, usdg, sale } = await setup();
    const tx = await sale.connect(alice).buyTokens(await usdg.getAddress(), U(20));
    const onchain = await ethers.provider.getTransaction(tx.hash);
    expect(readTag(onchain.data)).to.equal(null);
  });

  it("tagged buys still enforce the contract limits", async () => {
    const { alice, bandit, usdg, sale } = await setup();
    const data = tagged(sale, await usdg.getAddress(), U(201), bandit.address);
    await expect(alice.sendTransaction({ to: await sale.getAddress(), data })).to.be.revertedWith("Exceeds $200 maximum per wallet");
  });
});
