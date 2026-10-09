// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IUniswapV2Factory {
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IUniswapV2Router02 {
    function factory() external view returns (address);
    function WETH() external view returns (address);
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}

/// @title TradeWood ($WOOD) — The Sherwood Protocol on Robinhood Chain
/// @notice Fixed-supply ERC-20 with buy/sell tax (auto-LP + treasury), launch guardrails and hard-capped owner powers.
/// @dev Taxes apply only to trades against registered AMM pairs; wallet-to-wallet transfers are untaxed so
///      vaults, referrals and the early-buyer sale work without special cases. Auto-LP tokens are minted to the
///      treasury (protocol-owned liquidity).
contract WoodToken is ERC20, ERC20Burnable, ERC20Permit, Ownable2Step {
    using SafeERC20 for IERC20;

    // ─────────────────────────────── Constants ───────────────────────────────
    uint256 public constant TOTAL_SUPPLY = 100_000_000 ether; // 100M WOOD, 18 decimals
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_FEE_BPS = 500; // hard cap: buy or sell tax can never exceed 5%
    uint256 public constant MIN_MAX_TX = TOTAL_SUPPLY / 200; // max-tx can't be set below 0.5%
    uint256 public constant MIN_MAX_WALLET = TOTAL_SUPPLY / 100; // max-wallet can't be set below 1%

    // ─────────────────────────────── Immutables ──────────────────────────────
    IUniswapV2Router02 public immutable router;
    address public immutable mainPair; // WOOD / WETH

    // ─────────────────────────────── Config ──────────────────────────────────
    address public treasury;

    uint16 public buyLpFeeBps = 200; // 2% auto-LP
    uint16 public buyTreasuryFeeBps = 100; // 1% treasury
    uint16 public sellLpFeeBps = 200;
    uint16 public sellTreasuryFeeBps = 100;

    bool public tradingEnabled;
    uint256 public tradingEnabledAt;

    bool public limitsInEffect = true;
    uint256 public maxTxAmount = TOTAL_SUPPLY / 100; // 1%
    uint256 public maxWalletAmount = (TOTAL_SUPPLY * 2) / 100; // 2%

    bool public swapEnabled = true;
    uint256 public swapThreshold = TOTAL_SUPPLY / 10_000; // 10,000 WOOD
    uint256 public maxSwapAmount = TOTAL_SUPPLY / 1_000; // 100,000 WOOD per swap-back (limits price impact)

    // Accrued tax tokens awaiting swap-back
    uint256 public tokensForLp;
    uint256 public tokensForTreasury;

    mapping(address => bool) public isFeeExempt;
    mapping(address => bool) public isLimitExempt;
    mapping(address => bool) public isAmmPair;

    bool private _inSwap;

    // ─────────────────────────────── Events ──────────────────────────────────
    event TradingEnabled(uint256 timestamp);
    event LimitsRemoved();
    event LimitsUpdated(uint256 maxTxAmount, uint256 maxWalletAmount);
    event FeesUpdated(uint16 buyLpFeeBps, uint16 buyTreasuryFeeBps, uint16 sellLpFeeBps, uint16 sellTreasuryFeeBps);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event SwapSettingsUpdated(bool enabled, uint256 threshold, uint256 maxSwapAmount);
    event AmmPairSet(address indexed pair, bool value);
    event FeeExemptSet(address indexed account, bool value);
    event LimitExemptSet(address indexed account, bool value);
    event SwapBack(uint256 tokensSwapped, uint256 tokensAddedToLp, uint256 ethAddedToLp, uint256 ethToTreasury);
    event SwapBackFailed();
    event TreasuryPaymentFailed(uint256 amount);

    // ─────────────────────────────── Errors ──────────────────────────────────
    error ZeroAddress();
    error TradingNotEnabled();
    error TradingAlreadyEnabled();
    error ExceedsMaxTx();
    error ExceedsMaxWallet();
    error FeeTooHigh();
    error LimitTooLow();
    error InvalidSwapSettings();
    error CannotChangeMainPair();
    error CannotRescueWood();
    error EthTransferFailed();

    modifier lockSwap() {
        _inSwap = true;
        _;
        _inSwap = false;
    }

    constructor(address router_, address treasury_, address owner_)
        ERC20("TradeWood", "WOOD")
        ERC20Permit("TradeWood")
        Ownable(owner_)
    {
        if (router_ == address(0) || treasury_ == address(0) || owner_ == address(0)) revert ZeroAddress();

        router = IUniswapV2Router02(router_);
        treasury = treasury_;

        address pair = IUniswapV2Factory(router.factory()).createPair(address(this), router.WETH());
        mainPair = pair;
        isAmmPair[pair] = true;
        isLimitExempt[pair] = true;
        emit AmmPairSet(pair, true);

        address[4] memory exempt = [owner_, treasury_, address(this), address(0xdead)];
        for (uint256 i; i < exempt.length; ++i) {
            isFeeExempt[exempt[i]] = true;
            isLimitExempt[exempt[i]] = true;
        }
        isLimitExempt[router_] = true;

        _approve(address(this), router_, type(uint256).max);
        _mint(owner_, TOTAL_SUPPLY);
    }

    receive() external payable {}

    // ─────────────────────────────── Core transfer logic ─────────────────────

    function _update(address from, address to, uint256 amount) internal override {
        // Mints, burns and internal swap-back transfers pass straight through.
        if (from == address(0) || to == address(0) || _inSwap) {
            super._update(from, to, amount);
            return;
        }

        bool feeExempt = isFeeExempt[from] || isFeeExempt[to];

        // Before launch, only exempt parties (owner, treasury, sale/vault contracts) can move tokens.
        if (!tradingEnabled && !feeExempt) revert TradingNotEnabled();

        bool isBuy = isAmmPair[from];
        bool isSell = isAmmPair[to];

        if (limitsInEffect) {
            if (isBuy && !isLimitExempt[to]) {
                if (amount > maxTxAmount) revert ExceedsMaxTx();
                if (balanceOf(to) + amount > maxWalletAmount) revert ExceedsMaxWallet();
            } else if (isSell && !isLimitExempt[from]) {
                if (amount > maxTxAmount) revert ExceedsMaxTx();
            } else if (!isBuy && !isSell && !isLimitExempt[to]) {
                if (balanceOf(to) + amount > maxWalletAmount) revert ExceedsMaxWallet();
            }
        }

        // Convert accrued tax on sells (never during buys, which would revert inside the pair's lock).
        if (isSell && !feeExempt && swapEnabled) {
            uint256 contractBalance = balanceOf(address(this));
            if (contractBalance >= swapThreshold) {
                _swapBack(contractBalance);
            }
        }

        if (!feeExempt && (isBuy || isSell)) {
            (uint256 lpBps, uint256 treasuryBps) =
                isBuy ? (uint256(buyLpFeeBps), uint256(buyTreasuryFeeBps)) : (uint256(sellLpFeeBps), uint256(sellTreasuryFeeBps));
            uint256 totalBps = lpBps + treasuryBps;
            if (totalBps > 0) {
                uint256 fee = (amount * totalBps) / BPS;
                if (fee > 0) {
                    uint256 lpPortion = (fee * lpBps) / totalBps;
                    tokensForLp += lpPortion;
                    tokensForTreasury += fee - lpPortion;
                    super._update(from, address(this), fee);
                    amount -= fee;
                }
            }
        }

        super._update(from, to, amount);
    }

    /// @dev Swaps accrued tax for ETH, adds the LP share as protocol-owned liquidity, sends the rest to treasury.
    ///      Failures never block user transfers.
    function _swapBack(uint256 contractBalance) private lockSwap {
        uint256 accrued = tokensForLp + tokensForTreasury;
        if (accrued == 0) return;

        uint256 toProcess = contractBalance > maxSwapAmount ? maxSwapAmount : contractBalance;
        if (toProcess > accrued) toProcess = accrued;

        uint256 lpTokens = (toProcess * tokensForLp) / accrued;
        uint256 treasuryTokens = toProcess - lpTokens;
        uint256 lpHalf = lpTokens / 2; // kept as tokens to pair with ETH
        uint256 toSwap = toProcess - lpHalf;
        if (toSwap == 0) return;

        tokensForLp -= lpTokens;
        tokensForTreasury -= treasuryTokens;

        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = router.WETH();

        uint256 ethBefore = address(this).balance;
        try router.swapExactTokensForETHSupportingFeeOnTransferTokens(toSwap, 0, path, address(this), block.timestamp) {}
        catch {
            // Restore accounting so the tax is retried on a later sell.
            tokensForLp += lpTokens;
            tokensForTreasury += treasuryTokens;
            emit SwapBackFailed();
            return;
        }
        uint256 ethGained = address(this).balance - ethBefore;

        uint256 ethForLp = (ethGained * lpHalf) / toSwap;
        uint256 tokensAdded;
        uint256 ethAdded;
        if (lpHalf > 0 && ethForLp > 0) {
            try router.addLiquidityETH{value: ethForLp}(address(this), lpHalf, 0, 0, treasury, block.timestamp) returns (
                uint256 amountToken, uint256 amountETH, uint256
            ) {
                tokensAdded = amountToken;
                ethAdded = amountETH;
            } catch {}
        }

        uint256 ethToTreasury = address(this).balance;
        if (ethToTreasury > 0) {
            (bool ok,) = treasury.call{value: ethToTreasury}("");
            if (!ok) {
                emit TreasuryPaymentFailed(ethToTreasury); // ETH stays here; owner can rescue
                ethToTreasury = 0;
            }
        }

        emit SwapBack(toSwap, tokensAdded, ethAdded, ethToTreasury);
    }

    // ─────────────────────────────── Owner controls (bounded) ────────────────

    /// @notice One-way switch. Trading cannot be paused once enabled.
    function enableTrading() external onlyOwner {
        if (tradingEnabled) revert TradingAlreadyEnabled();
        tradingEnabled = true;
        tradingEnabledAt = block.timestamp;
        emit TradingEnabled(block.timestamp);
    }

    /// @notice One-way switch. Removes max-tx and max-wallet forever.
    function removeLimits() external onlyOwner {
        limitsInEffect = false;
        emit LimitsRemoved();
    }

    /// @notice Limits can only be loosened past the floors (0.5% tx / 1% wallet), never used to trap holders.
    function setLimits(uint256 maxTx, uint256 maxWallet) external onlyOwner {
        if (maxTx < MIN_MAX_TX || maxWallet < MIN_MAX_WALLET) revert LimitTooLow();
        maxTxAmount = maxTx;
        maxWalletAmount = maxWallet;
        emit LimitsUpdated(maxTx, maxWallet);
    }

    /// @notice Buy and sell tax are each hard-capped at 5%.
    function setFees(uint16 buyLp, uint16 buyTreasury, uint16 sellLp, uint16 sellTreasury) external onlyOwner {
        if (uint256(buyLp) + buyTreasury > MAX_FEE_BPS || uint256(sellLp) + sellTreasury > MAX_FEE_BPS) {
            revert FeeTooHigh();
        }
        buyLpFeeBps = buyLp;
        buyTreasuryFeeBps = buyTreasury;
        sellLpFeeBps = sellLp;
        sellTreasuryFeeBps = sellTreasury;
        emit FeesUpdated(buyLp, buyTreasury, sellLp, sellTreasury);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
        isFeeExempt[newTreasury] = true;
        isLimitExempt[newTreasury] = true;
    }

    function setSwapSettings(bool enabled, uint256 threshold, uint256 maxSwap) external onlyOwner {
        // threshold: 0.001% – 0.5% of supply; maxSwap: threshold – 1% of supply
        if (threshold < TOTAL_SUPPLY / 100_000 || threshold > TOTAL_SUPPLY / 200) revert InvalidSwapSettings();
        if (maxSwap < threshold || maxSwap > TOTAL_SUPPLY / 100) revert InvalidSwapSettings();
        swapEnabled = enabled;
        swapThreshold = threshold;
        maxSwapAmount = maxSwap;
        emit SwapSettingsUpdated(enabled, threshold, maxSwap);
    }

    function setAmmPair(address pair, bool value) external onlyOwner {
        if (pair == mainPair) revert CannotChangeMainPair();
        if (pair == address(0)) revert ZeroAddress();
        isAmmPair[pair] = value;
        if (value) isLimitExempt[pair] = true;
        emit AmmPairSet(pair, value);
    }

    function setFeeExempt(address account, bool value) external onlyOwner {
        isFeeExempt[account] = value;
        emit FeeExemptSet(account, value);
    }

    function setLimitExempt(address account, bool value) external onlyOwner {
        isLimitExempt[account] = value;
        emit LimitExemptSet(account, value);
    }

    /// @notice Manually convert accrued tax (e.g. if sells are rare).
    function manualSwapBack() external onlyOwner {
        uint256 bal = balanceOf(address(this));
        if (bal > 0) _swapBack(bal);
    }

    /// @notice Recover ETH stuck after a failed treasury payment.
    function rescueETH(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool ok,) = to.call{value: address(this).balance}("");
        if (!ok) revert EthTransferFailed();
    }

    /// @notice Recover foreign tokens sent here by mistake. Accrued WOOD tax cannot be withdrawn.
    function rescueToken(address token, address to) external onlyOwner {
        if (token == address(this)) revert CannotRescueWood();
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, IERC20(token).balanceOf(address(this)));
    }
}
