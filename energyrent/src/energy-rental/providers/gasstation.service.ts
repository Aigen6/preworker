import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import * as querystring from 'querystring';
import type { RentalEstimate, RentalOrder } from '../interfaces/rental.interface';

@Injectable()
export class GasStationService {
  private readonly appId: string;
  private readonly secret: string;
  private readonly baseUrl: string;
  private readonly axiosInstance: AxiosInstance;

  constructor(private configService: ConfigService) {
    const config = this.configService.get('gasstation');
    this.appId = config?.appId;
    this.secret = config?.secret;
    this.baseUrl = config?.baseUrl || 'https://openapi.gasstation.ai';

    // 验证配置
    if (!this.appId || !this.secret) {
      console.warn(
        '⚠️  GasStation API 配置不完整。请在 .env 文件中配置 GASSTATION_APP_ID 和 GASSTATION_SECRET。\n' +
        '   获取方式: https://gasstation.ai\n' +
        '   文档: https://gasdocs-zh.gasstation.ai'
      );
    }

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    // 调试日志：输出配置信息
    console.log('🔧 GasStation 服务配置:', {
      appId: this.appId ? `${this.appId.substring(0, 8)}...` : '未配置',
      secret: this.secret ? '已配置' : '未配置',
      baseUrl: this.baseUrl,
      enabled: config?.enabled !== false,
    });
  }

