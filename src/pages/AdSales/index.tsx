import { useState, useMemo } from 'react'
import { Card, Table, Tag, Button, Space, Empty, Badge, message, Select, Input, DatePicker, Form, Tabs } from 'antd'
import {
  ThunderboltOutlined,
  ArrowLeftOutlined,
  SearchOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { AlgorithmType, Region, RecommendChannel, AppType, APP_OPTIONS, REGION_OPTIONS, RECOMMEND_CHANNEL_OPTIONS } from '../Recommend/constants'
import DateTimeGrid from './DateTimeGrid'
import DayPicker from './DayPicker'
import {
  type InventoryItem,
  type RecommendTypeConfig,
  RECOMMEND_TYPE_CONFIGS,
  CHANNEL_LABEL,
  generateMockInventory,
} from './types'

/** 業務頻道標籤與選項 */
const BIZ_CHANNEL_LABEL: Record<string, string> = {
  food: '美食外賣',
  supermarket: '超市百貨',
  groupBuy: '團購到店',
}
const BIZ_CHANNEL_OPTIONS = [
  { label: '美食外賣', value: 'food' },
  { label: '超市百貨', value: 'supermarket' },
  { label: '團購到店', value: 'groupBuy' },
]

export default function AdSales() {
  const [currentStep, setCurrentStep] = useState(0)
  const [selectedAlgorithmType, setSelectedAlgorithmType] = useState<AlgorithmType | null>(null)
  const [selectedInventory, setSelectedInventory] = useState<InventoryItem | null>(null)
  const [selectedApp, setSelectedApp] = useState<AppType | null | undefined>(null)
  const [selectedSlotPosition, _setSelectedSlotPosition] = useState<number | null | undefined>(null)
  const [selectedTab, setSelectedTab] = useState<'delivery' | 'groupBuy'>('delivery')
  const [searchAdId, setSearchAdId] = useState<string>('')
  const [searchAdName, setSearchAdName] = useState<string>('')
  const [searchChannel, setSearchChannel] = useState<RecommendChannel | null | undefined>(null)
  const [searchBizChannel, setSearchBizChannel] = useState<string | null | undefined>(null)
  const [searchDateRange, setSearchDateRange] = useState<[any, any] | null>(null)
  const [searchInventoryStatus, setSearchInventoryStatus] = useState<'has' | 'none' | null | undefined>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // 根据推荐类型和品牌生成库存数据
  const inventoryData = useMemo<InventoryItem[]>(() => {
    if (!selectedAlgorithmType) return []
    // 生成所有商圈的库存数据
    const allData: InventoryItem[] = []
    Object.values(Region).forEach(region => {
      if (typeof region === 'number') {
        allData.push(...generateMockInventory(region, selectedAlgorithmType, selectedApp || undefined))
      }
    })
    // 如果选择了品牌（非null），过滤数据
    let filtered = allData
    if (selectedApp !== null && selectedApp !== undefined) {
      filtered = allData.filter(item => item.app === selectedApp)
    }
    // 根据Tab过滤展示頁面
    if (selectedTab === 'groupBuy') {
      filtered = filtered.filter(item => item.channel === RecommendChannel.HOME || item.channel === RecommendChannel.GROUP_BUY)
    } else {
      filtered = filtered.filter(item => item.channel === RecommendChannel.HOME || item.channel === RecommendChannel.DELIVERY || item.channel === RecommendChannel.SUPERMARKET)
    }
    return filtered
  }, [selectedAlgorithmType, selectedApp, selectedTab])

  // 展示位选项（已移除展示位置）
  const slotPositionOptions = useMemo(() => {
    return []
  }, [])

  // 根据展示位和其他条件过滤库存数据
  const filteredInventoryData = useMemo(() => {
    let data = inventoryData
    // 展示位筛选（已移除）
    // 广告ID筛选
    if (searchAdId) {
      data = data.filter(item => item.adId.toLowerCase().includes(searchAdId.toLowerCase()))
    }
    // 广告名称筛选
    if (searchAdName) {
      data = data.filter(item => item.promotionName.toLowerCase().includes(searchAdName.toLowerCase()))
    }
    // 业务频道筛选
    if (searchChannel !== null && searchChannel !== undefined) {
      data = data.filter(item => item.channel === searchChannel)
    }
    // 業務頻道篩選
    if (searchBizChannel !== null && searchBizChannel !== undefined) {
      data = data.filter(item => item.bizChannel === searchBizChannel)
    }
    // 可购买日期筛选
    if (searchDateRange && searchDateRange[0] && searchDateRange[1]) {
      const start = searchDateRange[0].format('YYYY-MM-DD')
      const end = searchDateRange[1].format('YYYY-MM-DD')
      data = data.filter(item => item.availableStartDate <= end && item.availableEndDate >= start)
    }
    // 库存状态筛选
    if (searchInventoryStatus === 'has') {
      data = data.filter(item => item.soldSlots < item.totalSlots)
    } else if (searchInventoryStatus === 'none') {
      data = data.filter(item => item.soldSlots >= item.totalSlots)
    }
    return data
  }, [inventoryData, selectedSlotPosition, searchAdId, searchAdName, searchChannel, searchBizChannel, searchDateRange, searchInventoryStatus])

  // 推荐类型选择 - 直接进入库存数据界面
  const handleSelectType = (config: RecommendTypeConfig) => {
    if (!config.enabled) {
      message.info('該類型暫未開放，敬請期待')
      return
    }
    setSelectedAlgorithmType(config.type)
    setCurrentStep(1) // 跳过商圈选择，直接进入库存数据界面
    setCurrentPage(1) // 重置分页
  }

  // 库存选择
  const handleSelectInventory = (record: InventoryItem) => {
    setSelectedInventory(record)
    setCurrentStep(2)
  }

  // 返回上一步
  const handleGoBack = () => {
    if (currentStep === 1) {
      setSelectedAlgorithmType(null)
      setCurrentPage(1) // 重置分页
    } else if (currentStep === 2) {
      setSelectedInventory(null)
    }
    setCurrentStep(prev => Math.max(0, prev - 1))
  }

  // 库存表格列配置
  const inventoryColumns: ColumnsType<InventoryItem> = [
    {
      title: '廣告ID',
      dataIndex: 'adId',
      key: 'adId',
      width: 120,
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '廣告名稱',
      dataIndex: 'promotionName',
      key: 'promotionName',
      width: 200,
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: '所屬品牌',
      dataIndex: 'app',
      key: 'app',
      width: 100,
      render: (v: AppType) => {
        const appConfig: Record<AppType, { color: string; label: string }> = {
          [AppType.SHANFENG]: { color: 'orange', label: '閃峰' },
          [AppType.MFOOD]: { color: 'green', label: 'mFood' },
        }
        const config = appConfig[v]
        return config ? <Tag color={config.color}>{config.label}</Tag> : '-'
      },
    },
    {
      title: '展示頁面',
      dataIndex: 'channel',
      key: 'channel',
      width: 150,
      render: (v: RecommendChannel) => CHANNEL_LABEL[v],
    },
    {
      title: '業務頻道',
      key: 'bizChannel',
      width: 110,
      align: 'center',
      render: (_: unknown, record: InventoryItem) => {
        const biz = record.bizChannel || ''
        return biz ? <Tag color="blue">{BIZ_CHANNEL_LABEL[biz]}</Tag> : '-'
      },
    },
    {
      title: '可購買日期',
      key: 'dateRange',
      width: 220,
      render: (_, record) => (
        <span style={{ color: '#595959' }}>
          {record.availableStartDate} ~ {record.availableEndDate}
        </span>
      ),
    },
    {
      title: '庫存狀態',
      key: 'stock',
      width: 140,
      render: (_, record) => {
        const remaining = record.totalSlots - record.soldSlots
        const percent = Math.round((remaining / record.totalSlots) * 100)
        const color = percent > 50 ? 'green' : percent > 20 ? 'orange' : 'red'
        return (
          <Space direction="vertical" size={0}>
            <Tag color={color}>{remaining} 個時段可選</Tag>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>剩餘 {percent}%</span>
          </Space>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          onClick={() => handleSelectInventory(record)}
        >
          前往購買
        </Button>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 页面标题 */}
      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '5px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>
              <ThunderboltOutlined style={{ marginRight: 8, color: '#faad14' }} />
              广告销售
            </h2>
            <p style={{ margin: '8px 0 0', color: '#8c8c8c', fontSize: 13 }}>
              可根據需求選擇推薦類型，為您的店鋪購買廣告曝光位，獲取流量
            </p>
          </div>
          {currentStep >= 1 && (
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={handleGoBack}
              style={{ backgroundColor: '#fa8c16', borderColor: '#fa8c16' }}
            >
              返回上一步
            </Button>
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
                        onClick={() => handleSelectType(config)}
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
                            <Tag color="green" style={{ marginTop: 12 }}>可購買</Tag>
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
                        onClick={() => handleSelectType(config)}
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
                            <Tag color="green" style={{ marginTop: 12 }}>可購買</Tag>
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

      {/* Step 2: 选择库存数据 */}
      {currentStep === 1 && (
        <>
          {/* 查询区域 */}
          <div className="search-section">
            <Form layout="inline">
              <Form.Item label="所屬品牌">
                <Select
                  placeholder="全部"
                  value={selectedApp}
                  onChange={(value) => {
                    setSelectedApp(value)
                  }}
                  allowClear
                  options={[
                    { label: '全部', value: null },
                    { label: '閃峰', value: AppType.SHANFENG },
                    { label: 'mFood', value: AppType.MFOOD },
                  ]}
                />
              </Form.Item>
              <Form.Item label="廣告ID">
                <Input
                  placeholder="請輸入廣告ID"
                  value={searchAdId}
                  onChange={(e) => setSearchAdId(e.target.value)}
                  allowClear
                />
              </Form.Item>
              <Form.Item label="廣告名稱">
                <Input
                  placeholder="請輸入廣告名稱"
                  value={searchAdName}
                  onChange={(e) => setSearchAdName(e.target.value)}
                  allowClear
                />
              </Form.Item>
              <Form.Item label="展示頁面">
                <Select
                  placeholder="全部"
                  value={searchChannel}
                  onChange={(value) => setSearchChannel(value)}
                  allowClear
                  options={
                    selectedTab === 'groupBuy'
                      ? [
                          { label: '全部', value: null },
                          { label: '大首頁-Feed', value: RecommendChannel.HOME },
                          { label: '團購頻道-Feed', value: RecommendChannel.GROUP_BUY },
                        ]
                      : [
                          { label: '全部', value: null },
                          { label: '大首頁-Feed', value: RecommendChannel.HOME },
                          { label: '外賣頻道-Feed', value: RecommendChannel.DELIVERY },
                          { label: '超市頻道-Feed', value: RecommendChannel.SUPERMARKET },
                        ]
                  }
                />
              </Form.Item>
              <Form.Item label="業務頻道">
                <Select
                  placeholder="全部"
                  value={searchBizChannel}
                  onChange={(value) => setSearchBizChannel(value)}
                  allowClear
                  options={BIZ_CHANNEL_OPTIONS}
                />
              </Form.Item>
              <Form.Item label="可購買日期">
                <DatePicker.RangePicker
                  value={searchDateRange as any}
                  onChange={(dates) => setSearchDateRange(dates as any)}
                />
              </Form.Item>
              <Form.Item label="庫存狀態">
                <Select
                  placeholder="全部"
                  value={searchInventoryStatus}
                  onChange={(value) => setSearchInventoryStatus(value)}
                  allowClear
                  options={[
                    { label: '全部', value: null },
                    { label: '有庫存', value: 'has' },
                    { label: '無庫存', value: 'none' },
                  ]}
                />
              </Form.Item>
              <Form.Item>
                <div className="search-actions">
                  <Button type="primary" icon={<SearchOutlined />}>查詢</Button>
                  <Button icon={<ReloadOutlined />} onClick={() => {
                    setSelectedApp(null)
                    setSearchAdId('')
                    setSearchAdName('')
                    setSearchChannel(null)
                    setSearchBizChannel(null)
                    setSearchDateRange(null)
                    setSearchInventoryStatus(null)
                  }}>重置</Button>
                </div>
              </Form.Item>
            </Form>
          </div>

          {/* 列表区域 */}
          <Table<InventoryItem>
            rowKey="id"
            columns={inventoryColumns}
            dataSource={filteredInventoryData}
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: inventoryData.length,
              showSizeChanger: true,
              showQuickJumper: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (total) => `共 ${total} 條`,
              onChange: (page, size) => {
                setCurrentPage(page)
                setPageSize(size)
              },
            }}
            scroll={{ x: 1030 }}
            locale={{ emptyText: <Empty description="該商圈暫無可購買庫存" /> }}
            rowClassName={(record) => selectedInventory?.id === record.id ? 'ant-table-row-selected' : ''}
          />
        </>
      )}

      {/* Step 3: 选择时段并加购 - 無敵星星 */}
      {currentStep === 2 && selectedInventory && selectedInventory.algorithmType !== AlgorithmType.HOT_REVIVE_AD && (
        <>
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size={24}>
                  <Space size={8}>
                    <span style={{ fontSize: 13, color: '#8c8c8c' }}>當前所選廣告：</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#fa8c16' }}>{selectedInventory.promotionName}</span>
                  </Space>
                  <Space size={8}>
                    <span style={{ fontSize: 13, color: '#8c8c8c' }}>業務頻道：</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#1890ff' }}>{CHANNEL_LABEL[selectedInventory.channel]}</span>
                  </Space>
                </Space>
              </div>
            }
            style={{ marginBottom: 16 }}
            bodyStyle={{ padding: '5px 24px' }}
          >
            <DateTimeGrid
              inventoryItem={selectedInventory}
            />
          </Card>
        </>
      )}

      {/* Step 3: 选择日期并加购 - 盤活復蘇 */}
      {currentStep === 2 && selectedInventory && selectedInventory.algorithmType === AlgorithmType.HOT_REVIVE_AD && (
        <>
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size={24}>
                  <Space size={8}>
                    <span style={{ fontSize: 13, color: '#8c8c8c' }}>當前所選廣告：</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#fa8c16' }}>{selectedInventory.promotionName}</span>
                  </Space>
                  <Space size={8}>
                    <span style={{ fontSize: 13, color: '#8c8c8c' }}>業務頻道：</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#1890ff' }}>{CHANNEL_LABEL[selectedInventory.channel]}</span>
                  </Space>
                  <Tag color="volcano">盤活復蘇</Tag>
                </Space>
              </div>
            }
            style={{ marginBottom: 16 }}
            bodyStyle={{ padding: '16px 24px' }}
          >
            <DayPicker
              inventoryItem={selectedInventory}
            />
          </Card>
        </>
      )}
    </div>
  )
}
