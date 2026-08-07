/**
 * 梯度折扣横幅：在购买界面常驻展示算法配置的梯度折扣规则
 * 无敌星星（按单日时段数）与盘活复苏（按购买天数）共用
 */
import { Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'

/** 单个梯度档位 */
export interface DiscountTier {
  threshold: number // 达标数量（≥N 个时段 / ≥N 天）
  discount: number  // 折扣，95=95折、80=8折
}

interface GradientDiscountBannerProps {
  tiers: DiscountTier[]   // 梯度配置（任意顺序，内部按门槛升序排列）
  unitLabel: string       // 数量单位：'個時段' | '天'
  scopeLabel?: string     // 规则范围前缀，如无敌星星的'單日'
  currentCount: number    // 当前已选数量（用于高亮档位与凑单提示）
  refundDisabled?: boolean // 算法不允许退款时，在同一行展示警示标签
}

/** 折扣展示文案：90 → 9折，95 → 95折 — 由组件内部使用 t() 生成 */
// formatDiscount moved inside component to access t()

export default function GradientDiscountBanner({ tiers, unitLabel, scopeLabel = '', currentCount, refundDisabled = false }: GradientDiscountBannerProps) {
  const { t } = useTranslation('adSales')

  /** 折扣展示文案：90 → 9折，95 → 95折 */
  const formatDiscount = (discount: number): string => {
    return discount % 10 === 0 ? `${discount / 10}${t('discountUnit')}` : `${discount}${t('discountUnit')}`
  }

  if (tiers.length === 0) return null

  // 按门槛升序排列
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold)
  // 当前达成的最高档位
  const achieved = [...sorted].reverse().find(t => currentCount >= t.threshold) || null
  // 下一个待达成档位
  const next = sorted.find(t => currentCount < t.threshold) || null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      padding: '10px 16px', marginBottom: 16,
      background: 'linear-gradient(135deg, #FFF9F0, #FFF4E6)',
      border: '1px solid #FFE0B2', borderRadius: 8,
    }}>
      {/* 标题 */}
      <span style={{ fontSize: 13, fontWeight: 700, color: '#E8720C', whiteSpace: 'nowrap' }}>
        {t('multiDiscount')}
      </span>

      {/* 梯度档位药丸 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {sorted.map((tier, i) => {
          const isAchieved = currentCount >= tier.threshold
          const isCurrent = achieved?.threshold === tier.threshold
          return (
            <span key={tier.threshold} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ fontSize: 10, color: '#FFD591' }}>▸</span>}
              <span style={{
                fontSize: 12, padding: '2px 10px', borderRadius: 12, whiteSpace: 'nowrap',
                fontWeight: isCurrent ? 700 : 500,
                transition: 'all 0.2s',
                ...(isAchieved
                  ? {
                      background: 'linear-gradient(135deg, #E8720C, #F59432)', color: '#fff',
                      border: '1px solid transparent',
                      boxShadow: isCurrent ? '0 2px 6px rgba(232,114,12,0.35)' : 'none',
                    }
                  : {
                      background: '#fff', color: '#E8720C', border: '1px solid #FFD591',
                    }),
              }}>
                {t('tierFull')}{tier.threshold}{unitLabel} {formatDiscount(tier.discount)}
              </span>
            </span>
          )
        })}
      </div>

      {/* 实时凑单提示 */}
      <span style={{ marginLeft: 'auto', fontSize: 12, whiteSpace: 'nowrap' }}>
        {currentCount === 0 ? (
          <span style={{ color: '#8C8C8C' }}>{t('shopMoreSaveMore')}</span>
        ) : next ? (
          <span style={{ color: '#595959' }}>
            {t('selected')} <strong style={{ color: '#E8720C' }}>{currentCount}</strong> {unitLabel}
            {achieved && <>，{t('enjoying')} <strong style={{ color: '#E8720C' }}>{formatDiscount(achieved.discount)}</strong></>}
            ，{t('moreFor')} <strong style={{ color: '#FF4D4F' }}>{next.threshold - currentCount}</strong> {unitLabel}{t('canGet')}
            <strong style={{ color: '#FF4D4F' }}> {formatDiscount(next.discount)}</strong>
          </span>
        ) : (
          <span style={{ color: '#52C41A', fontWeight: 600 }}>
            {t('selected')} {currentCount} {unitLabel}，{t('maxDiscount')} {formatDiscount(sorted[sorted.length - 1].discount)} 🎉
          </span>
        )}
      </span>

      {/* 不允许退款警示：合并在同一行，脉冲动效引起注意，悬停查看完整说明 */}
      {refundDisabled && (
        <Tooltip title={t('noRefundTooltip')}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'help',
            fontSize: 14, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap',
            padding: '5px 16px', borderRadius: 16,
            background: 'linear-gradient(135deg, #FF4D4F, #FF7875)',
            border: '1px solid #ff4d4f',
            animation: 'refundWarnPulse 1.8s ease-in-out infinite',
          }}>
            ⚠️ {t('noRefund')}
          </span>
        </Tooltip>
      )}
    </div>
  )
}
