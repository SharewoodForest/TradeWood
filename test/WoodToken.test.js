const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const WETH9 = require("@uniswap/v2-periphery/build/WETH9.json");
const Factory = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const Router = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");
const Pair = require("@uniswap/v2-core/build/UniswapV2Pair.json");

const E = (n) => ethers.parseEther(String(n));
const deadline = () => Math.floor(Date.now() / 1000) + 3600;

async function deployArtifact(json, signer, ...args) {
  const f = new ethers.ContractFactory(json.abi, "0x" + json.bytecode.replace(/^0x/, ""), signer);
  const c = await f.deploy(...args);
  await c.waitForDeployment();
  return c;
}

async function fixture(treasuryRejectsEth = false) {
  const [owner, treasuryEOA, alice, bob, presale] = await ethers.getSigners();
  const weth = await deployArtifact(WETH9, owner);
  const factory = await deployArtifact(Factory, owner, owner.address);
  const router = await deployArtifact(Router, owner, await factory.getAddress(), await weth.getAddress());

  let treasury = treasuryEOA.address;
  if (treasuryRejectsEth) {
    const r = await (await ethers.getContractFactory("RejectEth")).deploy();
    treasury = await r.getAddress();
  }

  const wood = await (await ethers.getContractFactory("WoodToken")).deploy(
    await router.getAddress(), treasury, owner.address
  );
  const pair = new ethers.Contract(await wood.mainPair(), Pair.abi, owner);

  // Owner seeds liquidity: 20M WOOD + 10 ETH (owner is exempt, so this works before trading opens)
  await wood.approve(await router.getAddress(), ethers.MaxUint256);
  await router.addLiquidityETH(await wood.getAddress(), E(20_000_000), 0, 0, owner.address, deadline(), { value: E(10) });

  return { owner, treasury, treasuryEOA, alice, bob, presale, weth, router, wood, pair };
}
const baseFixture = () => fixture(false);
const rejectFixture = () => fixture(true);

async function buy(router, wood, weth, signer, eth) {
  return router.connect(signer).swapExactETHForTokensSupportingFeeOnTransferTokens(
    0, [await weth.getAddress(), await wood.getAddress()], signer.address, deadline(), { value: E(eth) }
  );
}
async function sell(router, wood, weth, signer, amount) {
  await wood.connect(signer).approve(await router.getAddress(), ethers.MaxUint256);
  return router.connect(signer).swapExactTokensForETHSupportingFeeOnTransferTokens(
    amount, 0, [await wood.getAddress(), await weth.getAddress()], signer.address, deadline()
  );
}

