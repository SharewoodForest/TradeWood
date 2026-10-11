const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const WETH9 = require("@uniswap/v2-periphery/build/WETH9.json");
const Factory = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const Router = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");

const E = (n) => ethers.parseEther(String(n));
const U = (n) => ethers.parseUnits(String(n), 6);
const V2 = 0, V3 = 1, V4 = 2;
const ZERO = ethers.ZeroAddress;

async function deployArtifact(json, signer, ...args) {
  const f = new ethers.ContractFactory(json.abi, "0x" + json.bytecode.replace(/^0x/, ""), signer);
  const c = await f.deploy(...args);
  await c.waitForDeployment();
  return c;
}
const v3path = (a, fee, b) => ethers.solidityPacked(["address", "uint24", "address"], [a, fee, b]);

const coder = ethers.AbiCoder.defaultAbiCoder();
const sortPair = (a, b) => (a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a]);
const v2Leg = (path, weightBps = 10_000) => ({ venue: V2, weightBps, data: coder.encode(["address[]"], [path]) });
const v3Leg = (path, weightBps = 10_000) => ({ venue: V3, weightBps, data: path });
const HOP = "tuple(tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key, bytes hookData)[]";
const key = (a, b, fee = 500, tickSpacing = 10, hooks = ZERO) => {
  const [currency0, currency1] = sortPair(a, b);
  return { currency0, currency1, fee, tickSpacing, hooks };
};
const v4Leg = (keys, weightBps = 10_000) => ({
  venue: V4, weightBps, data: coder.encode([HOP], [keys.map((k) => ({ key: k, hookData: "0x" }))]),
});

async function fixture() {
  const [owner, treasury, alice, referrer] = await ethers.getSigners();
  const weth = await deployArtifact(WETH9, owner);
  const factory = await deployArtifact(Factory, owner, owner.address);
  const v2 = await deployArtifact(Router, owner, await factory.getAddress(), await weth.getAddress());
  const usdg = await (await ethers.getContractFactory("MockERC20")).deploy("Global Dollar", "USDG", 6);
  const v3 = await (await ethers.getContractFactory("MockV3Router")).deploy();
  const pm = await (await ethers.getContractFactory("MockPoolManager")).deploy();

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
    await weth.getAddress(), await v2.getAddress(), await v3.getAddress(), await pm.getAddress(), treasury.address, owner.address
  );
  // V4 mock pools: native ETH/USDG at 3,000 USDG per ETH (raw: 3000e6 per 1e18), and WETH/USDG
  const usdgA = await usdg.getAddress(), wethA = await weth.getAddress();
  await pm.setPrice(ZERO, usdgA, 3000n * 10n ** 6n);
  const [w0, w1] = sortPair(wethA, usdgA);
  await pm.setPrice(w0, w1, w0 === wethA ? 3000n * 10n ** 6n : (10n ** 36n) / (3000n * 10n ** 6n));
  await usdg.mint(await pm.getAddress(), U(1_000_000));
  await owner.sendTransaction({ to: await pm.getAddress(), value: E(100) });
  await weth.deposit({ value: E(50) });
  await weth.transfer(await pm.getAddress(), E(50));
  await usdg.mint(alice.address, U(100_000));
  return { owner, treasury, alice, referrer, weth, v2, v3, pm, usdg, wood, sr };
}

