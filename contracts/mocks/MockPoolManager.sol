// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IUnlockCallback {
    function unlockCallback(bytes calldata data) external returns (bytes memory);
}

/// @dev Test double for the Uniswap V4 PoolManager's flash-accounting flow: unlock → callback → swap/sync/settle/take,
///      and every currency delta must net to zero before unlock returns (like the real CurrencyNotSettled check).
///      Pools price at a fixed rate: amount1 = amount0 * price1e18 / 1e18. Real V4 behaviour is covered by the fork test.
contract MockPoolManager {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct SwapParams {
        bool zeroForOne;
        int256 amountSpecified;
        uint160 sqrtPriceLimitX96;
    }

    mapping(bytes32 => uint256) public price1e18; // keyed by keccak(currency0, currency1)
    mapping(address => int256) public delta; // + = owed to caller, - = caller owes
    address[] private touched;
    bool private unlocked;
    address private synced;
    uint256 private syncedBalance;
    /// @dev when > 0, swaps only consume this much input (simulates a partial fill / price-limit hit)
    uint256 public maxIn;

    function setPrice(address c0, address c1, uint256 p) external {
        price1e18[keccak256(abi.encode(c0, c1))] = p;
    }

    function setMaxIn(uint256 m) external {
        maxIn = m;
    }

    receive() external payable {}

    function unlock(bytes calldata data) external returns (bytes memory result) {
        require(!unlocked, "locked");
        unlocked = true;
        result = IUnlockCallback(msg.sender).unlockCallback(data);
        for (uint256 i; i < touched.length; ++i) {
            require(delta[touched[i]] == 0, "CurrencyNotSettled");
        }
        delete touched;
        unlocked = false;
    }

    function swap(PoolKey memory key, SwapParams memory params, bytes calldata) external returns (int256) {
        require(unlocked, "not unlocked");
        require(params.amountSpecified < 0, "exact-in only");
        uint256 p = price1e18[keccak256(abi.encode(key.currency0, key.currency1))];
        require(p > 0, "no pool");
        uint256 amountIn = uint256(-params.amountSpecified);
        if (maxIn > 0 && amountIn > maxIn) amountIn = maxIn;
        int128 a0;
        int128 a1;
        if (params.zeroForOne) {
            a0 = -int128(int256(amountIn));
            a1 = int128(int256((amountIn * p) / 1e18));
        } else {
            a1 = -int128(int256(amountIn));
            a0 = int128(int256((amountIn * 1e18) / p));
        }
        _account(key.currency0, a0);
        _account(key.currency1, a1);
        return (int256(a0) << 128) | int256(uint256(uint128(a1)));
    }

    function sync(address currency) external {
        synced = currency;
        syncedBalance = currency == address(0) ? 0 : IERC20(currency).balanceOf(address(this));
    }

    function settle() external payable returns (uint256 paid) {
        if (synced == address(0)) {
            paid = msg.value;
            _account(address(0), int128(int256(paid)));
        } else {
            require(msg.value == 0, "NonzeroNativeValue"); // like v4-core: native value with a token synced reverts
            paid = IERC20(synced).balanceOf(address(this)) - syncedBalance;
            _account(synced, int128(int256(paid)));
            synced = address(0);
        }
    }

    function take(address currency, address to, uint256 amount) external {
        _account(currency, -int128(int256(amount)));
        if (currency == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "eth");
        } else {
            IERC20(currency).transfer(to, amount);
        }
    }

    function _account(address c, int128 d) private {
        if (d == 0) return;
        delta[c] += d;
        touched.push(c);
    }
}
