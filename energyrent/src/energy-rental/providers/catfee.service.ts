import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import type { RentalEstimate, RentalOrder } from '../interfaces/rental.interface';

@Injectable()
export class CatFeeService {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;
  private readonly axiosInstance: AxiosInstance;

  constructor(private configService: ConfigService) {
    const config = this.configService.get('catfee');
    this.apiKey = config?.apiKey;
    this.apiSecret = config?.apiSecret;
    this.baseUrl = config?.baseUrl || 'https://api.catfee.io';

    // 验证配置
    if (!this.apiKey || !this.apiSecret) {
      console.warn(
        '⚠️  CatFee API 配置不完整。请在 .env 文件中配置 CATFEE_API_KEY 和 CATFEE_API_SECRET。\n' +
        '   获取方式: https://catfee.io/?tab=api\n' +
        '   文档: https://docs.catfee.io/en/getting-started/buy-energy-via-api-on-catfee/nodejs'
      );
    }

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });
  }

  /**
   * 生成签名
   * 根据 CatFee API 文档：timestamp + method + requestPath
   */
  private generateSignature(
    timestamp: string,
    method: string,
    requestPath: string,
  ): string {
    const signString = timestamp + method + requestPath;
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(signString)
      .digest('base64');
  }

  /**
   * 生成时间戳（ISO 8601格式）
   */
  private generateTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * 构建请求路径（包含查询参数）
   */
  private buildRequestPath(path: string, queryParams?: Record<string, any>): string {
    if (!queryParams || Object.keys(queryParams).length === 0) {
      return path;
    }
    const queryString = new URLSearchParams(queryParams).toString();
    return `${path}?${queryString}`;
  }

  /**
   * 创建请求头
   */
  private createHeaders(timestamp: string, signature: string) {
    return {
      'Content-Type': 'application/json',
      'CF-ACCESS-KEY': this.apiKey,
      'CF-ACCESS-SIGN': signature,
      'CF-ACCESS-TIMESTAMP': timestamp,
    };
  }

  /**
   * 估算租赁费用
   */
  async estimate(
    energyAmount: number,
    bandwidthAmount: number,
    duration: string = '1h',
  ): Promise<RentalEstimate> {
    // 检查配置
    if (!this.apiKey || !this.apiSecret) {
      throw new Error(
        'CatFee API 配置不完整。请在 .env 文件中配置 CATFEE_API_KEY 和 CATFEE_API_SECRET。\n' +
        '获取方式: https://catfee.io/?tab=api'
      );
    }

    // CatFee API: GET /v1/estimate
    // 官方文档：https://docs.catfee.io/en/api-reference/price
    // quantity: integer, min: 65000 (委托能量数量)
    // duration: string, 必须是 '1h'
    
    // 验证参数
    if (energyAmount < 65000) {
      throw new Error('CatFee API 要求 quantity >= 65000');
    }
    
    if (duration !== '1h') {
      console.warn(`⚠️  CatFee API 只支持 duration='1h'，当前值: ${duration}，将使用 '1h'`);
      duration = '1h';
    }
    
    const method = 'GET';
    const path = '/v1/estimate';
    const queryParams = {
      quantity: Math.floor(energyAmount).toString(), // 确保是整数
      duration: '1h', // 强制使用 '1h'
    };

    const timestamp = this.generateTimestamp();
    // 构建请求路径（包含查询参数），用于签名
    const requestPath = this.buildRequestPath(path, queryParams);
    const signature = this.generateSignature(timestamp, method, requestPath);

    // 调试日志：输出签名相关信息
    console.log('🔐 CatFee 签名信息:', {
      timestamp,
      method,
      requestPath,
      signString: timestamp + method + requestPath,
      queryParams,
    });

    try {
      // 注意：不要同时使用 requestPath（已包含查询参数）和 params（会重复添加）
      // 直接使用 requestPath，不传 params
      const response = await this.axiosInstance.get(requestPath, {
        headers: this.createHeaders(timestamp, signature),
        // 不传 params，因为 requestPath 已经包含查询参数
      });

      const data = response.data;
      
      // 检查是否是错误响应
      if (data.code && data.code !== 0) {
        // 如果是 "order not found by estimate" 错误，说明估算端点可能不存在
        if (data.msg && data.msg.includes('order not found by estimate')) {
          console.warn('⚠️  CatFee 估算端点可能不存在或需要不同参数:', data.msg);
          console.warn('   将使用市场价格估算');
          // 直接使用市场价格估算，不抛出错误
          const estimatedPricePerEnergy = 1.95 / 65000; // 基于 65K Energy = 1.95 TRX
          const totalCost = energyAmount * estimatedPricePerEnergy;
          const directBurnCost = energyAmount * 0.0001;
          const savings = Math.max(0, directBurnCost - totalCost);
          
          return {
            provider: 'catfee',
            energyCost: totalCost,
            bandwidthCost: 0,
            totalCost,
            estimatedTime: 30,
            savings,
          };
        }
        // 其他错误继续抛出
        throw new Error(`CatFee API 错误: ${data.msg || '未知错误'}`);
      }
      
      // CatFee API 响应格式（根据官方文档）:
      // { code: 0, msg: "ok", data: { quantity, duration, price_usdt, price_in_sun, total_usdt, fee_usdt, ... } }
      // 也可能直接返回数字：{ code: 0, data: 3930000 } (价格，单位可能是 SUN)
      // 也支持其他可能的格式（向后兼容）
      const responseData = data.data || data;
      
      // 详细日志：输出完整的 API 响应，便于调试
      console.log('📊 CatFee API 原始响应:', JSON.stringify(data, null, 2));
      
      let payment = 0;
      
      // 情况1: data.data 是数字（直接返回价格，可能是 SUN 单位）
      if (typeof responseData === 'number') {
        // 判断单位：如果数字很大（> 1000），可能是 SUN 单位；否则可能是 TRX
        if (responseData > 1000) {
          // 可能是 SUN 单位，转换为 TRX
          payment = responseData / 1000000;
          console.log(`✅ CatFee 返回数字价格（SUN）: ${responseData} SUN = ${payment} TRX`);
        } else {
          // 可能是 TRX 单位
          payment = responseData;
          console.log(`✅ CatFee 返回数字价格（TRX）: ${payment} TRX`);
        }
      }
      // 情况2: data.data 是对象，尝试从字段中提取
      else if (typeof responseData === 'object' && responseData !== null) {
        // 尝试多种可能的字段名来提取费用
        // 根据官方文档，响应可能包含：price_usdt, price_in_sun, total_usdt, fee_usdt
        // 也支持其他可能的字段名（向后兼容）
        const possibleCostFields = [
          'total_usdt',      // 官方文档字段：总费用（USDT）
          'price_usdt',      // 官方文档字段：价格（USDT）
          'price_in_sun',    // 官方文档字段：价格（SUN，需要转换为 TRX）
          'payment',
          'total_cost',
          'totalCost',
          'cost',
          'price',
          'amount',
          'fee',
          'total',
          'totalPrice',
          'totalFee',
        ];
        
        for (const field of possibleCostFields) {
          const value = responseData[field];
          if (value !== undefined && value !== null && value !== '') {
            let parsed = parseFloat(String(value));
            
            // 如果是 price_in_sun（以 SUN 为单位），需要转换为 TRX
            // 1 TRX = 1,000,000 SUN
            if (field === 'price_in_sun') {
              parsed = parsed / 1000000;
              console.log(`✅ 从字段 "${field}" 提取到费用: ${parsed} TRX (从 ${value} SUN 转换)`);
            } else {
              console.log(`✅ 从字段 "${field}" 提取到费用: ${parsed} TRX`);
            }
            
            if (!isNaN(parsed) && parsed > 0) {
              payment = parsed;
              break;
            }
          }
        }
        
        // 如果还是 0，尝试从嵌套对象中查找
        if (payment === 0 && responseData.data) {
          for (const field of possibleCostFields) {
            const value = responseData.data[field];
            if (value !== undefined && value !== null && value !== '') {
              let parsed = parseFloat(String(value));
              
              // 如果是 price_in_sun，需要转换为 TRX
              if (field === 'price_in_sun') {
                parsed = parsed / 1000000;
              }
              
              if (!isNaN(parsed) && parsed > 0) {
                payment = parsed;
                console.log(`✅ 从嵌套字段 "data.${field}" 提取到费用: ${payment} TRX`);
                break;
              }
            }
          }
        }
      }
      
      // 如果 payment 还是 0，说明没有从响应中提取到费用
      // 尝试从其他可能的字段中提取（仅当 responseData 是对象时）
      if (payment === 0 && typeof responseData === 'object' && responseData !== null) {
        const energyCost = parseFloat(responseData.energyCost || responseData.energy_cost || '0');
        const bandwidthCost = parseFloat(responseData.bandwidthCost || responseData.bandwidth_cost || '0');
        const totalCost = parseFloat(responseData.totalCost || responseData.total_cost || '0');
        payment = totalCost || energyCost || bandwidthCost;
      }
      
      const energyCost = (typeof responseData === 'object' && responseData !== null) 
        ? parseFloat(responseData.energyCost || responseData.energy_cost || '0') || payment
        : payment;
      const bandwidthCost = (typeof responseData === 'object' && responseData !== null)
        ? parseFloat(responseData.bandwidthCost || responseData.bandwidth_cost || '0')
        : 0;
      let totalCost = payment;
      
      // 如果费用为 0，可能是使用了预购账户模式
      // 在这种情况下，我们需要使用市场价格估算
      if (totalCost === 0) {
        // 根据 CatFee 网站显示的实际价格计算：
        // 65,000 Energy = 1.95 TRX（1小时）
        // 单价 = 1.95 / 65000 ≈ 0.00003 TRX per Energy
        // 注意：价格可能不是完全线性的，但可以作为估算值
        const estimatedPricePerEnergy = 1.95 / 65000; // ≈ 0.00003 TRX per Energy
        totalCost = energyAmount * estimatedPricePerEnergy;
        payment = totalCost;
        console.warn('⚠️  CatFee 估算返回费用为 0，可能使用了预购账户模式。');
        console.warn(`   使用市场价格估算: ${energyAmount} Energy × ${(estimatedPricePerEnergy * 1000000).toFixed(2)} SUN/Energy = ${totalCost.toFixed(6)} TRX`);
        console.warn('   参考价格：65,000 Energy = 1.95 TRX（1小时，来自 CatFee 网站）');
        console.warn('   提示：实际价格可能因市场波动而不同，建议查看 CatFee 网站获取实时价格');
      }
      
      // 计算预计节省（相比直接燃烧 TRX）
      // 直接燃烧成本约为: energyAmount * 0.0001 TRX
      const directBurnCost = energyAmount * 0.0001;
      const savings = Math.max(0, directBurnCost - totalCost);
      
      console.log('CatFee estimate response:', {
        raw: data,
        parsed: { energyCost, bandwidthCost, totalCost, savings, isPrepaidMode: payment === 0 },
      });
      
      return {
        provider: 'catfee',
        energyCost,
        bandwidthCost,
        totalCost,
        estimatedTime: responseData.estimatedTime || responseData.estimated_time || 30,
        savings,
      };
    } catch (error: any) {
      console.error('CatFee 费用估算失败:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers,
        },
      });
      
      // 如果是认证错误，提供更明确的提示
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error(
          'CatFee API 认证失败。请检查 .env 文件中的 CATFEE_API_KEY 和 CATFEE_API_SECRET 是否正确。\n' +
          '获取方式: https://catfee.io/?tab=api'
        );
      }
      
      throw new Error(`CatFee 费用估算失败: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * 创建租赁订单
   * @param useDirectPayment 如果为 true，使用 /v1/mate/open/transaction 端点（"一单一付"模式），强制用户直接支付
   */
  async createOrder(
    receiverAddress: string,
    energyAmount: number,
    bandwidthAmount: number,
    duration: string = '1h',
    useDirectPayment: boolean = false,
  ): Promise<RentalOrder> {
    // 检查配置
    if (!this.apiKey || !this.apiSecret) {
      throw new Error(
        'CatFee API 配置不完整。请在 .env 文件中配置 CATFEE_API_KEY 和 CATFEE_API_SECRET。\n' +
        '获取方式: https://catfee.io/?tab=api'
      );
    }

    // 验证接收地址
    if (!receiverAddress || typeof receiverAddress !== 'string') {
      throw new Error('接收地址不能为空');
    }
    
    // TRON 地址格式验证（以 T 开头，34 个字符）
    const tronAddressRegex = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
    const trimmedAddress = receiverAddress.trim();
    if (!tronAddressRegex.test(trimmedAddress)) {
      throw new Error(`无效的 TRON 地址格式: ${receiverAddress}`);
    }

    // 如果 useDirectPayment 为 true，使用 "一单一付" 模式
    // 参考: https://docs.catfee.io/en/api-reference/transaction/create-order
    // 注意：Mate API 可能需要特殊的 API 密钥或权限，如果认证失败，会自动回退到常规模式
    if (useDirectPayment) {
      try {
        return await this.createOrderWithDirectPayment(trimmedAddress, energyAmount, bandwidthAmount);
      } catch (error: any) {
        // 如果是认证错误，回退到常规模式
        if (error.message?.includes('Invalid API Key') || error.message?.includes('auth error')) {
          console.warn('⚠️  Mate API 认证失败，回退到常规模式:', error.message);
          console.warn('   提示：Mate API 可能需要特殊的 API 密钥或权限');
          console.warn('   当前使用常规模式，如果账户有余额，费用将从账户扣除');
          // 继续使用常规模式
        } else {
          // 其他错误直接抛出
          throw error;
        }
      }
    }

    const method = 'POST';
    const path = '/v1/order';

    // 根据 CatFee API 文档，创建订单的参数应该作为查询参数传递
    // 参考: https://docs.catfee.io/en/api-reference/create-order
    // 必需参数：quantity (>= 65000), receiver, duration ("1h")
    // 可选参数：client_order_id (用于幂等性), activate (默认 true)
    const queryParams: Record<string, string> = {
      quantity: energyAmount.toString(),
      receiver: trimmedAddress, // 使用验证和清理后的地址
      duration: duration, // 必须是 "1h"
    };
    
    // 可选：添加 client_order_id 用于幂等性（如果需要）
    // const clientOrderId = `catfee_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    // queryParams.client_order_id = clientOrderId;

    const timestamp = this.generateTimestamp();
    // 构建请求路径（包含查询参数），用于签名
    const requestPath = this.buildRequestPath(path, queryParams);
    const signature = this.generateSignature(timestamp, method, requestPath);

    // 调试日志：输出签名相关信息
    console.log('🔐 CatFee 创建订单签名信息:', {
      timestamp,
      method,
      requestPath,
      signString: timestamp + method + requestPath,
      queryParams,
      receiverAddress: trimmedAddress,
      receiverAddressLength: trimmedAddress.length,
    });

    try {
      // 注意：CatFee API 要求参数作为查询参数，而不是请求体
      // 直接使用 requestPath（已包含查询参数），不传 body
      const response = await this.axiosInstance.post(requestPath, null, {
        headers: this.createHeaders(timestamp, signature),
      });

      const data = response.data;
      
      // 调试日志：输出完整的 API 响应
      console.log('📊 CatFee 创建订单响应:', JSON.stringify(data, null, 2));

      // 检查是否是错误响应
      if (data.code && data.code !== 0) {
        console.error('❌ CatFee 常规模式 API 错误:', {
          code: data.code,
          msg: data.msg,
          sub_code: data.sub_code,
          sub_msg: data.sub_msg,
          requestParams: queryParams,
          receiverAddress: trimmedAddress,
        });
        throw new Error(`CatFee API 错误: ${data.msg || '未知错误'} (code: ${data.code})`);
      }

      // 提取响应数据（可能在 data 字段中）
      // 根据官方文档：https://docs.catfee.io/en/api-reference/create-order
      // 响应格式：{ code: 0, data: { id, status, confirm_status, ... } }
      const responseData = data.data || data;

      // 根据官方文档，订单ID字段是 `id`（Payment Hash / Order ID）
      // 可以使用这个ID通过 GET /v1/order/{id} 查询订单详情
      const orderId = responseData.id || responseData.orderId || responseData.order_id || responseData.tradeNo || responseData.trade_no || '';
      
      if (!orderId) {
        console.warn('⚠️  CatFee 创建订单响应中未找到订单ID');
      }
      
      // 根据官方文档，响应字段：
      // - pay_amount_sun: 支付金额（SUN）
      // - activate_amount_sun: 激活金额（SUN，如果需要激活）
      // - status: 订单状态（如 PAYMENT_SUCCESS, DELEGATE_SUCCESS）
      // - confirm_status: 链上确认状态（如 UNCONFIRMED, DELEGATION_CONFIRMED）
      
      // 提取支付金额（从 SUN 转换为 TRX）
      const payAmountSun = parseInt(responseData.pay_amount_sun || '0', 10);
      const activateAmountSun = parseInt(responseData.activate_amount_sun || '0', 10);
      const totalAmountSun = payAmountSun + activateAmountSun;
      const paymentAmount = totalAmountSun / 1_000_000; // 转换为 TRX
      
      // 提取费用（如果没有 pay_amount_sun，尝试其他字段）
      const cost = paymentAmount || parseFloat(
        responseData.cost || 
        responseData.total_cost || 
        responseData.price || 
        responseData.payment || 
        responseData.amount || 
        '0'
      );

      // 提取支付地址
      // 注意：CatFee API 可能不直接返回支付地址，需要从订单详情中获取
      // 或者根据文档，可能需要用户发送 TRX 到 CatFee 提供的地址
      const billingType = responseData.billing_type || '';
      let paymentAddress = 
        responseData.paymentAddress || 
        responseData.payment_address || 
        responseData.payAddress || 
        responseData.pay_address || 
        responseData.address || 
        responseData.payment_addr || 
        '';

      // 订单状态
      const orderStatus = responseData.status || 'pending';
      const confirmStatus = responseData.confirm_status || 'UNCONFIRMED';
      
      console.log('📋 CatFee 订单状态:', {
        orderId,
        billingType,
        status: orderStatus,
        confirmStatus,
        payAmountSun,
        activateAmountSun,
        paymentAmount,
      });

      // 如果是 API 模式且没有支付地址，说明是从账户余额扣除
      // 这种情况下，用户无法直接支付，需要提示
      if (billingType === 'API' && !paymentAddress) {
        console.warn('⚠️  CatFee API 模式订单：费用已从账户余额扣除，用户无需直接支付');
        console.warn('   如果希望用户直接支付，请确保 CatFee 账户余额不足，或使用其他支付方式');
      }

      console.log('💰 CatFee 创建订单支付信息:', {
        orderId,
        billingType,
        paymentAddress,
        paymentAmount,
        cost,
        hasPaymentInfo: !!(paymentAddress && paymentAmount > 0),
        isApiMode: billingType === 'API' && !paymentAddress,
      });

      // 根据订单状态设置 status
      let status: RentalOrder['status'] = 'pending';
      if (orderStatus === 'DELEGATE_SUCCESS' || orderStatus === 'PAYMENT_SUCCESS') {
        status = 'processing';
      } else if (orderStatus === 'DELEGATION_CONFIRMED' || confirmStatus === 'DELEGATION_CONFIRMED') {
        status = 'completed';
      } else if (orderStatus === 'FAILED' || orderStatus === 'ERROR' || orderStatus === 'CANCELED') {
        status = 'failed';
      }

      return {
        orderId,
        provider: 'catfee',
        receiverAddress: trimmedAddress, // 使用验证和清理后的地址
        energyAmount,
        bandwidthAmount,
        duration,
        cost: cost || paymentAmount,
        status,
        createdAt: Date.now(),
        expiresAt: responseData.expired_timestamp || responseData.expiresAt || responseData.expires_at || responseData.expire_time,
        txHash: responseData.delegate_hash || responseData.delegateHash || '',
        // CatFee 支付信息
        // 注意：如果 paymentAddress 为空，可能需要通过其他方式获取（如查询订单详情）
        paymentAddress,
        paymentAmount: paymentAmount || cost,
        paymentMemo: responseData.paymentMemo || responseData.payment_memo || responseData.memo || orderId,
      };
    } catch (error) {
      console.error('CatFee 订单创建失败:', error.response?.data || error.message);
      throw new Error(`CatFee 订单创建失败: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * 查询订单状态
   */
  async checkOrderStatus(orderId: string): Promise<RentalOrder> {
    // 检查配置
    if (!this.apiKey || !this.apiSecret) {
      throw new Error(
        'CatFee API 配置不完整。请在 .env 文件中配置 CATFEE_API_KEY 和 CATFEE_API_SECRET。\n' +
        '获取方式: https://catfee.io/?tab=api'
      );
    }
    const method = 'GET';
    const path = `/v1/order/${orderId}`;

    const timestamp = this.generateTimestamp();
    const requestPath = this.buildRequestPath(path);
    const signature = this.generateSignature(timestamp, method, requestPath);

    try {
      const response = await this.axiosInstance.get(requestPath, {
        headers: this.createHeaders(timestamp, signature),
      });

      const data = response.data;
      
      // 调试日志：输出完整的 API 响应
      console.log('📊 CatFee 订单状态查询响应:', JSON.stringify(data, null, 2));

      // 检查是否是错误响应
      if (data.code && data.code !== 0) {
        throw new Error(`CatFee API 错误: ${data.msg || '未知错误'} (code: ${data.code})`);
      }

      // 提取响应数据（可能在 data 字段中）
      const responseData = data.data || data;

      let status: RentalOrder['status'] = 'pending';
      if (responseData.status === 'completed' || responseData.status === 'success' || responseData.status === 'paid') {
        status = 'completed';
      } else if (responseData.status === 'failed' || responseData.status === 'error' || responseData.status === 'canceled') {
        status = 'failed';
      } else if (responseData.status === 'processing' || responseData.status === 'pending') {
        status = 'processing';
      }

      // 根据官方文档，响应字段：
      // - pay_amount_sun: 支付金额（SUN）
      // - activate_amount_sun: 激活金额（SUN，如果需要激活）
      // - billing_type: 计费类型（如 "API", "TRANSFER"）
      // 如果是 "API" 模式，说明是从账户余额扣除，可能不需要支付地址
      
      // 提取支付金额（从 SUN 转换为 TRX）
      const payAmountSun = parseInt(responseData.pay_amount_sun || '0', 10);
      const activateAmountSun = parseInt(responseData.activate_amount_sun || '0', 10);
      const totalAmountSun = payAmountSun + activateAmountSun;
      const paymentAmount = totalAmountSun / 1_000_000; // 转换为 TRX
      
      // 提取费用（如果没有 pay_amount_sun，尝试其他字段）
      const cost = paymentAmount || parseFloat(
        responseData.cost || 
        responseData.total_cost || 
        responseData.price || 
        responseData.payment || 
        responseData.amount || 
        '0'
      );

      // 提取支付地址
      // 注意：如果是 "API" 计费模式（billing_type: "API"），说明是从账户余额扣除
      // 这种情况下可能不需要支付地址，或者支付地址在创建订单时已经提供
      // 如果是 "TRANSFER" 模式，可能需要用户发送 TRX 到指定地址
      const billingType = responseData.billing_type || '';
      const paymentAddress = 
        responseData.paymentAddress || 
        responseData.payment_address || 
        responseData.payAddress || 
        responseData.pay_address || 
        responseData.address || 
        responseData.payment_addr || 
        '';

      console.log('💰 CatFee 支付信息提取:', {
        billingType,
        payAmountSun,
        activateAmountSun,
        paymentAmount,
        cost,
        paymentAddress,
        hasPaymentInfo: !!(paymentAddress || (paymentAmount > 0 && billingType === 'API')),
      });


      // 处理 duration（可能是数字，如 60 表示 60 分钟，需要转换为字符串）
      let durationStr = responseData.duration || '1h';
      if (typeof durationStr === 'number') {
        if (durationStr === 60) {
          durationStr = '1h';
        } else if (durationStr === 1440) {
          durationStr = '24h';
        } else {
          durationStr = `${durationStr}m`;
        }
      }

      return {
        orderId,
        provider: 'catfee',
        receiverAddress: responseData.receiver || responseData.receive_address || responseData.receiverAddress || '',
        energyAmount: responseData.energyAmount || responseData.energy_amount || responseData.quantity || 0,
        bandwidthAmount: responseData.bandwidthAmount || responseData.bandwidth_amount || 0,
        duration: durationStr,
        cost: cost || paymentAmount,
        status,
        txHash: responseData.delegate_hash || responseData.delegateHash || responseData.txHash || responseData.tx_hash || responseData.transactionHash || '',
        createdAt: responseData.pay_timestamp || responseData.createdAt || responseData.created_at || responseData.create_time || Date.now(),
        expiresAt: responseData.expired_timestamp || responseData.expiresAt || responseData.expires_at || responseData.expire_time,
        // 支付信息
        // 注意：如果是 "API" 计费模式，paymentAddress 可能为空（从账户余额扣除）
        // 但 paymentAmount 应该从 pay_amount_sun 提取
        paymentAddress,
        paymentAmount: paymentAmount || cost,
        paymentMemo: responseData.paymentMemo || responseData.payment_memo || responseData.memo || responseData.orderId || orderId,
      };
    } catch (error: any) {
      console.error('CatFee 订单状态查询失败:', {
        orderId,
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw new Error(`CatFee 订单状态查询失败: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * 使用 "一单一付" 模式创建订单（/v1/mate/open/transaction）
   * 参考: https://docs.catfee.io/en/api-reference/transaction/create-order
   * 这个模式专门用于用户直接支付，不依赖账户余额
   */
  private async createOrderWithDirectPayment(
    receiverAddress: string,
    energyAmount: number,
    bandwidthAmount: number,
  ): Promise<RentalOrder> {
    // 检查配置
    if (!this.apiKey || !this.apiSecret) {
      throw new Error(
        'CatFee API 配置不完整。请在 .env 文件中配置 CATFEE_API_KEY 和 CATFEE_API_SECRET。\n' +
        '获取方式: https://catfee.io/?tab=api\n' +
        '注意：/v1/mate/open/transaction 端点可能需要不同的 API 密钥或权限。'
      );
    }

    // 验证接收地址
    if (!receiverAddress || typeof receiverAddress !== 'string') {
      throw new Error('接收地址不能为空');
    }
    
    // TRON 地址格式验证（以 T 开头，34 个字符）
    const tronAddressRegex = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
    if (!tronAddressRegex.test(receiverAddress.trim())) {
      throw new Error(`无效的 TRON 地址格式: ${receiverAddress}`);
    }
    
    const trimmedAddress = receiverAddress.trim();
    
    const method = 'POST';
    const path = '/v1/mate/open/transaction';

    // 根据文档，必需参数：quantity, receiver
    // 可选参数：client_order_id, resource_type (ENERGY | BANDWIDTH)
    const queryParams: Record<string, string> = {
      quantity: energyAmount.toString(),
      receiver: trimmedAddress,
      resource_type: 'ENERGY', // 默认使用 ENERGY
    };

    const timestamp = this.generateTimestamp();
    const requestPath = this.buildRequestPath(path, queryParams);
    
    // 使用和常规端点相同的签名方式（timestamp + method + requestPath）
    const signature = this.generateSignature(timestamp, method, requestPath);

    console.log('🔐 CatFee 一单一付模式创建订单签名信息:', {
      timestamp,
      method,
      requestPath,
      signString: timestamp + method + requestPath,
      queryParams,
      receiverAddress: trimmedAddress,
      receiverAddressLength: trimmedAddress.length,
      apiKey: this.apiKey ? `${this.apiKey.substring(0, 8)}...` : '未配置',
    });

    try {
      const response = await this.axiosInstance.post(requestPath, null, {
        headers: this.createHeaders(timestamp, signature),
      });

      const data = response.data;
      console.log('📊 CatFee 一单一付模式创建订单响应:', JSON.stringify(data, null, 2));

      if (data.code && data.code !== 0) {
        console.error('❌ CatFee 一单一付模式 API 错误:', {
          code: data.code,
          msg: data.msg,
          sub_code: data.sub_code,
          sub_msg: data.sub_msg,
          requestParams: queryParams,
          receiverAddress: trimmedAddress,
          apiKeyConfigured: !!this.apiKey,
          apiSecretConfigured: !!this.apiSecret,
          requestPath,
          signatureMethod: 'timestamp + method + requestPath',
        });
        
        // 如果是认证错误，提供详细提示
        if (data.code === 2 && data.msg?.includes('Invalid API Key')) {
          const errorMsg = 
            `CatFee Mate API 认证失败: ${data.msg} (code: ${data.code})\n\n` +
            `⚠️  重要提示：/v1/mate/open/transaction 端点需要特殊的 API 权限。\n\n` +
            `解决方案：\n` +
            `1. 联系 CatFee 支持（Telegram: @CatFee_James）申请 Mate API 权限\n` +
            `2. 确认您的账户是否有 "Per-Order Payment" 或 "一单一付" 功能权限\n` +
            `3. 检查是否需要不同的 API 密钥用于 Mate API\n\n` +
            `临时方案：\n` +
            `- 如果 Mate API 不可用，系统会自动回退到常规模式\n` +
            `- 常规模式下，清空 CatFee 账户余额可以强制返回支付地址`;
          
          console.error('❌', errorMsg);
          throw new Error(errorMsg);
        }
        
        throw new Error(`CatFee API 错误: ${data.msg || '未知错误'} (code: ${data.code})`);
      }

      const responseData = data.data || data;

      // 根据文档，响应字段：
      // - order_id: 订单ID
      // - receiver: 接收地址
      // - quantity: 数量
      // - hash: 代理交易的哈希（未广播）
      // - hex: 代理交易的十六进制（未广播）
      // - amount_sun: 支付金额（SUN）
      // - payee_address: 支付地址（用户需要发送 TRX 到这个地址）
      const orderId = responseData.order_id || responseData.orderId || '';
      const payeeAddress = responseData.payee_address || responseData.payeeAddress || '';
      const amountSun = parseInt(responseData.amount_sun || '0', 10);
      const paymentAmount = amountSun / 1_000_000; // 转换为 TRX

      if (!orderId) {
        throw new Error('CatFee 一单一付模式：响应中未找到订单ID');
      }

      if (!payeeAddress) {
        throw new Error('CatFee 一单一付模式：响应中未找到支付地址');
      }

      if (!amountSun || amountSun <= 0) {
        throw new Error('CatFee 一单一付模式：响应中未找到支付金额');
      }

      console.log('💰 CatFee 一单一付模式订单信息:', {
        orderId,
        payeeAddress,
        amountSun,
        paymentAmount,
        hash: responseData.hash,
      });

      return {
        orderId,
        provider: 'catfee',
        receiverAddress: trimmedAddress, // 使用验证和清理后的地址
        energyAmount,
        bandwidthAmount,
        duration: '1h', // 一单一付模式固定为 1h
        cost: paymentAmount,
        status: 'pending', // 需要用户支付后才能完成
        createdAt: Date.now(),
        // 支付信息（用户需要发送 TRX 到 payeeAddress）
        paymentAddress: payeeAddress,
        paymentAmount,
        paymentAmountSun: amountSun,
        paymentMemo: orderId,
        // 标记为直接支付模式
        isDirectPaymentMode: true,
        // 代理交易信息（可选，用于后续广播）
        proxyTransactionHash: responseData.hash,
        proxyTransactionHex: responseData.hex,
      } as any;
    } catch (error: any) {
      console.error('CatFee 一单一付模式订单创建失败:', error.response?.data || error.message);
      throw new Error(`CatFee 一单一付模式订单创建失败: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * 提交支付哈希（用于一单一付模式）
   * 参考: https://docs.catfee.io/en/api-reference/transaction/pay-order
   * 用户支付后，需要调用此方法提交支付交易哈希
   */
  async submitPaymentHash(orderId: string, paymentHash: string): Promise<void> {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error(
        'CatFee API 配置不完整。请在 .env 文件中配置 CATFEE_API_KEY 和 CATFEE_API_SECRET。'
      );
    }

    const method = 'POST';
    const path = `/v1/mate/open/transaction/pay/${orderId}`;
    const queryParams = {
      hash: paymentHash,
    };

    const timestamp = this.generateTimestamp();
    const requestPath = this.buildRequestPath(path, queryParams);
    const signature = this.generateSignature(timestamp, method, requestPath);

    console.log('🔐 CatFee 提交支付哈希签名信息:', {
      timestamp,
      method,
      requestPath,
      orderId,
      paymentHash,
    });

    try {
      const response = await this.axiosInstance.post(requestPath, null, {
        headers: this.createHeaders(timestamp, signature),
      });

      const data = response.data;
      console.log('📊 CatFee 提交支付哈希响应:', JSON.stringify(data, null, 2));

      if (data.code && data.code !== 0) {
        throw new Error(`CatFee API 错误: ${data.msg || '未知错误'} (code: ${data.code})`);
      }

      console.log('✅ CatFee 支付哈希提交成功');
    } catch (error: any) {
      console.error('CatFee 提交支付哈希失败:', error.response?.data || error.message);
      throw new Error(`CatFee 提交支付哈希失败: ${error.response?.data?.message || error.message}`);
    }
  }
}
