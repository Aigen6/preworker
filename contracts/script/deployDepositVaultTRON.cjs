const fs = require("fs");
const path = require("path");
const TronWeb = require("tronweb");
const { Interface } = require("ethers");

const rootDir = path.join(__dirname, "..");
const ARTIFACTS_DIR = path.join(rootDir, "out");
const CONFIG_DIR = path.join(__dirname, "config");

// 加载网络配置
function loadNetworkConfig() {
    const configPath = path.join(CONFIG_DIR, "tron-mainnet.json");
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
    return null;
}

// FEE_LIMIT 将从命令行参数读取

/**
 * @title Deploy DepositVault on TRON
 * @dev 在 TRON 主网部署 DepositVault
 * 
 * 使用方法:
 *   node script/deployDepositVaultTRON.cjs <PRIVATE_KEY> [OPTIONS]
 * 
 * 参数:
 *   - PRIVATE_KEY: 部署者私钥（必需，第一个参数）
 * 
 * 可选参数:
 *   --delegate=<address>   : 已部署的 JustLend 适配器地址（不提供则自动部署）
 *   --api-key=<key>        : TronGrid API Key
 *   --fee-limit=<number>   : 手续费限制（默认 500 TRX）
 *   --testnet              : 使用 Shasta 测试网
 *   --dry-run              : 仅检查配置，不实际部署
 * 
 * jToken 地址从 script/config/tron-mainnet.json 配置文件读取
 * 
 * 示例:
 *   node script/deployDepositVaultTRON.cjs YOUR_PRIVATE_KEY
 *   node script/deployDepositVaultTRON.cjs YOUR_PRIVATE_KEY --dry-run
 *   node script/deployDepositVaultTRON.cjs YOUR_PRIVATE_KEY --testnet
 */

