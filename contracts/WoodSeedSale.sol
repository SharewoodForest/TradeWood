// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
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
    // Stablecoins the owner has approved, each treated as exactly $1 (6 to 18 decimals).
    // Anyone could deploy a worthless token, so the owner vets each one.
    address[] public acceptedTokens;
    mapping(address => bool) public isAccepted;
    mapping(address => uint8) public tokenDecimals;

    uint256 public constant MIN_CONTRIBUTION = 10 * 1e6;       // $10
    uint256 public constant MAX_CONTRIBUTION = 200 * 1e6;      // $200
    uint256 public constant HARD_CAP = 7500 * 1e6;             // $7,500 total raise
    uint256 public constant USDC_PER_WOOD_RATE = 7500;         // $0.0075 rate

    uint256 public totalRaised;
    uint256 public totalTokensAllocated;
    uint256 public totalTokensClaimed;
    bool public saleFinalized;
    uint256 public unlockedBps; // 10000 = 100%, 2500 = 25%

    struct Participant {
        uint256 totalContributed;
        uint256 totalAllocated;
        uint256 totalClaimed;
    }

    mapping(address => Participant) public participants;

    event TokenAccepted(address indexed token, bool accepted);
    event TokensPurchased(address indexed buyer, address indexed token, uint256 paymentAmount, uint256 woodAmount);
    event SaleFinalized(uint256 totalRaised, uint256 totalTokens);
    event MilestoneUnlocked(uint256 newUnlockedBps);
    event TokensClaimed(address indexed participant, uint256 amount);
    event UnsoldRecovered(address indexed to, uint256 amount);

    constructor(
        address _woodToken,
        address[] memory _paymentTokens,
        address _initialOwner
    ) Ownable(_initialOwner) {
        require(_paymentTokens.length > 0, "No payment tokens");
        woodToken = IERC20(_woodToken);
        for (uint256 i = 0; i < _paymentTokens.length; i++) _accept(_paymentTokens[i]);
    }

    function _accept(address t) internal {
        require(t != address(0) && tokenDecimals[t] == 0, "Bad payment token");
        uint8 d = IERC20Metadata(t).decimals();
        require(d >= 6 && d <= 18, "Unsupported decimals");
        tokenDecimals[t] = d;
        isAccepted[t] = true;
        acceptedTokens.push(t);
        emit TokenAccepted(t, true);
    }

    /// @notice Owner adds another stablecoin (e.g. a bridged one) while the sale is open.
    function addAcceptedToken(address t) external onlyOwner {
        require(!saleFinalized, "Sale has closed");
        _accept(t);
    }

    /// @notice Owner can pause a token (for example if it depegs). Already-paid funds are unaffected.
    function setTokenAccepted(address t, bool accepted) external onlyOwner {
        require(tokenDecimals[t] != 0, "Unknown token");
        isAccepted[t] = accepted;
        emit TokenAccepted(t, accepted);
    }

    function acceptedTokensLength() external view returns (uint256) {
        return acceptedTokens.length;
    }

    /// @param usdcAmount the dollar amount with 6 decimals ($50 = 50_000000), whatever the token's own decimals
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

        uint256 pull = usdcAmount * (10 ** (tokenDecimals[token] - 6));
        IERC20 t = IERC20(token);
        uint256 before = t.balanceOf(address(this));
        t.safeTransferFrom(msg.sender, address(this), pull);
        require(t.balanceOf(address(this)) - before == pull, "Fee-on-transfer token");

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

    /// @notice After the sale closes, send WOOD nobody bought to `to`. Backers' unclaimed allocations stay locked in.
    function recoverUnsoldWood(address to) external onlyOwner {
        require(saleFinalized, "Sale must be finalized first");
        require(to != address(0), "Zero address");
        uint256 owed = totalTokensAllocated - totalTokensClaimed;
        uint256 bal = woodToken.balanceOf(address(this));
        require(bal > owed, "Nothing to recover");
        uint256 amount = bal - owed;
        woodToken.safeTransfer(to, amount);
        emit UnsoldRecovered(to, amount);
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
        totalTokensClaimed += claimable;
        woodToken.safeTransfer(msg.sender, claimable);

        emit TokensClaimed(msg.sender, claimable);
    }
}
