// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test, console } from "forge-std/Test.sol";
import { DepositVault } from "../src/DepositVault.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockLendingPool } from "./mocks/MockLendingPool.sol";

contract DepositVaultTest is Test {
    DepositVault vault;
    MockERC20 token;
    MockERC20 yieldToken;
    MockLendingPool lendingPool;
    
    address owner = address(0x1);
    address alice = address(0x2);  // 地址A
    address bob = address(0x3);   // 地址B
    address configCore = address(0x4);
    
    function setUp() public {
        vm.startPrank(owner);
        
        // 部署测试代币
        token = new MockERC20("Test Token", "TEST", 18);
        yieldToken = new MockERC20("Yield Token", "YIELD", 18);
        
        // 部署模拟借贷池
        lendingPool = new MockLendingPool(address(token), address(yieldToken));
        
        // 部署 DepositVault
        vault = new DepositVault(
            address(lendingPool),
            address(0), // lendingDelegate (暂时不需要)
            configCore,
            owner
        );
        
        vm.stopPrank();
    }
    
    function test_Deposit_Success() public {
        uint256 amount = 1000e18;
        
        // Alice 准备代币
        token.mint(alice, amount);
        vm.prank(alice);
        token.approve(address(vault), amount);
        
        // Alice 存入
        vm.prank(alice);
        uint256 depositId = vault.deposit(address(token), amount, bob);
        
        // 验证存款记录
        (address tokenAddr, address yieldTokenAddr, uint256 yieldAmount,,, bool claimed, bool recovered) = 
            vault.getDeposit(alice, depositId);
        
        assertEq(tokenAddr, address(token));
        assertEq(yieldTokenAddr, address(yieldToken));
        assertGt(yieldAmount, 0);
        assertFalse(claimed);
        assertFalse(recovered);
    }
    
    function test_Claim_Success() public {
        uint256 amount = 1000e18;
        
        // Alice 存入
        token.mint(alice, amount);
        vm.prank(alice);
        token.approve(address(vault), amount);
        vm.prank(alice);
        uint256 depositId = vault.deposit(address(token), amount, bob);
        
        // 获取 yield token 数量
        (,, uint256 yieldAmount,,, bool claimedBefore,) = vault.getDeposit(alice, depositId);
        
        // Bob 领取
        uint256 bobBalanceBefore = yieldToken.balanceOf(bob);
        vm.prank(bob);
        vault.claim(alice, depositId);
        
        // 验证 Bob 收到了 yield token
        uint256 bobBalanceAfter = yieldToken.balanceOf(bob);
        assertEq(bobBalanceAfter - bobBalanceBefore, yieldAmount);
        
        // 验证状态
        (,,,,, bool claimedAfter, bool recovered) = vault.getDeposit(alice, depositId);
        assertTrue(claimedAfter);
        assertFalse(recovered);
    }
    
    function test_Recover_Success() public {
        uint256 amount = 1000e18;
        
        // Alice 存入
        token.mint(alice, amount);
        vm.prank(alice);
        token.approve(address(vault), amount);
        vm.prank(alice);
        uint256 depositId = vault.deposit(address(token), amount, bob);
        
        // 获取 yield token 数量
        (,, uint256 yieldAmount,,, bool claimedBefore,) = vault.getDeposit(alice, depositId);
        
        // 等待时间锁
        vm.warp(block.timestamp + 7 days + 1);
        
        // Alice 取回
        uint256 aliceBalanceBefore = yieldToken.balanceOf(alice);
        vm.prank(alice);
        vault.recover(depositId);
        
        // 验证 Alice 收到了 yield token
        uint256 aliceBalanceAfter = yieldToken.balanceOf(alice);
        assertEq(aliceBalanceAfter - aliceBalanceBefore, yieldAmount);
        
        // 验证状态
        (,,,,, bool claimedAfter, bool recoveredAfter) = vault.getDeposit(alice, depositId);
        assertFalse(claimedAfter);
        assertTrue(recoveredAfter);
    }
    
    function test_Recover_RevertIfTimeLockNotPassed() public {
        uint256 amount = 1000e18;
        
        // Alice 存入
        token.mint(alice, amount);
        vm.prank(alice);
        token.approve(address(vault), amount);
        vm.prank(alice);
        uint256 depositId = vault.deposit(address(token), amount, bob);
        
        // 尝试立即取回（应该失败）
        vm.prank(alice);
        vm.expectRevert(DepositVault.RecoveryNotAvailable.selector);
        vault.recover(depositId);
    }
    
    function test_Claim_RevertIfAlreadyClaimed() public {
        uint256 amount = 1000e18;
        
        // Alice 存入
        token.mint(alice, amount);
        vm.prank(alice);
        token.approve(address(vault), amount);
        vm.prank(alice);
        uint256 depositId = vault.deposit(address(token), amount, bob);
        
        // Bob 领取
        vm.prank(bob);
        vault.claim(alice, depositId);
        
        // 再次领取应该失败
        vm.prank(bob);
        vm.expectRevert(DepositVault.AlreadyClaimed.selector);
        vault.claim(alice, depositId);
    }
    
    function test_Claim_RevertIfWhitelistEnabled() public {
        uint256 amount = 1000e18;
        
        // 启用白名单
        vm.prank(owner);
        vault.setWhitelistEnabled(true);
        vm.prank(owner);
        vault.setValidRecipient(bob, true);
        
        // Alice 存入
        token.mint(alice, amount);
        vm.prank(alice);
        token.approve(address(vault), amount);
        vm.prank(alice);
        uint256 depositId = vault.deposit(address(token), amount, bob);
        
        // 未在白名单中的地址尝试领取应该失败
        address unauthorized = address(0x5);
        vm.prank(unauthorized);
        vm.expectRevert(DepositVault.RecipientNotWhitelisted.selector);
        vault.claim(alice, depositId);
        
        // Bob 在白名单中，可以领取
        vm.prank(bob);
        vault.claim(alice, depositId);
    }
}
