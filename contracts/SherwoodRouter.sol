// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256) external;
}

interface IUniswapV2RouterLike {
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}

/// @dev Uniswap SwapRouter02 (IV3SwapRouter) — note: no deadline in the struct; enforced by SherwoodRouter.
interface IV3SwapRouterLike {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}

/// @dev Minimal Uniswap V4 PoolManager surface (v4-core). `Currency` is an address (address(0) = native ETH);
///      `BalanceDelta` is an int256 packing amount0 (high 128 bits) and amount1 (low 128 bits), caller-signed.
interface IPoolManagerLike {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct SwapParams {
        bool zeroForOne;
        int256 amountSpecified; // negative = exact input
        uint160 sqrtPriceLimitX96;
    }

    function unlock(bytes calldata data) external returns (bytes memory);
    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData) external returns (int256);
    function sync(address currency) external;
    function settle() external payable returns (uint256 paid);
    function take(address currency, address to, uint256 amount) external;
}

/// @title Sherwood Router — TradeWood's multi-venue, split-routing swap router
/// @notice Routes a swap through Uniswap V2, V3 and V4 on Robinhood Chain — optionally split across several venues
///         in one transaction — and takes a small protocol fee on the input.
/// @dev The best route (and split) is computed off-chain: the frontend quotes every venue and picks the split with
///      the best total output. This contract enforces the user's minimum output *after* the fee across all legs,
///      handles native ETH/WETH on every venue (V4 pools can hold native ETH), and measures outputs by balance deltas.
///      Fee-on-transfer tokens like $WOOD must route through V2 only: V3 and V4 revert on taxed *input* (their
///      payment checks require the full amount to arrive). It holds no funds between transactions.
contract SherwoodRouter is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Venue {
        UniswapV2,
        UniswapV3,
        UniswapV4
    }

    /// @notice One slice of a swap.
    /// @param weightBps share of the post-fee input sent down this leg; all legs must sum to 10_000.
    /// @param data venue-specific route:
    ///        V2 → abi.encode(address[] path)            (WETH stands in for ETH)
    ///        V3 → abi.encodePacked(token, uint24 fee, token, ...)   (WETH stands in for ETH)
    ///        V4 → abi.encode(V4Hop[] hops)              (ETH may be address(0) or WETH, per pool)
    struct Leg {
        Venue venue;
        uint16 weightBps;
        bytes data;
    }

    struct V4Hop {
        IPoolManagerLike.PoolKey key;
        bytes hookData;
    }

    struct SwapParams {
        address tokenIn; // address(0) = native ETH
        address tokenOut; // address(0) = native ETH
        uint256 amountIn;
        uint256 minAmountOut; // what the user must receive in total, net of the protocol fee
        Leg[] legs;
        address recipient;
        uint256 deadline;
        address referrer; // Bounty Bandits referral attribution (recorded in the event)
    }

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_FEE_BPS = 30; // hard cap 0.30%
    uint256 public constant MAX_LEGS = 4;

    uint160 private constant MIN_SQRT_PRICE = 4295128739;
    uint160 private constant MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342;

    address public immutable WETH;
    IUniswapV2RouterLike public immutable v2Router;
    IV3SwapRouterLike public immutable v3Router;
    IPoolManagerLike public immutable poolManager;

    address public treasury;
    uint256 public feeBps = 10; // 0.10%

    /// @param venueMask bit i set = a leg used Venue(i) (1 = V2, 2 = V3, 4 = V4)
    event SherwoodSwap(
        address indexed user,
        address indexed referrer,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 feeAmount,
        address recipient,
        uint8 venueMask,
        uint8 legs
    );
    event FeeUpdated(uint256 feeBps);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);

    error ZeroAddress();
    error Expired();
    error InvalidAmount();
    error InvalidPath();
    error InvalidLegs();
    error InsufficientOutput(uint256 amountOut, uint256 minAmountOut);
    error FeeTooHigh();
    error EthTransferFailed();
    error SameToken();
    error NotPoolManager();
    error PartialFill();
    error NoOutput();
    error InvalidRecipient();

    constructor(
        address weth_,
        address v2Router_,
        address v3Router_,
        address poolManager_,
        address treasury_,
        address owner_
    ) Ownable(owner_) {
        if (
            weth_ == address(0) || v2Router_ == address(0) || v3Router_ == address(0) || poolManager_ == address(0)
                || treasury_ == address(0)
        ) revert ZeroAddress();
        WETH = weth_;
        v2Router = IUniswapV2RouterLike(v2Router_);
        v3Router = IV3SwapRouterLike(v3Router_);
        poolManager = IPoolManagerLike(poolManager_);
        treasury = treasury_;
    }

    /// @dev Accept ETH only from WETH unwraps and V4 native-ETH takes.
    receive() external payable {
        if (msg.sender != WETH && msg.sender != address(poolManager)) revert EthTransferFailed();
    }

    // ─────────────────────────────── Swap ────────────────────────────────────

    function swap(SwapParams calldata p) external payable nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (block.timestamp > p.deadline) revert Expired();
        if (p.recipient == address(0)) revert ZeroAddress();
        if (p.recipient == address(this)) revert InvalidRecipient();
        if (p.amountIn == 0) revert InvalidAmount();
        if (p.tokenIn == p.tokenOut) revert SameToken();
        if (_work(p.tokenIn) == _work(p.tokenOut)) revert SameToken();
        uint256 n = p.legs.length;
        if (n == 0 || n > MAX_LEGS) revert InvalidLegs();

        (uint256 received, uint256 fee, uint256 net) = _pullAndTakeFee(p.tokenIn, p.amountIn);
        uint8 mask;
        (amountOut, mask) = _routeLegs(p, net);

        // For ERC-20 output, the user's minimum is checked against what the recipient actually receives
        // (covers tokens that tax the router → recipient transfer).
        if (p.tokenOut == address(0)) {
            if (amountOut < p.minAmountOut) revert InsufficientOutput(amountOut, p.minAmountOut);
            _deliver(p.tokenOut, p.recipient, amountOut);
        } else {
            uint256 before = IERC20(p.tokenOut).balanceOf(p.recipient);
            _deliver(p.tokenOut, p.recipient, amountOut);
            amountOut = IERC20(p.tokenOut).balanceOf(p.recipient) - before;
            if (amountOut < p.minAmountOut) revert InsufficientOutput(amountOut, p.minAmountOut);
        }

        _emitSwap(p, received, amountOut, fee, mask);
    }

    function _emitSwap(SwapParams calldata p, uint256 received, uint256 amountOut, uint256 fee, uint8 mask) private {
        emit SherwoodSwap(
            msg.sender,
            p.referrer,
            p.tokenIn,
            p.tokenOut,
            received,
            amountOut,
            fee,
            p.recipient,
            mask,
            uint8(p.legs.length)
        );
    }

    /// @dev Splits `net` across the legs by weight (the last leg takes the rounding remainder) and sums outputs.
    function _routeLegs(SwapParams calldata p, uint256 net) private returns (uint256 amountOut, uint8 mask) {
        uint256 n = p.legs.length;
        uint256 assigned;
        uint256 totalWeight;
        for (uint256 i; i < n; ++i) {
            Leg calldata leg = p.legs[i];
            if (leg.weightBps == 0) revert InvalidLegs();
            totalWeight += leg.weightBps;
            uint256 legIn = i == n - 1 ? net - assigned : (net * leg.weightBps) / BPS;
            assigned += legIn;
            mask |= uint8(1 << uint8(leg.venue));
            amountOut += _runLeg(leg, p.tokenIn, p.tokenOut, legIn, p.deadline);
        }
        if (totalWeight != BPS) revert InvalidLegs();
    }

    /// @dev Pulls input (measuring actual receipt for fee-on-transfer tokens) and sends the fee to treasury.
    ///      Native ETH input stays native here; each leg wraps only what its venue needs.
    function _pullAndTakeFee(address tokenIn, uint256 amountIn)
        private
        returns (uint256 received, uint256 fee, uint256 net)
    {
        if (tokenIn == address(0)) {
            if (msg.value != amountIn) revert InvalidAmount();
            received = msg.value;
        } else {
            if (msg.value != 0) revert InvalidAmount();
            uint256 before = IERC20(tokenIn).balanceOf(address(this));
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
            received = IERC20(tokenIn).balanceOf(address(this)) - before;
        }

        fee = (received * feeBps) / BPS;
        net = received - fee;
        if (fee > 0) {
            if (tokenIn == address(0)) {
                (bool ok,) = treasury.call{value: fee}("");
                if (!ok) revert EthTransferFailed();
            } else {
                IERC20(tokenIn).safeTransfer(treasury, fee);
            }
        }
    }

    /// @dev Runs one leg and returns its output, normalised so native-ETH output counts WETH and ETH alike
    ///      (WETH is unwrapped in `_deliver`).
    function _runLeg(Leg calldata leg, address tokenIn, address tokenOut, uint256 amountIn, uint256 deadline)
        private
        returns (uint256 out)
    {
        if (amountIn == 0) revert InvalidAmount();
        if (leg.venue == Venue.UniswapV4) return _runV4(leg.data, tokenIn, tokenOut, amountIn);

        address workIn = _work(tokenIn);
        address workOut = _work(tokenOut);
        if (tokenIn == address(0)) IWETH(WETH).deposit{value: amountIn}();
        uint256 outBefore = IERC20(workOut).balanceOf(address(this));

        if (leg.venue == Venue.UniswapV2) {
            address[] memory path = abi.decode(leg.data, (address[]));
            if (path.length < 2 || path[0] != workIn || path[path.length - 1] != workOut) revert InvalidPath();
            IERC20(workIn).forceApprove(address(v2Router), amountIn);
            v2Router.swapExactTokensForTokensSupportingFeeOnTransferTokens(amountIn, 0, path, address(this), deadline);
            IERC20(workIn).forceApprove(address(v2Router), 0);
        } else {
            _checkV3Path(leg.data, workIn, workOut);
            IERC20(workIn).forceApprove(address(v3Router), amountIn);
            v3Router.exactInput(
                IV3SwapRouterLike.ExactInputParams({
                    path: leg.data,
                    recipient: address(this),
                    amountIn: amountIn,
                    amountOutMinimum: 0
                })
            );
            IERC20(workIn).forceApprove(address(v3Router), 0);
        }
        out = IERC20(workOut).balanceOf(address(this)) - outBefore;
    }

    // ─────────────────────────────── Uniswap V4 ──────────────────────────────

    function _runV4(bytes calldata data, address tokenIn, address tokenOut, uint256 amountIn)
        private
        returns (uint256 out)
    {
        V4Hop[] memory hops = abi.decode(data, (V4Hop[]));
        if (hops.length == 0) revert InvalidPath();

        // Where does the route start and end? ETH legs may use a native-ETH pool or a WETH pool.
        address startCur = _v4Start(hops[0].key, tokenIn);
        address endCur = _v4End(hops, startCur);
        if (tokenOut == address(0) ? (endCur != address(0) && endCur != WETH) : endCur != tokenOut) {
            revert InvalidPath();
        }
        if (tokenIn == address(0) && startCur == WETH) IWETH(WETH).deposit{value: amountIn}();

        uint256 outBefore = _balance(endCur);
        poolManager.unlock(abi.encode(hops, startCur, amountIn));
        out = _balance(endCur) - outBefore;
    }

    /// @notice Uniswap V4 callback — only the PoolManager can call it, and only while this router holds the lock.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (V4Hop[] memory hops, address cur, uint256 amountIn) = abi.decode(data, (V4Hop[], address, uint256));

        address startCur = cur;
        uint256 amt = amountIn;
        for (uint256 i; i < hops.length; ++i) {
            IPoolManagerLike.PoolKey memory key = hops[i].key;
            bool zeroForOne = cur == key.currency0;
            int256 delta = poolManager.swap(
                key,
                IPoolManagerLike.SwapParams({
                    zeroForOne: zeroForOne,
                    amountSpecified: -int256(amt),
                    sqrtPriceLimitX96: zeroForOne ? MIN_SQRT_PRICE + 1 : MAX_SQRT_PRICE - 1
                }),
                hops[i].hookData
            );
            int128 a0 = int128(delta >> 128);
            int128 a1 = int128(delta);
            // Exact input must be fully consumed on every hop (no partial fills / leftover credit).
            if (uint256(int256(-(zeroForOne ? a0 : a1))) != amt) revert PartialFill();
            int128 outDelta = zeroForOne ? a1 : a0;
            if (outDelta <= 0) revert NoOutput();
            amt = uint256(int256(outDelta));
            cur = zeroForOne ? key.currency1 : key.currency0;
        }

        // Pay what we owe in the input currency, then take the output.
        if (startCur == address(0)) {
            poolManager.sync(address(0)); // clear any currency a hook may have synced, or native settle would revert
            poolManager.settle{value: amountIn}();
        } else {
            poolManager.sync(startCur);
            IERC20(startCur).safeTransfer(address(poolManager), amountIn);
            poolManager.settle();
        }
        poolManager.take(cur, address(this), amt);
        return abi.encode(amt);
    }

    function _v4Start(IPoolManagerLike.PoolKey memory key, address tokenIn) private view returns (address s) {
        if (tokenIn == address(0)) {
            // native ETH in: prefer a native pool, else a WETH pool
            if (key.currency0 == address(0)) return address(0);
            if (key.currency0 == WETH || key.currency1 == WETH) return WETH;
            revert InvalidPath();
        }
        if (key.currency0 != tokenIn && key.currency1 != tokenIn) revert InvalidPath();
        return tokenIn;
    }

    function _v4End(V4Hop[] memory hops, address cur) private pure returns (address) {
        for (uint256 i; i < hops.length; ++i) {
            IPoolManagerLike.PoolKey memory k = hops[i].key;
            if (cur == k.currency0) cur = k.currency1;
            else if (cur == k.currency1) cur = k.currency0;
            else revert InvalidPath();
        }
        return cur;
    }

    // ─────────────────────────────── Delivery / helpers ──────────────────────

    /// @dev For native-ETH output, legs may have produced WETH and/or native ETH; unwrap all WETH first.
    function _deliver(address tokenOut, address recipient, uint256 amountOut) private {
        if (tokenOut == address(0)) {
            uint256 w = IERC20(WETH).balanceOf(address(this));
            if (w > 0) IWETH(WETH).withdraw(w);
            (bool ok,) = recipient.call{value: amountOut}("");
            if (!ok) revert EthTransferFailed();
        } else {
            IERC20(tokenOut).safeTransfer(recipient, amountOut);
        }
    }

    function _work(address token) private view returns (address) {
        return token == address(0) ? WETH : token;
    }

    function _balance(address cur) private view returns (uint256) {
        return cur == address(0) ? address(this).balance : IERC20(cur).balanceOf(address(this));
    }

    /// @dev V3 path = token(20) [fee(3) token(20)]+ → length = 20 + 23n, n >= 1
    function _checkV3Path(bytes calldata path, address workIn, address workOut) private pure {
        if (path.length < 43 || (path.length - 20) % 23 != 0) revert InvalidPath();
        address first = address(bytes20(path[0:20]));
        address last = address(bytes20(path[path.length - 20:]));
        if (first != workIn || last != workOut) revert InvalidPath();
    }

    /// @notice Fee the router would take on `amountIn` (for frontend quotes).
    function quoteFee(uint256 amountIn) external view returns (uint256 fee, uint256 netAmountIn) {
        fee = (amountIn * feeBps) / BPS;
        netAmountIn = amountIn - fee;
    }

    // ─────────────────────────────── Owner (bounded) ─────────────────────────

    function setFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    /// @notice Pausing only stops new swaps; the router never holds user funds between transactions.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Recover tokens/ETH sent here by mistake (the router holds nothing during normal operation).
    function rescue(address token, address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (token == address(0)) {
            (bool ok,) = to.call{value: address(this).balance}("");
            if (!ok) revert EthTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, IERC20(token).balanceOf(address(this)));
        }
    }
}
