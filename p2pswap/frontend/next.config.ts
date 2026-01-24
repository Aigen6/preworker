import type { NextConfig } from "next";
import path from "path";

// TRON Energy 环境变量
const tronEnergyEnvVars: Record<string, string> = {}
const envVarKeys = [
  'NEXT_PUBLIC_TRON_ENERGY_APPROVE_ENERGY',
  'NEXT_PUBLIC_TRON_ENERGY_APPROVE_BANDWIDTH',
  'NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_ENERGY',
  'NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_BANDWIDTH',
  'NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_WITHDRAW_ENERGY',
  'NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_WITHDRAW_BANDWIDTH',
  'NEXT_PUBLIC_TRON_ENERGY_DEFAULT_ENERGY',
  'NEXT_PUBLIC_TRON_ENERGY_DEFAULT_BANDWIDTH',
]

envVarKeys.forEach(key => {
  if (process.env[key]) {
    tronEnergyEnvVars[key] = process.env[key]
  }
})

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  
  env: {
    ...tronEnergyEnvVars,
  },
  
  webpack: (config, { isServer }) => {
    const webpack = require('webpack');
    const fs = require('fs');
    const path = require('path');
    
    const webpackContext = config.context || process.cwd();
    
    const resolvePackageFile = (packageName: string, exportPath: string = '.') => {
      const nodeModulesPath = path.resolve(webpackContext, 'node_modules', packageName);
      
      if (!fs.existsSync(nodeModulesPath)) {
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
          throw new Error(`Package not found: ${packageName}`);
        }
        
        return foundPath;
      }
      
      return nodeModulesPath;
    };
    
    const getPackageFilePath = (packageName: string, exportPath: string = '.') => {
      const packageDir = resolvePackageFile(packageName, exportPath);
      
      let filePath: string;
      if (exportPath === '.') {
        filePath = 'dist/index.mjs';
      } else if (exportPath === '/react') {
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
    
    const sdkIndexMjs = getPackageFilePath('@enclave-hq/sdk', '.');
    const sdkReactMjs = getPackageFilePath('@enclave-hq/sdk', '/react');
    const walletSdkIndexMjs = getPackageFilePath('@enclave-hq/wallet-sdk', '.');
    const walletSdkReactMjs = getPackageFilePath('@enclave-hq/wallet-sdk', '/react');
    const chainUtilsIndexMjs = getPackageFilePath('@enclave-hq/chain-utils', '.');
    
    config.resolve.alias = {
      ...config.resolve.alias,
      '@enclave-hq/sdk$': sdkIndexMjs,
      '@enclave-hq/sdk/react': sdkReactMjs,
      '@enclave-hq/wallet-sdk$': walletSdkIndexMjs,
      '@enclave-hq/wallet-sdk/react': walletSdkReactMjs,
      '@enclave-hq/chain-utils$': chainUtilsIndexMjs,
      '@enclave/node-nft': path.resolve(__dirname, '../../../node-nft'),
    };
    
    if (!config.resolve.extensions?.includes('.mjs')) {
      config.resolve.extensions = ['.mjs', ...(config.resolve.extensions || [])];
    }
    
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    if (!config.module.rules.some((r: any) => r.test?.toString().includes('mjs'))) {
      config.module.rules.push({
        test: /\.mjs$/,
        include: [/node_modules/],
        type: 'javascript/auto',
      });
    }
    
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /chain-utils/,
        message: /Critical dependency/,
      },
    ];
    
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
