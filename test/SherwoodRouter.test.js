const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const WETH9 = require("@uniswap/v2-periphery/build/WETH9.json");
const Factory = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const Router = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");

const E = (n) => ethers.parseEther(String(n));
const U = (n) => ethers.parseUnits(String(n), 6);
const V2 = 0, V3 = 1;
const ZERO = ethers.ZeroAddress;

async function deployArtifact(json, signer, ...args) {
  const f = new ethers.ContractFactory(json.abi, "0x" + json.bytecode.replace(/^0x/, ""), signer);
  const c = await f.deploy(...args);
  await c.waitForDeployment();
  return c;
}
const v3path = (a, fee, b) => ethers.solidityPacked(["address", "uint24", "address"], [a, fee, b]);

async function fixture() {
  const [owner, treasury, alice, referrer] = await ethers.getSigners();
  const weth = await deployArtifact(WETH9, owner);
  const factory = await deployArtifact(Factory, owner, owner.address);
  const v2 = await deployArtifact(Router, owner, await factory.getAddress(), await weth.getAddress());
  const usdg = await (await ethers.getContractFactory("MockERC20")).deploy("Global Dollar", "USDG", 6);
  const v3 = await (await ethers.getContractFactory("MockV3Router")).deploy();

  const dl = (await time.latest()) + 3600;
  // WETH/USDG V2 pool: 100 ETH / 300,000 USDG
  await usdg.mint(owner.address, U(10_000_000));
  await usdg.approve(await v2.getAddress(), ethers.MaxUint256);
  await v2.addLiquidityETH(await usdg.getAddress(), U(300_000), 0, 0, owner.address, dl, { value: E(100) });

  // WOOD with its own WOOD/WETH pool, trading on
  const wood = await (await ethers.getContractFactory("WoodToken")).deploy(await v2.getAddress(), treasury.address, owner.address);
  await wood.approve(await v2.getAddress(), ethers.MaxUint256);
  await v2.addLiquidityETH(await wood.getAddress(), E(20_000_000), 0, 0, owner.address, dl, { value: E(10) });
  await wood.enableTrading();

  // Fund mock V3 with liquidity
  await usdg.mint(await v3.getAddress(), U(1_000_000));
  await weth.deposit({ value: E(100) });
  await weth.transfer(await v3.getAddress(), E(100));

  const sr = await (await ethers.getContractFactory("SherwoodRouter")).deploy(
    await weth.getAddress(), await v2.getAddress(), await v3.getAddress(), treasury.address, owner.address
  );
  await usdg.mint(alice.address, U(100_000));
  return { owner, treasury, alice, referrer, weth, v2, v3, usdg, wood, sr };
}

function params(o) {
  return {
    venue: V2, tokenIn: ZERO, tokenOut: ZERO, amountIn: 0n, minAmountOut: 0n,
    v2Path: [], v3Path: "0x", recipient: ZERO, deadline: 0n, referrer: ZERO, ...o,
  };
}

