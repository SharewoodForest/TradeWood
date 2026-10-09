// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Test helper: a treasury that refuses ETH, to prove swap-back failures never block user trades.
contract RejectEth {
    receive() external payable {
        revert("no ETH");
    }
}
