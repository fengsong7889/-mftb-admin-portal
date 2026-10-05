import { Button } from 'antd'
import { ArrowLeftOutlined, OrderedListOutlined } from '@ant-design/icons'
import { RECOMMEND_TYPE_CONFIGS } from './types'

/**
 * 广告推广 / 促销配置 共享页头
 *
 * 提取自 AdSales/index.tsx 与 PromotionSalesConfig/index.tsx 中
 * 几乎完全相同的页面头部 JSX（渐变条 + 返回按钮 + 标题 + 类型徽章 + 查看订单）
 */
export function AdPromotionPageHeader({
  currentStep,
  selectedAlgorithmType,
  onGoBack,
  onViewOrders,
  t,
}: {
  currentStep: number
  selectedAlgorithmType: number | null
  onGoBack: () => void
  onViewOrders: () => void
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
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
          {currentStep >= 1 && (
            <>
              <Button type="primary" icon={<ArrowLeftOutlined />}
                onClick={onGoBack}
                style={{
                  backgroundColor: '#E8720C', borderColor: '#E8720C',
                  borderRadius: 8, height: 36, padding: '0 16px',
                  display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                }}>{t('common:back')}</Button>
              <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {currentStep >= 1 && selectedAlgorithmType
                ? t('buyAd')
                : t('adSalesTitle')}
            </h2>
            {currentStep >= 1 && selectedAlgorithmType && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 12px', background: '#FFF7E6',
                border: '1px solid #FFD591', borderRadius: 4,
                fontSize: 13, color: '#E8720C', fontWeight: 500,
              }}>
                <span style={{ fontSize: 14 }}>{RECOMMEND_TYPE_CONFIGS.find(c => c.type === selectedAlgorithmType)?.icon}</span>
                {RECOMMEND_TYPE_CONFIGS.find(c => c.type === selectedAlgorithmType)?.name}
              </div>
            )}
          </div>
        </div>
        {currentStep >= 1 && (
          <Button type="primary" icon={<OrderedListOutlined />}
            onClick={onViewOrders}
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C',
              borderRadius: 8, height: 36, padding: '0 18px',
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
            }}>{t('viewOrders')}</Button>
        )}
      </div>
    </div>
  )
}
