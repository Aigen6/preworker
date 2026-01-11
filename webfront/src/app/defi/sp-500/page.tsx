"use client"

import { useRouter } from "next/navigation"
import SvgIcon from "@/components/ui/SvgIcon"

export default function SP500DetailPage() {
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
            S&P 500 指数投资产品追踪标准普尔500指数，该指数包含美国500家最大的上市公司，覆盖各个行业。作为美国股市的重要基准指数，S&P 500代表了美国经济的整体表现。
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
                全行业覆盖: 涵盖科技、金融、医疗、消费等各个行业
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
              <p className="text-sm text-muted leading-relaxed">
                大盘股投资: 主要投资美国大型上市公司，相对稳定
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
              <p className="text-sm text-muted leading-relaxed">
                长期收益: 历史数据显示长期投资回报良好
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
                市场风险: 股市整体波动可能影响投资收益
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
              <p className="text-sm text-muted leading-relaxed">
                经济周期: 经济衰退期可能面临较大损失
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
              <p className="text-sm text-muted leading-relaxed">
                汇率风险: 美元汇率波动可能影响投资收益
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
          本信息仅供参考, 不构成投资建议。S&P 500投资存在市场风险，请在投资前仔细阅读相关文件并充分了解风险。过往业绩不代表未来表现。
        </p>
      </div>
    </div>
  )
}
