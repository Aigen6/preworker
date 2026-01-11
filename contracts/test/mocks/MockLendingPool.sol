// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockLendingPool
 * @dev 模拟借贷池，用于测试
 */
contract MockLendingPool {
    IERC20 public underlyingToken;
    IERC20 public yieldToken;
    
    constructor(address _underlyingToken, address _yieldToken) {
        underlyingToken = IERC20(_underlyingToken);
        yieldToken = IERC20(_yieldToken);
    }
    
    /**
     * @dev 模拟存入操作
     * @notice 当存入 underlying token 时，按 1:1 比例铸造 yield token
     */
    function supply(address token, uint256 amount, address onBehalfOf, uint16) external {
        require(token == address(underlyingToken), "Invalid token");
        require(amount > 0, "Invalid amount");
        
        // 接收 underlying token
        underlyingToken.transferFrom(msg.sender, address(this), amount);
        
        // 铸造 yield token 给 onBehalfOf（1:1 比例）
        ERC20(address(yieldToken)).transfer(onBehalfOf, amount);
    }
    
    /**
     * @dev 模拟提取操作
     */
    function withdraw(address token, uint256 amount, address to) external returns (uint256) {
        require(token == address(underlyingToken), "Invalid token");
        
        // 销毁 yield token
        yieldToken.transferFrom(msg.sender, address(this), amount);
        
        // 返回 underlying token
        underlyingToken.transfer(to, amount);
        
        return amount;
    }
}
