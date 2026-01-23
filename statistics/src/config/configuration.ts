import { DeploymentConfigService } from './deployment-config.service';

// 注意：这个配置函数会在模块加载时执行
// 如果需要从部署文件动态加载，应该在服务启动时通过 DeploymentConfigService 加载
export default () => {
  // 优先从环境变量读取，如果没有则使用默认值
  // 实际池配置会在运行时通过 DeploymentConfigService 从部署文件加载
  return {
    port: parseInt(process.env.PORT, 10) || 4000,
    database: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
      username: process.env.DATABASE_USERNAME || 'postgres',
      // 确保密码始终是字符串类型
      password: process.env.DATABASE_PASSWORD ? String(process.env.DATABASE_PASSWORD) : '',
      database: process.env.DATABASE_NAME || 'statistics_db',
    },
    backend: {
      apiUrl: process.env.BACKEND_API_URL || 'http://localhost:8080',
      apiToken: process.env.BACKEND_API_TOKEN || '',
    },
    // 池配置现在从部署文件自动加载，但保留环境变量作为备选
    pools: [
      {
        chainId: parseInt(process.env.POOL_1_CHAIN_ID, 10) || 56,
        rpcUrl: process.env.POOL_1_RPC_URL || 'https://bsc-dataseed1.binance.org',
        contractAddress: process.env.POOL_1_CONTRACT_ADDRESS || '',
        name: 'Pool 1 (BSC)',
      },
      {
        chainId: parseInt(process.env.POOL_2_CHAIN_ID, 10) || 1,
        rpcUrl: process.env.POOL_2_RPC_URL || 'https://eth.llamarpc.com',
        contractAddress: process.env.POOL_2_CONTRACT_ADDRESS || '',
        name: 'Pool 2 (Ethereum)',
      },
      {
        chainId: parseInt(process.env.POOL_3_CHAIN_ID, 10) || 137,
        rpcUrl: process.env.POOL_3_RPC_URL || 'https://polygon-rpc.com',
        contractAddress: process.env.POOL_3_CONTRACT_ADDRESS || '',
        name: 'Pool 3 (Polygon)',
      },
    ],
    // 是否从部署文件自动加载池配置
    autoLoadPoolsFromDeployment: process.env.AUTO_LOAD_POOLS !== 'false',
    logLevel: process.env.LOG_LEVEL || 'info',
  };
};
