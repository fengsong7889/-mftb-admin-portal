import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, Button, message, Tabs } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlgorithmType, Region, RecommendChannel, AppType } from '../Recommend/constants'
import { useCardOrder } from '../../hooks/useCardOrder'
import DateTimeGrid from './DateTimeGrid'
import DayPicker from './DayPicker'
import NewStoreDayPicker from './NewStoreDayPicker'
import PopularSkinPicker from './PopularSkinPicker'
import GoldenSignboardLabelPicker from './GoldenSignboardLabelPicker'
import TrafficPackagePicker from './TrafficPackagePicker'
import {
  type InventoryItem,
  type RecommendTypeConfig,
  RECOMMEND_TYPE_CONFIGS,
  generateMockInventory,
} from './types'
import { DELIVERY_CARD_TYPES, GROUP_BUY_CARD_TYPES } from '../_shared/ad-promotion/adPromotionConstants'
import { AdPromotionCardList } from '../_shared/ad-promotion/AdPromotionCardList'
import { AdPromotionPageHeader } from '../_shared/ad-promotion/AdPromotionPageHeader'

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
    // 新店广告、人气商家、金字招牌：进入各自选购界面；投流广告：进入流量包选购界面（均无需库存数据）
    if (config.type === AlgorithmType.NEW_STORE_AD || config.type === AlgorithmType.POPULAR_MERCHANT_KA || config.type === AlgorithmType.GOLDEN_SIGNBOARD || config.type === AlgorithmType.TRAFFIC_AD) {
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

  // URL 构建辅助函数
  const buildOrderUrl = (typeName: string) =>
    `/promotion-order-manage?type=${encodeURIComponent(typeName)}&from=ad-sales`
  const buildCardUrl = (name: string) =>
    `/promotion-order-manage?type=${encodeURIComponent(name)}&from=ad-sales`

  return (
    <div className="content-area">
      {/* 页面标题 */}
      <AdPromotionPageHeader
        currentStep={currentStep}
        selectedAlgorithmType={selectedAlgorithmType}
        onGoBack={handleGoBack}
        onViewOrders={() => {
          const typeName = RECOMMEND_TYPE_CONFIGS.find(c => c.type === selectedAlgorithmType)?.name || ''
          navigate(buildOrderUrl(typeName))
        }}
        t={t}
      />

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
                  <AdPromotionCardList
                    configs={RECOMMEND_TYPE_CONFIGS.filter(config => DELIVERY_CARD_TYPES.includes(config.type))}
                    cardOrder={deliveryCardOrder}
                    selectedAlgorithmType={selectedAlgorithmType}
                    onCardClick={(config) => navigate(buildCardUrl(config.name))}
                    onViewOrders={(config) => navigate(buildCardUrl(config.name))}
                    onBuy={handleGoToPurchase}
                    t={t}
                  />
                ),
              },
              {
                key: 'groupBuy',
                label: t('groupBuyTab'),
                children: (
                  <AdPromotionCardList
                    configs={RECOMMEND_TYPE_CONFIGS.filter(config => GROUP_BUY_CARD_TYPES.includes(config.type))}
                    cardOrder={groupBuyCardOrder}
                    selectedAlgorithmType={selectedAlgorithmType}
                    onCardClick={(config) => navigate(buildCardUrl(config.name))}
                    onViewOrders={(config) => navigate(buildCardUrl(config.name))}
                    onBuy={handleGoToPurchase}
                    t={t}
                  />
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

      {/* Step 2: 流量包選購 - 投流廣告 */}
      {currentStep === 1 && selectedAlgorithmType === AlgorithmType.TRAFFIC_AD && (
        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 24px' }}>
          <TrafficPackagePicker />
        </Card>
      )}

      {/* Step 2: 选择时段并加购 - 無敵星星 */}
      {currentStep === 1 && selectedAlgorithmType !== AlgorithmType.NEW_STORE_AD && selectedAlgorithmType !== AlgorithmType.POPULAR_MERCHANT_KA && selectedAlgorithmType !== AlgorithmType.GOLDEN_SIGNBOARD && selectedAlgorithmType !== AlgorithmType.TRAFFIC_AD && selectedInventory && selectedInventory.algorithmType !== AlgorithmType.HOT_REVIVE_AD && (
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
