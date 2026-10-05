import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, message, Tabs } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlgorithmType, AppType } from '../Recommend/constants'
import { useCardOrder } from '../../hooks/useCardOrder'
import DateTimeGrid from '../AdSales/DateTimeGrid'
import DayPicker from '../AdSales/DayPicker'
import NewStoreDayPicker from '../AdSales/NewStoreDayPicker'
import PopularSkinPicker from '../AdSales/PopularSkinPicker'
import TrafficPackagePicker from '../AdSales/TrafficPackagePicker'
import GoldenSignboardLabelPicker from '../AdSales/GoldenSignboardLabelPicker'
import {
  type InventoryItem,
  type RecommendTypeConfig,
  RECOMMEND_TYPE_CONFIGS,
} from './types'
import { DELIVERY_CARD_TYPES, GROUP_BUY_CARD_TYPES } from '../_shared/ad-promotion/adPromotionConstants'
import { AdPromotionCardList } from '../_shared/ad-promotion/AdPromotionCardList'
import { AdPromotionPageHeader } from '../_shared/ad-promotion/AdPromotionPageHeader'

// 根据URL参数计算初始状态
const getInitialState = (_searchParams: URLSearchParams) => {
  // TODO: 对接库存 API，当前无库存数据
  return { step: 0, algorithmType: null, inventory: null }
}

export default function PromotionSalesConfig() {
  const { t } = useTranslation('adSales')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initial = getInitialState(searchParams)
  const [currentStep, setCurrentStep] = useState(initial.step)
  const [selectedAlgorithmType, setSelectedAlgorithmType] = useState<AlgorithmType | null>(initial.algorithmType)
  const [selectedInventory, setSelectedInventory] = useState<InventoryItem | null>(initial.inventory)
  const [selectedApp, _setSelectedApp] = useState<AppType | null | undefined>(null)
  const [selectedTab, setSelectedTab] = useState<'delivery' | 'groupBuy'>('delivery')

  // 卡片拖拽排序（順序持久化到 localStorage，每個 Tab 獨立保存）
  const deliveryCardOrder = useCardOrder('promotion-sales-card-order-delivery', DELIVERY_CARD_TYPES)
  const groupBuyCardOrder = useCardOrder('promotion-sales-card-order-groupBuy', GROUP_BUY_CARD_TYPES)

  // 購買廣告 - 直接进入日期时段选择界面
  const handleGoToPurchase = (config: RecommendTypeConfig) => {
    if (!config.enabled) {
      message.info(t('notAvailable'))
      return
    }
    // 新店广告：进入赠送天数选购界面；人气商家：进入皮肤套件选购界面；投流广告：进入流量包定价配置界面（均无需库存数据）
    if (config.type === AlgorithmType.NEW_STORE_AD || config.type === AlgorithmType.POPULAR_MERCHANT_KA || config.type === AlgorithmType.GOLDEN_SIGNBOARD || config.type === AlgorithmType.TRAFFIC_AD) {
      setSelectedAlgorithmType(config.type)
      setSelectedInventory(null)
      setCurrentStep(1)
      return
    }
    setSelectedAlgorithmType(config.type)
    // TODO: 对接库存 API，当前无库存数据
    message.info(t('noInventory'))
  }

  // 返回卡片页
  const handleGoBack = () => {
    setSelectedAlgorithmType(null)
    setSelectedInventory(null)
    setCurrentStep(0)
  }

  // URL 构建辅助函数
  const buildOrderUrl = (typeName: string) =>
    `/promotion-order-manage?type=${encodeURIComponent(typeName)}`
  const buildCardUrl = (name: string) =>
    `/promotion-order-manage?type=${encodeURIComponent(name)}`

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

      {/* Step 1: 选择推荐类型 */}
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
                    gap={12}
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
          <NewStoreDayPicker storeMode />
        </Card>
      )}

      {/* Step 2: 选择皮肤套件并购买 - 人氣商家 */}
      {currentStep === 1 && selectedAlgorithmType === AlgorithmType.POPULAR_MERCHANT_KA && (
        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 24px' }}>
          <PopularSkinPicker storeMode />
        </Card>
      )}

      {/* Step 2: 流量包選購 - 投流廣告 */}
      {currentStep === 1 && selectedAlgorithmType === AlgorithmType.TRAFFIC_AD && (
        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 24px' }}>
          <TrafficPackagePicker storeMode />
        </Card>
      )}

      {/* Step 2: 選擇招牌標籤並購買 - 金字招牌 */}
      {currentStep === 1 && selectedAlgorithmType === AlgorithmType.GOLDEN_SIGNBOARD && (
        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 24px' }}>
          <GoldenSignboardLabelPicker storeMode />
        </Card>
      )}

      {/* Step 2: 选择时段并加购 - 無敵星星 */}
      {currentStep === 1 && selectedAlgorithmType !== AlgorithmType.NEW_STORE_AD && selectedAlgorithmType !== AlgorithmType.POPULAR_MERCHANT_KA && selectedAlgorithmType !== AlgorithmType.TRAFFIC_AD && selectedAlgorithmType !== AlgorithmType.GOLDEN_SIGNBOARD && selectedInventory && selectedInventory.algorithmType !== AlgorithmType.HOT_REVIVE_AD && (
        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 24px' }}>
          <DateTimeGrid
            inventoryItem={selectedInventory}
            storeMode
          />
        </Card>
      )}

      {/* Step 2: 选择日期并加购 - 盤活復蘇 */}
      {currentStep === 1 && selectedInventory && selectedInventory.algorithmType === AlgorithmType.HOT_REVIVE_AD && (
        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '16px 24px' }}>
          <DayPicker
            inventoryItem={selectedInventory}
            storeMode
          />
        </Card>
      )}
    </div>
  )
}
