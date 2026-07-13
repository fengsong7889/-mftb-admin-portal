import { useState } from 'react'
import { Card, Tag, Button, Space, message, Tabs } from 'antd'
import {
  ThunderboltOutlined,
  ArrowLeftOutlined,
  ShoppingCartOutlined,
  OrderedListOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlgorithmType, Region, RecommendChannel, AppType } from '../Recommend/constants'
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

export default function AdSales() {
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
      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '5px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>
              <ThunderboltOutlined style={{ marginRight: 8, color: '#faad14' }} />
              {currentStep >= 1 && selectedAlgorithmType
                ? `購買${RECOMMEND_TYPE_CONFIGS.find(c => c.type === selectedAlgorithmType)?.name || ''}`
                : '銷售訂單'}
            </h2>
            <p style={{ margin: '8px 0 0', color: '#8c8c8c', fontSize: 13 }}>
              {currentStep >= 1 && selectedAlgorithmType
                ? `為您的店鋪購買${RECOMMEND_TYPE_CONFIGS.find(c => c.type === selectedAlgorithmType)?.name || ''}廣告曝光位`
                : '可根據需求選擇推薦類型，為您的店鋪購買廣告曝光位，獲取流量'}
            </p>
          </div>
          {currentStep >= 1 && (
            <Space size={12}>
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={handleGoBack}
              >
                返回
              </Button>
              <Button
                type="primary"
                icon={<OrderedListOutlined />}
                onClick={() => {
                  const typeName = RECOMMEND_TYPE_CONFIGS.find(c => c.type === selectedAlgorithmType)?.name || ''
                  navigate(`/promotion-order-manage?type=${encodeURIComponent(typeName)}&from=ad-sales`)
                }}
                style={{ backgroundColor: '#fa8c16', borderColor: '#fa8c16' }}
              >
                查看訂單
              </Button>
            </Space>
          )}
        </div>
      </Card>

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
                      config.type === AlgorithmType.ORGANIC_TRAFFIC
                    ).map(config => (
                      <Card
                        key={config.type}
                        hoverable={config.enabled}
                        onClick={() => navigate(`/promotion-order-manage?type=${encodeURIComponent(config.name)}&from=ad-sales`)}
                        style={{
                          cursor: config.enabled ? 'pointer' : 'not-allowed',
                          opacity: config.enabled ? 1 : 0.5,
                          border: selectedAlgorithmType === config.type ? '2px solid #1890ff' : undefined,
                        }}
                        bodyStyle={{ padding: 20 }}
                      >
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 48, marginBottom: 12 }}>{config.icon}</div>
                          <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>{config.name}</h3>
                          <p style={{ margin: 0, color: '#8c8c8c', fontSize: 13, lineHeight: 1.6 }}>
                            {config.description}
                          </p>
                          {!config.enabled && (
                            <Tag color="default" style={{ marginTop: 12 }}>即將開放</Tag>
                          )}
                          {config.enabled && (
                            <div style={{ display: 'flex', gap: 24, marginTop: 16, justifyContent: 'center' }}>
                              <Button
                                size="small"
                                icon={<OrderedListOutlined />}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate(`/promotion-order-manage?type=${encodeURIComponent(config.name)}&from=ad-sales`)
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
                      </Card>
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
                      <Card
                        key={config.type}
                        hoverable={config.enabled}
                        onClick={() => navigate(`/promotion-order-manage?type=${encodeURIComponent(config.name)}&from=ad-sales`)}
                        style={{
                          cursor: config.enabled ? 'pointer' : 'not-allowed',
                          opacity: config.enabled ? 1 : 0.5,
                          border: selectedAlgorithmType === config.type ? '2px solid #1890ff' : undefined,
                        }}
                        bodyStyle={{ padding: 20 }}
                      >
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 48, marginBottom: 12 }}>{config.icon}</div>
                          <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>{config.name}</h3>
                          <p style={{ margin: 0, color: '#8c8c8c', fontSize: 13, lineHeight: 1.6 }}>
                            {config.description}
                          </p>
                          {!config.enabled && (
                            <Tag color="default" style={{ marginTop: 12 }}>即將開放</Tag>
                          )}
                          {config.enabled && (
                            <div style={{ display: 'flex', gap: 24, marginTop: 16, justifyContent: 'center' }}>
                              <Button
                                size="small"
                                icon={<OrderedListOutlined />}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate(`/promotion-order-manage?type=${encodeURIComponent(config.name)}&from=ad-sales`)
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
                      </Card>
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
