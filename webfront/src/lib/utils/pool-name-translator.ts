/**
 * 池子名称翻译工具
 * 由于池子名称是从后端动态获取的，需要在这里维护翻译映射
 */

export type Language = 'zh' | 'en' | 'ja' | 'ko'

interface PoolNameTranslations {
  [key: string]: {
    zh: string
    en: string
    ja: string
    ko: string
  }
}

// 池子名称翻译映射表
// key: 后端返回的池子名称（不区分大小写）
const poolNameTranslations: PoolNameTranslations = {
  // Aave 相关
  'aave v3': {
    zh: 'Aave V3',
    en: 'Aave V3',
    ja: 'Aave V3',
    ko: 'Aave V3',
  },
  'aave usdt pool': {
    zh: 'Aave USDT 池',
    en: 'Aave USDT Pool',
    ja: 'Aave USDT プール',
    ko: 'Aave USDT 풀',
  },
  'aave usdc pool': {
    zh: 'Aave USDC 池',
    en: 'Aave USDC Pool',
    ja: 'Aave USDC プール',
    ko: 'Aave USDC 풀',
  },
  // Compound 相关
  'compound': {
    zh: 'Compound',
    en: 'Compound',
    ja: 'Compound',
    ko: 'Compound',
  },
  'compound usdc': {
    zh: 'Compound USDC',
    en: 'Compound USDC',
    ja: 'Compound USDC',
    ko: 'Compound USDC',
  },
  // RWA 相关
  '美国国债 rwa': {
    zh: '美国国债 RWA',
    en: 'US Treasury RWA',
    ja: '米国債 RWA',
    ko: '미국 국채 RWA',
  },
  'us treasury rwa': {
    zh: '美国国债 RWA',
    en: 'US Treasury RWA',
    ja: '米国債 RWA',
    ko: '미국 국채 RWA',
  },
  'ondo finance': {
    zh: 'Ondo Finance',
    en: 'Ondo Finance',
    ja: 'Ondo Finance',
    ko: 'Ondo Finance',
  },
  // ETF 相关
  '纳斯达克100 etf': {
    zh: '纳斯达克100 ETF',
    en: 'NASDAQ 100 ETF',
    ja: 'NASDAQ 100 ETF',
    ko: '나스닥 100 ETF',
  },
  'nasdaq 100 etf': {
    zh: '纳斯达克100 ETF',
    en: 'NASDAQ 100 ETF',
    ja: 'NASDAQ 100 ETF',
    ko: '나스닥 100 ETF',
  },
  'backed finance': {
    zh: 'Backed Finance',
    en: 'Backed Finance',
    ja: 'Backed Finance',
    ko: 'Backed Finance',
  },
  // 默认协议名称
  '借贷协议': {
    zh: '借贷协议',
    en: 'Lending Protocol',
    ja: 'レンディングプロトコル',
    ko: '대출 프로토콜',
  },
}

/**
 * 翻译池子名称
 * @param poolName 后端返回的池子名称
 * @param language 目标语言
 * @returns 翻译后的池子名称，如果找不到翻译则返回原始名称
 */
export function translatePoolName(poolName: string | null | undefined, language: Language): string {
  if (!poolName) {
    return 'Unknown Pool'
  }

  // 转换为小写进行匹配（不区分大小写）
  const key = poolName.toLowerCase().trim()
  
  // 查找翻译
  const translation = poolNameTranslations[key]
  
  if (translation) {
    return translation[language]
  }

  // 如果没有找到精确匹配，尝试部分匹配
  // 例如 "Aave V3 USDT Pool" 可以匹配 "aave v3"
  for (const [translationKey, translations] of Object.entries(poolNameTranslations)) {
    if (key.includes(translationKey) || translationKey.includes(key)) {
      return translations[language]
    }
  }

  // 如果都找不到，返回原始名称
  return poolName
}

/**
 * 翻译协议名称（subtitle）
 * @param protocol 协议名称
 * @param language 目标语言
 * @returns 翻译后的协议名称
 */
export function translateProtocol(protocol: string | null | undefined, language: Language): string {
  if (!protocol) {
    return ''
  }

  const key = protocol.toLowerCase().trim()
  const translation = poolNameTranslations[key]
  
  if (translation) {
    return translation[language]
  }

  // 如果没有找到，返回原始名称
  return protocol
}

