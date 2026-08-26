import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, Tag, Button, message, Tabs } from 'antd'
import {
  ArrowLeftOutlined,
  ShoppingCartOutlined,
  OrderedListOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlgorithmType, Region, RecommendChannel, AppType, ALGO_CARD_COLOR_MAP } from '../Recommend/constants'
import { useCardOrder } from '../../hooks/useCardOrder'
import DateTimeGrid from './DateTimeGrid'
import DayPicker from './DayPicker'
import NewStoreDayPicker from './NewStoreDayPicker'
import PopularSkinPicker from './PopularSkinPicker'
import GoldenSignboardLabelPicker from './GoldenSignboardLabelPicker'
import {
  type InventoryItem,
  type RecommendTypeConfig,
  RECOMMEND_TYPE_CONFIGS,
  generateMockInventory,
} from './types'

// 各 Tab 展示的卡片默认类型顺序
const DELIVERY_CARD_TYPES: AlgorithmType[] = [
  AlgorithmType.INVINCIBLE_STAR,
  AlgorithmType.HOT_REVIVE_AD,
  AlgorithmType.NEW_STORE_AD,
  AlgorithmType.TRAFFIC_AD,
  AlgorithmType.POPULAR_MERCHANT_KA,
  AlgorithmType.GOLDEN_SIGNBOARD,
]
const GROUP_BUY_CARD_TYPES: AlgorithmType[] = [
  AlgorithmType.INVINCIBLE_STAR,
  AlgorithmType.HOT_REVIVE_AD,
]

// 根据URL参数计算初始状态
const getInitialState = (searchParams: URLSearchParams) => {
  const typeParam = searchParams.get('type')
  if (typeParam) {
    const config = RECOMMEND_TYPE_CONFIGS.find(c => c.name === typeParam)
    if (config && config.enabled) {
      // 生成库存数据
      const allData: InventoryItem[] = []
      Object.values(Region).forEach(region => {
        if (typeof region === 'number') {
          allData.push(...generateMockInventory(region, config.type, undefined))
        }
      })
      const filtered = allData.filter(item =>
        item.channel === RecommendChannel.HOME ||
        item.channel === RecommendChannel.DELIVERY ||
        item.channel === RecommendChannel.SUPERMARKET
      )
      return {
        step: 1,
        algorithmType: config.type,
        inventory: filtered.length > 0 ? filtered[0] : null,
      }
    }
  }
  return { step: 0, algorithmType: null, inventory: null }
}

