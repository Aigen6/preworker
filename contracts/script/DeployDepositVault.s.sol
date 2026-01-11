// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { DepositVault } from "../src/DepositVault.sol";

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { DepositVault } from "../src/DepositVault.sol";
import { ITreasuryConfigCore } from "../src/DepositVault.sol";

/**
 * @title DeployDepositVault
 * @dev DepositVault 部署脚本
 *
 * 使用方法:
 * NETWORK=bsc_testnet forge script script/DeployDepositVault.s.sol --rpc-url bsc_testnet --broadcast -vvvv
 *
 * 环境变量:
 * - CONFIG_CORE: TreasuryConfigCore 合约地址 (必需)
 * - INITIAL_OWNER: 初始所有者地址 (必需)
 * - PRIVATE_KEY: 部署者私钥 (必需)
 */
contract DeployDepositVault is Script {
    DepositVault public vault;
    address public deployer;
    
    function run() external {
        console.log("=== DepositVault Deployment Script ===");
        console.log("");
        
        // 1. 加载私钥
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        deployer = vm.addr(privateKey);
        console.log("Deployer:", deployer);
        
        // 2. 读取配置
        address configCore = vm.envAddress("CONFIG_CORE");
        address initialOwner = vm.envAddress("INITIAL_OWNER");
        
        console.log("Config Core:", configCore);
        console.log("Initial Owner:", initialOwner);
        console.log("");
        
        // 3. 执行部署
        vm.startBroadcast(privateKey);
        
        vault = new DepositVault(
            configCore,
            initialOwner
        );
        
        vm.stopBroadcast();
        
        // 4. 验证部署
        require(address(vault) != address(0), "Deployment failed");
        require(address(vault.configCore()) == configCore, "Config core mismatch");
        require(vault.owner() == initialOwner, "Owner mismatch");
        
        // 5. 输出部署信息
        console.log("=== Deployment Complete ===");
        console.log("DepositVault Address:", address(vault));
        console.log("Config Core:", address(vault.configCore()));
        console.log("Owner:", vault.owner());
        console.log("Recovery Delay:", vault.recoveryDelay());
        console.log("");
        console.log("=== Next Steps ===");
        console.log("1. 将 DepositVault 地址写入 TreasuryConfigCore:");
        console.log("   configCore.setAddressConfig('DEPOSIT_VAULT', address(vault))");
        console.log("2. 确保借贷池配置已设置:");
        console.log("   - POOL_DELEGATE_KEY (例如: 'AAVE_V3_DELEGATE')");
        console.log("   - POOL_TARGET_KEY (例如: 'AAVE_V3_POOL')");
        console.log("");
    }
}
