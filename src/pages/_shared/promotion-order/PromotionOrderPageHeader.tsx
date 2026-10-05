/**
 * 推廣訂單共享頁面頭部組件
 *
 * 提取 PromotionOrderManage 和 PromotionOrderManageStandalone 中相同的頁面頭部樣式。
 */
import { Button } from 'antd'
import { ArrowLeftOutlined, ShoppingCartOutlined } from '@ant-design/icons'
import { RECOMMEND_TYPE_ICON, type RecommendType } from './constants'
import type { AlgorithmType } from '../../Recommend/constants'

export interface PromotionOrderPageHeaderProps {
  t: (key: string, opts?: Record<string, unknown>) => string
  orderType: string
  orderTypeKey: AlgorithmType | undefined
  recommendTypeLabel: (key: AlgorithmType) => string
  onBack: () => void
  onBuyAd: () => void
}

export function PromotionOrderPageHeader({
  t,
  orderType,
  orderTypeKey,
  recommendTypeLabel,
  onBack,
  onBuyAd,
}: PromotionOrderPageHeaderProps) {
  return (
    <div style={{
      position: 'relative', background: '#fff', marginBottom: 16,
      borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      <div style={{
        height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
        backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
      }} />
      <div style={{
        padding: '16px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button type="primary" icon={<ArrowLeftOutlined />}
            onClick={onBack}
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C',
              borderRadius: 8, height: 36, padding: '0 16px',
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('promotionOrderManage.orderListTitle')}</h2>
            {orderType && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 12px', background: '#FFF7E6',
                border: '1px solid #FFD591', borderRadius: 4,
                fontSize: 13, color: '#E8720C', fontWeight: 500,
              }}>
                {orderTypeKey !== undefined && <span style={{ fontSize: 14 }}>{RECOMMEND_TYPE_ICON[orderTypeKey as RecommendType]}</span>}
                {orderTypeKey !== undefined ? recommendTypeLabel(orderTypeKey) : orderType}
              </div>
            )}
          </div>
        </div>
        <Button type="primary" icon={<ShoppingCartOutlined />}
          onClick={onBuyAd}
          style={{
            backgroundColor: '#E8720C', borderColor: '#E8720C',
            borderRadius: 8, height: 36, padding: '0 18px',
            boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>{t('promotionOrderManage.buyAd')}</Button>
      </div>
    </div>
  )
}
