/**
 * TRON Energy 代码分析工具 V2
 * 基于实际代码分析，不猜测外部合约的消耗
 * 
 * 原则：
 * 1. 只分析代码中可见的操作
 * 2. 对于外部合约调用，标记为"需要实际测试"
 * 3. 基于 TRON Energy 规则计算可见操作的消耗
 */

/**
 * Energy 消耗分析结果
 */
export interface CodeAnalysisResult {
  totalEnergy: number // 可见操作的总 Energy（不包含外部合约调用）
  externalCalls: Array<{
    contract: string
    function: string
    estimatedEnergy?: number // 如果已知
    note: string // 说明
  }>
  breakdown: {
    storageReads: number
    storageWrites: number
    internalCalls: number
    events: number
    other: number
  }
  details: Array<{
    operation: string
    energy: number
    description: string
    source: 'code' | 'external' // 是否来自代码分析
  }>
  warnings: string[] // 警告信息
}

/**
 * 分析 DepositVault.deposit 函数的 Energy 消耗
 * 
 * 基于实际代码分析，只计算可见的操作
 * 外部合约调用（JustLend mint）需要实际测试或查询链上数据
 */
export function analyzeDepositEnergyV2(): CodeAnalysisResult {
  const details: Array<{ operation: string; energy: number; description: string; source: 'code' | 'external' }> = []
  const externalCalls: Array<{ contract: string; function: string; estimatedEnergy?: number; note: string }> = []
  const warnings: string[] = []
  let totalEnergy = 0

  // ============ 1. 参数验证和基本计算 ============
  const validationEnergy = 100
  details.push({
    operation: '参数验证',
    energy: validationEnergy,
    description: '地址和金额验证、基本计算（if 语句、比较）',
    source: 'code'
  })
  totalEnergy += validationEnergy

  // ============ 2. Storage 读取（SLOAD）============
  // 从代码中可见的 SLOAD 操作：
  const storageReads = [
    { name: 'lendingDelegates[token]', line: 201, energy: 200 },
    { name: 'lendingTargets[token]', line: 202, energy: 200 },
    { name: 'defaultLendingDelegate', line: 205, energy: 200 },
    { name: 'defaultLendingTarget', line: 208, energy: 200 },
    { name: 'tokenKeys[token]', line: 219, energy: 200 },
    { name: 'minDepositAmount', line: 196, energy: 200 },
    { name: 'delegateWhitelist[delegate]', line: 990, energy: 200, optional: true },
    { name: 'delegateWhitelistEnabled', line: 990, energy: 200, optional: true },
  ]

  let storageReadEnergy = 0
  storageReads.forEach(read => {
    if (!read.optional) {
      details.push({
        operation: `SLOAD: ${read.name}`,
        energy: read.energy,
        description: `第 ${read.line} 行：读取 storage slot`,
        source: 'code'
      })
      storageReadEnergy += read.energy
      totalEnergy += read.energy
    }
  })

  // ============ 3. 外部调用（可见的）============
  
  // 3.1 getYieldTokenAddress (view 函数，不消耗 Energy)
  details.push({
    operation: 'CALL: getYieldTokenAddress',
    energy: 0,
    description: '第 222 行：view 函数调用，不消耗 Energy',
    source: 'code'
  })

  // 3.2 safeTransferFrom (ERC20 transfer)
  externalCalls.push({
    contract: 'ERC20 Token',
    function: 'transferFrom',
    note: '第 230 行：从用户转账到合约。消耗取决于代币合约实现，通常 20,000-30,000 Energy'
  })
  // 不添加到 totalEnergy，因为这是外部合约的消耗

  // 3.3 balanceOf (3次，view 函数，不消耗 Energy)
  details.push({
    operation: 'CALL: balanceOf (3次)',
    energy: 0,
    description: '第 233-234, 257, 263 行：view 函数调用，不消耗 Energy',
    source: 'code'
  })

  // 3.4 forceApprove (ERC20 approve)
  externalCalls.push({
    contract: 'ERC20 Token',
    function: 'approve',
    note: '第 237 行：批准借贷池使用代币。消耗取决于代币合约实现，通常 30,000-50,000 Energy'
  })

  // 3.5 delegatecall supply (JustLend mint) - 这是主要的外部调用
  externalCalls.push({
    contract: 'JustLendDelegate',
    function: 'supply -> IJToken.mint',
    note: '第 240-250 行：通过 delegatecall 调用 JustLend 的 mint 函数。这是主要 Energy 消耗，需要实际测试或查询链上数据确定。根据社区报告，JustLend mint 通常需要 100,000-300,000 Energy，但实际值可能因市场状态而异。'
  })
  warnings.push('JustLend mint 的 Energy 消耗需要实际测试或查询链上交易确定，无法从代码中准确计算')

  // ============ 4. Storage 写入（SSTORE）============
  // 从代码中可见的 SSTORE 操作：
  const storageWrites = [
    {
      name: 'depositCount++',
      line: 277,
      energy: 5000, // 更新已存在的值
      description: '更新全局计数器'
    },
    {
      name: 'deposits[depositId]',
      line: 279-287,
      energy: 35000, // 结构体包含 7 个字段，首次写入
      description: '写入 DepositInfo 结构体（7个字段：depositor, token, yieldToken, yieldAmount, intendedRecipient, depositTime, used）'
    },
    {
      name: 'depositorDeposits[msg.sender].push()',
      line: 290,
      energy: 15000, // 数组 push，取决于数组长度
      description: '添加到存款人列表（数组操作）'
    },
    {
      name: 'recipientDeposits[intendedRecipient].push()',
      line: 291,
      energy: 15000,
      description: '添加到接收人列表（数组操作）'
    },
  ]

  let storageWriteEnergy = 0
  storageWrites.forEach(write => {
    details.push({
      operation: `SSTORE: ${write.name}`,
      energy: write.energy,
      description: `第 ${write.line} 行：${write.description}`,
      source: 'code'
    })
    storageWriteEnergy += write.energy
    totalEnergy += write.energy
  })

  // ============ 5. 事件（LOG）============
  // Deposited 事件：3个 indexed 参数 + 4个非 indexed 参数
  // LOG3: 375 (基础) + 375 * 3 (indexed) + 8 * 数据大小
  const eventEnergy = 1500
  details.push({
    operation: 'LOG: Deposited 事件',
    energy: eventEnergy,
    description: '第 293-301 行：发出存款事件（3个 indexed 参数：depositor, depositId, token）',
    source: 'code'
  })
  totalEnergy += eventEnergy

  // ============ 6. 其他操作 ============
  const otherEnergy = 500 // 算术运算、比较、条件判断等
  details.push({
    operation: '其他计算操作',
    energy: otherEnergy,
    description: '算术运算、比较、条件判断、类型转换等',
    source: 'code'
  })
  totalEnergy += otherEnergy

  return {
    totalEnergy, // 只包含代码中可见的操作
    externalCalls,
    breakdown: {
      storageReads: storageReadEnergy,
      storageWrites: storageWriteEnergy,
      internalCalls: 0, // 没有内部函数调用
      events: eventEnergy,
      other: otherEnergy
    },
    details,
    warnings
  }
}

