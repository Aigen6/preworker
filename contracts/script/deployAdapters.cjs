const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const rootDir = path.join(__dirname, "..");
const ARTIFACTS_DIR = path.join(rootDir, "out");

/**
 * @title Deploy Adapters
 * @dev 部署借贷适配器（AAVEv3Delegate 和 JustLendDelegate）
 * 
 * 使用方法:
 *   # 部署 AAVE V3 适配器（EVM 链）
 *   node script/deployAdapters.cjs --network ethereum
 *   node script/deployAdapters.cjs --network bsc
 *   
 *   # 部署 JustLend 适配器（TRON）
 *   node script/deployAdapters.cjs --network tron --adapter justlend
 * 
 * 环境变量:
 *   - PRIVATE_KEY: 部署者私钥（必需）
 *   - RPC_URL: RPC 节点 URL（可选，根据网络自动选择）
 *   - ADAPTER: 适配器类型，"aave" 或 "justlend"（默认: "aave"）
 */
async function main() {
    const args = process.argv.slice(2);
    const networkArg = args.find(arg => arg.startsWith("--network="));
    const adapterArg = args.find(arg => arg.startsWith("--adapter="));
    
    const network = networkArg ? networkArg.split("=")[1] : process.env.NETWORK || "ethereum";
    const adapterType = adapterArg ? adapterArg.split("=")[1] : process.env.ADAPTER || "aave";
    
    console.log("====================================");
    console.log("Deploying Lending Adapters");
    console.log("====================================");
    console.log("Network:", network);
    console.log("Adapter Type:", adapterType);
    console.log("");
    
    // 加载私钥
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("PRIVATE_KEY environment variable is required");
    }
    
    if (network === "tron" || adapterType === "justlend") {
        // TRON 网络使用 TronWeb
        await deployJustLendAdapter();
    } else {
        // EVM 链使用 ethers.js
        await deployAAVEAdapter(network, privateKey);
    }
}

async function deployAAVEAdapter(network, privateKey) {
    console.log("Deploying AAVEv3Delegate on", network, "...");
    
    // 获取 RPC URL
    const rpcUrl = getRpcUrl(network);
    if (!rpcUrl) {
        throw new Error(`No RPC URL configured for network: ${network}`);
    }
    
    // 创建 provider 和 wallet
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    console.log("Deployer:", wallet.address);
    const balance = await provider.getBalance(wallet.address);
    console.log("Balance:", ethers.formatEther(balance), getNativeCurrency(network));
    console.log("");
    
    // 加载合约 artifact
    const artifactPath = path.join(ARTIFACTS_DIR, "AAVEv3Delegate.sol", "AAVEv3Delegate.json");
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Artifact not found: ${artifactPath}. Please run 'forge build' first.`);
    }
    
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    
    // 部署合约
    console.log("Deploying AAVEv3Delegate...");
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    
    const address = await contract.getAddress();
    console.log("✅ Deployed AAVEv3Delegate:", address);
    console.log("");
    console.log("Next Steps:");
    console.log("1. Use this address as defaultLendingDelegate in DepositVault");
    console.log("2. Set lendingTarget to AAVE V3 Pool address for each token");
    console.log("");
    console.log("AAVE V3 Pool Addresses:");
    console.log("  Ethereum Mainnet: 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2");
    console.log("  BSC Mainnet: 0x6807dc923806fE8Fd134338EABCA509979a7e0cB");
    console.log("  Polygon: 0x794a61358D6845594F94dc1DB02A252b5b4814aD");
    console.log("  Base: 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5");
}

async function deployJustLendAdapter() {
    console.log("Deploying JustLendDelegate on TRON...");
    console.log("Note: TRON deployment requires TronWeb. Please use deployDepositVaultTRON.cjs instead.");
    throw new Error("JustLend adapter deployment should be done via deployDepositVaultTRON.cjs");
}

function getRpcUrl(network) {
    // 优先使用环境变量
    if (process.env.RPC_URL) {
        return process.env.RPC_URL;
    }
    
    // 默认 RPC URLs
    const rpcUrls = {
        ethereum: "https://ethereum-rpc.publicnode.com",
        bsc: "https://bsc-dataseed1.binance.org",
        polygon: "https://polygon-rpc.com",
        base: "https://mainnet.base.org",
        sepolia: "https://rpc.sepolia.org",
        bsc_testnet: "https://data-seed-prebsc-1-s1.binance.org:8545"
    };
    
    return rpcUrls[network.toLowerCase()] || null;
}

function getNativeCurrency(network) {
    const currencies = {
        ethereum: "ETH",
        bsc: "BNB",
        polygon: "MATIC",
        base: "ETH",
        sepolia: "ETH",
        bsc_testnet: "BNB"
    };
    
    return currencies[network.toLowerCase()] || "ETH";
}

main().catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
});
