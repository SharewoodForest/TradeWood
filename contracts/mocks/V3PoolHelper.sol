// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IUniswapV3PoolLike {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function mint(address recipient, int24 tickLower, int24 tickUpper, uint128 amount, bytes calldata data)
        external
        returns (uint256 amount0, uint256 amount1);
}

/// @dev TEST ONLY (fork tests): adds liquidity straight to a Uniswap V3 pool, paying exactly what the pool asks.
contract V3PoolHelper {
    function mint(address pool, int24 tickLower, int24 tickUpper, uint128 liquidity) external {
        IUniswapV3PoolLike(pool).mint(msg.sender, tickLower, tickUpper, liquidity, abi.encode(msg.sender));
    }

    function uniswapV3MintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata data) external {
        address payer = abi.decode(data, (address));
        IUniswapV3PoolLike pool = IUniswapV3PoolLike(msg.sender);
        if (amount0Owed > 0) IERC20(pool.token0()).transferFrom(payer, msg.sender, amount0Owed);
        if (amount1Owed > 0) IERC20(pool.token1()).transferFrom(payer, msg.sender, amount1Owed);
    }
}