describe("WoodToken", () => {
  describe("deployment", () => {
    it("mints fixed 100M supply to owner and creates WOOD/WETH pair", async () => {
      const { wood, owner, pair } = await loadFixture(baseFixture);
      expect(await wood.totalSupply()).to.equal(E(100_000_000));
      expect(await wood.balanceOf(owner.address)).to.equal(E(80_000_000));
      expect(await wood.isAmmPair(await pair.getAddress())).to.equal(true);
      expect(await wood.name()).to.equal("TradeWood");
      expect(await wood.symbol()).to.equal("WOOD");
    });

    it("has no mint function (supply is fixed)", async () => {
      const { wood } = await loadFixture(baseFixture);
      expect(wood.interface.getFunction("mint")).to.equal(null);
    });
  });

  describe("pre-launch", () => {
    it("blocks non-exempt transfers and buys before trading is enabled", async () => {
      const { wood, owner, alice, bob, router, weth } = await loadFixture(baseFixture);
      await wood.transfer(alice.address, E(1000)); // owner is exempt → allowed (early-buyer sale distribution)
      await expect(wood.connect(alice).transfer(bob.address, E(1))).to.be.revertedWithCustomError(wood, "TradingNotEnabled");
      await expect(buy(router, wood, weth, alice, 0.01)).to.be.reverted;
    });

    it("an exempt sale contract can distribute before launch", async () => {
      const { wood, owner, presale, alice } = await loadFixture(baseFixture);
      await wood.setFeeExempt(presale.address, true);
      await wood.setLimitExempt(presale.address, true);
      await wood.transfer(presale.address, E(5_000_000));
      await wood.connect(presale).transfer(alice.address, E(100_000));
      expect(await wood.balanceOf(alice.address)).to.equal(E(100_000));
    });

    it("enableTrading is one-way and owner-only", async () => {
      const { wood, alice } = await loadFixture(baseFixture);
      await expect(wood.connect(alice).enableTrading()).to.be.revertedWithCustomError(wood, "OwnableUnauthorizedAccount");
      await wood.enableTrading();
      await expect(wood.enableTrading()).to.be.revertedWithCustomError(wood, "TradingAlreadyEnabled");
    });
  });

  describe("taxes", () => {
    it("takes 3% on buys, split 2% LP / 1% treasury", async () => {
      const { wood, router, weth, alice } = await loadFixture(baseFixture);
      await wood.enableTrading();
      await buy(router, wood, weth, alice, 0.1);
      const received = await wood.balanceOf(alice.address);
      const taxed = await wood.balanceOf(await wood.getAddress());
      // received = 97% of gross, tax = 3% of gross
      expect(taxed * 97n).to.be.closeTo(received * 3n, E(1));
      const lp = await wood.tokensForLp();
      const tr = await wood.tokensForTreasury();
      expect(lp + tr).to.equal(taxed);
      expect(lp).to.be.closeTo(tr * 2n, 2n);
    });

    it("does not tax wallet-to-wallet transfers", async () => {
      const { wood, router, weth, alice, bob } = await loadFixture(baseFixture);
      await wood.enableTrading();
      await buy(router, wood, weth, alice, 0.1);
      const bal = await wood.balanceOf(alice.address);
      await wood.connect(alice).transfer(bob.address, bal);
      expect(await wood.balanceOf(bob.address)).to.equal(bal);
    });

    it("sell triggers swap-back: treasury receives ETH and protocol-owned LP tokens", async () => {
      const { wood, router, weth, alice, bob, treasury, pair } = await loadFixture(baseFixture);
      await wood.enableTrading();
      await wood.setSwapSettings(true, E(1_000), E(100_000));
      await buy(router, wood, weth, alice, 0.2);
      await buy(router, wood, weth, bob, 0.2);
      const accrued = await wood.balanceOf(await wood.getAddress());
      expect(accrued).to.be.gt(E(1_000));

      const ethBefore = await ethers.provider.getBalance(treasury);
      const lpBefore = await pair.balanceOf(treasury);
      await expect(sell(router, wood, weth, alice, (await wood.balanceOf(alice.address)) / 2n)).to.emit(wood, "SwapBack");

      expect(await ethers.provider.getBalance(treasury)).to.be.gt(ethBefore);
      expect(await pair.balanceOf(treasury)).to.be.gt(lpBefore);
      expect(await ethers.provider.getBalance(await wood.getAddress())).to.equal(0n);
    });

    it("fees are hard-capped at 5% per side", async () => {
      const { wood } = await loadFixture(baseFixture);
      await expect(wood.setFees(400, 101, 200, 100)).to.be.revertedWithCustomError(wood, "FeeTooHigh");
      await expect(wood.setFees(200, 100, 400, 101)).to.be.revertedWithCustomError(wood, "FeeTooHigh");
      await wood.setFees(0, 0, 0, 0);
      expect(await wood.buyLpFeeBps()).to.equal(0);
    });

    it("zero fees → no tax taken", async () => {
      const { wood, router, weth, alice } = await loadFixture(baseFixture);
      await wood.enableTrading();
      await wood.setFees(0, 0, 0, 0);
      await buy(router, wood, weth, alice, 0.1);
      expect(await wood.balanceOf(await wood.getAddress())).to.equal(0n);
    });
  });

  describe("anti-whale limits", () => {
    it("rejects buys over max-tx (1%)", async () => {
      const { wood, router, weth, alice } = await loadFixture(baseFixture);
      await wood.enableTrading();
      await expect(buy(router, wood, weth, alice, 1)).to.be.reverted; // ~1.8M WOOD > 1M
    });

    it("rejects transfers that push a wallet over max-wallet (2%)", async () => {
      const { wood, owner, alice, bob } = await loadFixture(baseFixture);
      await wood.enableTrading();
      await wood.transfer(alice.address, E(1_500_000));
      await wood.transfer(bob.address, E(1_000_000));
      await expect(wood.connect(bob).transfer(alice.address, E(600_000))).to.be.revertedWithCustomError(wood, "ExceedsMaxWallet");
    });

    it("limits can't be set below floors; removeLimits lifts them", async () => {
      const { wood, router, weth, alice } = await loadFixture(baseFixture);
      await wood.enableTrading();
      await expect(wood.setLimits(E(100_000), E(2_000_000))).to.be.revertedWithCustomError(wood, "LimitTooLow");
      await wood.removeLimits();
      await buy(router, wood, weth, alice, 1);
      expect(await wood.balanceOf(alice.address)).to.be.gt(E(1_000_000));
    });
  });

  describe("safety", () => {
    it("a treasury that rejects ETH never blocks user sells", async () => {
      const { wood, router, weth, alice, bob } = await loadFixture(rejectFixture);
      await wood.enableTrading();
      await wood.setSwapSettings(true, E(1_000), E(100_000));
      await buy(router, wood, weth, alice, 0.2);
      await buy(router, wood, weth, bob, 0.2);
      await expect(sell(router, wood, weth, alice, E(10_000))).to.emit(wood, "TreasuryPaymentFailed");
      expect(await ethers.provider.getBalance(await wood.getAddress())).to.be.gt(0n);
      await wood.rescueETH((await ethers.getSigners())[0].address);
      expect(await ethers.provider.getBalance(await wood.getAddress())).to.equal(0n);
    });

    it("owner cannot withdraw accrued WOOD tax via rescueToken", async () => {
      const { wood, owner } = await loadFixture(baseFixture);
      await expect(wood.rescueToken(await wood.getAddress(), owner.address)).to.be.revertedWithCustomError(wood, "CannotRescueWood");
    });

    it("main pair cannot be un-registered", async () => {
      const { wood, pair } = await loadFixture(baseFixture);
      await expect(wood.setAmmPair(await pair.getAddress(), false)).to.be.revertedWithCustomError(wood, "CannotChangeMainPair");
    });

    it("ownership transfer is two-step", async () => {
      const { wood, owner, alice } = await loadFixture(baseFixture);
      await wood.transferOwnership(alice.address);
      expect(await wood.owner()).to.equal(owner.address);
      await wood.connect(alice).acceptOwnership();
      expect(await wood.owner()).to.equal(alice.address);
    });

    it("holders can burn", async () => {
      const { wood } = await loadFixture(baseFixture);
      await wood.burn(E(1_000_000));
      expect(await wood.totalSupply()).to.equal(E(99_000_000));
    });
  });
});
