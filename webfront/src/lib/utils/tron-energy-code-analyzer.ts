/**
 * TRON Energy 代码分析工具
 * 通过分析 Solidity 代码中的操作类型来估算 Energy 消耗
 * 
 * 基于 TRON 网络的 Energy 消耗规则：
 * - SLOAD (读取 storage): ~200 Energy
 * - SSTORE (写入 storage): ~20,000 Energy (首次写入) / ~5,000 Energy (更新)
 * - CALL (外部调用): ~700 Energy (基础) + 被调用合约的消耗
 * - DELEGATECALL: ~700 Energy (基础) + 被调用合约的消耗
 * - LOG (事件): ~375 Energy (基础) + 375 * indexed 参数数量 + 8 * 数据大小
 * - 计算操作: 通常很少，可以忽略
 */

/**
 * Energy 消耗估算结果
 */
export interface CodeAnalysisResult {
  totalEnergy: number
  breakdown: {
    storageReads: number
    storageWrites: number
    externalCalls: number
    events: number
    other: number
  }
  details: Array<{
    operation: string
    energy: number
    description: string
  }>
}

/**
 * 分析 DepositVault.deposit 函数的 Energy 消耗
 * 
 * 基于代码分析，deposit 函数包含以下操作：
 * 
 * 1. 参数验证和基本计算（~100 Energy）
 * 2. Storage 读取（SLOAD）：
 *    - lendingDelegates[token] (~200)
 *    - lendingTargets[token] (~200)
 *    - tokenKeys[token] (~200)
 *    - defaultLendingDelegate (~200)
 *    - defaultLendingTarget (~200)
 *    - minDepositAmount (~200)
 *    - delegateWhitelist[delegate] (~200，如果启用)
 *    - delegateWhitelistEnabled (~200，如果启用)
 * 3. 外部调用：
 *    - getYieldTokenAddress (view 函数，不消耗 Energy)
 *    - safeTransferFrom (ERC20 transfer，实际测试值：64,285 Energy)
 *    - balanceOf (view 函数，不消耗 Energy)
 *    - forceApprove (ERC20 approve，实际测试值：200,000 Energy)
 *    - delegatecall supply (JustLend mint，实际测试值：300,000 Energy，主要消耗)
 * 4. Storage 写入（SSTORE）：
 *    - depositCount++ (~5,000，更新)
 *    - deposits[depositId] (结构体写入，~20,000-50,000，取决于字段数量)
 *    - depositorDeposits[msg.sender].push() (~5,000-20,000，取决于数组长度)
 *    - recipientDeposits[intendedRecipient].push() (~5,000-20,000)
 * 5. 事件（LOG）：
 *    - Deposited 事件 (~1,000-2,000，3个 indexed 参数)
 * 
 * @param includeDelegatecallSupply 是否包含 delegatecall supply 的消耗（这是主要消耗）
 * @returns Energy 消耗分析结果
 */
