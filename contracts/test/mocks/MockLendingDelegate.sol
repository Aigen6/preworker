// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../src/interfaces/ILendingDelegate.sol";

/**
 * @title MockLendingDelegate
 * @dev 模拟 ILendingDelegate 适配器，用于测试
 */
contract MockLendingDelegate is ILendingDelegate {
    // token => yieldToken 映射
    mapping(address => address) public yieldTokens;
    
    function setYieldToken(address token, address yieldToken) external {
        yieldTokens[token] = yieldToken;
    }
    
    function supply(
        address tokenAddress,
        string calldata,
        uint256 amount,
        address onBehalfOf,
        address lendingTarget,
        address yieldTokenHint
    ) external override returns (uint256 shares) {
        // 注意: 这个函数通过 delegatecall 调用，所以 address(this) 是 DepositVault
        // DepositVault 已经批准了 lendingTarget，所以直接转 underlying 给 lendingTarget
        IERC20(tokenAddress).transfer(lendingTarget, amount);
        
        // 从 lendingTarget 转 yield token 到 onBehalfOf（1:1）
        // 使用 yieldTokenHint，因为 delegatecall 无法访问 MockLendingDelegate 的存储
        IERC20(yieldTokenHint).transferFrom(lendingTarget, onBehalfOf, amount);
        
        return amount;
    }
    
    function withdraw(
        address tokenAddress,
        string calldata,
        uint256 amount,
        address lendingTarget,
        address
    ) external override returns (uint256 actualAmount) {
        address yieldToken = yieldTokens[tokenAddress];
        
        // 从调用者转入 yield token
        IERC20(yieldToken).transferFrom(address(this), lendingTarget, amount);
        
        // 转出 underlying token
        IERC20(tokenAddress).transferFrom(lendingTarget, address(this), amount);
        
        return amount;
    }
    
    function getYieldTokenAddress(
        address tokenAddress,
        string calldata,
        address
    ) external view override returns (address yieldToken) {
        return yieldTokens[tokenAddress];
    }
    
    function getTotalValue(
        address,
        string calldata,
        address,
        address
    ) external pure override returns (uint256) {
        return 0;
    }
    
    function getApr(
        address,
        string calldata,
        address
    ) external pure override returns (uint256) {
        return 500; // 5%
    }
    
    function estimateRedeemAmount(
        address,
        string calldata,
        uint256 yieldTokenAmount,
        address
    ) external pure override returns (uint256) {
        return yieldTokenAmount; // 1:1
    }
    
    function estimateYieldTokenNeeded(
        address,
        string calldata,
        uint256 underlyingAmount,
        address
    ) external pure override returns (uint256) {
        return underlyingAmount; // 1:1
    }
    
    function getRedeemableAmount(
        address,
        string calldata,
        address,
        address
    ) external pure override returns (uint256) {
        return 0;
    }
}