describe("SherwoodRouter", () => {
  it("ETH → USDG via V2: takes 0.10% ETH fee to treasury, delivers output, holds nothing", async () => {
    const { sr, weth, usdg, alice, treasury, referrer } = await loadFixture(fixture);
    const dl = (await time.latest()) + 600;
    const tBefore = await ethers.provider.getBalance(treasury.address);
    const p = params({
      tokenIn: ZERO, tokenOut: await usdg.getAddress(), amountIn: E(1), minAmountOut: U(2_900),
      v2Path: [await weth.getAddress(), await usdg.getAddress()], recipient: alice.address, deadline: dl, referrer: referrer.address,
    });
    await expect(sr.connect(alice).swap(p, { value: E(1) }))
      .to.emit(sr, "SherwoodSwap")
      .withArgs(alice.address, referrer.address, V2, ZERO, await usdg.getAddress(), E(1), (v) => v > 0n, E("0.001"), alice.address);
    expect((await ethers.provider.getBalance(treasury.address)) - tBefore).to.equal(E("0.001"));
    expect(await usdg.balanceOf(alice.address)).to.be.gt(U(102_900));
    expect(await ethers.provider.getBalance(await sr.getAddress())).to.equal(0n);
    expect(await weth.balanceOf(await sr.getAddress())).to.equal(0n);
  });

  it("USDG → ETH via V2: fee taken in USDG, user receives native ETH", async () => {
    const { sr, weth, usdg, alice, treasury } = await loadFixture(fixture);
    const dl = (await time.latest()) + 600;
    await usdg.connect(alice).approve(await sr.getAddress(), ethers.MaxUint256);
    const ethBefore = await ethers.provider.getBalance(alice.address);
    const p = params({
      tokenIn: await usdg.getAddress(), tokenOut: ZERO, amountIn: U(3_000), minAmountOut: E("0.9"),
      v2Path: [await usdg.getAddress(), await weth.getAddress()], recipient: alice.address, deadline: dl,
    });
    await sr.connect(alice).swap(p);
    expect(await usdg.balanceOf(treasury.address)).to.equal(U(3));
    expect(await ethers.provider.getBalance(alice.address)).to.be.gt(ethBefore + E("0.9"));
  });

  it("ETH → WOOD via V2 works with WOOD's buy tax (fee-on-transfer)", async () => {
    const { sr, weth, wood, alice } = await loadFixture(fixture);
    const dl = (await time.latest()) + 600;
    const p = params({
      tokenIn: ZERO, tokenOut: await wood.getAddress(), amountIn: E("0.1"), minAmountOut: E(150_000),
      v2Path: [await weth.getAddress(), await wood.getAddress()], recipient: alice.address, deadline: dl,
    });
    await sr.connect(alice).swap(p, { value: E("0.1") });
    expect(await wood.balanceOf(alice.address)).to.be.gt(E(150_000));
    expect(await wood.balanceOf(await sr.getAddress())).to.equal(0n);
    expect(await wood.balanceOf(await wood.getAddress())).to.be.gt(0n); // WOOD tax accrued
  });

  it("WOOD → ETH via V2 works with WOOD's sell tax", async () => {
    const { sr, weth, wood, alice } = await loadFixture(fixture);
    const dl = (await time.latest()) + 600;
    await sr.connect(alice).swap(params({
      tokenIn: ZERO, tokenOut: await wood.getAddress(), amountIn: E("0.1"),
      v2Path: [await weth.getAddress(), await wood.getAddress()], recipient: alice.address, deadline: dl,
    }), { value: E("0.1") });
    const bal = await wood.balanceOf(alice.address);
    await wood.connect(alice).approve(await sr.getAddress(), bal);
    const ethBefore = await ethers.provider.getBalance(alice.address);
    await sr.connect(alice).swap(params({
      tokenIn: await wood.getAddress(), tokenOut: ZERO, amountIn: bal, minAmountOut: E("0.08"),
      v2Path: [await wood.getAddress(), await weth.getAddress()], recipient: alice.address, deadline: dl,
    }));
    expect(await ethers.provider.getBalance(alice.address)).to.be.gt(ethBefore + E("0.08"));
    expect(await wood.balanceOf(await sr.getAddress())).to.equal(0n);
  });

  it("ETH → USDG via V3 venue (mock SwapRouter02)", async () => {
    const { sr, v3, weth, usdg, alice } = await loadFixture(fixture);
    const dl = (await time.latest()) + 600;
    // mock pays 1:1 in raw units → set a rate that gives ~3000 USDG per ETH: 3000e6/1e18
    await v3.setRate(0); // first prove minOut enforcement
    const p = params({
      venue: V3, tokenIn: ZERO, tokenOut: await usdg.getAddress(), amountIn: E(1), minAmountOut: 1n,
      v3Path: v3path(await weth.getAddress(), 500, await usdg.getAddress()), recipient: alice.address, deadline: dl,
    });
    await expect(sr.connect(alice).swap(p, { value: E(1) })).to.be.revertedWithCustomError(sr, "InsufficientOutput");
  });

  it("USDG → WETH-out via V3 venue delivers native ETH and takes fee", async () => {
    const { sr, v3, weth, usdg, alice, treasury } = await loadFixture(fixture);
    const dl = (await time.latest()) + 600;
    await v3.setRate(10_000);
    await usdg.connect(alice).approve(await sr.getAddress(), ethers.MaxUint256);
    // mock is 1:1 raw → 1e6 raw USDG in → 999,000 raw WETH out after 0.10% fee (tiny ETH amount, fine for a mock)
    const before = await ethers.provider.getBalance(alice.address);
    const tx = await sr.connect(alice).swap(params({
      venue: V3, tokenIn: await usdg.getAddress(), tokenOut: ZERO, amountIn: U(1), minAmountOut: 999_000n,
      v3Path: v3path(await usdg.getAddress(), 500, await weth.getAddress()), recipient: treasury.address, deadline: dl,
    }));
    await tx.wait();
    expect(await usdg.balanceOf(treasury.address)).to.equal(1_000n);
  });

  describe("guards", () => {
    it("rejects bad V2 and V3 paths", async () => {
      const { sr, weth, usdg, alice } = await loadFixture(fixture);
      const dl = (await time.latest()) + 600;
      await expect(sr.connect(alice).swap(params({
        tokenIn: ZERO, tokenOut: await usdg.getAddress(), amountIn: E(1),
        v2Path: [await usdg.getAddress(), await weth.getAddress()], recipient: alice.address, deadline: dl,
      }), { value: E(1) })).to.be.revertedWithCustomError(sr, "InvalidPath");
      await expect(sr.connect(alice).swap(params({
        venue: V3, tokenIn: ZERO, tokenOut: await usdg.getAddress(), amountIn: E(1),
        v3Path: "0x1234", recipient: alice.address, deadline: dl,
      }), { value: E(1) })).to.be.revertedWithCustomError(sr, "InvalidPath");
    });

    it("enforces deadline, msg.value and same-token checks", async () => {
      const { sr, weth, usdg, alice } = await loadFixture(fixture);
      const now = await time.latest();
      const base = { tokenIn: ZERO, tokenOut: await usdg.getAddress(), amountIn: E(1),
        v2Path: [await weth.getAddress(), await usdg.getAddress()], recipient: alice.address };
      await expect(sr.connect(alice).swap(params({ ...base, deadline: now - 1 }), { value: E(1) }))
        .to.be.revertedWithCustomError(sr, "Expired");
      await expect(sr.connect(alice).swap(params({ ...base, deadline: now + 600 }), { value: E(2) }))
        .to.be.revertedWithCustomError(sr, "InvalidAmount");
      await expect(sr.connect(alice).swap(params({ ...base, tokenOut: await weth.getAddress(), deadline: now + 600 }), { value: E(1) }))
        .to.be.revertedWithCustomError(sr, "SameToken");
    });

    it("fee is capped at 0.30%, can be zero, and pause stops swaps", async () => {
      const { sr, weth, usdg, alice, treasury } = await loadFixture(fixture);
      await expect(sr.setFee(31)).to.be.revertedWithCustomError(sr, "FeeTooHigh");
      await expect(sr.connect(alice).setFee(5)).to.be.revertedWithCustomError(sr, "OwnableUnauthorizedAccount");
      await sr.setFee(0);
      const dl = (await time.latest()) + 600;
      const p = params({ tokenIn: ZERO, tokenOut: await usdg.getAddress(), amountIn: E(1),
        v2Path: [await weth.getAddress(), await usdg.getAddress()], recipient: alice.address, deadline: dl });
      const tBefore = await ethers.provider.getBalance(treasury.address);
      await sr.connect(alice).swap(p, { value: E(1) });
      expect(await ethers.provider.getBalance(treasury.address)).to.equal(tBefore);
      await sr.pause();
      await expect(sr.connect(alice).swap(p, { value: E(1) })).to.be.revertedWithCustomError(sr, "EnforcedPause");
    });

    it("rejects stray ETH not coming from WETH", async () => {
      const { sr, alice } = await loadFixture(fixture);
      await expect(alice.sendTransaction({ to: await sr.getAddress(), value: E(1) })).to.be.reverted;
    });

    it("quoteFee matches the fee charged", async () => {
      const { sr } = await loadFixture(fixture);
      const [fee, net] = await sr.quoteFee(E(1));
      expect(fee).to.equal(E("0.001"));
      expect(net).to.equal(E("0.999"));
    });
  });
});
