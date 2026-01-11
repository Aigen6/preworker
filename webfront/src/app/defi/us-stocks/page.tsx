"use client"

import { useRouter } from "next/navigation"
import SvgIcon from "@/components/ui/SvgIcon"

export default function USStocksDetailPage() {
  const router = useRouter()

  const handleBack = () => {
    router.back()
  }

  return (
    <div className="px-4 pb-8">
      {/* 产品说明 */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <SvgIcon src="/icons/home-core1.svg" className="w-5 h-5" />
          <h2 className="text-lg font-medium text-main">产品说明</h2>
        </div>
        <div className="bg-surface rounded-xl p-4">
          <p className="text-sm text-muted leading-relaxed">
            US Stocks 美股投资产品允许投资者通过区块链技术投资美国股票市场。该产品提供多样化的美股选择，包括科技股、金融股、消费股等，让投资者能够分散风险并获得美股市场的增长机会。
          </p>
        </div>
      </div>

      {/* 投资优势 */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <SvgIcon src="/icons/home-core2.svg" className="w-5 h-5" />
          <h2 className="text-lg font-medium text-main">投资优势</h2>
        </div>
        <div className="bg-surface rounded-xl p-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
              <p className="text-sm text-muted leading-relaxed">
                全球化投资: 直接投资美国优质上市公司股票
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
              <p className="text-sm text-muted leading-relaxed">
                分散风险: 支持多只股票组合投资，降低单一股票风险
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
              <p className="text-sm text-muted leading-relaxed">
                实时交易: 支持7x24小时交易，把握市场机会
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 风险提示 */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <SvgIcon src="/icons/home-core3.svg" className="w-5 h-5" />
          <h2 className="text-lg font-medium text-main">风险提示</h2>
        </div>
        <div className="bg-surface rounded-xl p-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
              <p className="text-sm text-muted leading-relaxed">
                市场风险: 美股市场波动较大，可能面临本金损失风险
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
              <p className="text-sm text-muted leading-relaxed">
                汇率风险: 美元汇率波动可能影响投资收益
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
              <p className="text-sm text-muted leading-relaxed">
                流动性风险: 部分股票可能存在流动性不足的情况
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 合规信息 */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <SvgIcon src="/icons/home-core4.svg" className="w-5 h-5" />
          <h2 className="text-lg font-medium text-main">合规信息</h2>
        </div>
        <div className="bg-surface rounded-xl p-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-[20%] bg-green-500 flex items-center justify-center shrink-0">
                <span className="text-white text-xs">✓</span>
              </div>
              <p className="text-sm text-muted">符合美国SEC监管要求</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-[20%] bg-green-500 flex items-center justify-center shrink-0">
                <span className="text-white text-xs">✓</span>
              </div>
              <p className="text-sm text-muted">通过KYC/AML合规审查</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-[20%] bg-green-500 flex items-center justify-center shrink-0">
                <span className="text-white text-xs">✓</span>
              </div>
              <p className="text-sm text-muted">资金托管在合规机构</p>
            </div>
          </div>
        </div>
      </div>

      {/* 免责声明 */}
      <div className="bg-surface rounded-xl p-4 border-l-4 border-primary">
        <h3 className="text-sm font-medium text-main mb-2">免责声明</h3>
        <p className="text-xs text-muted leading-relaxed">
          本信息仅供参考, 不构成投资建议。美股投资存在市场风险，请在投资前仔细阅读相关文件并充分了解风险。过往业绩不代表未来表现。
        </p>
      </div>
    </div>
  )
}