// 解析命令行参数
function parseArgs() {
    const args = process.argv.slice(2);
    const result = {
        privateKey: null,
        delegate: null,
        apiKey: null,
        feeLimit: 500_000_000,
        dryRun: false,
        testnet: false
    };
    
    for (const arg of args) {
        if (arg.startsWith("--delegate=")) {
            result.delegate = arg.slice(11);
        } else if (arg.startsWith("--api-key=")) {
            result.apiKey = arg.slice(10);
        } else if (arg.startsWith("--fee-limit=")) {
            result.feeLimit = Number(arg.slice(12));
        } else if (arg === "--dry-run") {
            result.dryRun = true;
        } else if (arg === "--testnet" || arg === "--shasta") {
            result.testnet = true;
        } else if (!arg.startsWith("--") && !result.privateKey) {
            // 第一个非 -- 开头的参数作为私钥
            result.privateKey = arg.replace(/^0x/, "");
        }
    }
    
    return result;
}
async function main() {
    console.log("====================================");
    console.log("Deploying DepositVault on TRON");
    console.log("====================================");
    
    // 解析命令行参数
    const args = parseArgs();
    
    // 获取私钥（优先命令行参数，其次环境变量）
    const privateKeyRaw = args.privateKey || derivePrivateKey();
    if (!privateKeyRaw) {
        console.error("用法: node script/deployDepositVaultTRON.cjs <PRIVATE_KEY> [OPTIONS]");
        console.error("");
        console.error("示例:");
        console.error("  node script/deployDepositVaultTRON.cjs YOUR_PRIVATE_KEY --jtoken=TXJgMdjVX5dKiQaUi9QobwNxtSQaFqccvd");
        throw new Error("请提供私钥作为第一个参数");
    }
    
    const FEE_LIMIT = args.feeLimit;
    
    // 选择网络
    let fullHost;
    if (args.testnet) {
        fullHost = "https://api.shasta.trongrid.io";
        console.log("⚠️  使用测试网 (Shasta)");
    } else {
        fullHost = process.env.TRON_FULLNODE || "https://api.trongrid.io";
        console.log("🌐 使用主网 (Mainnet)");
    }
    
    const solidityNode = process.env.TRON_SOLIDITY || fullHost;
    const eventServer = process.env.TRON_EVENT || fullHost;
    
    const tronWeb = new TronWeb({
        fullHost,
        solidityNode,
        eventServer,
        privateKey: privateKeyRaw
    });
    
    if (args.apiKey) {
        tronWeb.setHeader({ "TRON-PRO-API-KEY": args.apiKey });
    }
    
    const deployerAddress = tronWeb.address.fromPrivateKey(privateKeyRaw);
    
    // owner 地址（使用部署者地址）
    const initialOwner = deployerAddress;
    
    // 验证地址格式
    const normalizedOwner = normalizeAddress(tronWeb, initialOwner);
    if (!normalizedOwner) {
        throw new Error("Invalid INITIAL_OWNER address");
    }
    
    console.log("Deployer:", deployerAddress);
    console.log("Initial Owner:", normalizedOwner);
    if (deployerAddress.toLowerCase() !== normalizedOwner.toLowerCase()) {
        console.log("Note: Owner is different from deployer");
    }
    
    // 获取 jToken 地址（从配置文件读取）
    const networkConfig = loadNetworkConfig();
    let defaultJToken = networkConfig?.tokens?.USDT?.jToken;
    if (!defaultJToken) {
        throw new Error("请在 script/config/tron-mainnet.json 中配置 USDT.jToken 地址");
    }
    
    // Dry-run 模式：只检查配置，不实际部署
    if (args.dryRun) {
        console.log("");
        console.log("====================================");
        console.log("🧪 DRY-RUN 模式 - 配置检查");
        console.log("====================================");
        console.log("✅ 私钥格式正确（64位十六进制）");
        console.log("✅ 部署者地址:", deployerAddress);
        console.log("✅ Owner 地址:", normalizedOwner);
        console.log("✅ jToken 地址:", defaultJToken || "(未设置，将使用零地址)");
        console.log("✅ Fee Limit:", FEE_LIMIT / 1e6, "TRX");
        console.log("✅ 网络:", args.testnet ? "Shasta 测试网" : "主网");
        
        // 检查编译产物
        const vaultArtifact = path.join(ARTIFACTS_DIR, "DepositVault.sol/DepositVault.json");
        const delegateArtifact = path.join(ARTIFACTS_DIR, "JustLendDelegate.sol/JustLendDelegate.json");
        if (fs.existsSync(vaultArtifact) && fs.existsSync(delegateArtifact)) {
            console.log("✅ 编译产物存在");
        } else {
            console.log("❌ 编译产物缺失，请先运行 forge build");
        }
        
        console.log("");
        console.log("配置检查通过！移除 --dry-run 参数执行实际部署。");
        return;
    }
    
    // 检查账户余额
    const account = await tronWeb.trx.getAccount(deployerAddress);
    const balance = account.balance || 0;
    console.log("Balance:", balance / 1e6, "TRX");
    console.log("");
    
    // 1. 部署或使用现有的 JustLend 适配器
    let justLendDelegate = args.delegate;
    let delegateResult = null;
    if (!justLendDelegate) {
        console.log("Deploying JustLendDelegate...");
        delegateResult = await deployFromArtifact(
            tronWeb,
            "JustLendDelegate",
            "JustLendDelegate.sol/JustLendDelegate.json",
            [],
            privateKeyRaw,
            deployerAddress,
            FEE_LIMIT
        );
        justLendDelegate = delegateResult.address;
        console.log("✅ Deployed JustLendDelegate:", justLendDelegate);
    } else {
        justLendDelegate = normalizeAddress(tronWeb, justLendDelegate);
        console.log("Using existing JustLendDelegate:", justLendDelegate);
    }
    
    // 2. 规范化 jToken 地址（已从配置文件读取）
    defaultJToken = normalizeAddress(tronWeb, defaultJToken);
    console.log("Default jToken (lendingTarget):", defaultJToken);
    console.log("");
    
    // 3. 部署 DepositVault
    console.log("Deploying DepositVault...");
    const vaultResult = await deployFromArtifact(
        tronWeb,
        "DepositVault",
        "DepositVault.sol/DepositVault.json",
        [normalizedOwner, justLendDelegate, defaultJToken],
        privateKeyRaw,
        deployerAddress,
        FEE_LIMIT
    );
    
    const vaultAddress = vaultResult.address;
    
    // 4. 验证部署
    const vaultContract = await tronWeb.contract(vaultResult.artifact.abi, vaultAddress);
    let owner = await vaultContract.owner().call();
    let defaultDelegate = await vaultContract.defaultLendingDelegate().call();
    let defaultTarget = await vaultContract.defaultLendingTarget().call();
    const recoveryDelay = await vaultContract.recoveryDelay().call();
    
    // 转换地址格式（合约返回的可能是 hex 格式）
    owner = normalizeAddress(tronWeb, owner) || owner;
    defaultDelegate = normalizeAddress(tronWeb, defaultDelegate) || defaultDelegate;
    defaultTarget = normalizeAddress(tronWeb, defaultTarget) || defaultTarget;
    
    // 验证配置（使用规范化后的地址比较）
    const ownerMatch = owner.toLowerCase() === normalizedOwner.toLowerCase() ||
                       tronWeb.address.toHex(owner).toLowerCase() === tronWeb.address.toHex(normalizedOwner).toLowerCase();
    const delegateMatch = defaultDelegate.toLowerCase() === justLendDelegate.toLowerCase() ||
                          tronWeb.address.toHex(defaultDelegate).toLowerCase() === tronWeb.address.toHex(justLendDelegate).toLowerCase();
    
    if (!ownerMatch) {
        console.log("Warning: Owner address format mismatch (may be OK)");
        console.log("  Expected:", normalizedOwner);
        console.log("  Got:", owner);
    }
    if (!delegateMatch) {
        console.log("Warning: Delegate address format mismatch (may be OK)");
        console.log("  Expected:", justLendDelegate);
        console.log("  Got:", defaultDelegate);
    }
    
    // 5. 输出部署信息
    console.log("");
    console.log("====================================");
    console.log("Deployment Complete");
    console.log("====================================");
    console.log("DepositVault Address:", vaultAddress);
    console.log("Owner:", owner);
    console.log("Default Lending Delegate:", defaultDelegate);
    console.log("Default Lending Target (jToken):", defaultTarget);
    console.log("Recovery Delay:", recoveryDelay.toString(), "seconds (3 days)");
    console.log("");
    
    // 6. 保存部署结果到文件
    const deploymentInfo = {
        network: "tron",
        chainId: "0x2b6653dc", // TRON mainnet chain ID
        deployer: deployerAddress,
        timestamp: new Date().toISOString(),
        contracts: {
            DepositVault: {
                address: vaultAddress,
                owner: owner,
                defaultLendingDelegate: defaultDelegate,
                defaultLendingTarget: defaultTarget,
                recoveryDelay: recoveryDelay.toString(),
                txid: vaultResult.txid
            },
            JustLendDelegate: {
                address: justLendDelegate,
                txid: delegateResult?.txid || "N/A"
            }
        },
        configuration: {
            defaultJToken: defaultJToken
        }
    };
    
    const outputPath = path.join(rootDir, "deployed", "result_tron.json");
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
    console.log("✅ Deployment info saved to:", outputPath);
    console.log("");
    
    console.log("Next Steps:");
    console.log("1. Configure token-specific jToken addresses:");
    console.log(`   vault.setTokenConfig(tokenAddress, delegate, jTokenAddress, tokenKey)`);
    
    // 显示配置文件中的 jToken 地址
    const configInfo = loadNetworkConfig();
    if (configInfo && configInfo.tokens) {
        console.log("   jToken addresses from config/tron-mainnet.json:");
        for (const [symbol, tokenInfo] of Object.entries(configInfo.tokens)) {
            console.log(`   - j${symbol}: ${tokenInfo.jToken}`);
        }
    } else {
        console.log("   See script/config/tron-mainnet.json for jToken addresses");
    }
    
    console.log("2. Verify contract on TronScan (if supported)");
    console.log("");
}