  /**
   * AES-ECB 加密（PKCS7 填充，Base64 UrlSafe 输出）
   * 根据 GasStation 官方文档要求
   * 
   * 注意：Secret 可能是 Base64 编码的字符串，需要先解码
   */
  private encryptAesEcbUrlSafe(plaintext: string, key: string): string {
    // 尝试将密钥作为 Base64 字符串解码，如果失败则作为普通字符串使用
    let keyBuffer: Buffer;
    try {
      // 先尝试 Base64 解码
      keyBuffer = Buffer.from(key, 'base64');
      // 如果解码后的长度不符合 AES 要求，则使用原始字符串
      if (keyBuffer.length !== 16 && keyBuffer.length !== 24 && keyBuffer.length !== 32) {
        keyBuffer = Buffer.from(key, 'utf8');
      }
    } catch {
      // 如果 Base64 解码失败，使用 UTF-8 编码
      keyBuffer = Buffer.from(key, 'utf8');
    }
    
    // 根据密钥长度选择算法
    let algorithm: string;
    if (keyBuffer.length === 16) {
      algorithm = 'aes-128-ecb';
    } else if (keyBuffer.length === 24) {
      algorithm = 'aes-192-ecb';
    } else if (keyBuffer.length === 32) {
      algorithm = 'aes-256-ecb';
    } else {
      // 如果密钥长度不符合标准，尝试补齐或截断
      let adjustedKey: Buffer;
      if (keyBuffer.length < 16) {
        adjustedKey = Buffer.concat([keyBuffer, Buffer.alloc(16 - keyBuffer.length)]);
        algorithm = 'aes-128-ecb';
      } else if (keyBuffer.length < 24) {
        adjustedKey = Buffer.concat([keyBuffer, Buffer.alloc(24 - keyBuffer.length)]);
        algorithm = 'aes-192-ecb';
      } else if (keyBuffer.length < 32) {
        adjustedKey = Buffer.concat([keyBuffer, Buffer.alloc(32 - keyBuffer.length)]);
        algorithm = 'aes-256-ecb';
      } else {
        adjustedKey = keyBuffer.slice(0, 32);
        algorithm = 'aes-256-ecb';
      }
      return this.encryptAesEcbUrlSafe(plaintext, adjustedKey.toString('utf8'));
    }

    // 创建加密器（ECB 模式不需要 IV，传 null）
    const cipher = crypto.createCipheriv(algorithm, keyBuffer, null);
    cipher.setAutoPadding(true); // 启用 PKCS7 填充

    // 加密
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    // 转换为 Base64，然后转换为 URL-safe 格式
    return encrypted
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, ''); // 移除末尾的 = 填充
  }

  /**
   * 构建加密的请求数据
   */
  private buildEncryptedData(payload: Record<string, any>): string {
    // 根据文档示例，需要将 JSON 对象序列化为字符串
    const jsonString = JSON.stringify(payload);
    
    // 调试日志：输出加密前的数据（不包含敏感信息）
    console.log('🔐 GasStation 加密前数据:', {
      payloadKeys: Object.keys(payload),
      payloadSize: jsonString.length,
      secretLength: this.secret?.length || 0,
    });
    
    const encrypted = this.encryptAesEcbUrlSafe(jsonString, this.secret);
    
    // 调试日志：输出加密后的数据长度
    console.log('🔐 GasStation 加密后数据长度:', encrypted.length);
    
    return encrypted;
  }

  /**
   * 发送加密请求
   */
  private async sendEncryptedRequest(
    endpoint: string,
    payload: Record<string, any>,
    method: 'GET' | 'POST' = 'POST',
  ): Promise<any> {
    if (!this.appId || !this.secret) {
      throw new Error(
        'GasStation API 配置不完整。请在 .env 文件中配置 GASSTATION_APP_ID 和 GASSTATION_SECRET。\n' +
        '获取方式: https://gasstation.ai'
      );
    }

    // 加密数据
    const encryptedData = this.buildEncryptedData(payload);

    // 构建请求参数
    const params = {
      app_id: this.appId,
      data: encryptedData,
    };

    try {
      // 调试日志：输出请求信息
      const fullUrl = `${this.baseUrl}${endpoint}`;
      console.log('📤 GasStation API 请求:', {
        method,
        url: fullUrl,
        endpoint,
        baseUrl: this.baseUrl,
        hasAppId: !!this.appId,
        hasData: !!params.data,
      });

      let response;
      if (method === 'GET') {
        // GET 请求：参数放在 URL 中
        const queryString = querystring.stringify(params);
        const requestUrl = `${endpoint}?${queryString}`;
        console.log('📤 GasStation GET 请求 URL:', `${this.baseUrl}${requestUrl}`);
        response = await this.axiosInstance.get(requestUrl);
      } else {
        // POST 请求：参数放在 body 中（form-urlencoded）
        console.log('📤 GasStation POST 请求 body:', querystring.stringify(params));
        response = await this.axiosInstance.post(endpoint, querystring.stringify(params));
      }

      const result = response.data;

      // 检查响应状态码
      if (result.code !== 0 && result.code !== '0') {
        throw new Error(`GasStation API 错误: ${result.msg || '未知错误'} (code: ${result.code})`);
      }

      // 如果 data 是字符串，尝试解析 JSON
      if (typeof result.data === 'string') {
        try {
          return JSON.parse(result.data);
        } catch {
          return result.data;
        }
      }

      return result.data || result;
    } catch (error: any) {
      const errorDetails = {
        endpoint,
        method,
        baseUrl: this.baseUrl,
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
        code: error.code, // DNS 错误代码
      };
      
      console.error('❌ GasStation API 请求失败:', errorDetails);
      
      // 如果是 DNS 错误，提供更明确的提示
      if (error.code === 'ENOTFOUND' || error.message.includes('ENOTFOUND')) {
        throw new Error(
          `GasStation API 域名解析失败: ${error.hostname || this.baseUrl}\n` +
          `请检查：\n` +
          `1. 网络连接是否正常\n` +
          `2. 域名是否正确（应该是 openapi.gasstation.ai）\n` +
          `3. 服务是否已重启以加载最新配置`
        );
      }
      
      throw new Error(
        `GasStation API 请求失败: ${error.response?.data?.msg || error.message}`
      );
    }
  }

  /**
   * 转换时长到 service_charge_type
   * 根据 GasStation 文档：
   * - 10010: 10 分钟
   * - 20001: 1 小时
   * - 30001: 1 天
   */
  private durationToServiceChargeType(duration: string): string {
    if (duration === '10m') return '10010';
    if (duration === '1h') return '20001';
    if (duration === '24h' || duration === '1d') return '30001';
    return '30001'; // 默认1天
  }

  /**
   * 估算租赁费用
   * 根据官方文档：GET /api/mpc/tron/gas/estimate
   */
  async estimate(
    energyAmount: number,
    bandwidthAmount: number,
    duration: string = '1h',
  ): Promise<RentalEstimate> {
    // 检查配置
    if (!this.appId || !this.secret) {
      throw new Error(
        'GasStation API 配置不完整。请在 .env 文件中配置 GASSTATION_APP_ID 和 GASSTATION_SECRET。\n' +
        '获取方式: https://gasstation.ai'
      );
    }

    const serviceChargeType = this.durationToServiceChargeType(duration);
    
    // 确保 Energy 数量满足最小值 64,000
    const actualEnergyAmount = Math.max(energyAmount, 64000);

    try {
      // 根据官方文档：https://gasdocs-zh.gasstation.ai/api-references/gas-apis/apis/gas-estimate
      // 必需参数：receive_address, address_to, contract_address, service_charge_type
      // contract_address 是必需的，用于预估矿工费
      // 注意：如果没有具体的合约地址，可以使用一个有效的 TRON 地址作为占位符
      // 但最好使用实际的合约地址或目标地址
      const payload = {
        receive_address: 'TPlaceholderAddressForEstimate', // 资源接收地址
        address_to: 'TPlaceholderAddressForEstimate', // 转账到账地址，用于预估矿工费
        contract_address: 'TPlaceholderAddressForEstimate', // 合约地址，用于预估矿工费（必需）
        service_charge_type: serviceChargeType, // 租赁周期 code
      };
      
      console.log('📋 GasStation 估算请求参数:', {
        ...payload,
        service_charge_type: serviceChargeType,
        energyAmount: actualEnergyAmount,
      });

      const data = await this.sendEncryptedRequest(
        '/api/mpc/tron/gas/estimate',
        payload,
        'GET',
      );

      // 解析响应
      // 响应格式：{ amount, energy_amount, energy_num, energy_price, ... }
      const totalCost = parseFloat(data.amount || data.energy_amount || '0');
      const energyPrice = parseFloat(data.energy_price || '0');
      const energyNum = parseInt(data.energy_num || actualEnergyAmount.toString(), 10);

      // 如果 API 返回了价格，使用 API 价格
      // 否则使用估算价格
      let finalEnergyCost = totalCost;
      if (totalCost === 0 && energyPrice > 0) {
        // 根据单价计算
        finalEnergyCost = (actualEnergyAmount / 1000) * energyPrice;
      } else if (totalCost === 0) {
        // 如果都没有，使用默认估算
        finalEnergyCost = (actualEnergyAmount / 1000) * 0.00001;
      }

      // Bandwidth 成本（GasStation 可能不单独返回，使用估算）
      const bandwidthCost = (bandwidthAmount / 1000) * 0.000001;
      const finalTotalCost = finalEnergyCost + bandwidthCost;

      // 计算节省
      const directBurnCost = actualEnergyAmount * 0.0001 + bandwidthAmount * 0.00001;
      const savings = Math.max(0, directBurnCost - finalTotalCost);

      console.log('GasStation estimate response:', {
        raw: data,
        parsed: {
          energyCost: finalEnergyCost,
          bandwidthCost,
          totalCost: finalTotalCost,
          savings,
        },
      });

      return {
        provider: 'gasstation',
        energyCost: finalEnergyCost,
        bandwidthCost,
        totalCost: finalTotalCost,
        estimatedTime: 30,
        savings,
      };
    } catch (error: any) {
      console.error('GasStation 费用估算失败:', error.message);
      throw error;
    }
  }

  /**
   * 创建租赁订单
   * 根据官方文档：POST /api/mpc/tron/gas/create_order
   */
  async createOrder(
    receiverAddress: string,
    energyAmount: number,
    bandwidthAmount: number,
    duration: string = '1h',
  ): Promise<RentalOrder> {
    // 检查配置
    if (!this.appId || !this.secret) {
      throw new Error(
        'GasStation API 配置不完整。请在 .env 文件中配置 GASSTATION_APP_ID 和 GASSTATION_SECRET。\n' +
        '获取方式: https://gasstation.ai'
      );
    }

    const serviceChargeType = this.durationToServiceChargeType(duration);
    const actualEnergyAmount = Math.max(energyAmount, 64000); // 最小64,000
    const requestId = `gs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const payload = {
        request_id: requestId,
        receive_address: receiverAddress,
        service_charge_type: serviceChargeType,
        energy_num: actualEnergyAmount,
        buy_type: 0, // 0 = 指定数量，1 = 系统估算
      };

      const data = await this.sendEncryptedRequest(
        '/api/mpc/tron/gas/create_order',
        payload,
        'POST',
      );

      // 解析响应
      // 响应格式：{ trade_no, ... }
      const orderId = data.trade_no || requestId;
      const cost = parseFloat(data.cost || data.amount || '0');

      return {
        orderId,
        provider: 'gasstation',
        receiverAddress,
        energyAmount: actualEnergyAmount,
        bandwidthAmount,
        duration,
        cost,
        status: 'pending',
        createdAt: Date.now(),
        // GasStation 支付信息（如果API返回）
        paymentAddress: data.paymentAddress || data.pay_address,
        paymentAmount: cost,
        paymentMemo: orderId,
      };
    } catch (error: any) {
      console.error('GasStation 订单创建失败:', error.message);
      throw error;
    }
  }

  /**
   * 查询订单状态
   * 注意：GasStation 文档中可能没有明确的订单状态查询接口
   * 这里提供一个基础实现，可能需要根据实际API调整
   */
  async checkOrderStatus(orderId: string): Promise<RentalOrder> {
    // 检查配置
    if (!this.appId || !this.secret) {
      throw new Error(
        'GasStation API 配置不完整。请在 .env 文件中配置 GASSTATION_APP_ID 和 GASSTATION_SECRET。\n' +
        '获取方式: https://gasstation.ai'
      );
    }

    try {
      // 注意：这个端点可能需要根据实际 API 文档调整
      const payload = {
        trade_no: orderId,
      };

      const data = await this.sendEncryptedRequest(
        '/api/mpc/tron/gas/order/status',
        payload,
        'GET',
      );

      let status: RentalOrder['status'] = 'pending';
      if (data.status === 'completed' || data.status === 'success') {
        status = 'completed';
      } else if (data.status === 'failed' || data.status === 'error') {
        status = 'failed';
      } else if (data.status === 'processing') {
        status = 'processing';
      }

      return {
        orderId,
        provider: 'gasstation',
        receiverAddress: data.receive_address || '',
        energyAmount: data.energy_num || 0,
        bandwidthAmount: data.bandwidth_num || 0,
        duration: data.duration || '1h',
        cost: parseFloat(data.cost || '0'),
        status,
        txHash: data.tx_hash,
        createdAt: data.created_at || Date.now(),
        paymentAddress: data.paymentAddress || data.pay_address,
        paymentAmount: parseFloat(data.paymentAmount || data.cost || '0'),
        paymentMemo: data.paymentMemo || orderId,
      };
    } catch (error: any) {
      // 如果查询接口不存在，返回处理中状态
      console.warn('GasStation 订单状态查询失败，返回处理中状态:', error.message);
      return {
        orderId,
        provider: 'gasstation',
        receiverAddress: '',
        energyAmount: 0,
        bandwidthAmount: 0,
        cost: 0,
        status: 'processing',
        createdAt: Date.now(),
      };
    }
  }
}
