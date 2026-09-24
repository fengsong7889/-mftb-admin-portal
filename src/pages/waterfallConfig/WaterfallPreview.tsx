import { useTranslation } from 'react-i18next'
import { Tag } from 'antd'
import type { WaterfallBusinessType, WaterfallContentType, WaterfallLayoutColumns, WaterfallDisplayCategoryMode, WaterfallBizChannel } from './types'
import { toPreviewRows, type PreviewCard } from './previewLayout'

/** 算法类型标签/配色（预览用，与算法库 algo_type 对齐） */
const ALGO_TYPE_LABEL: Record<number, string> = {
  1: 'recommend:algoInvincibleStar', 2: 'recommend:algoNewStoreAd', 3: 'recommend:algoHotReviveAd',
  4: 'recommend:algoExclusiveMerchant', 5: 'recommend:algoPopularMerchant', 6: 'recommend:algoGuessYouLike',
  7: 'recommend:algoOrganicTraffic', 11: 'recommend:algoBrandMerchant', 12: 'recommend:algoGoldAd',
  13: 'recommend:algoGoldenSignboard', 14: 'recommend:algoProductPromo', 15: 'recommend:algoTrafficAd',
}
const ALGO_TYPE_COLOR: Record<number, string> = {
  1: 'gold', 2: 'green', 3: 'magenta', 4: 'purple', 5: 'red', 6: 'blue',
  7: 'lime', 11: 'orange', 12: 'cyan', 13: 'geekblue', 14: 'volcano', 15: 'yellow',
}

export interface PreviewAlgoSlot {
  position: number
  algorithmName: string
  algorithmType: number
}

interface Props {
  businessType: WaterfallBusinessType
  bizChannel?: WaterfallBizChannel
  displayCategoryMode?: WaterfallDisplayCategoryMode
  contentType: WaterfallContentType
  layoutColumns: WaterfallLayoutColumns
  /** 手机顶部标题 */
  phoneTitle: string
  /** 外卖：已配置算法坑位 */
  algoSlots: PreviewAlgoSlot[]
  /** 团购：预览卡片序列 */
  previewCards: PreviewCard[]
  /** 外卖：自然流量兜底算法名称（未配置坑位提示用） */
  naturalFallbackName?: string
  /** 手机状态栏时间 */
  phoneTime: string
}

/**
 * 高仿真手机瀑布流预览。
 * 外卖：按坑位列表展示算法名称（卡片内容仅布局示意，不声称来自算法计算）。
 * 团购：按单列/双列布局渲染固定内容与分类补位卡片。
 */
