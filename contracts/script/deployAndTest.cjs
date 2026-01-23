const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/**
 * @title Deploy and Test Multi-Recipient Flow
 * @dev 一键部署并测试多接收者流程
 * 
 * 使用方法:
 *   node script/deployAndTest.cjs
 * 
 * 环境变量:
 *   - PRIVATE_KEY: 部署者私钥（可选，默认使用 Anvil 第一个账户）
 *   - RPC_URL: RPC URL（可选，默认 http://localhost:8545）
 */
async function main() {
    console.log("====================================");
    console.log("Deploy and Test Multi-Recipient Flow");
    console.log("====================================");
    console.log("");
    
    const rpcUrl = process.env.RPC_URL || "http://localhost:8545";
    const privateKey = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    
    console.log("Step 1: Building contracts...");
    try {
        execSync("forge build", { stdio: "inherit", cwd: path.join(__dirname, "..") });
        console.log("✅ Build complete\n");
    } catch (error) {
        console.error("❌ Build failed:", error.message);
        process.exit(1);
    }
    
    console.log("Step 2: Deploying to local node...");
    try {
        execSync(`PRIVATE_KEY=${privateKey} RPC_URL=${rpcUrl} node script/deployLocal.cjs`, {
            stdio: "inherit",
            cwd: path.join(__dirname, ".."),
            env: { ...process.env, PRIVATE_KEY: privateKey, RPC_URL: rpcUrl }
        });
        console.log("✅ Deployment complete\n");
    } catch (error) {
        console.error("❌ Deployment failed:", error.message);
        process.exit(1);
    }
    
    console.log("Step 3: Testing multi-recipient flow...");
    try {
        execSync(`RPC_URL=${rpcUrl} node script/testMultiRecipient.cjs`, {
            stdio: "inherit",
            cwd: path.join(__dirname, ".."),
            env: { ...process.env, RPC_URL: rpcUrl }
        });
        console.log("✅ Test complete\n");
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        process.exit(1);
    }
    
    console.log("====================================");
    console.log("✅ All Steps Completed Successfully!");
    console.log("====================================");
}

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});
