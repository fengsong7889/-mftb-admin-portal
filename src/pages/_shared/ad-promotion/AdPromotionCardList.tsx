import { Tag, Button } from 'antd'
import { ShoppingCartOutlined, OrderedListOutlined } from '@ant-design/icons'
import { ALGO_CARD_COLOR_MAP } from '@mftb/contracts/recommendConstants'
import { HERO_CARD_STYLES, renderHeroMark } from './heroCardStyles'
import AdPromotionDescription from './AdPromotionDescription'
import type { useCardOrder } from '@/hooks/useCardOrder'
import type { RecommendTypeConfig } from './types'

/**
 * 广告推广卡片列表 — 共享渲染组件
 *
 * 提取自 AdSales/index.tsx 与 PromotionSalesConfig/index.tsx 中
 * 几乎完全相同的卡片网格 JSX（delivery / groupBuy 两个 Tab 共用）
 */
export function AdPromotionCardList({
  configs,
  cardOrder,
  selectedAlgorithmType,
  onCardClick,
  onViewOrders,
  onBuy,
  t,
  gap = 24,
}: {
  configs: RecommendTypeConfig[]
  cardOrder: ReturnType<typeof useCardOrder>
  selectedAlgorithmType: number | null
  onCardClick: (config: RecommendTypeConfig) => void
  onViewOrders: (config: RecommendTypeConfig) => void
  onBuy: (config: RecommendTypeConfig) => void
  t: (key: string, opts?: Record<string, unknown>) => string
  gap?: number
}) {
  return (
    <div className="algo-card-stage" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: 16,
    }}>
      {cardOrder.sortCards(
        configs,
        config => config.type,
      ).map(config => {
        /** hero 款：与算法库共用同一套渐变/徽记（heroCardStyles）；按钮保持本菜单自身的 查看訂單/購買廣告 */
        const hero = HERO_CARD_STYLES[config.type]
        return (
        <div
          key={config.type}
          className={`algo-card-wrapper${hero ? ` algo-card-hero algo-card-hero--${hero.variant}` : ` algo-card-wrapper--${ALGO_CARD_COLOR_MAP[config.type]}`}${!config.enabled ? ' disabled' : ''}`}
          onClick={() => onCardClick(config)}
          style={selectedAlgorithmType === config.type ? { outline: '2px solid #1890ff', outlineOffset: -2 } : undefined}
          {...cardOrder.getDragProps(config.type)}
        >
          <div className="algo-card-inner" style={hero ? { background: hero.gradient } : undefined}>
            <div className="algo-card-icon">{hero ? renderHeroMark(config.type) : config.icon}</div>
            <h3 className="algo-card-title">{config.name}</h3>
            <AdPromotionDescription type={config.type} />
            <div className="algo-card-tag">
              {!config.enabled && (
                <Tag color="default">{t('comingSoon')}</Tag>
              )}
              {config.enabled && (
                <div style={{ display: 'flex', gap, justifyContent: 'center' }}>
                  <Button
                    size="small"
                    icon={<OrderedListOutlined />}
                    onClick={(e) => {
                      e.stopPropagation()
                      onViewOrders(config)
                    }}
                  >
                    {t('viewOrders')}
                  </Button>
                  <Button
                    type="primary"
                    size="small"
                    icon={<ShoppingCartOutlined />}
                    onClick={(e) => {
                      e.stopPropagation()
                      onBuy(config)
                    }}
                  >
                    {t('buyAd')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
        )
      })}
    </div>
  )
}
