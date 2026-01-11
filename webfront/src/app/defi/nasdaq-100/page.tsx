"use client"

import { useRouter } from "next/navigation"
import SvgIcon from "@/components/ui/SvgIcon"

export default function NASDAQ100DetailPage() {
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
            NASDAQ 100 指数投资产品追踪纳斯达克100指数，该指数包含100家在纳斯达克交易所上市的最大非金融公司。主要涵盖科技、生物技术、零售等行业，是投资美国科技股的重要工具。
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
                科技股集中: 主要投资苹果、微软、谷歌等科技巨头
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
              <p className="text-sm text-muted leading-relaxed">
                指数化投资: 分散投资风险，避免单一股票风险
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
              <p className="text-sm text-muted leading-relaxed">
                长期增长: 科技股具有长期增长潜力
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
                科技股波动: 科技股价格波动较大，风险较高
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
              <p className="text-sm text-muted leading-relaxed">
                行业集中: 过度集中在科技行业，存在行业风险
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
              <p className="text-sm text-muted leading-relaxed">
                政策风险: 科技行业监管政策变化可能影响股价
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
          本信息仅供参考, 不构成投资建议。NASDAQ 100投资存在市场风险，请在投资前仔细阅读相关文件并充分了解风险。过往业绩不代表未来表现。
        </p>
      </div>
    </div>
  )
}
