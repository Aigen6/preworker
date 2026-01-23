/**
 * TRON Energy 配置读取工具
 * 在运行时动态读取环境变量，确保从 .env.local 正确加载
 */

/**
 * 运行时读取环境变量
 * Next.js 会在构建时将 NEXT_PUBLIC_* 变量注入到客户端代码
 */
function getEnvVar(key: string): string | undefined {
  // 客户端环境
  if (typeof window !== 'undefined') {
    // Next.js 会将 NEXT_PUBLIC_* 变量注入到 process.env
    // 在客户端代码中，process.env 是只读的，但值已经在构建时注入
    return process.env[key]
  }
  
  // 服务端环境
  return process.env[key]
}

/**
 * 获取 TRON Energy 配置值
 * @param operationKey 操作键名（如 'APPROVE', 'JUSTLENDING_SUPPLY'）
 * @param type 'ENERGY' 或 'BANDWIDTH'
 * @param defaultValue 默认值
 */
export function getTronEnergyConfig(
  operationKey: string,
  type: 'ENERGY' | 'BANDWIDTH',
  defaultValue: number
): number {
  const key = `NEXT_PUBLIC_TRON_ENERGY_${operationKey}_${type}`
  const value = getEnvVar(key)
  
  if (!value) {
    console.log(`[TRON Energy Config] 未找到环境变量 ${key}，使用默认值: ${defaultValue}`)
    return defaultValue
  }
  
  const parsed = parseInt(value, 10)
  if (isNaN(parsed)) {
    console.warn(`[TRON Energy Config] 环境变量 ${key} 的值 "${value}" 无效，使用默认值: ${defaultValue}`)
    return defaultValue
  }
  
  console.log(`[TRON Energy Config] ${key} = ${parsed}`)
  return parsed
}

/**
 * 调试：打印所有 TRON Energy 配置
 */
export function debugTronEnergyConfig() {
  if (typeof window === 'undefined') {
    return // 只在客户端调试
  }
  
  const configs = [
    'NEXT_PUBLIC_TRON_ENERGY_APPROVE_ENERGY',
    'NEXT_PUBLIC_TRON_ENERGY_APPROVE_BANDWIDTH',
    'NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_ENERGY',
    'NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_BANDWIDTH',
    'NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_WITHDRAW_ENERGY',
    'NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_WITHDRAW_BANDWIDTH',
  ]
  
  console.log('=== TRON Energy 配置调试 ===')
  configs.forEach(key => {
    const value = getEnvVar(key)
    console.log(`${key}: ${value || '未设置'}`)
  })
  console.log('========================')
}
