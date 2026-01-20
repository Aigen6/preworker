import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface DeploymentResult {
  network: string;
  chainId: string;
  deployer: string;
  timestamp: string;
  contracts: {
    DepositVault?: {
      address: string;
      owner: string;
      defaultLendingDelegate: string;
      defaultLendingTarget: string;
      recoveryDelay?: string;
      txid?: string;
    };
    [key: string]: {
      address: string;
      [key: string]: unknown;
    } | undefined;
  };
  configuration?: {
    [key: string]: string;
  };
}

export interface PoolConfig {
  chainId: number;
  rpcUrl: string;
  contractAddress: string;
  name: string;
  network: string;
}

/**
 * ChainId 到网络名称的映射
 * 支持多种 chainId 格式（十进制、十六进制、SLIP-44）
 */
const CHAIN_ID_TO_NETWORK: Record<number, string> = {
  1: 'eth',        // Ethereum Mainnet
  56: 'bsc',       // BSC Mainnet
  137: 'polygon',  // Polygon
  195: 'tron',     // TRON (SLIP-44)
  714: 'bsc',      // BSC (SLIP-44)
  966: 'polygon',  // Polygon (SLIP-44)
  728126428: 'tron', // TRON (EVM-compatible: 0x2b6653dc)
};

/**
 * 网络名称到默认 RPC URL 的映射
 */
const NETWORK_TO_RPC: Record<string, string> = {
  eth: 'https://eth.llamarpc.com',
  bsc: 'https://bsc-dataseed1.binance.org',
  polygon: 'https://polygon-rpc.com',
  tron: 'https://api.trongrid.io',
};

@Injectable()
export class DeploymentConfigService {
  private readonly logger = new Logger(DeploymentConfigService.name);
  private readonly deploymentDir: string;

  constructor() {
    // 部署文件目录：优先使用 contracts/deployed，如果没有则使用 webfront/public/deployed
    const contractsDeployed = path.join(
      process.cwd(),
      '../contracts/deployed',
    );
    const webfrontDeployed = path.join(
      process.cwd(),
      '../webfront/public/deployed',
    );

    if (fs.existsSync(contractsDeployed)) {
      this.deploymentDir = contractsDeployed;
    } else if (fs.existsSync(webfrontDeployed)) {
      this.deploymentDir = webfrontDeployed;
    } else {
      this.logger.warn(
        'Deployment directory not found, using contracts/deployed as default',
      );
      this.deploymentDir = contractsDeployed;
    }
  }

  /**
   * 根据 chainId 获取网络名称
   * 支持从部署文件中的 chainId（可能是字符串格式）获取
   */
  getNetworkNameFromChainId(chainId: number | string): string | null {
    const chainIdNum = typeof chainId === 'string' ? this.parseChainId(chainId) : chainId;
    return CHAIN_ID_TO_NETWORK[chainIdNum] || null;
  }

  /**
   * 从部署结果 JSON 文件读取配置
   * @param chainId 可以是数字或字符串（支持十六进制）
   */
  loadDeploymentConfig(chainId: number | string): DeploymentResult | null {
    try {
      const networkName = this.getNetworkNameFromChainId(chainId);
      if (!networkName) {
        this.logger.warn(`未找到 chainId ${chainId} 对应的网络名称`);
        return null;
      }

      const filePath = path.join(
        this.deploymentDir,
        `result_${networkName}.json`,
      );

      if (!fs.existsSync(filePath)) {
        this.logger.warn(`未找到部署配置文件: ${filePath}`);
        return null;
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(fileContent) as DeploymentResult;
      return data;
    } catch (error) {
      this.logger.error(
        `加载部署配置失败 (chainId: ${chainId}): ${error.message}`,
      );
      return null;
    }
  }

  /**
   * 从部署配置获取 DepositVault 地址
   */
  getDepositVaultAddress(chainId: number): string | null {
    const config = this.loadDeploymentConfig(chainId);
    if (!config) {
      return null;
    }

    return config.contracts.DepositVault?.address || null;
  }

  /**
   * 解析 chainId（支持十六进制和十进制）
   */
  parseChainId(chainIdStr: string): number {
    if (chainIdStr.startsWith('0x') || chainIdStr.startsWith('0X')) {
      return parseInt(chainIdStr, 16);
    }
    return parseInt(chainIdStr, 10);
  }

  /**
   * 从部署文件自动加载所有池配置
   */
  loadPoolsFromDeployment(): PoolConfig[] {
    const pools: PoolConfig[] = [];

    try {
      // 读取部署目录中的所有 result_*.json 文件
      const files = fs.readdirSync(this.deploymentDir);
      const deploymentFiles = files.filter((f) =>
        f.startsWith('result_') && f.endsWith('.json'),
      );

      for (const file of deploymentFiles) {
        try {
          const filePath = path.join(this.deploymentDir, file);
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          const config = JSON.parse(fileContent) as DeploymentResult;

          if (!config.contracts.DepositVault?.address) {
            this.logger.warn(
              `部署文件 ${file} 中没有 DepositVault 地址，跳过`,
            );
            continue;
          }

          const chainId = this.parseChainId(config.chainId);
          const network = config.network || this.getNetworkNameFromChainId(config.chainId) || 'unknown';
          const rpcUrl = NETWORK_TO_RPC[network] || '';

          pools.push({
            chainId,
            rpcUrl,
            contractAddress: config.contracts.DepositVault.address,
            name: `Pool (${network.toUpperCase()})`,
            network,
          });

          this.logger.log(
            `✅ 从部署文件加载池配置: ${network} (chainId: ${chainId}, address: ${config.contracts.DepositVault.address})`,
          );
        } catch (error) {
          this.logger.error(`解析部署文件 ${file} 失败: ${error.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`读取部署目录失败: ${error.message}`);
    }

    return pools;
  }
}