export function analyzeDepositEnergy(
  includeDelegatecallSupply: boolean = true
): CodeAnalysisResult {
  const details: Array<{ operation: string; energy: number; description: string }> = []
  let totalEnergy = 0

  // 1. 参数验证和基本计算
  const validationEnergy = 100
  details.push({
    operation: '参数验证',
    energy: validationEnergy,
    description: '地址和金额验证、基本计算'
  })
  totalEnergy += validationEnergy

  // 2. Storage 读取（SLOAD）
  const storageReads = [
    { name: 'lendingDelegates[token]', energy: 200 },
    { name: 'lendingTargets[token]', energy: 200 },
    { name: 'tokenKeys[token]', energy: 200 },
    { name: 'defaultLendingDelegate', energy: 200 },
    { name: 'defaultLendingTarget', energy: 200 },
    { name: 'minDepositAmount', energy: 200 },
    { name: 'delegateWhitelist[delegate]', energy: 200, optional: true },
    { name: 'delegateWhitelistEnabled', energy: 200, optional: true },
  ]

  let storageReadEnergy = 0
  storageReads.forEach(read => {
    if (!read.optional || includeDelegatecallSupply) {
      details.push({
        operation: `读取: ${read.name}`,
        energy: read.energy,
        description: 'SLOAD 操作'
      })
      storageReadEnergy += read.energy
      totalEnergy += read.energy
    }
  })

  // 3. 外部调用
  const externalCalls = [
    {
      name: 'getYieldTokenAddress',
      energy: 0,
      description: 'View 函数，不消耗 Energy'
    },
    {
      name: 'safeTransferFrom',
      energy: 64285, // 实际测试值：64,285 Energy（基于链上交易数据）
      description: 'ERC20 transferFrom，从用户转账到合约（实际测试值）'
    },
    {
      name: 'balanceOf (3次)',
      energy: 0,
      description: 'View 函数，不消耗 Energy'
    },
    {
      name: 'forceApprove',
      energy: 200000, // 实际测试值：200,000 Energy（20万能量）
      description: 'ERC20 approve，批准借贷池使用代币（实际测试值）'
    },
  ]

  let externalCallEnergy = 0
  externalCalls.forEach(call => {
    if (call.energy > 0) {
      details.push({
        operation: `外部调用: ${call.name}`,
        energy: call.energy,
        description: call.description
      })
      externalCallEnergy += call.energy
      totalEnergy += call.energy
    }
  })

  // 4. delegatecall supply（主要消耗）
  if (includeDelegatecallSupply) {
    // 实际测试值：300,000 Energy（30万能量）
    const delegatecallEnergy = 300000
    details.push({
      operation: 'delegatecall supply (JustLend mint)',
      energy: delegatecallEnergy,
      description: '通过适配器存入借贷池，调用 JustLend mint（实际测试值：30万能量）'
    })
    externalCallEnergy += delegatecallEnergy
    totalEnergy += delegatecallEnergy
  }

  // 5. Storage 写入（SSTORE）
  const storageWrites = [
    {
      name: 'depositCount++',
      energy: 5000,
      description: '更新计数器（从非零值更新）'
    },
    {
      name: 'deposits[depositId] (结构体)',
      energy: 35000, // 结构体包含 7 个字段，首次写入
      description: '写入存款信息结构体（depositor, token, yieldToken, yieldAmount, intendedRecipient, depositTime, used）'
    },
    {
      name: 'depositorDeposits[msg.sender].push()',
      energy: 15000, // 数组 push，取决于数组长度
      description: '添加到存款人列表'
    },
    {
      name: 'recipientDeposits[intendedRecipient].push()',
      energy: 15000,
      description: '添加到接收人列表'
    },
  ]

  let storageWriteEnergy = 0
  storageWrites.forEach(write => {
    details.push({
      operation: `写入: ${write.name}`,
      energy: write.energy,
      description: write.description
    })
    storageWriteEnergy += write.energy
    totalEnergy += write.energy
  })

  // 6. 事件（LOG）
  // Deposited 事件包含 3 个 indexed 参数和 4 个非 indexed 参数
  // LOG3: 375 (基础) + 375 * 3 (indexed) + 8 * 数据大小
  const eventEnergy = 1500
  details.push({
    operation: '事件: Deposited',
    energy: eventEnergy,
    description: '发出存款事件（3个 indexed 参数）'
  })
  totalEnergy += eventEnergy

  // 7. 其他操作（计算、比较等）
  const otherEnergy = 500
  details.push({
    operation: '其他计算操作',
    energy: otherEnergy,
    description: '算术运算、比较、条件判断等'
  })
  totalEnergy += otherEnergy

  return {
    totalEnergy,
    breakdown: {
      storageReads: storageReadEnergy,
      storageWrites: storageWriteEnergy,
      externalCalls: externalCallEnergy,
      events: eventEnergy,
      other: otherEnergy
    },
    details
  }
}

/**
 * 分析 ERC20 approve 操作的 Energy 消耗
 * 
 * @param tokenComplexity 代币合约复杂度 ('simple' | 'standard' | 'complex')
 * @returns Energy 消耗分析结果
 */
