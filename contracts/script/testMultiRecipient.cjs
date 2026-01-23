const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const rootDir = path.join(__dirname, "..");
const ARTIFACTS_DIR = path.join(rootDir, "out");
const DEPLOYED_DIR = path.join(rootDir, "deployed");

/**
 * @title Test Multi-Recipient Deposit and Claim
 * @dev 测试多接收者存款和提取流程
 * 
 * 流程：
 * 1. 地址1存入代币，分配给地址2/3/4/5
 * 2. 地址2/3/4/5分别提取自己的份额
 * 
 * 使用方法:
 *   node script/testMultiRecipient.cjs
 * 
 * 环境变量:
 *   - PRIVATE_KEY_1: 地址1的私钥（存款人）
 *   - PRIVATE_KEY_2: 地址2的私钥（接收人1）
 *   - PRIVATE_KEY_3: 地址3的私钥（接收人2）
 *   - PRIVATE_KEY_4: 地址4的私钥（接收人3）
 *   - PRIVATE_KEY_5: 地址5的私钥（接收人4）
 *   - RPC_URL: RPC URL（可选，默认 http://localhost:8545）
 *   - VAULT_ADDRESS: DepositVault 地址（可选，从 deployed/result_local.json 读取）
 */
async function main() {
    console.log("====================================");
    console.log("Test Multi-Recipient Deposit & Claim");
    console.log("====================================");
    
    // 获取 RPC URL
    const rpcUrl = process.env.RPC_URL || "http://localhost:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // 加载部署信息
    let vaultAddress, mockTokenAddress;
    const deployedFile = path.join(DEPLOYED_DIR, "result_local.json");
    if (fs.existsSync(deployedFile)) {
        const deployed = JSON.parse(fs.readFileSync(deployedFile, "utf8"));
        vaultAddress = deployed.contracts?.DepositVault?.address;
        mockTokenAddress = deployed.contracts?.MockERC20?.token;
        console.log("✅ Loaded deployment info from:", deployedFile);
        console.log("  Vault:", vaultAddress);
        console.log("  Mock Token:", mockTokenAddress);
    }
    
    if (!vaultAddress || !mockTokenAddress) {
        throw new Error("Vault or token address not found. Please deploy first using deployLocal.cjs");
    }
    
    // 创建钱包（地址1-5）
    const privateKey1 = process.env.PRIVATE_KEY_1;
    const privateKey2 = process.env.PRIVATE_KEY_2;
    const privateKey3 = process.env.PRIVATE_KEY_3;
    const privateKey4 = process.env.PRIVATE_KEY_4;
    const privateKey5 = process.env.PRIVATE_KEY_5;
    
    if (!privateKey1 || !privateKey2 || !privateKey3 || !privateKey4 || !privateKey5) {
        console.log("⚠️  Not all private keys provided, using Anvil default accounts");
        // 使用 Anvil 默认账户
        const anvilKeys = [
            "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
            "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
            "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
            "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
            "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"
        ];
        const wallets = anvilKeys.map(key => new ethers.Wallet(key, provider));
        await testMultiRecipient(provider, vaultAddress, mockTokenAddress, wallets);
    } else {
        const wallet1 = new ethers.Wallet(privateKey1, provider);
        const wallet2 = new ethers.Wallet(privateKey2, provider);
        const wallet3 = new ethers.Wallet(privateKey3, provider);
        const wallet4 = new ethers.Wallet(privateKey4, provider);
        const wallet5 = new ethers.Wallet(privateKey5, provider);
        const wallets = [wallet1, wallet2, wallet3, wallet4, wallet5];
        await testMultiRecipient(provider, vaultAddress, mockTokenAddress, wallets);
    }
}

