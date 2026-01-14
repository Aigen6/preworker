const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const rootDir = path.join(__dirname, "..");
const ARTIFACTS_DIR = path.join(rootDir, "out");

// BSC Mainnet AAVE V3 Pool
const AAVE_POOL_BSC = "0x6807dc923806fE8Fd134338EABCA509979a7e0cB";

/**
 * @title Deploy DepositVault on BSC
 * @dev 在 BSC 主网部署 DepositVault
 * 
 * 使用方法:
 *   node script/deployDepositVaultBSC.cjs
 * 
 * 环境变量:
 *   - PRIVATE_KEY: 部署者私钥（必需）
 *   - INITIAL_OWNER: 初始所有者地址（可选，如果不提供则使用部署者地址）
 *                    说明：部署者（deployer）是执行部署的地址，所有者（owner）是合约的管理者
 *                    它们可以是同一个地址，也可以是不同的地址（例如部署后转移给多签钱包）
 *   - RPC_URL: BSC RPC URL（可选，默认使用公共节点）
 *   - AAVE_DELEGATE: AAVE V3 适配器地址（可选，如果不提供会自动部署）
 *   - AAVE_POOL: AAVE V3 Pool 地址（可选，默认使用 BSC 主网地址）
 */
async function main() {
    console.log("====================================");
    console.log("Deploying DepositVault on BSC");
    console.log("====================================");
    
    // 检查必需的环境变量
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("PRIVATE_KEY environment variable is required");
    }
    
    // 获取 RPC URL
    const rpcUrl = process.env.RPC_URL || "https://bsc-dataseed1.binance.org";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    // INITIAL_OWNER 是可选的，如果不提供则使用部署者地址
    // 关系说明：
    // - PRIVATE_KEY: 部署者的私钥，用于签名和发送部署交易
    // - INITIAL_OWNER: 合约的所有者地址，拥有合约的管理权限（可以调用 owner 函数）
    // 它们可以是同一个地址（部署者就是所有者），也可以是不同的地址（部署后转移给多签钱包等）
    const initialOwner = process.env.INITIAL_OWNER || wallet.address;
    
    console.log("Deployer:", wallet.address);
    console.log("Initial Owner:", initialOwner);
    const balance = await provider.getBalance(wallet.address);
    console.log("Balance:", ethers.formatEther(balance), "BNB");
    
    const network = await provider.getNetwork();
    console.log("Chain ID:", network.chainId.toString());
    console.log("");
    
    // 1. 部署或使用现有的 AAVE V3 适配器
    let aaveDelegate = process.env.AAVE_DELEGATE;
    if (!aaveDelegate) {
        console.log("Deploying AAVEv3Delegate...");
        aaveDelegate = await deployAAVEAdapter(wallet, provider);
        console.log("✅ Deployed AAVEv3Delegate:", aaveDelegate);
    } else {
        console.log("Using existing AAVEv3Delegate:", aaveDelegate);
    }
    
    // 2. 获取 AAVE Pool 地址
    const aavePool = process.env.AAVE_POOL || AAVE_POOL_BSC;
    console.log("AAVE V3 Pool:", aavePool);
    console.log("");
    
    // 3. 部署 DepositVault
    console.log("Deploying DepositVault...");
    const vaultAddress = await deployDepositVault(wallet, initialOwner, aaveDelegate, aavePool);
    
    // 4. 验证部署
    const vault = await getVaultContract(wallet, vaultAddress);
    const owner = await vault.owner();
    const defaultDelegate = await vault.defaultLendingDelegate();
    const defaultTarget = await vault.defaultLendingTarget();
    const recoveryDelay = await vault.recoveryDelay();
    
    if (owner.toLowerCase() !== initialOwner.toLowerCase()) {
        throw new Error("Owner mismatch");
    }
    if (defaultDelegate.toLowerCase() !== aaveDelegate.toLowerCase()) {
        throw new Error("Delegate mismatch");
    }
    if (defaultTarget.toLowerCase() !== aavePool.toLowerCase()) {
        throw new Error("Pool mismatch");
    }
    
    // 5. 输出部署信息
    console.log("");
    console.log("====================================");
    console.log("Deployment Complete");
    console.log("====================================");
    console.log("DepositVault Address:", vaultAddress);
    console.log("Owner:", owner);
    console.log("Default Lending Delegate:", defaultDelegate);
    console.log("Default Lending Target:", defaultTarget);
    console.log("Recovery Delay:", recoveryDelay.toString(), "seconds (3 days)");
    console.log("");
    
    // 6. 保存部署结果到文件
    const deploymentInfo = {
        network: "bsc",
        chainId: network.chainId.toString(),
        deployer: wallet.address,
        timestamp: new Date().toISOString(),
        contracts: {
            DepositVault: {
                address: vaultAddress,
                owner: owner,
                defaultLendingDelegate: defaultDelegate,
                defaultLendingTarget: defaultTarget,
                recoveryDelay: recoveryDelay.toString()
            },
            AAVEv3Delegate: {
                address: aaveDelegate
            }
        },
        configuration: {
            aavePool: aavePool
        }
    };
    
    const outputPath = path.join(rootDir, "deployed", "result_bsc.json");
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
    console.log("✅ Deployment info saved to:", outputPath);
    console.log("");
    
    console.log("Next Steps:");
    console.log("1. Configure token-specific settings (if needed):");
    console.log(`   vault.setTokenConfig(tokenAddress, delegate, pool, tokenKey)`);
    console.log("2. Verify contract on BscScan");
    console.log("");
}

async function deployAAVEAdapter(wallet, provider) {
    const artifactPath = path.join(ARTIFACTS_DIR, "AAVEv3Delegate.sol", "AAVEv3Delegate.json");
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Artifact not found: ${artifactPath}. Please run 'forge build' first.`);
    }
    
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    
    return await contract.getAddress();
}

async function deployDepositVault(wallet, initialOwner, defaultDelegate, defaultTarget) {
    const artifactPath = path.join(ARTIFACTS_DIR, "DepositVault.sol", "DepositVault.json");
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Artifact not found: ${artifactPath}. Please run 'forge build' first.`);
    }
    
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const contract = await factory.deploy(initialOwner, defaultDelegate, defaultTarget);
    await contract.waitForDeployment();
    
    return await contract.getAddress();
}

async function getVaultContract(wallet, address) {
    const artifactPath = path.join(ARTIFACTS_DIR, "DepositVault.sol", "DepositVault.json");
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    return new ethers.Contract(address, artifact.abi, wallet);
}

main().catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
});