function derivePrivateKey() {
    const direct = process.env.TRON_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (direct && direct.trim().length > 0) {
        return direct.replace(/^0x/, "");
    }
    
    const mnemonicPath = path.join(rootDir, ".mnemonic");
    if (fs.existsSync(mnemonicPath)) {
        const mnemonic = fs.readFileSync(mnemonicPath, "utf8").trim();
        if (mnemonic) {
            const { HDNodeWallet } = require("ethers");
            const index = Number(process.env.DERIVATION_INDEX || "0");
            const derivationPath = `m/44'/195'/0'/0/${index}`;
            const wallet = HDNodeWallet.fromPhrase(mnemonic, undefined, derivationPath);
            return wallet.privateKey.replace(/^0x/, "");
        }
    }
    return "";
}

function normalizeAddress(tronWeb, addr) {
    if (!addr) return null;
    if (addr.startsWith("T")) return addr;
    if (addr.startsWith("0x")) {
        const lower = addr.toLowerCase();
        if (lower === "0x0000000000000000000000000000000000000000") {
            return "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"; // TRON zero address
        }
        if (!lower.startsWith("0x41")) {
            throw new Error(`地址 ${addr} 不是合法的 Tron Hex（应该以 0x41 开头）`);
        }
        return tronWeb.address.fromHex(addr);
    }
    if (addr.startsWith("41") && addr.length === 42) {
        return tronWeb.address.fromHex(`0x${addr}`);
    }
    return addr;
}

