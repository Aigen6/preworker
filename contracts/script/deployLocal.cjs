const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const rootDir = path.join(__dirname, "..");
const ARTIFACTS_DIR = path.join(rootDir, "out");

/**
 * @title Deploy DepositVault on Local Node
 * @dev 在本地节点（Anvil/Hardhat）上部署 DepositVault，使用 Mock 适配器和 Mock 借贷池
 * 
 * 使用方法:
 *   node script/deployLocal.cjs
 * 
 * 环境变量:
 *   - PRIVATE_KEY: 部署者私钥（必需）
 *   - INITIAL_OWNER: 初始所有者地址（可选，如果不提供则使用部署者地址）
 *   - RPC_URL: 本地节点 RPC URL（可选，默认 http://localhost:8545）
 */
async function main() {
    console.log("====================================");
    console.log("Deploying DepositVault on Local Node");
    console.log("====================================");
    
    // 检查必需的环境变量
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("PRIVATE_KEY environment variable is required");
    }
    
    // 获取 RPC URL（默认本地 Anvil）
    const rpcUrl = process.env.RPC_URL || "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    const initialOwner = process.env.INITIAL_OWNER || wallet.address;
    
    console.log("Deployer:", wallet.address);
    console.log("Initial Owner:", initialOwner);
    const balance = await provider.getBalance(wallet.address);
    console.log("Balance:", ethers.formatEther(balance), "ETH");
    
    const network = await provider.getNetwork();
    console.log("Chain ID:", network.chainId.toString());
    console.log("RPC URL:", rpcUrl);
    console.log("");
    
    // 1. 部署 Mock ERC20 代币（模拟 USDT）
    console.log("Deploying Mock ERC20 tokens...");
    let currentNonce = await provider.getTransactionCount(wallet.address, "pending");
    console.log("  Starting nonce:", currentNonce);
    const mockToken = await deployMockERC20(wallet, "Test USDT", "USDT", 6, currentNonce++);
    const mockYieldToken = await deployMockERC20(wallet, "Yield USDT", "aUSDT", 6, currentNonce++);
    console.log("✅ Mock USDT:", mockToken);
    console.log("✅ Mock Yield Token (aUSDT):", mockYieldToken);
    console.log("");
    
    // 2. 部署 Mock 借贷池
    console.log("Deploying Mock Lending Pool...");
    const mockPool = await deployMockLendingPool(wallet, mockToken, mockYieldToken, currentNonce++);
    console.log("✅ Mock Lending Pool:", mockPool);
    console.log("");
    
    // 3. 部署 Mock 适配器
    console.log("Deploying Mock Lending Delegate...");
    const mockDelegate = await deployMockLendingDelegate(wallet, currentNonce++);
    console.log("✅ Mock Lending Delegate:", mockDelegate);
    
    // 配置 Mock 适配器：设置 token => yieldToken 映射
    console.log("Configuring Mock Delegate...");
    await configureMockDelegate(wallet, mockDelegate, mockToken, mockYieldToken, currentNonce++);
    console.log("✅ Mock Delegate configured");
    console.log("");
    
    // 4. 给 Mock Pool 铸造 yield token（模拟借贷池有足够的 yield token）
    console.log("Minting yield tokens to Mock Pool...");
    await mintYieldTokensToPool(wallet, mockYieldToken, mockPool, currentNonce++);
    console.log("✅ Yield tokens minted");
    console.log("");
    
    // 5. Mock Pool 授权给 DepositVault（稍后部署）
    // 注意：我们需要先部署 DepositVault，然后再授权
    // 所以这一步会在部署 DepositVault 之后进行
    
    // 6. 部署 DepositVault
    console.log("Deploying DepositVault...");
    const vaultAddress = await deployDepositVault(wallet, initialOwner, mockDelegate, mockPool, currentNonce++);
    console.log("✅ DepositVault deployed:", vaultAddress);
    console.log("");
    
    // 7. Mock Pool 授权给 DepositVault
    console.log("Approving yield tokens from Mock Pool to DepositVault...");
    await approveYieldTokensFromPool(wallet, mockPool, vaultAddress, currentNonce++);
    console.log("✅ Approval completed");
    console.log("");
    
    // 8. 验证部署
    const vault = await getVaultContract(wallet, vaultAddress);
    const owner = await vault.owner();
    const defaultDelegate = await vault.defaultLendingDelegate();
    const defaultTarget = await vault.defaultLendingTarget();
    const recoveryDelay = await vault.recoveryDelay();
    
    if (owner.toLowerCase() !== initialOwner.toLowerCase()) {
        throw new Error("Owner mismatch");
    }
    if (defaultDelegate.toLowerCase() !== mockDelegate.toLowerCase()) {
        throw new Error("Delegate mismatch");
    }
    if (defaultTarget.toLowerCase() !== mockPool.toLowerCase()) {
        throw new Error("Pool mismatch");
    }
    
    // 9. 输出部署信息
    console.log("");
    console.log("====================================");
    console.log("Deployment Complete");
    console.log("====================================");
    console.log("DepositVault Address:", vaultAddress);
    console.log("Owner:", owner);
    console.log("Mock Lending Delegate:", defaultDelegate);
    console.log("Mock Lending Pool:", defaultTarget);
    console.log("Mock USDT Token:", mockToken);
    console.log("Mock Yield Token:", mockYieldToken);
    console.log("Recovery Delay:", recoveryDelay.toString(), "seconds (3 days)");
    console.log("");
    
    // 10. 保存部署结果到文件
    const deploymentInfo = {
        network: "local",
        chainId: network.chainId.toString(),
        deployer: wallet.address,
        timestamp: new Date().toISOString(),
        rpcUrl: rpcUrl,
        contracts: {
            DepositVault: {
                address: vaultAddress,
                owner: owner,
                defaultLendingDelegate: defaultDelegate,
                defaultLendingTarget: defaultTarget,
                recoveryDelay: recoveryDelay.toString()
            },
            MockLendingDelegate: {
                address: mockDelegate
            },
            MockLendingPool: {
                address: mockPool
            },
            MockERC20: {
                token: mockToken,
                yieldToken: mockYieldToken
            }
        }
    };
    
    const outputPath = path.join(rootDir, "deployed", "result_local.json");
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
    console.log("✅ Deployment info saved to:", outputPath);
    console.log("");
    
    console.log("Next Steps:");
    console.log("1. Mint test tokens to your account:");
    console.log(`   cast send ${mockToken} "mint(address,uint256)" ${wallet.address} 1000000000000 --rpc-url ${rpcUrl} --private-key <key>`);
    console.log("2. Approve tokens to DepositVault:");
    console.log(`   cast send ${mockToken} "approve(address,uint256)" ${vaultAddress} 1000000000000 --rpc-url ${rpcUrl} --private-key <key>`);
    console.log("3. Test deposit:");
    console.log(`   cast send ${vaultAddress} "deposit(address,uint256,(address,uint256)[])" ${mockToken} 1000000000 "[(${wallet.address},1000000000)]" --rpc-url ${rpcUrl} --private-key <key>`);
    console.log("");
}