export default function WaterfallPreview({
  businessType, bizChannel, displayCategoryMode, contentType, layoutColumns, phoneTitle,
  algoSlots, previewCards, naturalFallbackName, phoneTime,
}: Props) {
  const { t } = useTranslation()
  const isGroupBuy = businessType === 'groupBuy'
  const enabledAlgoSlots = algoSlots
  const isContentPreview = (isGroupBuy || bizChannel === 'supermarket') && displayCategoryMode !== 'algorithm'

  return (
    <div style={{ width: 375, flexShrink: 0, position: 'relative' }}>
      {/* 侧边按钮 */}
      <div style={{ position: 'absolute', left: -3, top: 150, width: 3, height: 32, borderRadius: '2px 0 0 2px', background: 'linear-gradient(180deg, #5A7D9A, #3D6180, #5A7D9A)' }} />
      <div style={{ position: 'absolute', left: -3, top: 195, width: 3, height: 32, borderRadius: '2px 0 0 2px', background: 'linear-gradient(180deg, #5A7D9A, #3D6180, #5A7D9A)' }} />
      <div style={{ position: 'absolute', left: -3, top: 112, width: 3, height: 20, borderRadius: '2px 0 0 2px', background: 'linear-gradient(180deg, #5A7D9A, #3D6180, #5A7D9A)' }} />
      <div style={{ position: 'absolute', right: -3, top: 160, width: 3, height: 52, borderRadius: '0 2px 2px 0', background: 'linear-gradient(180deg, #5A7D9A, #3D6180, #5A7D9A)' }} />

      {/* 手机外壳 */}
      <div style={{
        width: 375, height: 720, borderRadius: 52, position: 'relative',
        background: 'linear-gradient(160deg, #3E5C76 0%, #2C4A64 30%, #1B3A52 60%, #263F56 100%)',
        boxShadow: [
          '0 24px 64px rgba(20,40,65,0.40)', '0 8px 24px rgba(0,0,0,0.22)',
          'inset 0 1px 0 rgba(180,210,240,0.18)', 'inset 0 -1px 0 rgba(0,0,0,0.35)',
          'inset 1px 0 0 rgba(180,210,240,0.08)', 'inset -1px 0 0 rgba(180,210,240,0.08)',
        ].join(', '),
      }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 52, border: '1px solid rgba(180,210,240,0.12)', pointerEvents: 'none', zIndex: 2 }} />
        <div style={{ position: 'absolute', top: 90, left: -1, width: 2, height: 6, background: '#4E6E8A', borderRadius: 1, zIndex: 3 }} />
        <div style={{ position: 'absolute', top: 90, right: -1, width: 2, height: 6, background: '#4E6E8A', borderRadius: 1, zIndex: 3 }} />
        <div style={{ position: 'absolute', bottom: 130, left: -1, width: 2, height: 6, background: '#4E6E8A', borderRadius: 1, zIndex: 3 }} />
        <div style={{ position: 'absolute', bottom: 130, right: -1, width: 2, height: 6, background: '#4E6E8A', borderRadius: 1, zIndex: 3 }} />

        {/* 屏幕 */}
        <div style={{ position: 'absolute', inset: 10, borderRadius: 42, background: '#000', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 42, background: '#F5F5F5', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* 状态栏 */}
            <div style={{ height: 50, padding: '14px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', flexShrink: 0, position: 'relative', zIndex: 5 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#000', letterSpacing: 0.5 }}>{phoneTime}</span>
              <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', width: 110, height: 30, background: '#000', borderRadius: 16, zIndex: 10 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width="17" height="12" viewBox="0 0 17 12" fill="none"><rect x="0" y="9" width="3" height="3" rx="0.5" fill="#000" /><rect x="4.5" y="6" width="3" height="6" rx="0.5" fill="#000" /><rect x="9" y="3" width="3" height="9" rx="0.5" fill="#000" /><rect x="13.5" y="0" width="3" height="12" rx="0.5" fill="#000" /></svg>
                <svg width="16" height="12" viewBox="0 0 16 12" fill="none"><circle cx="8" cy="10" r="1.5" fill="#000" /><path d="M4.5 8c1-1.2 2.2-1.8 3.5-1.8s2.5.6 3.5 1.8" stroke="#000" strokeWidth="1.3" strokeLinecap="round" /><path d="M1.8 5.5C3.5 3.5 5.6 2.5 8 2.5s4.5 1 6.2 3" stroke="#000" strokeWidth="1.3" strokeLinecap="round" /></svg>
                <svg width="27" height="13" viewBox="0 0 27 13" fill="none"><rect x="0.5" y="0.5" width="22" height="12" rx="2.5" stroke="#000" strokeOpacity="0.35" /><rect x="2" y="2" width="19" height="9" rx="1.5" fill="#000" /><path d="M24 4.5v4a2 2 0 0 0 0-4z" fill="#000" fillOpacity="0.4" /></svg>
              </div>
            </div>

            {/* 导航栏 */}
            <div style={{ background: '#fff', padding: '8px 16px 12px', borderBottom: '0.5px solid rgba(0,0,0,0.08)', flexShrink: 0, textAlign: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#262626', letterSpacing: 0.3 }}>{phoneTitle}</div>
              <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 3, lineHeight: 1.4 }}>
                {isContentPreview ? t('promotionSlotConfig:previewHintGroupBuy') : t('promotionSlotConfig:previewHintAlgorithm')}
              </div>
            </div>

            {/* 内容区 */}
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px 28px' }}>
              {isContentPreview ? (
                <GroupBuyPreview contentType={contentType} layoutColumns={layoutColumns} cards={previewCards} />
              ) : (
                <DeliveryPreview slots={enabledAlgoSlots} naturalFallbackName={naturalFallbackName} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DeliveryPreview({ slots, naturalFallbackName }: { slots: PreviewAlgoSlot[]; naturalFallbackName?: string }) {
  const { t } = useTranslation()
  if (slots.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '36px 14px', lineHeight: 1.7 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>{t('promotionSlotConfig:noConfiguredSlot')}</div>
        <div style={{ fontSize: 11, color: '#8c8c8c', background: '#FFFBE6', border: '1px solid #FFE58F', borderRadius: 8, padding: '8px 12px', marginTop: 10, lineHeight: 1.7 }}>
          {t('promotionSlotConfig:naturalFallbackHint')}
          {naturalFallbackName ? `：${naturalFallbackName}` : ''}
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {slots.map(item => (
        <div key={item.position} style={{ background: '#FAFAFA', borderRadius: 12, padding: '12px 16px', border: '1px solid #F0F0F0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Tag color="blue" style={{ margin: 0 }}>{t('promotionSlotConfig:posNum', { pos: item.position })}</Tag>
            <Tag color={ALGO_TYPE_COLOR[item.algorithmType] ?? 'default'} style={{ margin: 0 }}>
              {ALGO_TYPE_LABEL[item.algorithmType] ? t(ALGO_TYPE_LABEL[item.algorithmType]) : t('promotionSlotConfig:algoTypeFallback', { type: item.algorithmType })}
            </Tag>
          </div>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6 }}>{item.algorithmName}</div>
        </div>
      ))}
    </div>
  )
}

function GroupBuyPreview({ contentType, layoutColumns, cards }: { contentType: WaterfallContentType; layoutColumns: WaterfallLayoutColumns; cards: PreviewCard[] }) {
  const { t } = useTranslation()
  if (cards.length === 0) {
    return <div style={{ textAlign: 'center', padding: '36px 14px', fontSize: 13, color: '#8c8c8c' }}>{t('promotionSlotConfig:noPreviewContent')}</div>
  }
  const rows = toPreviewRows(cards, layoutColumns)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'grid', gridTemplateColumns: `repeat(${layoutColumns}, 1fr)`, gap: 10 }}>
          {row.map(card => (
            <PreviewCardView key={card.position} card={card} contentType={contentType} />
          ))}
        </div>
      ))}
    </div>
  )
}

