'use client'

import SvgIcon from '@/components/ui/SvgIcon'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function RwaDetailPage() {
  const { t } = useTranslation()

  return (
    <div className="p-4 space-y-4">
      {/* 产品说明 */}
      <div>
        <div className="flex items-center gap-2 mb-4 text-main">
          <SvgIcon src="/icons/describe-1.svg" className="w-4 h-4" />
          <h2 className="">{t('defi.rwa.productIntroTitle')}</h2>
        </div>
        <p className="text-sm text-muted leading-relaxed">
          {t('defi.rwa.productIntroContent')}
        </p>
      </div>

      {/* 法币出入金 */}
      <div>
        <div className="flex items-center gap-2 mb-4 text-main">
          <SvgIcon src="/icons/deposit.svg" className="w-4 h-4" monochrome />
          <h2 className="">{t('defi.rwa.fiatTitle')}</h2>
        </div>
      </div>
      <a
        href="https://example.com/us-stocks-fiat"
        target="_blank"
        style={{ backgroundColor: 'color-mix(in srgb, var(--text-main) 5%, transparent)' }}
        className="border border-line rounded-xl px-4 py-2 flex items-center gap-2"
      >
        <div className="bg-surface rounded-[20%] w-8 h-8 flex items-center justify-center">
          <img src="/images/trend.png" alt="trend" className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-white">{t('defi.rwa.fiatLinkText')}</p>
          <p className="text-xs text-muted">
            https://example.com/us-stocks-fiat
          </p>
        </div>
        <SvgIcon
          src="/icons/deposit.svg"
          className="w-4 h-4 text-white"
          monochrome
        />
      </a>

      {/* 风险提示 */}
      <div>
        <div className="flex items-center gap-2 mb-4 text-main">
          <SvgIcon src="/icons/describe-2.svg" className="w-4 h-4" />
          <h2 className="">{t('defi.rwa.riskTitle')}</h2>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
            <p className="text-sm text-muted leading-relaxed">
              {t('defi.rwa.riskItems.market')}
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
            <p className="text-sm text-muted leading-relaxed">
              {t('defi.rwa.riskItems.tokenization')}
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-[20%] bg-black-9 mt-2 shrink-0"></div>
            <p className="text-muted leading-relaxed">
              {t('defi.rwa.riskItems.liquidity')}
            </p>
          </div>
        </div>
      </div>

      {/* 合规信息 */}
      <div>
        <div className="flex items-center gap-2 mb-4 text-main">
          <SvgIcon src="/icons/describe-3.svg" className="w-4 h-4" />
          <h2 className="">{t('defi.rwa.complianceTitle')}</h2>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3 text-muted">
            <span>✓</span>
            <p>{t('defi.rwa.complianceItems.regulation')}</p>
          </div>
          <div className="flex items-center gap-3 text-muted">
            <span>✓</span>
            <p>{t('defi.rwa.complianceItems.custody')}</p>
          </div>
          <div className="flex items-center gap-3 text-muted">
            <span>✓</span>
            <p>{t('defi.rwa.complianceItems.disclosure')}</p>
          </div>
        </div>
      </div>

      {/* 相关文件 */}
      <div>
        <div className="flex items-center gap-2 mb-4 text-main">
          <SvgIcon src="/icons/describe-1.svg" className="w-4 h-4" />
          <h2 className="">{t('defi.rwa.docsTitle')}</h2>
          <div className="bg-surface rounded-[4px] px-2 py-1 text-xs text-white">
            PDF
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl bg-surface px-4 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SvgIcon src="/icons/describe-1.svg" className="w-4 h-4" />
              <p className="text-sm text-white">{t('defi.rwa.docs.structure')}</p>
            </div>
            <div className="text-xs text-muted">{t('defi.rwa.viewMore')}</div>
          </div>
          <div className="rounded-xl bg-surface px-4 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SvgIcon src="/icons/describe-1.svg" className="w-4 h-4" />
              <p className="text-sm text-white">{t('defi.rwa.docs.custody')}</p>
            </div>
            <div className="text-xs text-muted">{t('defi.rwa.viewMore')}</div>
          </div>
          <div className="rounded-xl bg-surface px-4 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SvgIcon src="/icons/describe-1.svg" className="w-4 h-4" />
              <p className="text-sm text-white">{t('defi.rwa.docs.risk')}</p>
            </div>
            <div className="text-xs text-muted">{t('defi.rwa.viewMore')}</div>
          </div>
          <div className="rounded-xl bg-surface px-4 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SvgIcon src="/icons/describe-1.svg" className="w-4 h-4" />
              <p className="text-sm text-white">{t('defi.rwa.docs.monthly')}</p>
            </div>
            <div className="text-xs text-muted">{t('defi.rwa.viewMore')}</div>
          </div>
        </div>
      </div>
      {/* 免责声明 */}
      <div className="bg-surface rounded-xl p-4 border-l-4 border-primary">
        <p className="text-xs text-muted leading-relaxed">
          {t('defi.rwa.disclaimer')}
        </p>
      </div>
    </div>
  )
}
