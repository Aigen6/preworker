const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const rootDir = path.join(__dirname, "..");
const ARTIFACTS_DIR = path.join(rootDir, "out");
const DEPLOYED_DIR = path.join(rootDir, "deployed");

/**
 * @title Test DepositVault on BSC
 * @dev 在 BSC 链上测试 DepositVault 合约
 * 
 * 使用方法:
 *   node script/testDepositVaultBSC.cjs
 * 
 * 环境变量:
 *   - PRIVATE_KEY: 测试账户私钥（必需，需要有足够的 BNB 和测试代币）
 *   - RPC_URL: BSC RPC URL（可选，默认使用公共节点）
 *   - VAULT_ADDRESS: DepositVault 合约地址（可选，如果不提供则从 deployed/result_bsc.json 读取）
 *   - TEST_TOKEN: 测试代币地址（可选，如果不提供则使用 USDT）
 *   - TEST_DEPOSIT_AMOUNT: 测试存款金额（可选，如果不提供则使用最小存款金额）
 *                           格式：代币数量（不是 wei），例如 "10" 表示 10 USDT
 */
async function main() {
    console.log("====================================");
    console.log("Testing DepositVault on BSC");
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
    
    console.log("Test Account:", wallet.address);
    const balance = await provider.getBalance(wallet.address);
    console.log("Balance:", ethers.formatEther(balance), "BNB");
    
    const network = await provider.getNetwork();
    console.log("Chain ID:", network.chainId.toString());
    console.log("");
    
    // 加载部署信息
    let vaultAddress = process.env.VAULT_ADDRESS;
    if (!vaultAddress) {
        const deployedFile = path.join(DEPLOYED_DIR, "result_bsc.json");
        if (fs.existsSync(deployedFile)) {
            const deployed = JSON.parse(fs.readFileSync(deployedFile, "utf8"));
            vaultAddress = deployed.contracts?.DepositVault?.address;
            if (vaultAddress) {
                console.log("✅ Loaded vault address from deployment file:", vaultAddress);
            }
        }
    }
    
    if (!vaultAddress) {
        throw new Error("VAULT_ADDRESS not provided and not found in deployment file");
    }
    
    // 加载合约 ABI
    const vaultArtifactPath = path.join(ARTIFACTS_DIR, "DepositVault.sol", "DepositVault.json");
    if (!fs.existsSync(vaultArtifactPath)) {
        throw new Error(`Artifact not found: ${vaultArtifactPath}. Please run 'forge build' first.`);
    }
    
    const vaultArtifact = JSON.parse(fs.readFileSync(vaultArtifactPath, "utf8"));
    const vault = new ethers.Contract(vaultAddress, vaultArtifact.abi, wallet);
    
    // 验证合约
    console.log("Verifying contract...");
    try {
        const owner = await vault.owner();
        const defaultDelegate = await vault.defaultLendingDelegate();
        const defaultTarget = await vault.defaultLendingTarget();
        const recoveryDelay = await vault.recoveryDelay();
        const minDepositAmount = await vault.minDepositAmount();
        
        console.log("✅ Contract verified:");
        console.log("  Owner:", owner);
        console.log("  Default Lending Delegate:", defaultDelegate);
        console.log("  Default Lending Target:", defaultTarget);
        console.log("  Recovery Delay:", recoveryDelay.toString(), "seconds");
        console.log("  Min Deposit Amount:", ethers.formatUnits(minDepositAmount, 18), "tokens");
        console.log("");
    } catch (error) {
        throw new Error(`Failed to verify contract: ${error.message}`);
    }
    
    // 获取测试代币地址
    const testTokenAddress = process.env.TEST_TOKEN || "0x55d398326f99059fF775485246999027B3197955"; // BSC USDT
    console.log("Test Token:", testTokenAddress);
    
    // 加载 ERC20 ABI
    const erc20Abi = [
        "function balanceOf(address) view returns (uint256)",
        "function approve(address, uint256) returns (bool)",
        "function allowance(address, address) view returns (uint256)",
        "function transfer(address, uint256) returns (bool)",
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)"
    ];
    
    const testToken = new ethers.Contract(testTokenAddress, erc20Abi, wallet);
    
    // 获取代币信息（包括精度）
    let tokenDecimals = 18; // 默认精度
    try {
        const tokenName = await testToken.name();
        const tokenSymbol = await testToken.symbol();
        tokenDecimals = await testToken.decimals();
        console.log(`Token: ${tokenName} (${tokenSymbol}), Decimals: ${tokenDecimals}`);
        
        const tokenBalance = await testToken.balanceOf(wallet.address);
        console.log("Token Balance:", ethers.formatUnits(tokenBalance, tokenDecimals), tokenSymbol);
        console.log("");
    } catch (error) {
        console.log("⚠️  Warning: Could not get token info:", error.message);
        console.log("  Using default decimals: 18");
        console.log("");
    }
    
    // 运行测试
    const testResults = {
        passed: 0,
        failed: 0,
        tests: []
    };
    
    // 测试 1: 检查最小存款金额
    await runTest("Test 1: Check Min Deposit Amount", async () => {
        const minAmount = await vault.minDepositAmount();
        console.log("  Min deposit amount (wei):", minAmount.toString());
        console.log("  Min deposit amount (formatted):", ethers.formatUnits(minAmount, tokenDecimals), "tokens");
        assert(minAmount > 0, "Min deposit amount should be greater than 0");
    }, testResults);
    
    // 测试 2: 检查 Delegate 配置
    await runTest("Test 2: Check Delegate Configuration", async () => {
        const defaultDelegate = await vault.defaultLendingDelegate();
        const defaultTarget = await vault.defaultLendingTarget();
        const delegateWhitelistEnabled = await vault.delegateWhitelistEnabled();
        
        console.log("  Default Lending Delegate:", defaultDelegate);
        console.log("  Default Lending Target:", defaultTarget);
        console.log("  Delegate Whitelist Enabled:", delegateWhitelistEnabled);
        
        if (delegateWhitelistEnabled) {
            const isWhitelisted = await vault.delegateWhitelist(defaultDelegate);
            console.log("  Delegate in Whitelist:", isWhitelisted);
            if (!isWhitelisted) {
                throw new Error("Delegate is not in whitelist! Please add it using setDelegateWhitelist()");
            }
        }
        
        // 检查 delegate 是否实现了接口
        // 注意：supply 函数需要通过 delegatecall 调用，不能直接 staticcall
        // 我们通过检查 getYieldTokenAddress 来验证接口
        const delegateContract = new ethers.Contract(defaultDelegate, [
            "function getYieldTokenAddress(address,string,address) external view returns (address)"
        ], provider);
        
        try {
            // 尝试调用 getYieldTokenAddress 函数来验证接口
            const yieldTokenAddress = await delegateContract.getYieldTokenAddress(
                testTokenAddress,
                "",
                defaultTarget
            );
            if (yieldTokenAddress === ethers.ZeroAddress) {
                throw new Error("getYieldTokenAddress returned zero address");
            }
            console.log("  ✅ Delegate interface check passed (getYieldTokenAddress works)");
            console.log("  Yield Token Address:", yieldTokenAddress);
        } catch (error) {
            console.log("  ❌ Delegate interface check failed:", error.message);
            throw new Error("Delegate does not implement ILendingDelegate interface correctly");
        }
    }, testResults);
    
    // 测试 3: 获取 Yield Token 地址
    await runTest("Test 3: Get Yield Token Address", async () => {
        const yieldTokenAddress = await vault.getYieldTokenAddress(testTokenAddress);
        console.log("  Yield Token Address:", yieldTokenAddress);
        assert(yieldTokenAddress !== ethers.ZeroAddress, "Yield token address should not be zero");
    }, testResults);
    
    // 测试 4: 检查代币余额和授权
    await runTest("Test 4: Check Token Balance and Approval", async () => {
        const balance = await testToken.balanceOf(wallet.address);
        const minAmount = await vault.minDepositAmount();
        
        console.log("  Token balance:", ethers.formatUnits(balance, tokenDecimals));
        console.log("  Min deposit amount:", ethers.formatUnits(minAmount, tokenDecimals));
        
        if (balance < minAmount) {
            throw new Error(`Insufficient token balance. Need at least ${ethers.formatUnits(minAmount, tokenDecimals)} tokens`);
        }
        
        // 检查授权
        const allowance = await testToken.allowance(wallet.address, vaultAddress);
        console.log("  Current allowance:", ethers.formatUnits(allowance, tokenDecimals));
        
        if (allowance < minAmount) {
            console.log("  ⚠️  Insufficient allowance, approving...");
            const approveTx = await testToken.approve(vaultAddress, ethers.MaxUint256);
            await approveTx.wait();
            console.log("  ✅ Approved");
        }
    }, testResults);
    
    // 测试 5: Deposit（如果有足够的代币）
    let depositId = null;
    await runTest("Test 5: Deposit", async () => {
        // tokenDecimals 已经在前面获取过了
        
        const balance = await testToken.balanceOf(wallet.address);
        const minAmount = await vault.minDepositAmount();
        
        if (balance < minAmount) {
            throw new Error(`Skipping deposit test: insufficient token balance. Need at least ${ethers.formatUnits(minAmount, tokenDecimals)} tokens`);
        }
        
        // 使用测试账户作为 intendedRecipient（自己给自己）
        // 确定存款金额：优先使用环境变量，否则智能调整最小存款金额
        let depositAmount;
        if (process.env.TEST_DEPOSIT_AMOUNT) {
            const testAmount = parseFloat(process.env.TEST_DEPOSIT_AMOUNT);
            depositAmount = ethers.parseUnits(testAmount.toString(), tokenDecimals);
            console.log("  Using custom deposit amount from TEST_DEPOSIT_AMOUNT:", testAmount, "tokens");
        } else {
            // 智能检测：如果 minAmount 是 6 位精度的值（10 * 10^6），但代币是 18 位精度
            // 则自动调整为 18 位精度的等效值（10 * 10^18）
            const minAmountFor6Decimals = ethers.parseUnits("10", 6); // 10 * 10^6
            const minAmountFor18Decimals = ethers.parseUnits("10", 18); // 10 * 10^18
            
            if (minAmount.toString() === minAmountFor6Decimals.toString() && tokenDecimals === 18) {
                console.log("  ⚠️  Warning: minDepositAmount is set for 6 decimals (10 USDT), but token has 18 decimals");
                console.log("  Auto-adjusting to 18 decimals equivalent: 10 USDT");
                depositAmount = minAmountFor18Decimals; // 使用 10 USDT (18位精度)
            } else {
                depositAmount = minAmount;
                console.log("  Using minimum deposit amount (minDepositAmount)");
            }
        }
        
        // 验证存款金额（使用更宽松的检查，因为可能存在精度不匹配）
        // 如果 depositAmount 是调整后的值，可能小于 minAmount（数值上），但这是合理的
        // 我们只检查实际金额是否合理（至少 10 USDT 的数值）
        const depositAmountValue = Number(ethers.formatUnits(depositAmount, tokenDecimals));
        if (depositAmountValue < 10) {
            console.log("  ⚠️  Warning: Deposit amount is very small:", depositAmountValue, "tokens");
            console.log("  This may fail if contract's minDepositAmount is set incorrectly for this token's decimals");
        }
        
        // 验证余额足够
        if (balance < depositAmount) {
            throw new Error(`Insufficient balance. Need ${ethers.formatUnits(depositAmount, tokenDecimals)}, have ${ethers.formatUnits(balance, tokenDecimals)}`);
        }
        
        const intendedRecipient = wallet.address;
        
        console.log("  Depositing:", ethers.formatUnits(depositAmount, tokenDecimals), "tokens");
        console.log("  Intended Recipient:", intendedRecipient);
        
        const depositTx = await vault.deposit(testTokenAddress, depositAmount, intendedRecipient);
        console.log("  Transaction hash:", depositTx.hash);
        
        const receipt = await depositTx.wait();
        console.log("  ✅ Deposit confirmed in block:", receipt.blockNumber);
        
        // 查找 DepositId 从事件
        const depositedEvent = receipt.logs.find(log => {
            try {
                const parsed = vault.interface.parseLog(log);
                return parsed && parsed.name === "Deposited";
            } catch {
                return false;
            }
        });
        
        if (depositedEvent) {
            const parsed = vault.interface.parseLog(depositedEvent);
            depositId = parsed.args.depositId;
            console.log("  ✅ Deposit ID:", depositId.toString());
        } else {
            throw new Error("Deposited event not found");
        }
    }, testResults);
    
    // 测试 5: 查询存款信息
    if (depositId !== null) {
        await runTest("Test 5: Get Deposit Info", async () => {
            const depositInfo = await vault.getDeposit(depositId);
            console.log("  Depositor:", depositInfo.depositor);
            console.log("  Token:", depositInfo.token);
            console.log("  Yield Token:", depositInfo.yieldToken);
            console.log("  Yield Amount:", ethers.formatUnits(depositInfo.yieldAmount, 18));
            console.log("  Intended Recipient:", depositInfo.intendedRecipient);
            console.log("  Deposit Time:", new Date(Number(depositInfo.depositTime) * 1000).toISOString());
            console.log("  Used:", depositInfo.used);
            
            assert(depositInfo.depositor.toLowerCase() === wallet.address.toLowerCase(), "Depositor mismatch");
            assert(depositInfo.intendedRecipient.toLowerCase() === wallet.address.toLowerCase(), "Recipient mismatch");
            assert(!depositInfo.used, "Deposit should not be used yet");
        }, testResults);
        
        // 测试 6: 查询底层资产数量
        await runTest("Test 6: Get Underlying Amount", async () => {
            // 先获取存款信息
            const depositInfo = await vault.getDeposit(depositId);
            console.log("  Deposit Yield Amount:", ethers.formatUnits(depositInfo.yieldAmount, tokenDecimals));
            
            // 直接调用 getUnderlyingAmount（view 函数）
            const underlyingAmount = await vault.getUnderlyingAmount(depositId);
            console.log("  Underlying Amount:", ethers.formatUnits(underlyingAmount, tokenDecimals));
            
            if (underlyingAmount === 0n) {
                // 尝试直接调用 delegate 的 estimateRedeemAmount 来验证
                const defaultDelegate = await vault.defaultLendingDelegate();
                const defaultTarget = await vault.defaultLendingTarget();
                const delegateContract = new ethers.Contract(defaultDelegate, [
                    "function estimateRedeemAmount(address,string,uint256,address) external pure returns (uint256)"
                ], provider);
                
                try {
                    const directResult = await delegateContract.estimateRedeemAmount.staticCall(
                        depositInfo.token,
                        "",
                        depositInfo.yieldAmount,
                        defaultTarget
                    );
                    console.log("  ⚠️  Direct call to delegate.estimateRedeemAmount:", ethers.formatUnits(directResult, tokenDecimals));
                    console.log("  ⚠️  This suggests the staticcall in contract may be failing");
                } catch (directError) {
                    console.log("  ⚠️  Direct call also failed:", directError.message);
                }
            }
            
            assert(underlyingAmount > 0, "Underlying amount should be greater than 0");
        }, testResults);
        
        // 测试 7: 查询可领取的存款
        await runTest("Test 7: Get Claimable Deposits", async () => {
            const claimableDeposits = await vault.getClaimableDeposits(wallet.address);
            console.log("  Claimable Deposits Count:", claimableDeposits.length);
            assert(claimableDeposits.length > 0, "Should have at least one claimable deposit");
            assert(claimableDeposits.includes(depositId), "Should include the deposit we just created");
        }, testResults);
        
        // 测试 8: Claim
        await runTest("Test 8: Claim", async () => {
            // 获取 yield token 地址和余额
            const depositInfo = await vault.getDeposit(depositId);
            const yieldToken = new ethers.Contract(depositInfo.yieldToken, erc20Abi, wallet);
            const balanceBefore = await yieldToken.balanceOf(wallet.address);
            
            console.log("  Yield Token:", depositInfo.yieldToken);
            console.log("  Yield Amount:", ethers.formatUnits(depositInfo.yieldAmount, tokenDecimals));
            console.log("  Balance before:", ethers.formatUnits(balanceBefore, tokenDecimals));
            
            const claimTx = await vault.claim(depositId);
            console.log("  Transaction hash:", claimTx.hash);
            
            const receipt = await claimTx.wait();
            console.log("  ✅ Claim confirmed in block:", receipt.blockNumber);
            
            const balanceAfter = await yieldToken.balanceOf(wallet.address);
            console.log("  Balance after:", ethers.formatUnits(balanceAfter, tokenDecimals));
            
            const received = balanceAfter - balanceBefore;
            assert(received >= depositInfo.yieldAmount, "Should receive at least the yield amount");
            
            // 验证状态
            const depositInfoAfter = await vault.getDeposit(depositId);
            assert(depositInfoAfter.used, "Deposit should be marked as used");
        }, testResults);
        
        // 测试 9: 直接调用 AAVE 赎回 USDT
        await runTest("Test 9: Redeem USDT Directly from AAVE", async () => {
            // 获取 yield token 余额（应该在用户钱包中）
            const depositInfo = await vault.getDeposit(depositId);
            const yieldToken = new ethers.Contract(depositInfo.yieldToken, erc20Abi, wallet);
            const yieldTokenBalance = await yieldToken.balanceOf(wallet.address);
            
            console.log("  Yield Token:", depositInfo.yieldToken);
            console.log("  Yield Token Balance:", ethers.formatUnits(yieldTokenBalance, tokenDecimals));
            
            if (yieldTokenBalance === 0n) {
                throw new Error("No yield token balance in wallet. Claim may have failed.");
            }
            
            // 获取 USDT 余额（赎回前）
            const usdtBalanceBefore = await testToken.balanceOf(wallet.address);
            console.log("  USDT Balance Before:", ethers.formatUnits(usdtBalanceBefore, tokenDecimals));
            
            // 获取 AAVE Pool 地址
            let lendingTarget = await vault.lendingTargets(testTokenAddress);
            if (lendingTarget === ethers.ZeroAddress) {
                lendingTarget = await vault.defaultLendingTarget();
            }
            
            if (lendingTarget === ethers.ZeroAddress) {
                throw new Error("Lending target not configured");
            }
            
            console.log("  AAVE Pool Address:", lendingTarget);
            
            // AAVE V3 Pool ABI
            const aavePoolAbi = [
                "function withdraw(address asset, uint256 amount, address to) external returns (uint256)"
            ];
            
            const aavePool = new ethers.Contract(lendingTarget, aavePoolAbi, wallet);
            
            // 调用 AAVE Pool.withdraw，使用 type(uint256).max 表示赎回全部
            const maxAmount = ethers.MaxUint256;
            console.log("  Calling AAVE Pool.withdraw...");
            const redeemTx = await aavePool.withdraw(testTokenAddress, maxAmount, wallet.address);
            console.log("  Transaction hash:", redeemTx.hash);
            
            const redeemReceipt = await redeemTx.wait();
            console.log("  ✅ Redeem confirmed in block:", redeemReceipt.blockNumber);
            
            // 检查 USDT 余额（赎回后）
            const usdtBalanceAfter = await testToken.balanceOf(wallet.address);
            const received = usdtBalanceAfter - usdtBalanceBefore;
            console.log("  USDT Balance After:", ethers.formatUnits(usdtBalanceAfter, tokenDecimals));
            console.log("  Received USDT:", ethers.formatUnits(received, tokenDecimals));
            
            assert(received > 0n, "Should receive USDT after redeem");
        }, testResults);
        
        // 测试 10: 尝试再次 Claim（应该失败）
        await runTest("Test 10: Try Claim Again (Should Fail)", async () => {
            try {
                const claimTx = await vault.claim(depositId);
                await claimTx.wait();
                throw new Error("Claim should have failed but succeeded");
            } catch (error) {
                // 检查错误代码 0x7b8c8210 (AlreadyUsed)
                if (error.data === "0x7b8c8210" || 
                    error.message.includes("AlreadyUsed") || 
                    error.reason?.includes("AlreadyUsed") ||
                    error.message.includes("0x7b8c8210")) {
                    console.log("  ✅ Correctly reverted with AlreadyUsed error");
                } else {
                    // 如果错误数据包含 0x7b8c8210，也认为是正确的
                    if (error.data && error.data.toString().includes("7b8c8210")) {
                        console.log("  ✅ Correctly reverted with AlreadyUsed error (detected by error code)");
                    } else {
                        throw error;
                    }
                }
            }
        }, testResults);
    } else {
        console.log("⚠️  Skipping tests that require deposit (deposit test failed or skipped)");
    }
    
    // 测试 11: 查询存款 ID 列表
    await runTest("Test 11: Get Deposit IDs", async () => {
        const depositIds = await vault.getDepositIds(wallet.address);
        console.log("  Deposit IDs count:", depositIds.length);
        console.log("  Deposit IDs:", depositIds.map(id => id.toString()));
    }, testResults);
    
    // 测试 12: 查询存款数量
    await runTest("Test 12: Get Deposit Count", async () => {
        const count = await vault.getDepositCount(wallet.address);
        console.log("  Deposit count:", count.toString());
    }, testResults);
    
    // 输出测试结果
    console.log("");
    console.log("====================================");
    console.log("Test Results");
    console.log("====================================");
    console.log(`Total Tests: ${testResults.passed + testResults.failed}`);
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log("");
    
    if (testResults.failed > 0) {
        console.log("Failed Tests:");
        testResults.tests.forEach(test => {
            if (!test.passed) {
                console.log(`  - ${test.name}: ${test.error}`);
            }
        });
        console.log("");
        process.exit(1);
    } else {
        console.log("✅ All tests passed!");
        process.exit(0);
    }
}

async function runTest(name, testFn, results) {
    console.log(`\n${name}`);
    console.log("-".repeat(50));
    try {
        await testFn();
        console.log(`✅ ${name} - PASSED`);
        results.passed++;
        results.tests.push({ name, passed: true });
    } catch (error) {
        console.log(`❌ ${name} - FAILED`);
        console.log(`   Error: ${error.message}`);
        results.failed++;
        results.tests.push({ name, passed: false, error: error.message });
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || "Assertion failed");
    }
}

main().catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
});
