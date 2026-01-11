// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { ITreasuryConfigCore } from "../src/DepositVault.sol";

/**
 * @title ConfigureDepositVault
 * @dev 将 DepositVault 地址写入 TreasuryConfigCore 配置
 *
 * 使用方法:
 * NETWORK=bsc_testnet forge script script/ConfigureDepositVault.s.sol --rpc-url bsc_testnet --broadcast -vvvv
 *
 * 环境变量:
 * - TREASURY_CONFIG_CORE: TreasuryConfigCore 合约地址 (必需)
 * - DEPOSIT_VAULT: DepositVault 合约地址 (必需)
 * - PRIVATE_KEY: 部署者私钥 (必需)
 */
contract ConfigureDepositVault is Script {
    function run() external {
        console.log("=== Configure DepositVault ===");
        console.log("");

        // 1. 加载私钥
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);
        console.log("Deployer:", deployer);

        // 2. 读取配置
        address treasuryConfigCore = vm.envAddress("TREASURY_CONFIG_CORE");
        address depositVault = vm.envAddress("DEPOSIT_VAULT");

        console.log("TreasuryConfigCore:", treasuryConfigCore);
        console.log("DepositVault:", depositVault);
        console.log("");

        // 3. 执行配置
        vm.startBroadcast(privateKey);

        ITreasuryConfigCore configCore = ITreasuryConfigCore(treasuryConfigCore);
        configCore.setAddressConfig("DEPOSIT_VAULT", depositVault);

        vm.stopBroadcast();

        // 4. 验证配置
        address configuredAddress = configCore.getAddressConfig("DEPOSIT_VAULT");
        require(configuredAddress == depositVault, "Configuration failed");

        // 5. 输出配置信息
        console.log("=== Configuration Complete ===");
        console.log("DepositVault Address:", configuredAddress);
        console.log("");
    }
}
