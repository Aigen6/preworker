import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  
  webpack: (config, { isServer }) => {
    const webpack = require('webpack');
    const fs = require('fs');
    const path = require('path');
    
    // Next.js 16 webpack 无法正确解析 package.json exports，需要手动指定路径
    // 使用 webpack 的 context 来解析路径（更可靠）
    const webpackContext = config.context || process.cwd();
    
    const resolvePackageFile = (packageName: string, exportPath: string = '.') => {
      // 使用 webpack context 作为基础路径
      const nodeModulesPath = path.resolve(webpackContext, 'node_modules', packageName);
      
      if (!fs.existsSync(nodeModulesPath)) {
        // 如果使用 webpack context 失败，尝试其他路径
        const fallbackPaths = [
          path.resolve(process.cwd(), 'node_modules', packageName),
          path.resolve(__dirname, 'node_modules', packageName),
        ];
        
        let foundPath: string | null = null;
        for (const testPath of fallbackPaths) {
          if (fs.existsSync(testPath)) {
            foundPath = testPath;
            break;
          }
        }
        
        if (!foundPath) {
          throw new Error(`Package not found: ${packageName}\nWebpack context: ${webpackContext}\nTried: ${nodeModulesPath}`);
        }
        
        return foundPath;
      }
      
      return nodeModulesPath;
    };
    
    const getPackageFilePath = (packageName: string, exportPath: string = '.') => {
      const packageDir = resolvePackageFile(packageName, exportPath);
      
      // 根据 exports 定义构建文件路径
      // "." -> dist/index.mjs
      // "/react" -> dist/react.mjs (sdk) 或 dist/react/index.mjs (wallet-sdk)
      let filePath: string;
      if (exportPath === '.') {
        filePath = 'dist/index.mjs';
      } else if (exportPath === '/react') {
        // 检查是 sdk 还是 wallet-sdk
        if (packageName === '@enclave-hq/sdk') {
          filePath = 'dist/react.mjs';
        } else {
          filePath = 'dist/react/index.mjs';
        }
      } else {
        throw new Error(`Unknown export path: ${exportPath}`);
      }
      
      const fullPath = path.join(packageDir, filePath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${fullPath} for ${packageName}${exportPath}`);
      }
      
      return fullPath;
    };
    
    // 解析包的主入口和子路径
    const sdkIndexMjs = getPackageFilePath('@enclave-hq/sdk', '.');
    const sdkReactMjs = getPackageFilePath('@enclave-hq/sdk', '/react');
    const walletSdkIndexMjs = getPackageFilePath('@enclave-hq/wallet-sdk', '.');
    const walletSdkReactMjs = getPackageFilePath('@enclave-hq/wallet-sdk', '/react');
    const chainUtilsIndexMjs = getPackageFilePath('@enclave-hq/chain-utils', '.');
    
    // 设置别名 - 使用绝对路径
    config.resolve.alias = {
      ...config.resolve.alias,
      '@enclave-hq/sdk$': sdkIndexMjs,
      '@enclave-hq/sdk/react': sdkReactMjs,
      '@enclave-hq/wallet-sdk$': walletSdkIndexMjs,
      '@enclave-hq/wallet-sdk/react': walletSdkReactMjs,
      '@enclave-hq/chain-utils$': chainUtilsIndexMjs,
    };
    
    // 添加 .mjs 支持
    if (!config.resolve.extensions?.includes('.mjs')) {
      config.resolve.extensions = ['.mjs', ...(config.resolve.extensions || [])];
    }
    
    // 处理 .mjs 文件（支持 node_modules 中的包）
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    if (!config.module.rules.some((r: any) => r.test?.toString().includes('mjs'))) {
      config.module.rules.push({
        test: /\.mjs$/,
        include: [
          /node_modules/,
        ],
        type: 'javascript/auto',
      });
    }
    
    // 忽略来自 @enclave-hq/chain-utils 的 critical dependency 警告
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /chain-utils/,
        message: /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/,
      },
      /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/,
    ];
    
    // 使用插件作为备用方案
    config.plugins = config.plugins || [];
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^@enclave-hq\/sdk$/, sdkIndexMjs),
      new webpack.NormalModuleReplacementPlugin(/^@enclave-hq\/sdk\/react$/, sdkReactMjs),
      new webpack.NormalModuleReplacementPlugin(/^@enclave-hq\/wallet-sdk$/, walletSdkIndexMjs),
      new webpack.NormalModuleReplacementPlugin(/^@enclave-hq\/wallet-sdk\/react$/, walletSdkReactMjs),
      new webpack.NormalModuleReplacementPlugin(/^@enclave-hq\/chain-utils$/, chainUtilsIndexMjs),
    );
    
    return config;
  },
  
  transpilePackages: ['@enclave-hq/sdk', '@enclave-hq/wallet-sdk', '@enclave-hq/chain-utils'],
};

export default nextConfig;
