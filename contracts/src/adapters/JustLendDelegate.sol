// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/ILendingDelegate.sol";

/**
 * @title IJToken
 * @dev JustLend jToken interface (similar to Compound's CToken)
 */
interface IJToken {
    function mint(uint256 mintAmount) external returns (uint256);
    function redeem(uint256 redeemTokens) external returns (uint256);
    function redeemUnderlying(uint256 redeemAmount) external returns (uint256);
    function balanceOf(address owner) external view returns (uint256);
    function balanceOfUnderlying(address owner) external returns (uint256);
    function exchangeRateCurrent() external returns (uint256);
    function exchangeRateStored() external view returns (uint256);
    function underlying() external view returns (address);
    function supplyRatePerBlock() external view returns (uint256);
    function accrueInterest() external returns (uint256);
}

/**
 * @title JustLendDelegate
 * @dev Stateless delegate module for DepositVault to use via delegatecall
 * @dev All operations execute in DepositVault's context, no storage variables
 * @notice This adapter works with JustLend protocol on TRON network
 */
contract JustLendDelegate is ILendingDelegate {
    using SafeERC20 for IERC20;

    uint256 internal constant EXCHANGE_RATE_SCALE = 1e18;
    uint256 internal constant BLOCKS_PER_YEAR = 15768000; // Tron: ~2 seconds per block
    uint256 internal constant MANTISSA = 1e18;

    // ============ Errors ============

    error InvalidAmount();
    error InvalidOnBehalfOf();
    error InvalidTokenKey();
    error UnknownJToken();
    error MintFailed(uint256 errorCode);
    error RedeemFailed(uint256 errorCode);
    error InsufficientBalance();

    // ============ Delegatecall Functions ============

    /**
     * @dev Execute JustLend mint via delegatecall
     * @param tokenAddress Underlying token address
     * @param tokenKey Token key (unused)
     * @param amount Amount to supply
     * @param onBehalfOf jToken receiver (must be DepositVault)
     * @param lendingTarget jToken address
     * @param yieldTokenHint Optional override for jToken address
     * @return shares Minted jToken amount
     */
    function supply(
        address tokenAddress,
        string calldata tokenKey,
        uint256 amount,
        address onBehalfOf,
        address lendingTarget,
        address yieldTokenHint
    ) external override returns (uint256 shares) {
        if (amount == 0) revert InvalidAmount();
        if (onBehalfOf == address(0)) revert InvalidOnBehalfOf();
        if (tokenAddress == address(0)) revert InvalidTokenKey();
        
        address jToken = yieldTokenHint == address(0) ? lendingTarget : yieldTokenHint;
        if (jToken == address(0)) revert UnknownJToken();

        // Note: onBehalfOf should be address(this) = DepositVault for delegatecall context
        if (onBehalfOf != address(this)) revert InvalidOnBehalfOf();

        // Get balance before mint
        uint256 beforeBal = IJToken(jToken).balanceOf(address(this));

        // Call JustLend mint (executes in DepositVault's context)
        uint256 errorCode = IJToken(jToken).mint(amount);
        if (errorCode != 0) revert MintFailed(errorCode);

        // Get balance after mint
        uint256 afterBal = IJToken(jToken).balanceOf(address(this));
        shares = afterBal - beforeBal;

        return shares;
    }

    /**
     * @dev Execute JustLend redeem via delegatecall
     * @param tokenAddress Underlying token address
     * @param tokenKey Token key (unused)
     * @param amount Amount of underlying token to withdraw (0 or max = withdraw all, NOT jToken amount)
     * @param lendingTarget jToken address
     * @param yieldTokenHint Optional override for jToken address
     * @return actualAmount Actual withdrawn underlying token amount
     */
    function withdraw(
        address tokenAddress,
        string calldata tokenKey,
        uint256 amount,
        address lendingTarget,
        address yieldTokenHint
    ) external override returns (uint256 actualAmount) {
        if (tokenAddress == address(0)) revert InvalidTokenKey();
        
        address jToken = yieldTokenHint == address(0) ? lendingTarget : yieldTokenHint;
        if (jToken == address(0)) revert UnknownJToken();

        // Get underlying token balance before withdraw
        uint256 beforeBal = IERC20(tokenAddress).balanceOf(address(this));

        uint256 errorCode;
        if (amount == 0 || amount == type(uint256).max) {
            // Withdraw all: redeem all jTokens
            uint256 jTokenBalance = IJToken(jToken).balanceOf(address(this));
            if (jTokenBalance == 0) revert InsufficientBalance();
            errorCode = IJToken(jToken).redeem(jTokenBalance);
        } else {
            // Withdraw specific amount: use redeemUnderlying
            errorCode = IJToken(jToken).redeemUnderlying(amount);
        }

        if (errorCode != 0) revert RedeemFailed(errorCode);

        // Get underlying token balance after withdraw
        uint256 afterBal = IERC20(tokenAddress).balanceOf(address(this));
        actualAmount = afterBal - beforeBal;

        return actualAmount;
    }

    // ============ View Functions ============

    /**
     * @dev Resolve yield token address for the configured lending target
     * @param tokenAddress Underlying token address (unused, kept for interface consistency)
     * @param tokenKey Token key (unused)
     * @param lendingTarget jToken address
     * @return yieldToken Yield-bearing token address (jToken)
     */
    function getYieldTokenAddress(
        address tokenAddress,
        string calldata tokenKey,
        address lendingTarget
    ) external pure override returns (address yieldToken) {
        tokenAddress; // unused
        tokenKey; // unused
        return lendingTarget; // For JustLend, lendingTarget IS the jToken address
    }

    function getTotalValue(
        address tokenAddress,
        string calldata tokenKey,
        address account,
        address lendingTarget
    ) external view override returns (uint256 totalValue) {
        tokenAddress; // unused
        tokenKey; // Parameter kept for interface consistency
        if (lendingTarget == address(0)) return 0;
        if (account == address(0)) return 0;

        // Get jToken balance
        uint256 jTokenBalance = IJToken(lendingTarget).balanceOf(account);
        if (jTokenBalance == 0) return 0;

        // Convert to underlying using exchange rate
        uint256 exchangeRate = IJToken(lendingTarget).exchangeRateStored();
        totalValue = (jTokenBalance * exchangeRate) / EXCHANGE_RATE_SCALE;

        return totalValue;
    }

    function getApr(
        address tokenAddress,
        string calldata tokenKey,
        address lendingTarget
    ) external view override returns (uint256 apr) {
        tokenAddress; // unused
        tokenKey; // Parameter kept for interface consistency
        if (lendingTarget == address(0)) return 0;

        try IJToken(lendingTarget).supplyRatePerBlock() returns (uint256 ratePerBlock) {
            // APR = supplyRatePerBlock * blocksPerYear * 10000 / 1e18
            apr = (ratePerBlock * BLOCKS_PER_YEAR * 10000) / MANTISSA;
            return apr;
        } catch {
            return 0;
        }
    }

    function estimateRedeemAmount(
        address tokenAddress,
        string calldata tokenKey,
        uint256 jTokenAmount,
        address lendingTarget
    ) external view override returns (uint256 underlyingAmount) {
        tokenAddress; // unused
        tokenKey; // Parameter kept for interface consistency
        if (jTokenAmount == 0) return 0;
        if (lendingTarget == address(0)) return 0;

        // Get exchange rate
        uint256 exchangeRate = IJToken(lendingTarget).exchangeRateStored();
        if (exchangeRate == 0) return 0;

        // Calculate underlying amount: jTokenAmount * exchangeRate / 1e18
        underlyingAmount = (jTokenAmount * exchangeRate) / EXCHANGE_RATE_SCALE;

        return underlyingAmount;
    }

    function estimateYieldTokenNeeded(
        address tokenAddress,
        string calldata tokenKey,
        uint256 underlyingAmount,
        address lendingTarget
    ) external view override returns (uint256 jTokenAmount) {
        tokenAddress; // unused
        tokenKey; // Parameter kept for interface consistency
        if (underlyingAmount == 0) return 0;
        if (lendingTarget == address(0)) return 0;

        // Get exchange rate
        uint256 exchangeRate = IJToken(lendingTarget).exchangeRateStored();
        if (exchangeRate == 0) return 0;

        // Calculate jToken amount needed: underlyingAmount * 1e18 / exchangeRate
        // Round up to ensure sufficient jTokens
        jTokenAmount = (underlyingAmount * EXCHANGE_RATE_SCALE + exchangeRate - 1) / exchangeRate;

        return jTokenAmount;
    }

    function getRedeemableAmount(
        address tokenAddress,
        string calldata tokenKey,
        address account,
        address lendingTarget
    ) external view override returns (uint256 redeemableAmount) {
        tokenAddress; // unused
        tokenKey; // Parameter kept for interface consistency
        if (account == address(0)) return 0;
        if (lendingTarget == address(0)) return 0;

        // Get jToken balance and convert to underlying
        uint256 jTokenBalance = IJToken(lendingTarget).balanceOf(account);
        if (jTokenBalance == 0) return 0;

        uint256 exchangeRate = IJToken(lendingTarget).exchangeRateStored();
        redeemableAmount = (jTokenBalance * exchangeRate) / EXCHANGE_RATE_SCALE;

        return redeemableAmount;
    }
}