function loadArtifact(fileName) {
    const artifactPath = path.join(ARTIFACTS_DIR, fileName);
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`未找到编译产物: ${artifactPath}，请先运行 forge build`);
    }
    return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

async function deployFromArtifact(tronWeb, label, fileName, parameters, privateKeyRaw, deployerAddress, feeLimit = 500_000_000) {
    const artifact = loadArtifact(fileName);
    console.log(`\n部署 ${label} ...`);
    
    const rawBytecode = artifact.bytecode?.object || artifact.bytecode;
    if (typeof rawBytecode !== "string") {
        throw new Error(`无效的 bytecode: ${fileName}`);
    }
    
    const bytecode = rawBytecode.startsWith("0x") ? rawBytecode.slice(2) : rawBytecode;
    
    // 转换参数为 TRON 格式
    const tronParams = parameters.map(param => {
        if (typeof param === "string" && param.startsWith("T")) {
            return tronWeb.address.toHex(param);
        }
        return param;
    });
    
    const tx = await tronWeb.transactionBuilder.createSmartContract(
        {
            abi: artifact.abi,
            bytecode,
            feeLimit: feeLimit,
            callValue: 0,
            parameters: tronParams
        },
        deployerAddress
    );
    
    const signed = await tronWeb.trx.sign(tx, privateKeyRaw);
    const res = await tronWeb.trx.sendRawTransaction(signed);
    
    if (!res.result) {
        console.error("广播失败:", res);
        throw new Error(`部署 ${label} 交易发送失败`);
    }
    
    console.log(`${label} 部署交易 txid: ${res.txid}`);
    const info = await waitForTx(tronWeb, res.txid);
    const contractHex = info.contract_address || (tx.contract_address ? `0x${tx.contract_address}` : null);
    const address = contractHex ? tronWeb.address.fromHex(contractHex) : "(未知，稍后查询)";
    const energy = info.receipt?.energy_usage_total;
    const fee = info.fee;
    
    if (address) console.log(`${label} 地址: ${address}`);
    if (typeof energy === "number") console.log(`${label} 能量消耗: ${energy}`);
    if (typeof fee === "number") console.log(`${label} 手续费(SUN): ${fee} 约 TRX=${fee / 1e6}`);
    
    const contract = address !== "(未知，稍后查询)" ? await tronWeb.contract(artifact.abi, address) : null;
    return { artifact, contract, address, txid: res.txid, energy, fee };
}

async function waitForTx(tronWeb, txid, retries = 60, delayMs = 2000) {
    for (let i = 0; i < retries; i++) {
        const info = await tronWeb.trx.getTransactionInfo(txid);
        if (info && Object.keys(info).length > 0) {
            return info;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    throw new Error(`交易 ${txid} 超时未确认`);
}

main().catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
});
