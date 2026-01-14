const fs = require("fs");
const path = require("path");
const TronWeb = require("tronweb");
const { Interface } = require("ethers");

const rootDir = path.join(__dirname, "..");
const ARTIFACTS_DIR = path.join(rootDir, "out");

const FEE_LIMIT = Number(process.env.TRON_FEE_LIMIT || 300_000_000); // 300 TRX

/**
 * @title Deploy DepositVault on TRON
 * @dev 在 TRON 主网部署 DepositVault
 * 
 * 使用方法:
 *   node script/deployDepositVaultTRON.cjs
 * 
 * 环境变量:
 *   - TRON_PRIVATE_KEY 或 PRIVATE_KEY: 部署者私钥（必需）
 *   - INITIAL_OWNER: 初始所有者地址（可选，如果不提供则使用部署者地址）
 *                    说明：部署者（deployer）是执行部署的地址，所有者（owner）是合约的管理者
 *                    它们可以是同一个地址，也可以是不同的地址（例如部署后转移给多签钱包）
 *   - TRON_FULLNODE: TRON 全节点 URL（可选，默认使用 TronGrid）
 *   - TRON_API_KEY: TronGrid API Key（可选）
 *   - JUSTLEND_DELEGATE: JustLend 适配器地址（可选，如果不提供会自动部署）
 *   - DEFAULT_JTOKEN: 默认 jToken 地址（可选，用于 defaultLendingTarget）
 *   - TRON_FEE_LIMIT: 手续费限制（可选，默认 300 TRX）
 */
async function main() {
    console.log("====================================");
    console.log("Deploying DepositVault on TRON");
    console.log("====================================");
    
    // 加载私钥
    const privateKeyRaw = derivePrivateKey();
    if (!privateKeyRaw) {
        throw new Error("请设置 TRON_PRIVATE_KEY/PRIVATE_KEY，或在 .mnemonic 中提供助记词");
    }
    
    // 初始化 TronWeb
    const fullHost = process.env.TRON_FULLNODE || "https://api.trongrid.io";
    const solidityNode = process.env.TRON_SOLIDITY || fullHost;
    const eventServer = process.env.TRON_EVENT || fullHost;
    
    const tronWeb = new TronWeb({
        fullHost,
        solidityNode,
        eventServer,
        privateKey: privateKeyRaw
    });
    
    if (process.env.TRON_API_KEY) {
        tronWeb.setHeader({ "TRON-PRO-API-KEY": process.env.TRON_API_KEY });
    }
    
    const deployerAddress = tronWeb.address.fromPrivateKey(privateKeyRaw);
    
    // INITIAL_OWNER 是可选的，如果不提供则使用部署者地址
    // 关系说明：
    // - TRON_PRIVATE_KEY: 部署者的私钥，用于签名和发送部署交易
    // - INITIAL_OWNER: 合约的所有者地址，拥有合约的管理权限（可以调用 owner 函数）
    // 它们可以是同一个地址（部署者就是所有者），也可以是不同的地址（部署后转移给多签钱包等）
    const initialOwner = process.env.INITIAL_OWNER || deployerAddress;
    
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
    
    // 检查账户余额
    const account = await tronWeb.trx.getAccount(deployerAddress);
    const balance = account.balance || 0;
    console.log("Balance:", balance / 1e6, "TRX");
    console.log("");
    
    // 1. 部署或使用现有的 JustLend 适配器
    let justLendDelegate = process.env.JUSTLEND_DELEGATE;
    let delegateResult = null;
    if (!justLendDelegate) {
        console.log("Deploying JustLendDelegate...");
        delegateResult = await deployFromArtifact(
            tronWeb,
            "JustLendDelegate",
            "JustLendDelegate.sol/JustLendDelegate.json",
            [],
            privateKeyRaw,
            deployerAddress
        );
        justLendDelegate = delegateResult.address;
        console.log("✅ Deployed JustLendDelegate:", justLendDelegate);
    } else {
        justLendDelegate = normalizeAddress(tronWeb, justLendDelegate);
        console.log("Using existing JustLendDelegate:", justLendDelegate);
    }
    
    // 2. 获取默认 jToken 地址
    let defaultJToken = process.env.DEFAULT_JTOKEN;
    if (defaultJToken) {
        defaultJToken = normalizeAddress(tronWeb, defaultJToken);
        console.log("Default jToken (lendingTarget):", defaultJToken);
    } else {
        defaultJToken = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"; // 零地址的 TRON 格式
        console.log("WARNING: DEFAULT_JTOKEN not set, using zero address");
        console.log("You should set token-specific jToken addresses after deployment");
    }
    console.log("");
    
    // 3. 部署 DepositVault
    console.log("Deploying DepositVault...");
    const vaultResult = await deployFromArtifact(
        tronWeb,
        "DepositVault",
        "DepositVault.sol/DepositVault.json",
        [normalizedOwner, justLendDelegate, defaultJToken],
        privateKeyRaw,
        deployerAddress
    );
    
    const vaultAddress = vaultResult.address;
    
    // 4. 验证部署
    const vaultContract = await tronWeb.contract(vaultResult.artifact.abi, vaultAddress);
    const owner = await vaultContract.owner().call();
    const defaultDelegate = await vaultContract.defaultLendingDelegate().call();
    const defaultTarget = await vaultContract.defaultLendingTarget().call();
    const recoveryDelay = await vaultContract.recoveryDelay().call();
    
    if (owner.toLowerCase() !== normalizedOwner.toLowerCase()) {
        throw new Error("Owner mismatch");
    }
    if (defaultDelegate.toLowerCase() !== justLendDelegate.toLowerCase()) {
        throw new Error("Delegate mismatch");
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
    console.log("   Example jToken addresses on TRON:");
    console.log("   - jUSDT: TYZRXTRxTDw5pVjV8S3McZ3Xzr1PQHcFk");
    console.log("   - jUSDC: TYukBQZ2XXCcRCReAUguyXncCWNY9CEiDQ");
    console.log("   - jTRX: TQn9Y2khEsLMWTgY5v3o1cJhGp1T5WJzFp");
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

async function deployFromArtifact(tronWeb, label, fileName, parameters, privateKeyRaw, deployerAddress) {
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
            feeLimit: FEE_LIMIT,
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
