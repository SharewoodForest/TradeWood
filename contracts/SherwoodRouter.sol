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

/// @title Sherwood Router — TradeWood's multi-venue swap router
/// @notice Routes swaps through Uniswap V2 or V3 on Robinhood Chain and takes a small protocol fee on the input.
/// @dev The best route is chosen off-chain (frontend quotes V2 + V3 and picks the best output). This contract
///      enforces the user's minimum output *after* the fee, handles ETH wrapping, and is safe for fee-on-transfer
///      tokens like $WOOD (amounts are measured by balance deltas). It holds no funds between transactions.
contract SherwoodRouter is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Venue {
        UniswapV2,
        UniswapV3
    }

    struct SwapParams {
        Venue venue;
        address tokenIn; // address(0) = native ETH
        address tokenOut; // address(0) = native ETH
        uint256 amountIn;
        uint256 minAmountOut; // what the user must receive, net of the protocol fee
        address[] v2Path; // V2 only: must start with tokenIn (WETH for ETH) and end with tokenOut (WETH for ETH)
        bytes v3Path; // V3 only: abi.encodePacked(token, uint24 fee, token, ...)
        address recipient;
        uint256 deadline;
        address referrer; // Merry Men referral attribution (recorded in the event)
    }

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_FEE_BPS = 30; // hard cap 0.30%

    address public immutable WETH;
    IUniswapV2RouterLike public immutable v2Router;
    IV3SwapRouterLike public immutable v3Router;

    address public treasury;
    uint256 public feeBps = 10; // 0.10%

    event SherwoodSwap(
        address indexed user,
        address indexed referrer,
        Venue venue,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 feeAmount,
        address recipient
    );
    event FeeUpdated(uint256 feeBps);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);

    error ZeroAddress();
    error Expired();
    error InvalidAmount();
    error InvalidPath();
    error InsufficientOutput(uint256 amountOut, uint256 minAmountOut);
    error FeeTooHigh();
    error EthTransferFailed();
    error SameToken();

    constructor(address weth_, address v2Router_, address v3Router_, address treasury_, address owner_)
        Ownable(owner_)
    {
        if (weth_ == address(0) || v2Router_ == address(0) || v3Router_ == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        WETH = weth_;
        v2Router = IUniswapV2RouterLike(v2Router_);
        v3Router = IV3SwapRouterLike(v3Router_);
        treasury = treasury_;
    }

    /// @dev Accept ETH only from WETH unwraps.
    receive() external payable {
        if (msg.sender != WETH) revert EthTransferFailed();
    }

    // ─────────────────────────────── Swap ────────────────────────────────────

    function swap(SwapParams calldata p) external payable nonReentrant whenNotPaused returns (uint256 amountOut) {
        if (block.timestamp > p.deadline) revert Expired();
        if (p.recipient == address(0)) revert ZeroAddress();
        if (p.amountIn == 0) revert InvalidAmount();
        if (p.tokenIn == p.tokenOut) revert SameToken();

        address workIn = p.tokenIn == address(0) ? WETH : p.tokenIn;
        address workOut = p.tokenOut == address(0) ? WETH : p.tokenOut;
        if (workIn == workOut) revert SameToken();

        (uint256 received, uint256 fee, uint256 net) = _pullAndTakeFee(p.tokenIn, p.amountIn);
        amountOut = _route(p, workIn, workOut, net);

        if (amountOut < p.minAmountOut) revert InsufficientOutput(amountOut, p.minAmountOut);
        _deliver(p.tokenOut, workOut, p.recipient, amountOut);

        emit SherwoodSwap(msg.sender, p.referrer, p.venue, p.tokenIn, p.tokenOut, received, amountOut, fee, p.recipient);
    }

    /// @dev Pulls input (measuring actual receipt for fee-on-transfer tokens), sends the fee to treasury,
    ///      wraps ETH. Returns gross received, fee, and net amount to route.
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
        if (tokenIn == address(0)) {
            if (fee > 0) {
                (bool ok,) = treasury.call{value: fee}("");
                if (!ok) revert EthTransferFailed();
            }
            IWETH(WETH).deposit{value: net}();
        } else if (fee > 0) {
            IERC20(tokenIn).safeTransfer(treasury, fee);
        }
    }

    /// @dev Routes `net` of workIn through the chosen venue; output lands here and is measured by balance delta.
    function _route(SwapParams calldata p, address workIn, address workOut, uint256 net)
        private
        returns (uint256 amountOut)
    {
        uint256 outBefore = IERC20(workOut).balanceOf(address(this));
        if (p.venue == Venue.UniswapV2) {
            _checkV2Path(p.v2Path, workIn, workOut);
            IERC20(workIn).forceApprove(address(v2Router), net);
            v2Router.swapExactTokensForTokensSupportingFeeOnTransferTokens(net, 0, p.v2Path, address(this), p.deadline);
            IERC20(workIn).forceApprove(address(v2Router), 0);
        } else {
            _checkV3Path(p.v3Path, workIn, workOut);
            IERC20(workIn).forceApprove(address(v3Router), net);
            v3Router.exactInput(
                IV3SwapRouterLike.ExactInputParams({
                    path: p.v3Path,
                    recipient: address(this),
                    amountIn: net,
                    amountOutMinimum: 0
                })
            );
            IERC20(workIn).forceApprove(address(v3Router), 0);
        }
        amountOut = IERC20(workOut).balanceOf(address(this)) - outBefore;
    }

    function _deliver(address tokenOut, address workOut, address recipient, uint256 amountOut) private {
        if (tokenOut == address(0)) {
            IWETH(WETH).withdraw(amountOut);
            (bool ok,) = recipient.call{value: amountOut}("");
            if (!ok) revert EthTransferFailed();
        } else {
            IERC20(workOut).safeTransfer(recipient, amountOut);
        }
    }

    /// @notice Fee the router would take on `amountIn` (for frontend quotes).
    function quoteFee(uint256 amountIn) external view returns (uint256 fee, uint256 netAmountIn) {
        fee = (amountIn * feeBps) / BPS;
        netAmountIn = amountIn - fee;
    }

    // ─────────────────────────────── Path checks ─────────────────────────────

    function _checkV2Path(address[] calldata path, address workIn, address workOut) private pure {
        if (path.length < 2 || path[0] != workIn || path[path.length - 1] != workOut) revert InvalidPath();
    }

    /// @dev V3 path = token(20) [fee(3) token(20)]+ → length = 20 + 23n, n >= 1
    function _checkV3Path(bytes calldata path, address workIn, address workOut) private pure {
        if (path.length < 43 || (path.length - 20) % 23 != 0) revert InvalidPath();
        address first = address(bytes20(path[0:20]));
        address last = address(bytes20(path[path.length - 20:]));
        if (first != workIn || last != workOut) revert InvalidPath();
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