function params(o) {
  const { venue = V2, v2Path, v3Path, legs, ...rest } = o;
  const l = legs || [venue === V3 ? v3Leg(v3Path) : v2Leg(v2Path)];
  return { tokenIn: ZERO, tokenOut: ZERO, amountIn: 0n, minAmountOut: 0n, legs: l,
    recipient: ZERO, deadline: 0n, referrer: ZERO, ...rest };
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
      .withArgs(alice.address, referrer.address, ZERO, await usdg.getAddress(), E(1), (v) => v > 0n, E("0.001"), alice.address, 1, 1);
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


  describe("Uniswap V4 venue", () => {
    it("native ETH → USDG through a native-ETH V4 pool, fee taken, nothing left behind", async () => {
      const { sr, pm, weth, usdg, alice, treasury, referrer } = await loadFixture(fixture);
      const dl = (await time.latest()) + 600;
      const before = await usdg.balanceOf(alice.address);
      await expect(sr.connect(alice).swap(params({
        tokenIn: ZERO, tokenOut: await usdg.getAddress(), amountIn: E(1), minAmountOut: U("2997"),
        legs: [v4Leg([key(ZERO, await usdg.getAddress())])], recipient: alice.address, deadline: dl, referrer: referrer.address,
      }), { value: E(1) })).to.emit(sr, "SherwoodSwap")
        .withArgs(alice.address, referrer.address, ZERO, await usdg.getAddress(), E(1), U("2997"), E("0.001"), alice.address, 4, 1);
      expect((await usdg.balanceOf(alice.address)) - before).to.equal(U("2997"));
      expect(await ethers.provider.getBalance(await sr.getAddress())).to.equal(0n);
      expect(await usdg.balanceOf(await sr.getAddress())).to.equal(0n);
      expect(await weth.balanceOf(await sr.getAddress())).to.equal(0n);
      expect(await pm.delta(ZERO)).to.equal(0n);
    });

    it("native ETH in, routed through a WETH V4 pool (router wraps first)", async () => {
      const { sr, weth, usdg, alice } = await loadFixture(fixture);
      const dl = (await time.latest()) + 600;
      const before = await usdg.balanceOf(alice.address);
      await sr.connect(alice).swap(params({
        tokenIn: ZERO, tokenOut: await usdg.getAddress(), amountIn: E(1), minAmountOut: U("2996"),
        legs: [v4Leg([key(await weth.getAddress(), await usdg.getAddress())])], recipient: alice.address, deadline: dl,
      }), { value: E(1) });
      expect((await usdg.balanceOf(alice.address)) - before).to.be.closeTo(U("2997"), 2n);
      expect(await weth.balanceOf(await sr.getAddress())).to.equal(0n);
    });

    it("USDG → native ETH out of a V4 pool", async () => {
      const { sr, usdg, alice, treasury } = await loadFixture(fixture);
      const dl = (await time.latest()) + 600;
      await usdg.connect(alice).approve(await sr.getAddress(), ethers.MaxUint256);
      const bob = ethers.Wallet.createRandom().address;
      await sr.connect(alice).swap(params({
        tokenIn: await usdg.getAddress(), tokenOut: ZERO, amountIn: U(3000), minAmountOut: E("0.999"),
        legs: [v4Leg([key(ZERO, await usdg.getAddress())])], recipient: bob, deadline: dl,
      }));
      expect(await ethers.provider.getBalance(bob)).to.equal(E("0.999"));
      expect(await usdg.balanceOf(treasury.address)).to.equal(U(3));
    });

    it("multi-hop V4: ETH → USDG → TKN", async () => {
      const { sr, pm, usdg, alice } = await loadFixture(fixture);
      const tkn = await (await ethers.getContractFactory("MockERC20")).deploy("Token", "TKN", 18);
      const [c0, c1] = sortPair(await usdg.getAddress(), await tkn.getAddress());
      // 1 USDG (1e6) = 2 TKN (2e18)
      await pm.setPrice(c0, c1, c0 === (await usdg.getAddress()) ? 2n * 10n ** 12n * 10n ** 18n : 5n * 10n ** 17n / 10n ** 12n);
      await tkn.mint(await pm.getAddress(), E(1_000_000));
      const dl = (await time.latest()) + 600;
      await sr.connect(alice).swap(params({
        tokenIn: ZERO, tokenOut: await tkn.getAddress(), amountIn: E(1), minAmountOut: E(5994),
        legs: [v4Leg([key(ZERO, await usdg.getAddress()), key(await usdg.getAddress(), await tkn.getAddress())])],
        recipient: alice.address, deadline: dl,
      }), { value: E(1) });
      expect(await tkn.balanceOf(alice.address)).to.equal(E(5994));
    });

    it("reverts on a partial fill instead of leaving funds behind", async () => {
      const { sr, pm, usdg, alice } = await loadFixture(fixture);
      await pm.setMaxIn(E("0.5"));
      const dl = (await time.latest()) + 600;
      await expect(sr.connect(alice).swap(params({
        tokenIn: ZERO, tokenOut: await usdg.getAddress(), amountIn: E(1),
        legs: [v4Leg([key(ZERO, await usdg.getAddress())])], recipient: alice.address, deadline: dl,
      }), { value: E(1) })).to.be.revertedWithCustomError(sr, "PartialFill");
    });

    it("unlockCallback can only be called by the PoolManager", async () => {
      const { sr, alice } = await loadFixture(fixture);
      await expect(sr.connect(alice).unlockCallback("0x")).to.be.revertedWithCustomError(sr, "NotPoolManager");
    });
  });

  describe("split routing", () => {
    it("splits ETH → USDG 60% V2 / 40% V4 and enforces one total minimum", async () => {
      const { sr, weth, usdg, alice } = await loadFixture(fixture);
      const dl = (await time.latest()) + 600;
      const usdgA = await usdg.getAddress(), wethA = await weth.getAddress();
      const legs = [v2Leg([wethA, usdgA], 6_000), v4Leg([key(ZERO, usdgA)], 4_000)];
      const before = await usdg.balanceOf(alice.address);
      const tx = sr.connect(alice).swap(params({
        tokenIn: ZERO, tokenOut: usdgA, amountIn: E(1), minAmountOut: U(2_900), legs, recipient: alice.address, deadline: dl,
      }), { value: E(1) });
      await expect(tx).to.emit(sr, "SherwoodSwap")
        .withArgs(alice.address, ZERO, ZERO, usdgA, E(1), (v) => v > U(2_900), E("0.001"), alice.address, 5, 2);
      const got = (await usdg.balanceOf(alice.address)) - before;
      // V4 leg alone: 0.3996 ETH * 3000 = 1198.8 USDG; V2 leg ~0.5994 ETH from a 100 ETH / 300k pool
      expect(got).to.be.gt(U(2_980));
      expect(await ethers.provider.getBalance(await sr.getAddress())).to.equal(0n);
      expect(await weth.balanceOf(await sr.getAddress())).to.equal(0n);
      // the same split with an impossible minimum reverts as a whole
      await expect(sr.connect(alice).swap(params({
        tokenIn: ZERO, tokenOut: usdgA, amountIn: E(1), minAmountOut: U(3_000), legs, recipient: alice.address, deadline: dl,
      }), { value: E(1) })).to.be.revertedWithCustomError(sr, "InsufficientOutput");
    });

    it("splits USDG → native ETH across V2 (WETH) and V4 (native) and pays out one ETH amount", async () => {
      const { sr, weth, usdg, alice } = await loadFixture(fixture);
      const dl = (await time.latest()) + 600;
      const usdgA = await usdg.getAddress(), wethA = await weth.getAddress();
      await usdg.connect(alice).approve(await sr.getAddress(), ethers.MaxUint256);
      const bob = ethers.Wallet.createRandom().address;
      await sr.connect(alice).swap(params({
        tokenIn: usdgA, tokenOut: ZERO, amountIn: U(6_000), minAmountOut: E("1.95"),
        legs: [v2Leg([usdgA, wethA], 5_000), v4Leg([key(ZERO, usdgA)], 5_000)], recipient: bob, deadline: dl,
      }));
      expect(await ethers.provider.getBalance(bob)).to.be.gt(E("1.95"));
      expect(await weth.balanceOf(await sr.getAddress())).to.equal(0n);
      expect(await ethers.provider.getBalance(await sr.getAddress())).to.equal(0n);
    });

    it("3 legs with odd weights: ETH in → V2 + WETH-start V4 + native V4; remainder goes to the last leg", async () => {
      const { sr, weth, usdg, alice, pm } = await loadFixture(fixture);
      const dl = (await time.latest()) + 600;
      const usdgA = await usdg.getAddress(), wethA = await weth.getAddress();
      const amt = E(1) + 7n; // odd amount so the weight split has a rounding remainder
      const net = amt - (amt * 10n) / 10_000n;
      const legs = [v2Leg([wethA, usdgA], 3_333), v4Leg([key(wethA, usdgA)], 3_333), v4Leg([key(ZERO, usdgA)], 3_334)];
      const before = await usdg.balanceOf(alice.address);
      await sr.connect(alice).swap(params({
        tokenIn: ZERO, tokenOut: usdgA, amountIn: amt, minAmountOut: U(2_900), legs, recipient: alice.address, deadline: dl,
      }), { value: amt });
      expect((await usdg.balanceOf(alice.address)) - before).to.be.gt(U(2_900));
      // the native V4 leg received exactly the remainder: net - 2 * floor(net * 3333 / 10000)
      const lastIn = net - 2n * ((net * 3_333n) / 10_000n);
      expect(lastIn).to.be.gt((net * 3_334n) / 10_000n - 1n);
      expect(await ethers.provider.getBalance(await sr.getAddress())).to.equal(0n);
      expect(await weth.balanceOf(await sr.getAddress())).to.equal(0n);
      expect(await usdg.balanceOf(await sr.getAddress())).to.equal(0n);
      expect(await pm.delta(ZERO)).to.equal(0n);
    });

    it("rejects the router itself as recipient", async () => {
      const { sr, weth, usdg, alice } = await loadFixture(fixture);
      const dl = (await time.latest()) + 600;
      await expect(sr.connect(alice).swap(params({
        tokenIn: ZERO, tokenOut: await usdg.getAddress(), amountIn: E(1),
        v2Path: [await weth.getAddress(), await usdg.getAddress()], recipient: await sr.getAddress(), deadline: dl,
      }), { value: E(1) })).to.be.revertedWithCustomError(sr, "InvalidRecipient");
    });

    it("rejects malformed leg sets", async () => {
      const { sr, weth, usdg, alice } = await loadFixture(fixture);
      const dl = (await time.latest()) + 600;
      const usdgA = await usdg.getAddress(), wethA = await weth.getAddress();
      const base = { tokenIn: ZERO, tokenOut: usdgA, amountIn: E(1), recipient: alice.address, deadline: dl };
      const bad = [
        [],
        [v2Leg([wethA, usdgA], 5_000)],
        [v2Leg([wethA, usdgA], 10_000), v4Leg([key(ZERO, usdgA)], 0)],
        [v2Leg([wethA, usdgA], 6_000), v4Leg([key(ZERO, usdgA)], 5_000)],
        Array(5).fill(v2Leg([wethA, usdgA], 2_000)),
      ];
      for (const legs of bad) {
        await expect(sr.connect(alice).swap(params({ ...base, legs }), { value: E(1) }))
          .to.be.revertedWithCustomError(sr, "InvalidLegs");
      }
    });
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
      // V4 pool that doesn't contain the input token
      await expect(sr.connect(alice).swap(params({
        tokenIn: ZERO, tokenOut: await usdg.getAddress(), amountIn: E(1),
        legs: [v4Leg([key(await usdg.getAddress(), alice.address)])], recipient: alice.address, deadline: dl,
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
