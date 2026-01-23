/**
 * TRON Energy 配置调试工具
 * 在浏览器控制台运行此函数来检查环境变量是否正确加载
 */

export function debugTronEnergyConfig() {
  if (typeof window === 'undefined') {
    console.log('此函数只能在浏览器环境中运行')
    return
  }

  console.log('=== TRON Energy 配置调试 ===')
  console.log('检查环境变量是否正确加载...')
  console.log('')

  // 检查 process.env 对象本身
  console.log('🔍 检查 process.env 对象:', {
    'typeof process': typeof process,
    'typeof process.env': typeof process.env,
    'process.env 是否为对象': typeof process.env === 'object' && process.env !== null,
    'process.env 的所有键（前20个）': Object.keys(process.env).slice(0, 20),
    'NEXT_PUBLIC_ 开头的变量数量': Object.keys(process.env).filter(k => k.startsWith('NEXT_PUBLIC_')).length,
  })
  console.log('')

  const configs = [
    { key: 'NEXT_PUBLIC_TRON_ENERGY_APPROVE_ENERGY', name: '授权操作' },
    { key: 'NEXT_PUBLIC_TRON_ENERGY_APPROVE_BANDWIDTH', name: '授权操作 Bandwidth' },
    { key: 'NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_ENERGY', name: '存入操作' },
    { key: 'NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_SUPPLY_BANDWIDTH', name: '存入操作 Bandwidth' },
    { key: 'NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_WITHDRAW_ENERGY', name: '提取操作' },
    { key: 'NEXT_PUBLIC_TRON_ENERGY_JUSTLENDING_WITHDRAW_BANDWIDTH', name: '提取操作 Bandwidth' },
  ]

  configs.forEach(({ key, name }) => {
    // 尝试多种读取方式
    const value1 = process.env[key]
    const value2 = (process.env as any)[key]
    const value3 = process.env[key as keyof typeof process.env]
    
    // 检查所有可能的读取方式
    const allValues = [value1, value2, value3].filter(v => v !== undefined)
    const finalValue = allValues[0] || undefined
    
    if (finalValue) {
      console.log(`✅ ${name} (${key}): ${finalValue}`)
    } else {
      console.warn(`❌ ${name} (${key}): 未设置`, {
        '直接访问': value1,
        '类型断言访问': value2,
        'keyof 访问': value3,
        '所有值': allValues,
      })
    }
  })

  // 列出所有 NEXT_PUBLIC_TRON_ENERGY 开头的变量
  const tronEnergyVars = Object.keys(process.env).filter(k => k.startsWith('NEXT_PUBLIC_TRON_ENERGY'))
  console.log('')
  console.log('📋 所有 NEXT_PUBLIC_TRON_ENERGY 开头的变量:', tronEnergyVars.length > 0 ? tronEnergyVars : '无')
  if (tronEnergyVars.length > 0) {
    tronEnergyVars.forEach(key => {
      console.log(`  - ${key}: ${process.env[key]}`)
    })
  }

  console.log('')
  console.log('提示：如果看到 ❌，请检查：')
  console.log('1. .env.local 文件中是否包含这些变量')
  console.log('2. 变量名是否以 NEXT_PUBLIC_ 开头')
  console.log('3. 是否已重启开发服务器（npm run dev）')
  console.log('4. 检查 Next.js 版本是否支持环境变量注入')
  console.log('5. 检查 next.config.ts 是否有特殊配置')
  console.log('========================')
}

// 在开发环境自动运行
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // 延迟执行，确保页面加载完成
  setTimeout(() => {
    debugTronEnergyConfig()
  }, 1000)
}
