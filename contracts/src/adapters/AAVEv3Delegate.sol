// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/ILendingDelegate.sol";

// Custom errors for gas optimization
error InvalidAmount();
error InvalidOnBehalfOf();
error InvalidPool();
error InvalidToken();
error UnknownAToken();
error SupplyFailed();
error WithdrawFailed();

/**
 * @title IAAVEv3Pool
 * @dev Aave V3 Pool interface
 */
interface IAAVEv3Pool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
    function getReserveData(address asset)
        external
        view
        returns (
            uint256 configuration,
            uint128 liquidityIndex,
            uint128 currentLiquidityRate,
            uint128 variableBorrowIndex,
            uint128 currentVariableBorrowRate,
            uint128 currentStableBorrowRate,
            uint40 lastUpdateTimestamp,
            uint16 id,
            address aTokenAddress,
            address stableDebtTokenAddress,
            address variableDebtTokenAddress,
            address interestRateStrategyAddress,
            uint128 accruedToTreasury,
            uint128 unbacked,
            uint128 isolationModeTotalDebt
        );
}

/**
 * @title IAToken
 * @dev Aave V3 aToken interface
 */
interface IAToken {
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title AAVEv3Delegate
 * @dev Stateless delegate module for DepositVault to use via delegatecall
 * @dev All operations execute in DepositVault's context, no storage variables
 * @notice This adapter works with AAVE V3 protocol on multiple chains
 * @notice Note: This adapter requires the underlying token address to be passed via yieldTokenHint
 *         or retrieved from the caller's context. DepositVault should call getATokenAddress() first.
 */
contract AAVEv3Delegate is ILendingDelegate {
    uint16 internal constant REFERRAL_CODE = 0;

    // ============ Delegatecall Functions ============

    /**
     * @dev Execute Aave V3 supply via delegatecall
     * @param tokenAddress Underlying token address
     * @param tokenKey Token key (unused, kept for interface compatibility)
     * @param amount Amount to supply
     * @param onBehalfOf aToken receiver (must be DepositVault)
     * @param lendingTarget Aave V3 Pool address
     * @param yieldTokenHint aToken address (required - DepositVault should get it first via getATokenAddress)
     * @return shares Minted aToken amount
     * @notice The underlying token must already be approved to lendingTarget by the caller
     */
    function supply(
        address tokenAddress,
        string calldata tokenKey,
        uint256 amount,
        address onBehalfOf,
        address lendingTarget,
        address yieldTokenHint
    ) external override returns (uint256 shares) {
        tokenKey; // unused, kept for interface compatibility
        if (amount == 0) revert InvalidAmount();
        if (onBehalfOf == address(0)) revert InvalidOnBehalfOf();
        if (lendingTarget == address(0)) revert InvalidPool();
        if (tokenAddress == address(0)) revert InvalidToken();
        
        // aToken address must be provided via yieldTokenHint
        address aToken = yieldTokenHint;
        if (aToken == address(0)) revert UnknownAToken();

        uint256 beforeBal = IAToken(aToken).balanceOf(onBehalfOf);

        // Call Aave V3 supply (executes in DepositVault's context)
        IAAVEv3Pool(lendingTarget).supply(tokenAddress, amount, onBehalfOf, REFERRAL_CODE);

        uint256 afterBal = IAToken(aToken).balanceOf(onBehalfOf);
        shares = afterBal - beforeBal;
        if (shares == 0) revert SupplyFailed();
        
        return shares;
    }

    /**
     * @dev Execute Aave V3 withdraw via delegatecall
     * @param tokenAddress Underlying token address
     * @param tokenKey Token key (unused)
     * @param amount Amount to withdraw (must be > 0, in underlying token amount)
     * @param lendingTarget Aave V3 Pool address
     * @param yieldTokenHint aToken address (required)
     * @return actualAmount Actual withdrawn amount
     */
    function withdraw(
        address tokenAddress,
        string calldata tokenKey,
        uint256 amount,
        address lendingTarget,
        address yieldTokenHint
    ) external override returns (uint256 actualAmount) {
        tokenKey; // unused, kept for interface compatibility
        if (lendingTarget == address(0)) revert InvalidPool();
        if (amount == 0) revert InvalidAmount();
        if (tokenAddress == address(0)) revert InvalidToken();
        
        address aToken = yieldTokenHint;
        if (aToken == address(0)) revert UnknownAToken();
        
        // Call Aave V3 withdraw (to = address(this) = DepositVault)
        actualAmount = IAAVEv3Pool(lendingTarget).withdraw(tokenAddress, amount, address(this));
        
        if (actualAmount == 0) revert WithdrawFailed();
        
        return actualAmount;
    }

    // ============ Helper Functions (called directly, not via delegatecall) ============

    /**
     * @dev Get aToken address from AAVE Pool using token address
     * @param tokenAddress Underlying token address
     * @param poolAddress Aave V3 Pool address
     * @return aToken aToken address
     * @notice This function should be called directly (not via delegatecall) by DepositVault
     */
    function getATokenAddress(address tokenAddress, address poolAddress)
        public
        view
        returns (address aToken)
    {
        if (poolAddress == address(0)) return address(0);
        if (tokenAddress == address(0)) return address(0);

        (,,,,,,,, aToken,,,,,,) = IAAVEv3Pool(poolAddress).getReserveData(tokenAddress);
        return aToken;
    }

    // ============ View Functions (ILendingDelegate interface) ============

    /**
     * @dev Get aToken address from AAVE Pool
     * @param tokenAddress Underlying token address
     * @param tokenKey Token key (unused)
     * @param lendingTarget Aave V3 Pool address
     * @return yieldToken aToken address
     */
    function getYieldTokenAddress(
        address tokenAddress,
        string calldata tokenKey,
        address lendingTarget
    ) external view override returns (address yieldToken) {
        tokenKey; // unused, kept for interface compatibility
        if (lendingTarget == address(0)) return address(0);
        if (tokenAddress == address(0)) return address(0);
        
        return getATokenAddress(tokenAddress, lendingTarget);
    }

    function getTotalValue(
        address tokenAddress,
        string calldata tokenKey,
        address account,
        address lendingTarget
    ) external view override returns (uint256 totalValue) {
        tokenKey; // unused, kept for interface compatibility
        if (lendingTarget == address(0)) return 0;
        if (account == address(0)) return 0;
        if (tokenAddress == address(0)) return 0;

        address aToken = getATokenAddress(tokenAddress, lendingTarget);
        if (aToken == address(0)) return 0;

        return IAToken(aToken).balanceOf(account);
    }

    function getApr(
        address tokenAddress,
        string calldata tokenKey,
        address lendingTarget
    ) external view override returns (uint256 apr) {
        tokenKey; // unused, kept for interface compatibility
        if (lendingTarget == address(0)) return 0;
        if (tokenAddress == address(0)) return 0;

        try IAAVEv3Pool(lendingTarget).getReserveData(tokenAddress) returns (
            uint256,
            uint128,
            uint128 currentLiquidityRate,
            uint128,
            uint128,
            uint128,
            uint40,
            uint16,
            address,
            address,
            address,
            address,
            uint128,
            uint128,
            uint128
        ) {
            // APR = (currentLiquidityRate * 10000) / 1e27 (convert to basis points)
            return (uint256(currentLiquidityRate) * 10_000) / 1e27;
        } catch {
            return 0;
        }
    }

    function estimateRedeemAmount(
        address tokenAddress,
        string calldata tokenKey,
        uint256 yieldTokenAmount,
        address lendingTarget
    ) external pure override returns (uint256 underlyingAmount) {
        tokenAddress; // unused, kept for interface compatibility
        tokenKey; // unused, kept for interface compatibility
        lendingTarget; // unused, kept for interface compatibility
        if (yieldTokenAmount == 0) return 0;
        // In AAVE V3, aToken.balanceOf is 1:1 with underlying amount
        return yieldTokenAmount;
    }

    function estimateYieldTokenNeeded(
        address tokenAddress,
        string calldata tokenKey,
        uint256 underlyingAmount,
        address lendingTarget
    ) external pure override returns (uint256 yieldTokenAmount) {
        tokenAddress; // unused, kept for interface compatibility
        tokenKey; // unused, kept for interface compatibility
        lendingTarget; // unused, kept for interface compatibility
        if (underlyingAmount == 0) return 0;
        // In AAVE V3, aToken amount equals underlying amount (1:1)
        return underlyingAmount;
    }

    function getRedeemableAmount(
        address tokenAddress,
        string calldata tokenKey,
        address account,
        address lendingTarget
    ) external view override returns (uint256 redeemableAmount) {
        tokenKey; // unused, kept for interface compatibility
        if (lendingTarget == address(0)) return 0;
        if (account == address(0)) return 0;
        if (tokenAddress == address(0)) return 0;

        address aToken = getATokenAddress(tokenAddress, lendingTarget);
        if (aToken == address(0)) return 0;

        return IAToken(aToken).balanceOf(account);
    }
}
