// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Test helper mimicking SwapRouter02.exactInput for single-hop paths: pays out tokenOut at a fixed rate
///      (rateBps / 10_000 of amountIn) from its own balance. Real V3 behavior is covered by the mainnet-fork test.
contract MockV3Router {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    uint256 public rateBps = 10_000;

    function setRate(uint256 r) external {
        rateBps = r;
    }

    function exactInput(ExactInputParams calldata p) external payable returns (uint256 out) {
        address tokenIn = address(bytes20(p.path[0:20]));
        address tokenOut = address(bytes20(p.path[p.path.length - 20:]));
        IERC20(tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        out = (p.amountIn * rateBps) / 10_000;
        require(out >= p.amountOutMinimum, "slippage");
        IERC20(tokenOut).transfer(p.recipient, out);
    }
}