export default function AdSales() {
  const { t } = useTranslation('adSales')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initial = getInitialState(searchParams)
  const [currentStep, setCurrentStep] = useState(initial.step)
  const [selectedAlgorithmType, setSelectedAlgorithmType] = useState<AlgorithmType | null>(initial.algorithmType)
  const [selectedInventory, setSelectedInventory] = useState<InventoryItem | null>(initial.inventory)
  const [selectedApp, _setSelectedApp] = useState<AppType | null | undefined>(null)
  const [selectedTab, setSelectedTab] = useState<'delivery' | 'groupBuy'>('delivery')

  // 卡片拖拽排序（順序持久化到數據庫 + localStorage，每個 Tab 獨立保存）
  const deliveryCardOrder = useCardOrder('ad-sales-card-order-delivery', DELIVERY_CARD_TYPES, 'ad-sales')
  const groupBuyCardOrder = useCardOrder('ad-sales-card-order-groupBuy', GROUP_BUY_CARD_TYPES, 'ad-sales')

  // 購買廣告 - 直接进入日期时段选择界面
  const handleGoToPurchase = (config: RecommendTypeConfig) => {
    if (!config.enabled) {
      message.info(t('notAvailable'))
      return
    }
    // 新店广告、人气商家、金字招牌：进入各自选购界面（无需库存数据）
    if (config.type === AlgorithmType.NEW_STORE_AD || config.type === AlgorithmType.POPULAR_MERCHANT_KA || config.type === AlgorithmType.GOLDEN_SIGNBOARD) {
      setSelectedAlgorithmType(config.type)
      setSelectedInventory(null)
      setCurrentStep(1)
      return
    }
    setSelectedAlgorithmType(config.type)
    // 自动生成第一条库存数据并直接进入日期选择
    const allData: InventoryItem[] = []
    Object.values(Region).forEach(region => {
      if (typeof region === 'number') {
        allData.push(...generateMockInventory(region, config.type, selectedApp || undefined))
      }
    })
    let filtered = allData
    if (selectedApp !== null && selectedApp !== undefined) {
      filtered = allData.filter(item => item.app === selectedApp)
    }
    if (selectedTab === 'groupBuy') {
      filtered = filtered.filter(item => item.channel === RecommendChannel.HOME || item.channel === RecommendChannel.GROUP_BUY)
    } else {
      filtered = filtered.filter(item => item.channel === RecommendChannel.HOME || item.channel === RecommendChannel.DELIVERY || item.channel === RecommendChannel.SUPERMARKET)
    }
    if (filtered.length > 0) {
      setSelectedInventory(filtered[0])
      setCurrentStep(1)
    } else {
      message.info(t('noInventory'))
    }
  }

  // 返回卡片页
  const handleGoBack = () => {
    setSelectedAlgorithmType(null)
    setSelectedInventory(null)
    setCurrentStep(0)
  }

  return (
    <div className="content-area">
      {/* 页面标题 */}
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
                  onClick={handleGoBack}
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
                {currentStep >= 1 && selectedAlgorithmType ? t('buyAd') : t('adSalesTitle')}
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
              onClick={() => {
                const typeName = RECOMMEND_TYPE_CONFIGS.find(c => c.type === selectedAlgorithmType)?.name || ''
                navigate(`/promotion-order-manage?type=${encodeURIComponent(typeName)}&from=ad-sales`)
              }}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 18px',
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              }}>{t('viewOrders')}</Button>
          )}
        </div>
      </div>

      {/* Step 1: 选择广告类型 */}
      {currentStep === 0 && (
        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '5px 24px' }}>
          <Tabs
            defaultActiveKey="delivery"
            onChange={(key) => setSelectedTab(key as 'delivery' | 'groupBuy')}
            items={[
              {
                key: 'delivery',
                label: t('deliveryTab'),
                children: (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 16,
                  }}>
                    {deliveryCardOrder.sortCards(
                      RECOMMEND_TYPE_CONFIGS.filter(config => DELIVERY_CARD_TYPES.includes(config.type)),
                      config => config.type,
                    ).map(config => (
                      <div
                        key={config.type}
                        className={`algo-card-wrapper algo-card-wrapper--${ALGO_CARD_COLOR_MAP[config.type]}${!config.enabled ? ' disabled' : ''}`}
                        onClick={() => navigate(`/promotion-order-manage?type=${encodeURIComponent(config.name)}&from=ad-sales`)}
                        style={selectedAlgorithmType === config.type ? { outline: '2px solid #1890ff', outlineOffset: -2 } : undefined}
                        {...deliveryCardOrder.getDragProps(config.type)}
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
                              <div style={{ display: 'flex', gap: 24, justifyContent: 'center' }}>
                                <Button
                                  size="small"
                                  icon={<OrderedListOutlined />}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    navigate(`/promotion-order-manage?type=${encodeURIComponent(config.name)}&from=ad-sales`)
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
                                    handleGoToPurchase(config)
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
                ),
              },
              {
                key: 'groupBuy',
                label: t('groupBuyTab'),
                children: (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 16,
                  }}>
                    {groupBuyCardOrder.sortCards(
                      RECOMMEND_TYPE_CONFIGS.filter(config => GROUP_BUY_CARD_TYPES.includes(config.type)),
                      config => config.type,
                    ).map(config => (
                      <div
                        key={config.type}
                        className={`algo-card-wrapper algo-card-wrapper--${ALGO_CARD_COLOR_MAP[config.type]}${!config.enabled ? ' disabled' : ''}`}
                        onClick={() => navigate(`/promotion-order-manage?type=${encodeURIComponent(config.name)}&from=ad-sales`)}
                        style={selectedAlgorithmType === config.type ? { outline: '2px solid #1890ff', outlineOffset: -2 } : undefined}
                        {...groupBuyCardOrder.getDragProps(config.type)}
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
                              <div style={{ display: 'flex', gap: 24, justifyContent: 'center' }}>
                                <Button
                                  size="small"
                                  icon={<OrderedListOutlined />}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    navigate(`/promotion-order-manage?type=${encodeURIComponent(config.name)}&from=ad-sales`)
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
                                    handleGoToPurchase(config)
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
                ),
              },
            ]}
          />
        </Card>
      )}

      {/* Step 2: 選擇贈送推廣天數並提交訂單 - 新店廣告 */}
      {currentStep === 1 && selectedAlgorithmType === AlgorithmType.NEW_STORE_AD && (
        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 24px' }}>
          <NewStoreDayPicker />
        </Card>
      )}

      {/* Step 2: 选择皮肤套件并购买 - 人氣商家 */}
      {currentStep === 1 && selectedAlgorithmType === AlgorithmType.POPULAR_MERCHANT_KA && (
        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 24px' }}>
          <PopularSkinPicker />
        </Card>
      )}

      {/* Step 2: 选择标签并购买 - 金字招牌 */}
      {currentStep === 1 && selectedAlgorithmType === AlgorithmType.GOLDEN_SIGNBOARD && (
        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 24px' }}>
          <GoldenSignboardLabelPicker />
        </Card>
      )}

      {/* Step 2: 选择时段并加购 - 無敵星星 */}
      {currentStep === 1 && selectedAlgorithmType !== AlgorithmType.NEW_STORE_AD && selectedAlgorithmType !== AlgorithmType.POPULAR_MERCHANT_KA && selectedAlgorithmType !== AlgorithmType.GOLDEN_SIGNBOARD && selectedInventory && selectedInventory.algorithmType !== AlgorithmType.HOT_REVIVE_AD && (
        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 24px' }}>
          <DateTimeGrid
            inventoryItem={selectedInventory}
          />
        </Card>
      )}

      {/* Step 2: 选择日期并加购 - 盤活復蘇 */}
      {currentStep === 1 && selectedInventory && selectedInventory.algorithmType === AlgorithmType.HOT_REVIVE_AD && (
        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 24px' }}>
          <DayPicker
            inventoryItem={selectedInventory}
          />
        </Card>
      )}
    </div>
  )
}