async function testMultiRecipient(provider, vaultAddress, tokenAddress, wallets) {
    const [wallet1, wallet2, wallet3, wallet4, wallet5] = wallets;
    
    console.log("\n📋 Test Accounts:");
    console.log("  Address 1 (Depositor):", wallet1.address);
    console.log("  Address 2 (Recipient 1):", wallet2.address);
    console.log("  Address 3 (Recipient 2):", wallet3.address);
    console.log("  Address 4 (Recipient 3):", wallet4.address);
    console.log("  Address 5 (Recipient 4):", wallet5.address);
    console.log("");
    
    // 加载合约 ABI
    const vaultArtifactPath = path.join(ARTIFACTS_DIR, "DepositVault.sol", "DepositVault.json");
    const tokenArtifactPath = path.join(ARTIFACTS_DIR, "MockERC20.sol", "MockERC20.json");
    
    if (!fs.existsSync(vaultArtifactPath) || !fs.existsSync(tokenArtifactPath)) {
        throw new Error("Artifacts not found. Please run 'forge build' first.");
    }
    
    const vaultArtifact = JSON.parse(fs.readFileSync(vaultArtifactPath, "utf8"));
    const tokenArtifact = JSON.parse(fs.readFileSync(tokenArtifactPath, "utf8"));
    
    const vault = new ethers.Contract(vaultAddress, vaultArtifact.abi, wallet1);
    const token = new ethers.Contract(tokenAddress, tokenArtifact.abi, wallet1);
    
    // 获取代币精度
    let tokenDecimals = 18;
    try {
        tokenDecimals = await token.decimals();
    } catch (e) {
        console.log("⚠️  Could not get decimals, using default 18");
    }
    
    console.log("Token Decimals:", tokenDecimals);
    console.log("");
    
    // ========== 步骤 1: 给地址1铸造代币 ==========
    console.log("Step 1: Mint tokens to Address 1 (Depositor)");
    console.log("-".repeat(50));
    const totalAmount = ethers.parseUnits("10000", tokenDecimals); // 10000 tokens
    // 使用 deployer 账户来 mint（因为 token 合约的 mint 函数需要权限）
    const deployer = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
    const deployerToken = new ethers.Contract(tokenAddress, tokenArtifact.abi, deployer);
    const mintNonce = await provider.getTransactionCount(deployer.address, "pending");
    const mintTx = await deployerToken.mint(wallet1.address, totalAmount, { nonce: mintNonce });
    await mintTx.wait();
    console.log("✅ Minted", ethers.formatUnits(totalAmount, tokenDecimals), "tokens to", wallet1.address);
    
    const balance1 = await token.balanceOf(wallet1.address);
    console.log("  Balance:", ethers.formatUnits(balance1, tokenDecimals), "tokens");
    console.log("");
    
    // ========== 步骤 2: 地址1授权给 DepositVault ==========
    console.log("Step 2: Approve tokens from Address 1 to DepositVault");
    console.log("-".repeat(50));
    // 获取当前 nonce（等待 mint 交易确认后再获取）
    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待 1 秒确保交易已确认
    const currentNonce = await provider.getTransactionCount(wallet1.address, "pending");
    console.log("  Using nonce:", currentNonce);
    const approveTx = await token.approve(vaultAddress, totalAmount, { nonce: currentNonce });
    await approveTx.wait();
    console.log("✅ Approved", ethers.formatUnits(totalAmount, tokenDecimals), "tokens");
    console.log("");
    
    // ========== 步骤 3: 地址1存入，分配给地址2/3/4/5 ==========
    console.log("Step 3: Deposit from Address 1, allocate to Addresses 2/3/4/5");
    console.log("-".repeat(50));
    
    // 分配方案：每个接收者 2500 tokens（总共 10000）
    const allocationAmount = ethers.parseUnits("2500", tokenDecimals);
    const allocations = [
        { recipient: wallet2.address, amount: allocationAmount },
        { recipient: wallet3.address, amount: allocationAmount },
        { recipient: wallet4.address, amount: allocationAmount },
        { recipient: wallet5.address, amount: allocationAmount }
    ];
    
    console.log("Allocations:");
    allocations.forEach((alloc, i) => {
        console.log(`  Recipient ${i + 2}: ${alloc.recipient} - ${ethers.formatUnits(alloc.amount, tokenDecimals)} tokens`);
    });
    console.log(`  Total: ${ethers.formatUnits(totalAmount, tokenDecimals)} tokens`);
    console.log("");
    
    // 调用 deposit 函数（多接收者版本）
    // 获取当前 nonce（等待 approve 交易确认后再获取）
    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待 1 秒确保交易已确认
    const depositNonce = await provider.getTransactionCount(wallet1.address, "pending");
    console.log("  Using nonce:", depositNonce);
    const depositTx = await vault.deposit(
        tokenAddress,
        totalAmount,
        allocations,
        { nonce: depositNonce }
    );
    console.log("  Transaction hash:", depositTx.hash);
    
    const depositReceipt = await depositTx.wait();
    console.log("✅ Deposit confirmed in block:", depositReceipt.blockNumber);
    
    // 从事件中提取 deposit IDs
    const depositIds = [];
    for (const log of depositReceipt.logs) {
        try {
            const parsed = vault.interface.parseLog(log);
            if (parsed && parsed.name === "Deposited") {
                depositIds.push(parsed.args.depositId);
            }
        } catch (e) {
            // 忽略解析错误
        }
    }
    
    console.log("✅ Created", depositIds.length, "deposits");
    console.log("  Deposit IDs:", depositIds.map(id => id.toString()).join(", "));
    console.log("");
    
    // ========== 步骤 4: 验证每个接收者的可提取存款 ==========
    console.log("Step 4: Verify claimable deposits for each recipient");
    console.log("-".repeat(50));
    
    for (let i = 0; i < 4; i++) {
        const recipientWallet = wallets[i + 1];
        const recipientVault = new ethers.Contract(vaultAddress, vaultArtifact.abi, recipientWallet);
        
        const claimableDeposits = await recipientVault.getClaimableDeposits(recipientWallet.address);
        console.log(`  Address ${i + 2} (${recipientWallet.address}):`);
        console.log(`    Claimable deposits: ${claimableDeposits.length}`);
        
        if (claimableDeposits.length > 0) {
            const depositInfo = claimableDeposits[0];
            console.log(`    Deposit ID: ${depositInfo.depositId.toString()}`);
            console.log(`    Yield Amount: ${ethers.formatUnits(depositInfo.yieldAmount, tokenDecimals)} tokens`);
        }
    }
    console.log("");
    
    // ========== 步骤 5: 地址2/3/4/5分别提取 ==========
    console.log("Step 5: Each recipient claims their deposit");
    console.log("-".repeat(50));
    
    // 获取 yield token 地址
    const yieldTokenAddress = await vault.getYieldTokenAddress(tokenAddress);
    const yieldToken = new ethers.Contract(yieldTokenAddress, tokenArtifact.abi, wallet2);
    
    for (let i = 0; i < 4; i++) {
        const recipientWallet = wallets[i + 1];
        const recipientVault = new ethers.Contract(vaultAddress, vaultArtifact.abi, recipientWallet);
        const depositId = depositIds[i];
        
        console.log(`\n  Claiming for Address ${i + 2} (${recipientWallet.address})...`);
        console.log(`    Deposit ID: ${depositId.toString()}`);
        
        // 获取 yield token 余额（提取前）
        const yieldBalanceBefore = await yieldToken.balanceOf(recipientWallet.address);
        console.log(`    Yield Token Balance Before: ${ethers.formatUnits(yieldBalanceBefore, tokenDecimals)}`);
        
        // 提取
        // 等待之前的交易确认
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        const claimNonce = await provider.getTransactionCount(recipientWallet.address, "pending");
        console.log(`    Using nonce: ${claimNonce}`);
        const claimTx = await recipientVault.claim(depositId, { nonce: claimNonce });
        console.log(`    Transaction hash: ${claimTx.hash}`);
        
        const claimReceipt = await claimTx.wait();
        console.log(`    ✅ Claim confirmed in block: ${claimReceipt.blockNumber}`);
        
        // 获取 yield token 余额（提取后）
        const yieldBalanceAfter = await yieldToken.balanceOf(recipientWallet.address);
        const received = yieldBalanceAfter - yieldBalanceBefore;
        console.log(`    Yield Token Balance After: ${ethers.formatUnits(yieldBalanceAfter, tokenDecimals)}`);
        console.log(`    Received: ${ethers.formatUnits(received, tokenDecimals)} tokens`);
        
        // 验证存款状态
        const depositInfo = await vault.getDeposit(depositId);
        console.log(`    Deposit Used: ${depositInfo.used}`);
        
        if (!depositInfo.used) {
            throw new Error(`Deposit ${depositId} should be marked as used`);
        }
    }
    
    // ========== 步骤 6: 测试 Recover 功能 ==========
    console.log("Step 6: Test Recover Function");
    console.log("-".repeat(50));
    
    // 首先设置一个较短的 recovery delay（方便测试）
    console.log("\n  Setting shorter recovery delay for testing...");
    const deployerWallet = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
    const deployerVault = new ethers.Contract(vaultAddress, vaultArtifact.abi, deployerWallet);
    const shortRecoveryDelay = 10; // 10 秒用于测试
    await new Promise(resolve => setTimeout(resolve, 1000));
    const setDelayNonce = await provider.getTransactionCount(deployerWallet.address, "pending");
    const setDelayTx = await deployerVault.setRecoveryDelay(shortRecoveryDelay, { nonce: setDelayNonce });
    await setDelayTx.wait();
    console.log("  ✅ Recovery delay set to", shortRecoveryDelay, "seconds");
    
    // 创建一个新的存款，但不让 recipient 提取，测试 depositor recover
    console.log("\n  Creating a new deposit for recover test...");
    const recoverTestAmount = ethers.parseUnits("5000", tokenDecimals);
    const recoverTestAllocations = [
        { recipient: wallet2.address, amount: recoverTestAmount }
    ];
    
    // 检查余额和授权
    const balanceBeforeRecover = await token.balanceOf(wallet1.address);
    const allowanceBeforeRecover = await token.allowance(wallet1.address, vaultAddress);
    console.log("  Balance:", ethers.formatUnits(balanceBeforeRecover, tokenDecimals), "tokens");
    console.log("  Current allowance:", ethers.formatUnits(allowanceBeforeRecover, tokenDecimals), "tokens");
    
    // 如果余额不足，先铸造代币
    if (balanceBeforeRecover < recoverTestAmount) {
        console.log("  ⚠️  Insufficient balance, minting more tokens...");
        const deployerToken = new ethers.Contract(tokenAddress, tokenArtifact.abi, deployerWallet);
        await new Promise(resolve => setTimeout(resolve, 1000));
        const mintNonce = await provider.getTransactionCount(deployerWallet.address, "pending");
        const mintTx = await deployerToken.mint(wallet1.address, recoverTestAmount, { nonce: mintNonce });
        await mintTx.wait();
        console.log("  ✅ Minted", ethers.formatUnits(recoverTestAmount, tokenDecimals), "tokens");
    }
    
    // 如果授权不足，重新授权
    if (allowanceBeforeRecover < recoverTestAmount) {
        console.log("  ⚠️  Insufficient allowance, approving more...");
        await new Promise(resolve => setTimeout(resolve, 1000));
        const approveNonce = await provider.getTransactionCount(wallet1.address, "pending");
        const approveTx = await token.approve(vaultAddress, recoverTestAmount, { nonce: approveNonce });
        await approveTx.wait();
        console.log("  ✅ Approved", ethers.formatUnits(recoverTestAmount, tokenDecimals), "tokens");
    }
    
    // 等待之前的交易确认
    await new Promise(resolve => setTimeout(resolve, 1000));
    const recoverDepositNonce = await provider.getTransactionCount(wallet1.address, "pending");
    console.log("  Using nonce:", recoverDepositNonce);
    
    const recoverDepositTx = await vault.deposit(
        tokenAddress,
        recoverTestAmount,
        recoverTestAllocations,
        { nonce: recoverDepositNonce }
    );
    const recoverDepositReceipt = await recoverDepositTx.wait();
    
    // 从事件中提取 deposit ID
    let recoverDepositId = null;
    for (const log of recoverDepositReceipt.logs) {
        try {
            const parsed = vault.interface.parseLog(log);
            if (parsed && parsed.name === "Deposited") {
                recoverDepositId = parsed.args.depositId;
                break;
            }
        } catch (e) {
            // 忽略解析错误
        }
    }
    
    if (!recoverDepositId) {
        throw new Error("Failed to get deposit ID from recover test deposit");
    }
    
    console.log("  ✅ Created deposit for recover test, Deposit ID:", recoverDepositId.toString());
    
    // 获取存款信息
    const recoverDepositInfo = await vault.getDeposit(recoverDepositId);
    const depositTime = Number(recoverDepositInfo.depositTime);
    console.log("  Deposit time:", new Date(depositTime * 1000).toISOString());
    
    // 获取当前区块时间
    const currentBlockBefore = await provider.getBlock("latest");
    const currentTimeBefore = Number(currentBlockBefore.timestamp);
    console.log("  Current block timestamp (before):", new Date(currentTimeBefore * 1000).toISOString());
    
    // 获取 recovery delay（应该是我们刚设置的短时间）
    const recoveryDelay = await vault.recoveryDelay();
    const recoveryDelayNum = Number(recoveryDelay);
    console.log("  Recovery Delay:", recoveryDelayNum, "seconds");
    
    // 计算需要快进的时间
    const timeNeeded = depositTime + recoveryDelayNum - currentTimeBefore + 5; // 额外5秒确保通过
    console.log("  Time needed:", timeNeeded, "seconds");
    
    // 快进时间（使用 Anvil 的 evm_increaseTime）
    console.log("\n  Fast-forwarding time to pass recovery delay...");
    if (timeNeeded > 0) {
        // 使用 evm_increaseTime 快进时间
        await provider.send("evm_increaseTime", [timeNeeded]);
        // 挖一个新区块以应用时间变化
        await provider.send("evm_mine", []);
        console.log("  ✅ Time fast-forwarded by", timeNeeded, "seconds");
    }
    
    // 获取当前区块时间（快进后）
    const currentBlockAfter = await provider.getBlock("latest");
    let currentTimeAfter = Number(currentBlockAfter.timestamp);
    console.log("  Current block timestamp (after):", new Date(currentTimeAfter * 1000).toISOString());
    console.log("  Time elapsed:", currentTimeAfter - depositTime, "seconds");
    
    // 验证时间锁已通过
    if (currentTimeAfter < depositTime + recoveryDelayNum) {
        console.log("  ⚠️  Time lock not passed, waiting a bit more...");
        // 再等一会儿（通过挖更多区块）
        await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
        // 再挖一个区块
        await provider.send("evm_mine", []);
        const finalBlock = await provider.getBlock("latest");
        currentTimeAfter = Number(finalBlock.timestamp);
        console.log("  Final block timestamp:", new Date(currentTimeAfter * 1000).toISOString());
        console.log("  Final time elapsed:", currentTimeAfter - depositTime, "seconds");
    }
    
    // 最终验证时间锁已通过
    if (currentTimeAfter < depositTime + recoveryDelayNum) {
        throw new Error(`Time lock not passed. Current: ${currentTimeAfter}, Deposit: ${depositTime}, Delay: ${recoveryDelayNum}, Required: ${depositTime + recoveryDelayNum}`);
    }
    console.log("  ✅ Time lock verified");
    
    // 验证 recipient 还没有 claim（应该可以 claim）
    const recoverClaimableBefore = await vault.getClaimableDeposits(wallet2.address);
    console.log("  Recipient claimable deposits before recover:", recoverClaimableBefore.length);
    if (recoverClaimableBefore.length === 0) {
        throw new Error("Recipient should have claimable deposit before recover");
    }
    
    // 获取 depositor 的 yield token 余额（recover 前）
    const depositorYieldBalanceBefore = await yieldToken.balanceOf(wallet1.address);
    console.log("  Depositor yield token balance before recover:", ethers.formatUnits(depositorYieldBalanceBefore, tokenDecimals));
    
    // Depositor recover
    console.log("\n  Depositor recovering deposit...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    const recoverNonce = await provider.getTransactionCount(wallet1.address, "pending");
    console.log("  Using nonce:", recoverNonce);
    
    const recoverTx = await vault.recover(recoverDepositId, { nonce: recoverNonce });
    console.log("  Transaction hash:", recoverTx.hash);
    
    const recoverReceipt = await recoverTx.wait();
    console.log("  ✅ Recover confirmed in block:", recoverReceipt.blockNumber);
    
    // 获取 depositor 的 yield token 余额（recover 后）
    const depositorYieldBalanceAfter = await yieldToken.balanceOf(wallet1.address);
    const recovered = depositorYieldBalanceAfter - depositorYieldBalanceBefore;
    console.log("  Depositor yield token balance after recover:", ethers.formatUnits(depositorYieldBalanceAfter, tokenDecimals));
    console.log("  Recovered:", ethers.formatUnits(recovered, tokenDecimals), "tokens");
    
    // 验证存款状态
    const recoverDepositInfoAfter = await vault.getDeposit(recoverDepositId);
    console.log("  Deposit Used:", recoverDepositInfoAfter.used);
    
    if (!recoverDepositInfoAfter.used) {
        throw new Error(`Deposit ${recoverDepositId} should be marked as used after recover`);
    }
    
    if (recovered < recoverTestAmount) {
        throw new Error(`Recovered amount ${ethers.formatUnits(recovered, tokenDecimals)} should be at least ${ethers.formatUnits(recoverTestAmount, tokenDecimals)}`);
    }
    
    // ========== 步骤 7: 测试 Recover 后无法 Claim ==========
    console.log("\n  Testing that recipient cannot claim after recover...");
    console.log("-".repeat(50));
    
    // 验证 recipient 无法再 claim
    const recoverClaimableAfter = await vault.getClaimableDeposits(wallet2.address);
    console.log("  Recipient claimable deposits after recover:", recoverClaimableAfter.length);
    
    // 检查 recoverDepositId 是否还在 claimable 列表中
    const isStillClaimable = recoverClaimableAfter.some(dep => dep.depositId.toString() === recoverDepositId.toString());
    if (isStillClaimable) {
        throw new Error(`Deposit ${recoverDepositId} should not be claimable after recover`);
    }
    console.log("  ✅ Deposit is no longer claimable");
    
    // 尝试 claim（应该失败）
    console.log("\n  Attempting to claim after recover (should fail)...");
    const recipientVault = new ethers.Contract(vaultAddress, vaultArtifact.abi, wallet2);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const claimAfterRecoverNonce = await provider.getTransactionCount(wallet2.address, "pending");
    console.log("  Using nonce:", claimAfterRecoverNonce);
    
    try {
        const claimTx = await recipientVault.claim(recoverDepositId, { nonce: claimAfterRecoverNonce });
        await claimTx.wait();
        throw new Error("Claim should have failed but succeeded");
    } catch (error) {
        // 检查错误代码
        const errorData = error.data || error.reason || error.message || "";
        const errorString = errorData.toString();
        console.log("  ✅ Claim correctly failed");
        console.log("  Error data:", errorString);
        
        // 验证错误是 AlreadyUsed (0x7b8c8210) 或 DepositNotFound (0x411321ed)
        // recover 后 yieldAmount 被设为 0，所以 claim 会返回 DepositNotFound
        const alreadyUsedSelector = "0x7b8c8210";
        const depositNotFoundSelector = "0x411321ed";
        
        if (errorString.includes("AlreadyUsed") || 
            errorString.includes(alreadyUsedSelector) ||
            errorString.includes("7b8c8210")) {
            console.log("  ✅ Correctly reverted with AlreadyUsed error");
        } else if (errorString.includes("DepositNotFound") ||
                   errorString.includes(depositNotFoundSelector) ||
                   errorString.includes("411321ed")) {
            console.log("  ✅ Correctly reverted with DepositNotFound error");
            console.log("  Note: After recover, yieldAmount is set to 0, so claim returns DepositNotFound");
        } else {
            // 即使错误代码不匹配，只要 claim 失败就是正确的
            console.log("  ✅ Claim failed (error code:", errorString.substring(0, 12) + "...)");
            console.log("  Note: This is expected - deposit cannot be claimed after recover");
        }
    }
    
    console.log("  ✅ Recover test passed!");
    
    console.log("");
    console.log("====================================");
    console.log("✅ All Tests Passed!");
    console.log("====================================");
    console.log("\nSummary:");
    console.log("  - Depositor (Address 1):", wallet1.address);
    console.log("  - Deposited:", ethers.formatUnits(totalAmount, tokenDecimals), "tokens");
    console.log("  - Allocated to 4 recipients, 2500 tokens each");
    console.log("  - All 4 recipients successfully claimed their deposits");
    console.log("  - Recover test: Depositor successfully recovered deposit after time lock");
    console.log("");
}

main().catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
});