export function analyzeApproveEnergy(
  tokenComplexity: 'simple' | 'standard' | 'complex' = 'standard'
): CodeAnalysisResult {
  const details: Array<{ operation: string; energy: number; description: string }> = []
  let totalEnergy = 0

  // 1. 参数验证
  const validationEnergy = 50
  details.push({
    operation: '参数验证',
    energy: validationEnergy,
    description: '地址和金额验证'
  })
  totalEnergy += validationEnergy

  // 2. Storage 读取（读取当前的 allowance）
  const storageReadEnergy = 200
  details.push({
    operation: '读取: allowance[owner][spender]',
    energy: storageReadEnergy,
    description: 'SLOAD 操作，读取当前授权金额'
  })
  totalEnergy += storageReadEnergy

  // 3. Storage 写入（更新 allowance）
  // 根据代币合约复杂度，approve 操作的消耗不同
  const approveEnergyMap = {
    simple: 20000,    // 简单合约，直接更新
    standard: 35000,  // 标准 ERC20，可能包含一些检查
    complex: 50000    // 复杂合约，可能包含额外逻辑
  }
  const storageWriteEnergy = approveEnergyMap[tokenComplexity]
  details.push({
    operation: '写入: allowance[owner][spender]',
    energy: storageWriteEnergy,
    description: `SSTORE 操作，更新授权金额（${tokenComplexity} 合约）`
  })
  totalEnergy += storageWriteEnergy

  // 4. 事件
  const eventEnergy = 750 // Approval 事件，2个 indexed 参数
  details.push({
    operation: '事件: Approval',
    energy: eventEnergy,
    description: '发出授权事件（2个 indexed 参数）'
  })
  totalEnergy += eventEnergy

  // 5. 其他操作
  const otherEnergy = 200
  details.push({
    operation: '其他计算操作',
    energy: otherEnergy,
    description: '算术运算、比较等'
  })
  totalEnergy += otherEnergy

  return {
    totalEnergy,
    breakdown: {
      storageReads: storageReadEnergy,
      storageWrites: storageWriteEnergy,
      externalCalls: 0,
      events: eventEnergy,
      other: otherEnergy
    },
    details
  }
}

/**
 * 获取基于代码分析的 Energy 估算值
 * 
 * @param operation 操作类型
 * @param options 选项
 * @returns Energy 估算值
 */
export function getCodeBasedEnergyEstimate(
  operation: 'deposit' | 'approve',
  options?: {
    includeDelegatecallSupply?: boolean
    tokenComplexity?: 'simple' | 'standard' | 'complex'
  }
): number {
  if (operation === 'deposit') {
    const analysis = analyzeDepositEnergy(options?.includeDelegatecallSupply ?? true)
    return analysis.totalEnergy
  } else {
    const analysis = analyzeApproveEnergy(options?.tokenComplexity ?? 'standard')
    return analysis.totalEnergy
  }
}

/**
 * 打印详细的 Energy 消耗分析报告
 */
export function printEnergyAnalysis(analysis: CodeAnalysisResult): void {
  console.log('=== TRON Energy 消耗分析 ===')
  console.log(`总 Energy: ${analysis.totalEnergy.toLocaleString()}`)
  console.log('\n分类消耗:')
  console.log(`  Storage 读取: ${analysis.breakdown.storageReads.toLocaleString()}`)
  console.log(`  Storage 写入: ${analysis.breakdown.storageWrites.toLocaleString()}`)
  console.log(`  外部调用: ${analysis.breakdown.externalCalls.toLocaleString()}`)
  console.log(`  事件: ${analysis.breakdown.events.toLocaleString()}`)
  console.log(`  其他: ${analysis.breakdown.other.toLocaleString()}`)
  console.log('\n详细操作:')
  analysis.details.forEach((detail, index) => {
    console.log(`  ${index + 1}. ${detail.operation}: ${detail.energy.toLocaleString()} Energy`)
    console.log(`     ${detail.description}`)
  })
  console.log('============================')
}
