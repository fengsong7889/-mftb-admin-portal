import { Tag, Button } from 'antd'
import { ShoppingCartOutlined, OrderedListOutlined } from '@ant-design/icons'
import { ALGO_CARD_COLOR_MAP } from '../../Recommend/constants'
import type { useCardOrder } from '../../../hooks/useCardOrder'
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
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: 16,
    }}>
      {cardOrder.sortCards(
        configs,
        config => config.type,
      ).map(config => (
        <div
          key={config.type}
          className={`algo-card-wrapper algo-card-wrapper--${ALGO_CARD_COLOR_MAP[config.type]}${!config.enabled ? ' disabled' : ''}`}
          onClick={() => onCardClick(config)}
          style={selectedAlgorithmType === config.type ? { outline: '2px solid #1890ff', outlineOffset: -2 } : undefined}
          {...cardOrder.getDragProps(config.type)}
        >
          <div className="algo-card-inner">
            <div className="algo-card-icon">{config.icon}</div>
            <h3 className="algo-card-title">{config.name}</h3>
            <p className="algo-card-desc">{config.description}</p>
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
      ))}
    </div>
  )
}
