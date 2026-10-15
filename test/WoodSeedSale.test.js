const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const WETH9 = require("@uniswap/v2-periphery/build/WETH9.json");
const Factory = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const Router = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");

const E = (n) => ethers.parseEther(String(n));
const U = (n) => ethers.parseUnits(String(n), 6);
const SEED = E(1_000_000);

async function deployArtifact(json, signer, ...args) {
  const f = new ethers.ContractFactory(json.abi, "0x" + json.bytecode.replace(/^0x/, ""), signer);
  const c = await f.deploy(...args);
  await c.waitForDeployment();
  return c;
}

async function fixture() {
  const [owner, treasury, alice, bob] = await ethers.getSigners();
  const weth = await deployArtifact(WETH9, owner);
  const factory = await deployArtifact(Factory, owner, owner.address);
  const router = await deployArtifact(Router, owner, await factory.getAddress(), await weth.getAddress());
  const wood = await (await ethers.getContractFactory("WoodToken")).deploy(await router.getAddress(), treasury.address, owner.address);
  const usdg = await (await ethers.getContractFactory("MockERC20")).deploy("Global Dollar", "USDG", 6);
  const sale = await (await ethers.getContractFactory("WoodSeedSale")).deploy(await wood.getAddress(), await usdg.getAddress(), owner.address);
  const saleA = await sale.getAddress();
  await usdg.mint(alice.address, U(1_000));
  await usdg.mint(bob.address, U(1_000));
  await usdg.connect(alice).approve(saleA, ethers.MaxUint256);
  await usdg.connect(bob).approve(saleA, ethers.MaxUint256);
  return { owner, treasury, alice, bob, wood, usdg, sale, saleA };
}

// what scripts/deploy-seed.js does after deploying the sale
async function wire({ wood, saleA }) {
  await wood.setFeeExempt(saleA, true);
  await wood.setLimitExempt(saleA, true);
  await wood.transfer(saleA, SEED);
}

describe("WoodSeedSale", () => {
  it("allocates $0.0075 per WOOD ($50 = 6,666.666… WOOD)", async () => {
    const { sale, alice } = await loadFixture(fixture);
    await sale.connect(alice).buyTokens(U(50));
    const p = await sale.participants(alice.address);
    expect(p.totalContributed).to.equal(U(50));
    expect(p.totalAllocated).to.equal((U(50) * E(1)) / 7500n);
    expect(p.totalAllocated).to.be.closeTo(E("6666.666666666666666"), E("0.000001"));
  });

  it("enforces $10 minimum, $200 per wallet, and the $7,500 hard cap", async () => {
    const { sale, usdg, alice } = await loadFixture(fixture);
    await expect(sale.connect(alice).buyTokens(U(9))).to.be.revertedWith("Below $10 minimum");
    await sale.connect(alice).buyTokens(U(150));
    await expect(sale.connect(alice).buyTokens(U(51))).to.be.revertedWith("Exceeds $200 maximum per wallet");
    await sale.connect(alice).buyTokens(U(50));
    expect((await sale.participants(alice.address)).totalContributed).to.equal(U(200));
    // Fill to $7,400 with many wallets (alice $200 + 36 x $200), then $100 fits and $101 does not.
    // This also shows the cap is per wallet, not per person.
    const saleA = await sale.getAddress();
    const newWallet = async () => {
      const w = ethers.Wallet.createRandom().connect(ethers.provider);
      await ethers.provider.send("hardhat_setBalance", [w.address, "0x56BC75E2D63100000"]);
      await usdg.mint(w.address, U(200));
      await usdg.connect(w).approve(saleA, U(200));
      return w;
    };
    for (let i = 0; i < 36; i++) await sale.connect(await newWallet()).buyTokens(U(200));
    expect(await sale.totalRaised()).to.equal(U(7_400));
    await expect(sale.connect(await newWallet()).buyTokens(U(101))).to.be.revertedWith("Hard cap exceeded");
    await sale.connect(await newWallet()).buyTokens(U(100));
    expect(await sale.totalRaised()).to.equal(U(7_500));
  }).timeout(180000);

  describe("finalize needs the WOOD", () => {
    it("reverts without WOOD, then succeeds once the sale is funded", async () => {
      const f = await loadFixture(fixture);
      const { sale, alice, treasury, usdg } = f;
      await sale.connect(alice).buyTokens(U(100));
      await expect(sale.finalizeSale(treasury.address)).to.be.revertedWith("Contract needs WOOD tokens");
      expect(await usdg.balanceOf(treasury.address)).to.equal(0n); // nothing left the contract
      await wire(f);
      await sale.finalizeSale(treasury.address);
      expect(await usdg.balanceOf(treasury.address)).to.equal(U(100));
    });
  });

  describe("claims with the real WoodToken", () => {
    it("claims revert before launch if the sale is NOT fee-exempt", async () => {
      const f = await loadFixture(fixture);
      const { sale, wood, saleA, alice, treasury } = f;
      await wood.transfer(saleA, SEED); // funded but not exempt
      await sale.connect(alice).buyTokens(U(100));
      await sale.finalizeSale(treasury.address);
      await sale.setUnlockedBps(2500);
      await expect(sale.connect(alice).claimTokens()).to.be.revertedWithCustomError(wood, "TradingNotEnabled");
    });

    it("exempt sale pays Tranche 1 before launch, then later tranches, with no tax taken", async () => {
      const f = await loadFixture(fixture);
      const { sale, wood, alice, treasury } = f;
      await wire(f);
      await sale.connect(alice).buyTokens(U(100)); // 13,333.33 WOOD
      await sale.finalizeSale(treasury.address);
      const allocated = (await sale.participants(alice.address)).totalAllocated;

      await sale.setUnlockedBps(2500);
      await sale.connect(alice).claimTokens();
      expect(await wood.balanceOf(alice.address)).to.equal((allocated * 2500n) / 10000n);

      await wood.enableTrading();
      await sale.setUnlockedBps(10000);
      await sale.connect(alice).claimTokens();
      expect(await wood.balanceOf(alice.address)).to.equal(allocated); // full amount, no 3% taken
      await expect(sale.connect(alice).claimTokens()).to.be.revertedWith("No tokens available to claim");
    });

    it("unlock percentage can only go up and never above 100%", async () => {
      const f = await loadFixture(fixture);
      const { sale, treasury, alice } = f;
      await wire(f);
      await sale.connect(alice).buyTokens(U(10));
      await expect(sale.setUnlockedBps(2500)).to.be.revertedWith("Sale must be finalized first");
      await sale.finalizeSale(treasury.address);
      await sale.setUnlockedBps(5000);
      await expect(sale.setUnlockedBps(2500)).to.be.revertedWith("Cannot reduce unlocked percentage");
      await expect(sale.setUnlockedBps(10001)).to.be.revertedWith("Cannot exceed 100%");
    });
  });
});
