// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ILendingDelegate
 * @dev Common interface for protocol-specific lending delegates
 * @dev Delegates are stateless contracts executed via delegatecall from DepositVault
 */
interface ILendingDelegate {
    /**
     * @dev Supply underlying tokens to lending protocol
     * @param tokenAddress Underlying token address
     * @param tokenKey Token key (optional, can be empty string, for compatibility)
     * @param amount Amount of underlying tokens to supply
     * @param onBehalfOf Receiver of yield-bearing tokens (DepositVault address)
     * @param lendingTarget Protocol-specific target (e.g., pool or jToken)
     * @param yieldTokenHint Optional yield token address hint (pass zero to auto-resolve)
     * @return shares Amount of yield-bearing tokens minted
     */
    function supply(
        address tokenAddress,
        string calldata tokenKey,
        uint256 amount,
        address onBehalfOf,
        address lendingTarget,
        address yieldTokenHint
    ) external returns (uint256 shares);

    /**
     * @dev Withdraw underlying tokens from lending protocol
     * @param tokenAddress Underlying token address
     * @param tokenKey Token key (optional, can be empty string, for compatibility)
     * @param amount Amount of underlying to withdraw (type(uint256).max = withdraw all)
     * @param lendingTarget Protocol-specific target (e.g., pool or jToken)
     * @param yieldTokenHint Optional yield token address hint (pass zero to auto-resolve)
     * @return actualAmount Amount of underlying tokens withdrawn
     */
    function withdraw(
        address tokenAddress,
        string calldata tokenKey,
        uint256 amount,
        address lendingTarget,
        address yieldTokenHint
    ) external returns (uint256 actualAmount);

    /**
     * @dev Resolve the protocol's yield-bearing token for a treasury token
     * @param tokenAddress Underlying token address
     * @param tokenKey Token key (optional, can be empty string, for compatibility)
     * @param lendingTarget Protocol-specific target (e.g., pool or jToken)
     * @return yieldToken Yield-bearing token address
     */
    function getYieldTokenAddress(
        address tokenAddress,
        string calldata tokenKey,
        address lendingTarget
    ) external view returns (address yieldToken);

    /**
     * @dev Get total value in underlying terms for an account
     */
    function getTotalValue(
        address tokenAddress,
        string calldata tokenKey,
        address account,
        address lendingTarget
    ) external view returns (uint256 totalValue);

    /**
     * @dev Get APR in basis points for the token on the protocol
     */
    function getApr(
        address tokenAddress,
        string calldata tokenKey,
        address lendingTarget
    ) external view returns (uint256 apr);

    /**
     * @dev Estimate how much underlying will be received for redeeming a given yield token amount
     */
    function estimateRedeemAmount(
        address tokenAddress,
        string calldata tokenKey,
        uint256 yieldTokenAmount,
        address lendingTarget
    ) external view returns (uint256 underlyingAmount);

    /**
     * @dev Estimate how many yield tokens are needed to redeem a specified underlying amount
     */
    function estimateYieldTokenNeeded(
        address tokenAddress,
        string calldata tokenKey,
        uint256 underlyingAmount,
        address lendingTarget
    ) external view returns (uint256 yieldTokenAmount);

    /**
     * @dev Query redeemable amount of underlying for an account
     */
    function getRedeemableAmount(
        address tokenAddress,
        string calldata tokenKey,
        address account,
        address lendingTarget
    ) external view returns (uint256 redeemableAmount);
}