/**
 * 分析 JustLendDelegate.supply 函数的 Energy 消耗
 * 
 * 这个函数本身很简单，主要消耗来自调用 JustLend 的 mint 函数
 */
export function analyzeJustLendDelegateSupply(): CodeAnalysisResult {
  const details: Array<{ operation: string; energy: number; description: string; source: 'code' | 'external' }> = []
  const externalCalls: Array<{ contract: string; function: string; estimatedEnergy?: number; note: string }> = []
  const warnings: string[] = []
  let totalEnergy = 0

  // 1. 参数验证
  const validationEnergy = 50
  details.push({
    operation: '参数验证',
    energy: validationEnergy,
    description: '地址和金额验证',
    source: 'code'
  })
  totalEnergy += validationEnergy

  // 2. balanceOf 调用（view 函数，不消耗 Energy）
  details.push({
    operation: 'CALL: balanceOf (2次)',
    energy: 0,
    description: '第 79, 86 行：view 函数调用，不消耗 Energy',
    source: 'code'
  })

  // 3. 外部调用：JustLend mint
  externalCalls.push({
    contract: 'JustLend jToken',
    function: 'mint',
    note: '第 82 行：调用 JustLend 的 mint 函数。这是主要 Energy 消耗。根据代码分析，mint 函数会：1) 可能调用 accrueInterest() 更新利息指数，2) transferFrom 转账底层资产，3) 计算并 mint jToken，4) 更新状态和发出事件。实际消耗需要查询链上交易或测试确定。'
  })
  warnings.push('JustLend mint 函数的 Energy 消耗无法从代码中准确计算，需要实际测试')

  return {
    totalEnergy,
    externalCalls,
    breakdown: {
      storageReads: 0,
      storageWrites: 0,
      internalCalls: 0,
      events: 0,
      other: validationEnergy
    },
    details,
    warnings
  }
}

/**
 * 打印详细的分析报告
 */
export function printEnergyAnalysisV2(analysis: CodeAnalysisResult): void {
  console.log('=== TRON Energy 消耗分析（基于代码）===')
  console.log(`代码中可见操作的总 Energy: ${analysis.totalEnergy.toLocaleString()}`)
  
  if (analysis.externalCalls.length > 0) {
    console.log('\n⚠️ 外部合约调用（需要实际测试确定消耗）:')
    analysis.externalCalls.forEach((call, index) => {
      console.log(`  ${index + 1}. ${call.contract}.${call.function}`)
      console.log(`     ${call.note}`)
      if (call.estimatedEnergy) {
        console.log(`     估算 Energy: ${call.estimatedEnergy.toLocaleString()}`)
      }
    })
  }

  if (analysis.warnings.length > 0) {
    console.log('\n⚠️ 警告:')
    analysis.warnings.forEach(warning => {
      console.log(`  - ${warning}`)
    })
  }

  console.log('\n代码中可见操作的分类:')
  console.log(`  Storage 读取: ${analysis.breakdown.storageReads.toLocaleString()}`)
  console.log(`  Storage 写入: ${analysis.breakdown.storageWrites.toLocaleString()}`)
  console.log(`  内部调用: ${analysis.breakdown.internalCalls.toLocaleString()}`)
  console.log(`  事件: ${analysis.breakdown.events.toLocaleString()}`)
  console.log(`  其他: ${analysis.breakdown.other.toLocaleString()}`)

  console.log('\n详细操作:')
  analysis.details.forEach((detail, index) => {
    if (detail.energy > 0 || detail.operation.includes('CALL') || detail.operation.includes('LOG')) {
      console.log(`  ${index + 1}. ${detail.operation}: ${detail.energy.toLocaleString()} Energy`)
      console.log(`     ${detail.description}`)
      console.log(`     来源: ${detail.source === 'code' ? '代码分析' : '外部估算'}`)
    }
  })
  
  console.log('\n💡 建议:')
  console.log('  1. 使用 TRON API (estimateEnergy) 获取准确的 Energy 消耗')
  console.log('  2. 查询链上实际交易，查看 Energy Used 字段')
  console.log('  3. 进行实际测试，记录真实消耗')
  console.log('==========================================')
}
