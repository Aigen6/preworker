// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test, console } from "forge-std/Test.sol";
import { DepositVault } from "../src/DepositVault.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { MockLendingDelegate } from "./mocks/MockLendingDelegate.sol";

contract DepositVaultTest is Test {
    DepositVault vault;
    MockERC20 token;
    MockERC20 yieldToken;
    MockLendingDelegate lendingDelegate;
    
    address owner = address(0x1);
    address alice = address(0x2);  // 存款人
    address bob = address(0x3);    // 接收人
    address lendingPool = address(0x100); // 模拟借贷池地址
    
    uint256 constant INITIAL_BALANCE = 100_000e6; // 100k USDT (6 decimals)
    uint256 constant DEPOSIT_AMOUNT = 1000e6;     // 1000 USDT
    
    function setUp() public {
        vm.startPrank(owner);
        
        // 部署测试代币 (模拟 USDT 6位精度)
        token = new MockERC20("Test USDT", "USDT", 6);
        yieldToken = new MockERC20("Yield USDT", "aUSDT", 6);
        
        // 部署模拟借贷适配器
        lendingDelegate = new MockLendingDelegate();
        lendingDelegate.setYieldToken(address(token), address(yieldToken));
        
        // 部署 DepositVault
        vault = new DepositVault(
            owner,                          // _initialOwner
            address(lendingDelegate),       // _defaultLendingDelegate
            lendingPool                     // _defaultLendingTarget
        );
        
        vm.stopPrank();
        
        // 给 lendingPool 铸造 yield token (模拟借贷池有足够的 yield token)
        yieldToken.mint(lendingPool, INITIAL_BALANCE);
        
        // lendingPool 授权给 lendingDelegate (模拟借贷池操作)
        vm.prank(lendingPool);
        yieldToken.approve(address(vault), type(uint256).max);
    }
    
    /**
     * @dev 测试存款功能 - 主要用于测量 gas
     */
    function test_Deposit_Gas() public {
        // Alice 准备代币
        token.mint(alice, DEPOSIT_AMOUNT);
        vm.prank(alice);
        token.approve(address(vault), DEPOSIT_AMOUNT);
        
        // Alice 存入 - 测量 gas
        vm.prank(alice);
        uint256 gasBefore = gasleft();
        uint256 depositId = vault.deposit(address(token), DEPOSIT_AMOUNT, bob);
        uint256 gasUsed = gasBefore - gasleft();
        
        console.log("=== deposit() Gas Report ===");
        console.log("Gas used:", gasUsed);
        console.log("Deposit ID:", depositId);
        
        // 验证存款记录
        DepositVault.DepositInfo memory info = vault.getDeposit(depositId);
        
        assertEq(info.depositor, alice);
        assertEq(info.token, address(token));
        assertEq(info.yieldToken, address(yieldToken));
        assertEq(info.yieldAmount, DEPOSIT_AMOUNT); // 1:1 in mock
        assertEq(info.intendedRecipient, bob);
        assertFalse(info.used);
    }
    
    /**
     * @dev 测试首次存款 (冷存储)
     */
    function test_Deposit_FirstTime() public {
        token.mint(alice, DEPOSIT_AMOUNT);
        vm.prank(alice);
        token.approve(address(vault), DEPOSIT_AMOUNT);
        
        vm.prank(alice);
        uint256 depositId = vault.deposit(address(token), DEPOSIT_AMOUNT, bob);
        
        assertEq(depositId, 0);
        
        DepositVault.DepositInfo memory info = vault.getDeposit(depositId);
        assertEq(info.depositor, alice);
        assertEq(info.intendedRecipient, bob);
        assertFalse(info.used);
    }
    
    /**
     * @dev 测试多次存款 (热存储)
     */
    function test_Deposit_MultipleTimes() public {
        token.mint(alice, DEPOSIT_AMOUNT * 3);
        vm.prank(alice);
        token.approve(address(vault), DEPOSIT_AMOUNT * 3);
        
        // 多次铸造 yield token
        yieldToken.mint(lendingPool, DEPOSIT_AMOUNT * 3);
        
        // 第一次存款
        vm.prank(alice);
        uint256 gasBefore1 = gasleft();
        uint256 id1 = vault.deposit(address(token), DEPOSIT_AMOUNT, bob);
        uint256 gasUsed1 = gasBefore1 - gasleft();
        
        // 第二次存款
        vm.prank(alice);
        uint256 gasBefore2 = gasleft();
        uint256 id2 = vault.deposit(address(token), DEPOSIT_AMOUNT, bob);
        uint256 gasUsed2 = gasBefore2 - gasleft();
        
        // 第三次存款
        vm.prank(alice);
        uint256 gasBefore3 = gasleft();
        uint256 id3 = vault.deposit(address(token), DEPOSIT_AMOUNT, bob);
        uint256 gasUsed3 = gasBefore3 - gasleft();
        
        console.log("=== Multiple Deposits Gas Report ===");
        console.log("1st deposit gas (cold):", gasUsed1);
        console.log("2nd deposit gas (warm):", gasUsed2);
        console.log("3rd deposit gas (warm):", gasUsed3);
        
        assertEq(id1, 0);
        assertEq(id2, 1);
        assertEq(id3, 2);
    }
    
    /**
     * @dev 测试领取功能
     */
    function test_Claim_Success() public {
        // Alice 存入
        token.mint(alice, DEPOSIT_AMOUNT);
        vm.prank(alice);
        token.approve(address(vault), DEPOSIT_AMOUNT);
        vm.prank(alice);
        uint256 depositId = vault.deposit(address(token), DEPOSIT_AMOUNT, bob);
        
        // Bob 领取
        uint256 bobBalanceBefore = yieldToken.balanceOf(bob);
        vm.prank(bob);
        vault.claim(depositId);
        
        // 验证 Bob 收到了 yield token
        uint256 bobBalanceAfter = yieldToken.balanceOf(bob);
        assertEq(bobBalanceAfter - bobBalanceBefore, DEPOSIT_AMOUNT);
        
        // 验证状态
        DepositVault.DepositInfo memory info = vault.getDeposit(depositId);
        assertTrue(info.used);
    }
    
    /**
     * @dev 测试取回功能
     */
    function test_Recover_Success() public {
        // Alice 存入
        token.mint(alice, DEPOSIT_AMOUNT);
        vm.prank(alice);
        token.approve(address(vault), DEPOSIT_AMOUNT);
        vm.prank(alice);
        uint256 depositId = vault.deposit(address(token), DEPOSIT_AMOUNT, bob);
        
        // 等待时间锁 (默认 3 天)
        vm.warp(block.timestamp + 3 days + 1);
        
        // Alice 取回
        uint256 aliceBalanceBefore = yieldToken.balanceOf(alice);
        vm.prank(alice);
        vault.recover(depositId);
        
        // 验证 Alice 收到了 yield token
        uint256 aliceBalanceAfter = yieldToken.balanceOf(alice);
        assertEq(aliceBalanceAfter - aliceBalanceBefore, DEPOSIT_AMOUNT);
        
        // 验证状态
        DepositVault.DepositInfo memory info = vault.getDeposit(depositId);
        assertTrue(info.used);
    }
    
    /**
     * @dev 测试时间锁未到期不能取回
     */
    function test_Recover_RevertIfTimeLockNotPassed() public {
        token.mint(alice, DEPOSIT_AMOUNT);
        vm.prank(alice);
        token.approve(address(vault), DEPOSIT_AMOUNT);
        vm.prank(alice);
        uint256 depositId = vault.deposit(address(token), DEPOSIT_AMOUNT, bob);
        
        // 尝试立即取回（应该失败）
        vm.prank(alice);
        vm.expectRevert(DepositVault.RecoveryNotAvailable.selector);
        vault.recover(depositId);
    }
    
    /**
     * @dev 测试重复领取
     */
    function test_Claim_RevertIfAlreadyUsed() public {
        token.mint(alice, DEPOSIT_AMOUNT);
        vm.prank(alice);
        token.approve(address(vault), DEPOSIT_AMOUNT);
        vm.prank(alice);
        uint256 depositId = vault.deposit(address(token), DEPOSIT_AMOUNT, bob);
        
        // Bob 领取
        vm.prank(bob);
        vault.claim(depositId);
        
        // 再次领取应该失败
        vm.prank(bob);
        vm.expectRevert(DepositVault.AlreadyUsed.selector);
        vault.claim(depositId);
    }
    
    
    /**
     * @dev 测试非预期接收人不能领取
     */
    function test_Claim_RevertIfNotIntendedRecipient() public {
        token.mint(alice, DEPOSIT_AMOUNT);
        vm.prank(alice);
        token.approve(address(vault), DEPOSIT_AMOUNT);
        vm.prank(alice);
        uint256 depositId = vault.deposit(address(token), DEPOSIT_AMOUNT, bob);
        
        // 其他人尝试领取
        address other = address(0x999);
        vm.prank(other);
        vm.expectRevert(DepositVault.InvalidRecipient.selector);
        vault.claim(depositId);
    }
}