async function deployMockERC20(wallet, name, symbol, decimals, nonce) {
    const artifactPath = path.join(ARTIFACTS_DIR, "MockERC20.sol", "MockERC20.json");
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Artifact not found: ${artifactPath}. Please run 'forge build' first.`);
    }
    
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const deployTx = await factory.getDeployTransaction(name, symbol, decimals);
    deployTx.nonce = nonce;
    const tx = await wallet.sendTransaction(deployTx);
    const receipt = await tx.wait();
    const contractAddress = receipt.contractAddress;
    if (!contractAddress) {
        throw new Error("Contract deployment failed: no contract address");
    }
    return contractAddress;
}

async function deployMockLendingPool(wallet, underlyingToken, yieldToken, nonce) {
    const artifactPath = path.join(ARTIFACTS_DIR, "MockLendingPool.sol", "MockLendingPool.json");
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Artifact not found: ${artifactPath}. Please run 'forge build' first.`);
    }
    
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const deployTx = await factory.getDeployTransaction(underlyingToken, yieldToken);
    deployTx.nonce = nonce;
    const tx = await wallet.sendTransaction(deployTx);
    const receipt = await tx.wait();
    return receipt.contractAddress;
}

async function deployMockLendingDelegate(wallet, nonce) {
    const artifactPath = path.join(ARTIFACTS_DIR, "MockLendingDelegate.sol", "MockLendingDelegate.json");
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Artifact not found: ${artifactPath}. Please run 'forge build' first.`);
    }
    
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const deployTx = await factory.getDeployTransaction();
    deployTx.nonce = nonce;
    const tx = await wallet.sendTransaction(deployTx);
    const receipt = await tx.wait();
    return receipt.contractAddress;
}

async function configureMockDelegate(wallet, delegateAddress, tokenAddress, yieldTokenAddress, nonce) {
    const artifactPath = path.join(ARTIFACTS_DIR, "MockLendingDelegate.sol", "MockLendingDelegate.json");
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const delegate = new ethers.Contract(delegateAddress, artifact.abi, wallet);
    
    const tx = await delegate.setYieldToken(tokenAddress, yieldTokenAddress, { nonce });
    await tx.wait();
}

async function mintYieldTokensToPool(wallet, yieldTokenAddress, poolAddress, nonce) {
    const artifactPath = path.join(ARTIFACTS_DIR, "MockERC20.sol", "MockERC20.json");
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const yieldToken = new ethers.Contract(yieldTokenAddress, artifact.abi, wallet);
    
    // 铸造 1,000,000 yield tokens (1M * 10^6 = 1e12)
    const amount = ethers.parseUnits("1000000", 6);
    const tx = await yieldToken.mint(poolAddress, amount, { nonce });
    await tx.wait();
}

async function deployDepositVault(wallet, initialOwner, defaultDelegate, defaultTarget, nonce) {
    const artifactPath = path.join(ARTIFACTS_DIR, "DepositVault.sol", "DepositVault.json");
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Artifact not found: ${artifactPath}. Please run 'forge build' first.`);
    }
    
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const deployTx = await factory.getDeployTransaction(initialOwner, defaultDelegate, defaultTarget);
    deployTx.nonce = nonce;
    const tx = await wallet.sendTransaction(deployTx);
    const receipt = await tx.wait();
    return receipt.contractAddress;
}

async function approveYieldTokensFromPool(wallet, poolAddress, vaultAddress, nonce) {
    const artifactPath = path.join(ARTIFACTS_DIR, "MockLendingPool.sol", "MockLendingPool.json");
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const pool = new ethers.Contract(poolAddress, artifact.abi, wallet);
    
    // 调用 Mock Pool 的 approveYieldToken 函数
    const tx = await pool.approveYieldToken(vaultAddress, ethers.MaxUint256, { nonce });
    await tx.wait();
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