function PreviewCardView({ card, contentType }: { card: PreviewCard; contentType: WaterfallContentType }) {
  const { t } = useTranslation()
  if (card.kind === 'empty') {
    return (
      <div style={{ borderRadius: 12, border: '1px dashed #d9d9d9', background: '#fafafa', minHeight: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, textAlign: 'center' }}>
        <span style={{ fontSize: 11, color: '#bfbfbf' }}>{t('promotionSlotConfig:candidateInsufficient')}</span>
      </div>
    )
  }
  return (
    <div style={{ borderRadius: 12, border: '1px solid #F0F0F0', background: '#fff', overflow: 'hidden' }}>
      <div style={{ height: 72, background: card.kind === 'fixed' ? '#FFF7E6' : '#F0F5FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, position: 'relative' }}>
        {card.image || (contentType === 'store' ? '🏪' : '🎫')}
        {card.kind === 'fixed' && (
          <Tag color="orange" style={{ position: 'absolute', top: 4, left: 4, margin: 0, fontSize: 10 }}>{t('promotionSlotConfig:fixedSlotTag')}</Tag>
        )}
      </div>
      <div style={{ padding: '6px 8px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#262626', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', minHeight: 32 }}>
          {card.itemName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: '#8c8c8c' }}>
          {card.rating ? <span style={{ color: '#E8720C' }}>★ {card.rating}</span> : null}
          {card.monthlySales ? <span>月售 {card.monthlySales}</span> : null}
          {card.price != null ? <span style={{ color: '#FF4D4F', marginLeft: 'auto' }}>MOP {card.price}</span> : null}
        </div>
      </div>
    </div>
  )
}
