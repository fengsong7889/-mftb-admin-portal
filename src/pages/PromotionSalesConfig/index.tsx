import { useState } from 'react'
import { Card, Tag, Button, Space, message, Tabs } from 'antd'
import {
  ThunderboltOutlined,
  ArrowLeftOutlined,
  ShoppingCartOutlined,
  OrderedListOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlgorithmType, Region, RecommendChannel, AppType, ALGO_CARD_COLOR_MAP } from '../Recommend/constants'
import DateTimeGrid from './DateTimeGrid'
import DayPicker from './DayPicker'
import {
  type InventoryItem,
  type RecommendTypeConfig,
  RECOMMEND_TYPE_CONFIGS,
  generateMockInventory,
} from './types'

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

export default function PromotionSalesConfig() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initial = getInitialState(searchParams)
  const [currentStep, setCurrentStep] = useState(initial.step)
  const [selectedAlgorithmType, setSelectedAlgorithmType] = useState<AlgorithmType | null>(initial.algorithmType)
  const [selectedInventory, setSelectedInventory] = useState<InventoryItem | null>(initial.inventory)
  const [selectedApp, setSelectedApp] = useState<AppType | null | undefined>(null)
  const [selectedTab, setSelectedTab] = useState<'delivery' | 'groupBuy'>('delivery')

  // 購買廣告 - 直接进入日期时段选择界面
  const handleGoToPurchase = (config: RecommendTypeConfig) => {
    if (!config.enabled) {
      message.info('該類型暫未開放，敬請期待')
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
      message.info('暫無可購買的廣告庫存')
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
                  }}>返回</Button>
                <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
              </>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {currentStep >= 1 && selectedAlgorithmType ? '購買廣告' : '店鋪推廣'}
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
                navigate(`/promotion-order-manage?type=${encodeURIComponent(typeName)}`)
              }}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 18px',
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              }}>查看訂單</Button>
          )}
        </div>
      </div>

      {/* Step 1: 选择推荐类型 */}
      {currentStep === 0 && (
        <Card title="選擇推薦類型" style={{ marginBottom: 16 }} bodyStyle={{ padding: '5px 24px' }}>
          <Tabs
            defaultActiveKey="delivery"
            onChange={(key) => setSelectedTab(key as 'delivery' | 'groupBuy')}
            items={[
              {
                key: 'delivery',
                label: '外賣到家',
                children: (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 16,
                  }}>
                    {RECOMMEND_TYPE_CONFIGS.filter(config => 
                      config.type === AlgorithmType.INVINCIBLE_STAR || 
                      config.type === AlgorithmType.HOT_REVIVE_AD || 
                      config.type === AlgorithmType.NEW_STORE_AD || 
                      config.type === AlgorithmType.TRAFFIC_AD || 
                      config.type === AlgorithmType.ORGANIC_TRAFFIC ||
                      config.type === AlgorithmType.POPULAR_MERCHANT_KA
                    ).map(config => (
                      <div
                        key={config.type}
                        className={`algo-card-wrapper algo-card-wrapper--${ALGO_CARD_COLOR_MAP[config.type]}${!config.enabled ? ' disabled' : ''}`}
                        onClick={() => navigate(`/promotion-order-manage?type=${encodeURIComponent(config.name)}`)}
                        style={selectedAlgorithmType === config.type ? { outline: '2px solid #1890ff', outlineOffset: -2 } : undefined}
                      >
                        <div className="algo-card-inner">
                          <div className="algo-card-icon">{config.icon}</div>
                          <h3 className="algo-card-title">{config.name}</h3>
                          <p className="algo-card-desc">{config.description}</p>
                          <div className="algo-card-tag">
                            {!config.enabled && (
                              <Tag color="default">即將開放</Tag>
                            )}
                            {config.enabled && (
                              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                                <Button
                                  size="small"
                                  icon={<OrderedListOutlined />}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    navigate(`/promotion-order-manage?type=${encodeURIComponent(config.name)}`)
                                  }}
                                >
                                  查看訂單
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
                                  購買廣告
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
                label: '團購到店',
                children: (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 16,
                  }}>
                    {RECOMMEND_TYPE_CONFIGS.filter(config => 
                      config.type === AlgorithmType.INVINCIBLE_STAR || 
                      config.type === AlgorithmType.HOT_REVIVE_AD
                    ).map(config => (
                      <div
                        key={config.type}
                        className={`algo-card-wrapper algo-card-wrapper--${ALGO_CARD_COLOR_MAP[config.type]}${!config.enabled ? ' disabled' : ''}`}
                        onClick={() => navigate(`/promotion-order-manage?type=${encodeURIComponent(config.name)}`)}
                        style={selectedAlgorithmType === config.type ? { outline: '2px solid #1890ff', outlineOffset: -2 } : undefined}
                      >
                        <div className="algo-card-inner">
                          <div className="algo-card-icon">{config.icon}</div>
                          <h3 className="algo-card-title">{config.name}</h3>
                          <p className="algo-card-desc">{config.description}</p>
                          <div className="algo-card-tag">
                            {!config.enabled && (
                              <Tag color="default">即將開放</Tag>
                            )}
                            {config.enabled && (
                              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                                <Button
                                  size="small"
                                  icon={<OrderedListOutlined />}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    navigate(`/promotion-order-manage?type=${encodeURIComponent(config.name)}`)
                                  }}
                                >
                                  查看訂單
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
                                  購買廣告
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

      {/* Step 2: 选择时段并加购 - 無敵星星 */}
      {currentStep === 1 && selectedInventory && selectedInventory.algorithmType !== AlgorithmType.HOT_REVIVE_AD && (
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
