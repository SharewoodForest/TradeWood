// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title WoodSeedSale
 * @dev Seed sale contract for $WOOD on Robinhood Chain (ID 4663).
 * Enforces $10 min / $200 max per wallet and progressive milestone vesting.
 */
contract WoodSeedSale is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable woodToken;
    // Accepted stablecoins (all must be 6 decimals, treated as $1). Fixed at deploy.
    address[] public acceptedTokens;
    mapping(address => bool) public isAccepted;

    uint256 public constant MIN_CONTRIBUTION = 10 * 1e6;       // $10
    uint256 public constant MAX_CONTRIBUTION = 200 * 1e6;      // $200
    uint256 public constant HARD_CAP = 7500 * 1e6;             // $7,500 total raise
    uint256 public constant USDC_PER_WOOD_RATE = 7500;         // $0.0075 rate

    uint256 public totalRaised;
    uint256 public totalTokensAllocated;
    bool public saleFinalized;
    uint256 public unlockedBps; // 10000 = 100%, 2500 = 25%

    struct Participant {
        uint256 totalContributed;
        uint256 totalAllocated;
        uint256 totalClaimed;
    }

    mapping(address => Participant) public participants;

    event TokensPurchased(address indexed buyer, address indexed token, uint256 paymentAmount, uint256 woodAmount);
    event SaleFinalized(uint256 totalRaised, uint256 totalTokens);
    event MilestoneUnlocked(uint256 newUnlockedBps);
    event TokensClaimed(address indexed participant, uint256 amount);

    constructor(
        address _woodToken,
        address[] memory _paymentTokens,
        address _initialOwner
    ) Ownable(_initialOwner) {
        require(_paymentTokens.length > 0, "No payment tokens");
        woodToken = IERC20(_woodToken);
        for (uint256 i = 0; i < _paymentTokens.length; i++) {
            address t = _paymentTokens[i];
            require(t != address(0) && !isAccepted[t], "Bad payment token");
            isAccepted[t] = true;
            acceptedTokens.push(t);
        }
    }

    function acceptedTokensLength() external view returns (uint256) {
        return acceptedTokens.length;
    }

    function buyTokens(address token, uint256 usdcAmount) external nonReentrant {
        require(isAccepted[token], "Token not accepted");
        require(!saleFinalized, "Sale has closed");
        require(usdcAmount > 0, "Amount must be > 0");

        Participant storage p = participants[msg.sender];
        uint256 newTotal = p.totalContributed + usdcAmount;

        require(newTotal >= MIN_CONTRIBUTION, "Below $10 minimum");
        require(newTotal <= MAX_CONTRIBUTION, "Exceeds $200 maximum per wallet");
        require(totalRaised + usdcAmount <= HARD_CAP, "Hard cap exceeded");

        uint256 woodAmount = (usdcAmount * 1e18) / USDC_PER_WOOD_RATE;

        p.totalContributed = newTotal;
        p.totalAllocated += woodAmount;
        totalRaised += usdcAmount;
        totalTokensAllocated += woodAmount;

        IERC20(token).safeTransferFrom(msg.sender, address(this), usdcAmount);

        emit TokensPurchased(msg.sender, token, usdcAmount, woodAmount);
    }

    function finalizeSale(address treasury) external onlyOwner {
        require(!saleFinalized, "Already finalized");
        require(woodToken.balanceOf(address(this)) >= totalTokensAllocated, "Contract needs WOOD tokens");

        saleFinalized = true;

        for (uint256 i = 0; i < acceptedTokens.length; i++) {
            IERC20 t = IERC20(acceptedTokens[i]);
            uint256 balance = t.balanceOf(address(this));
            if (balance > 0) t.safeTransfer(treasury, balance);
        }

        emit SaleFinalized(totalRaised, totalTokensAllocated);
    }

    function setUnlockedBps(uint256 _bps) external onlyOwner {
        require(saleFinalized, "Sale must be finalized first");
        require(_bps >= unlockedBps, "Cannot reduce unlocked percentage");
        require(_bps <= 10000, "Cannot exceed 100%");

        unlockedBps = _bps;
        emit MilestoneUnlocked(_bps);
    }

    function getClaimableAmount(address user) public view returns (uint256) {
        if (!saleFinalized || unlockedBps == 0) return 0;

        Participant memory p = participants[user];
        uint256 totalUnlocked = (p.totalAllocated * unlockedBps) / 10000;

        if (totalUnlocked <= p.totalClaimed) return 0;
        return totalUnlocked - p.totalClaimed;
    }

    function claimTokens() external nonReentrant {
        require(saleFinalized, "Sale not finalized");
        uint256 claimable = getClaimableAmount(msg.sender);
        require(claimable > 0, "No tokens available to claim");

        participants[msg.sender].totalClaimed += claimable;
        woodToken.safeTransfer(msg.sender, claimable);

        emit TokensClaimed(msg.sender, claimable);
    }
}
