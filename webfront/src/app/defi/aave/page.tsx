'use client'

import { useRouter } from 'next/navigation'
import SvgIcon from '@/components/ui/SvgIcon'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function AaveDetailPage() {
  const router = useRouter()
  const { t } = useTranslation()

  const handleBack = () => {
    router.back()
  }

  return (
    <div className="p-4 space-y-4">
      {/* 产品说明 */}
      <div>
        <div className="flex items-center gap-2 mb-4 text-main">
          <SvgIcon src="/icons/describe-1.svg" className="w-4 h-4" />
          <h2 className="">{t('defi.aave.productIntroTitle')}</h2>
        </div>
        <p className="text-sm text-muted leading-relaxed">
          {t('defi.aave.productIntroContent')}
        </p>
      </div>

      {/* 风险提示 */}
      <div>
        <div className="flex items-center gap-2 mb-4 text-main">
          <SvgIcon src="/icons/describe-2.svg" className="w-4 h-4" />
          <h2 className="">{t('defi.aave.riskAlertTitle')}</h2>
        </div>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
            <p className="text-sm text-muted leading-relaxed">
              {t('defi.aave.riskItems.contract')}
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
            <p className="text-sm text-muted leading-relaxed">
              {t('defi.aave.riskItems.liquidation')}
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
            <p className="text-sm text-muted leading-relaxed">
              {t('defi.aave.riskItems.rate')}
            </p>
          </div>
        </div>
      </div>

      {/* 合规信息 */}
      <div>
        <div className="flex items-center gap-2 mb-4 text-main">
          <SvgIcon src="/icons/describe-3.svg" className="w-4 h-4" />
          <h2 className="">{t('defi.aave.complianceTitle')}</h2>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-muted">
            <span>✓</span>
            <p>{t('defi.aave.complianceItems.audit')}</p>
          </div>
          <div className="flex items-center gap-3 text-muted">
            <span>✓</span>
            <p>{t('defi.aave.complianceItems.regulation')}</p>
          </div>
          <div className="flex items-center gap-3 text-muted">
            <span>✓</span>
            <p>{t('defi.aave.complianceItems.kyc')}</p>
          </div>
        </div>
      </div>

      {/* 安全审计 */}
      <div>
        <div className="flex items-center gap-2 mb-4 text-main">
          <SvgIcon src="/icons/describe-2.svg" className="w-4 h-4" />
          <h2 className="">{t('defi.aave.securityAuditTitle')}</h2>
        </div>
        <div className="space-y-3">
          {/* OpenZeppelin */}
          <div className="bg-surface rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-main">
                OpenZeppelin
              </h3>
              <button className="border border-line rounded-[6px] text-white px-3 py-1  text-xs">
                {t('defi.aave.passed')}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted mb-2">2024 {t('defi.aave.august')}</p>
              <button className="text-xs text-muted">{t('defi.aave.viewMore')}</button>
            </div>
          </div>

          {/* Trail of Bits */}
          <div className="bg-surface rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-main">
                Trail of Bits
              </h3>
              <button className="border border-line rounded-[6px] text-white px-3 py-1  text-xs">
                {t('defi.aave.passed')}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted mb-2">2024 {t('defi.aave.august')}</p>
              <button className="text-xs text-muted">{t('defi.aave.viewMore')}</button>
            </div>
          </div>

          {/* Consensys Diligence */}
          <div className="bg-surface rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-main">
                Consensys Diligence
              </h3>
              <button className="border border-line rounded-[6px] text-white px-3 py-1  text-xs">
                {t('defi.aave.passed')}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted mb-2">2024 {t('defi.aave.august')}</p>
              <button className="text-xs text-muted">{t('defi.aave.viewMore')}</button>
            </div>
          </div>
        </div>
      </div>

      {/* 免责声明 */}
      <div className="bg-surface rounded-xl p-4 border-l-4 border-primary">
        <p className="text-xs text-muted leading-relaxed">
          {t('defi.aave.disclaimer')}
        </p>
      </div>
    </div>
  )
}
