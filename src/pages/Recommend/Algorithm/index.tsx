import { useState, useMemo } from 'react'
import { Button, Space, Table, Tag, Badge, Input, Select, Form, Card, Tabs } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined, ArrowLeftOutlined, AppstoreOutlined, ApartmentOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlgorithmType, RecommendChannel, PlacementInterface, ServiceStatus, SERVICE_STATUS_OPTIONS, AppType, APP_OPTIONS, ALGORITHM_TYPE_OPTIONS } from '../constants'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

const { Search } = Input

/** 各业务类型对应的算法类型列表 */
const TAB_ALGORITHM_MAP: Record<string, AlgorithmType[]> = {
  delivery: [
    AlgorithmType.INVINCIBLE_STAR,
    AlgorithmType.HOT_REVIVE_AD,
    AlgorithmType.NEW_STORE_AD,
    AlgorithmType.EXCLUSIVE_MERCHANT,
    AlgorithmType.TRAFFIC_AD,
    AlgorithmType.GUESS_YOU_LIKE,
    AlgorithmType.ORGANIC_TRAFFIC,
    AlgorithmType.SEARCH_ALGORITHM,
  ],
  groupBuy: [
    AlgorithmType.INVINCIBLE_STAR,
    AlgorithmType.HOT_REVIVE_AD,
  ],
}

/** 广告类型卡片配置 */
const ALGORITHM_TYPE_CARDS: { type: AlgorithmType; icon: string; description: string }[] = [
  { type: AlgorithmType.INVINCIBLE_STAR, icon: '⭐', description: '超級曝光位，首頁頂部黃金坑位，強勢引流' },
  { type: AlgorithmType.HOT_REVIVE_AD, icon: '🔥', description: '盤活熱門商家流量，提升店鋪曝光' },
  { type: AlgorithmType.NEW_STORE_AD, icon: '🏪', description: '新店專屬推廣位，快速獲取首批顧客' },
  { type: AlgorithmType.EXCLUSIVE_MERCHANT, icon: '👑', description: '獨家商家專屬展示位，彰顯品牌實力' },
  { type: AlgorithmType.TRAFFIC_AD, icon: '📊', description: '精準流量投放，覆蓋目標用戶群體' },
  { type: AlgorithmType.GUESS_YOU_LIKE, icon: '💡', description: '智能推薦，個性化匹配用戶偏好' },
  { type: AlgorithmType.ORGANIC_TRAFFIC, icon: '🌿', description: '自然流量曝光，提升店鋪基礎流量' },
  { type: AlgorithmType.SEARCH_ALGORITHM, icon: '🔍', description: '搜索算法優化，提升搜索轉化率' },
]

interface AlgorithmRecord {
  id: number
  name: string
  code: string
  type: AlgorithmType
  channel: RecommendChannel
  placementInterface?: PlacementInterface  // 投放界面
  brand?: AppType  // 所属品牌
  status: ServiceStatus
  slotCount: number
}

const TYPE_LABEL: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: '無敵星星',
  [AlgorithmType.NEW_STORE_AD]: '新店廣告',
  [AlgorithmType.HOT_REVIVE_AD]: '盤活復蘇',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: '獨家商家',
  [AlgorithmType.TRAFFIC_AD]: '流量廣告',
  [AlgorithmType.GUESS_YOU_LIKE]: '猜你喜歡',
  [AlgorithmType.ORGANIC_TRAFFIC]: '自然流量',
  [AlgorithmType.SEARCH_ALGORITHM]: '搜索算法',
} as Record<AlgorithmType, string>

const TYPE_COLOR: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: 'gold',
  [AlgorithmType.NEW_STORE_AD]: 'green',
  [AlgorithmType.HOT_REVIVE_AD]: 'volcano',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: 'purple',
  [AlgorithmType.TRAFFIC_AD]: 'cyan',
  [AlgorithmType.GUESS_YOU_LIKE]: 'blue',
  [AlgorithmType.ORGANIC_TRAFFIC]: 'lime',
  [AlgorithmType.SEARCH_ALGORITHM]: 'magenta',
} as Record<AlgorithmType, string>

const CHANNEL_LABEL: Record<RecommendChannel, string> = {
  [RecommendChannel.HOME]: '美食外賣',
  [RecommendChannel.DELIVERY]: '美食外賣',
  [RecommendChannel.SUPERMARKET]: '超市百貨',
  [RecommendChannel.GROUP_BUY]: '團購到店',
}

const PLACEMENT_LABEL: Record<PlacementInterface, string> = {
  [PlacementInterface.HOME]: '大首頁-Feed',
  [PlacementInterface.DELIVERY]: '外賣頻道-Feed',
  [PlacementInterface.SUPERMARKET]: '超市頻道-Feed',
  [PlacementInterface.GROUP_BUY]: '團購頻道-Feed',
}

const TIME_SLOT_LABEL: Record<string, string> = {
  allDay: '全天',
  breakfast: '早餐(06:00-09:00)',
  lunch: '午餐(11:00-14:00)',
  afternoon: '下午茶(14:00-17:00)',
  dinner: '晚餐(17:00-20:00)',
  nightSnack: '夜宵(20:00-02:00)',
}

const BRAND_LABEL: Record<AppType, string> = {
  [AppType.SHANFENG]: '閃峰',
  [AppType.MFOOD]: 'mFood',
}

const BRAND_COLOR: Record<AppType, string> = {
  [AppType.SHANFENG]: 'blue',
  [AppType.MFOOD]: 'green',
}

export const mockAlgorithmData: AlgorithmRecord[] = [
  // 無敵星星 - 8条
  { id: 1, name: '無敵星星-美食外賣閃峰版', code: 'ALG_STAR_001', type: AlgorithmType.INVINCIBLE_STAR, channel: RecommendChannel.HOME, placementInterface: PlacementInterface.HOME, brand: AppType.SHANFENG, status: ServiceStatus.ENABLED, slotCount: 3 },
  { id: 2, name: '無敵星星-美食外賣閃峰版B', code: 'ALG_STAR_002', type: AlgorithmType.INVINCIBLE_STAR, channel: RecommendChannel.DELIVERY, placementInterface: PlacementInterface.DELIVERY, brand: AppType.SHANFENG, status: ServiceStatus.ENABLED, slotCount: 2 },
  { id: 3, name: '無敵星星-超市百貨閃峰版', code: 'ALG_STAR_003', type: AlgorithmType.INVINCIBLE_STAR, channel: RecommendChannel.SUPERMARKET, placementInterface: PlacementInterface.SUPERMARKET, brand: AppType.SHANFENG, status: ServiceStatus.ENABLED, slotCount: 2 },
  { id: 4, name: '無敵星星-團購到店閃峰版', code: 'ALG_STAR_004', type: AlgorithmType.INVINCIBLE_STAR, channel: RecommendChannel.GROUP_BUY, placementInterface: PlacementInterface.GROUP_BUY, brand: AppType.SHANFENG, status: ServiceStatus.DISABLED, slotCount: 1 },
  { id: 5, name: '無敵星星-美食外賣mFood版', code: 'ALG_STAR_005', type: AlgorithmType.INVINCIBLE_STAR, channel: RecommendChannel.HOME, placementInterface: PlacementInterface.HOME, brand: AppType.MFOOD, status: ServiceStatus.ENABLED, slotCount: 3 },
  { id: 6, name: '無敵星星-美食外賣mFood版B', code: 'ALG_STAR_006', type: AlgorithmType.INVINCIBLE_STAR, channel: RecommendChannel.DELIVERY, placementInterface: PlacementInterface.DELIVERY, brand: AppType.MFOOD, status: ServiceStatus.ENABLED, slotCount: 2 },
  { id: 7, name: '無敵星星-超市百貨mFood版', code: 'ALG_STAR_007', type: AlgorithmType.INVINCIBLE_STAR, channel: RecommendChannel.SUPERMARKET, placementInterface: PlacementInterface.SUPERMARKET, brand: AppType.MFOOD, status: ServiceStatus.DISABLED, slotCount: 1 },
  { id: 8, name: '無敵星星-團購到店mFood版', code: 'ALG_STAR_008', type: AlgorithmType.INVINCIBLE_STAR, channel: RecommendChannel.GROUP_BUY, placementInterface: PlacementInterface.GROUP_BUY, brand: AppType.MFOOD, status: ServiceStatus.ENABLED, slotCount: 2 },
  // 盤活復蘇 - 7条
  { id: 9, name: '盤活復蘇-美食外賣閃峰版', code: 'ALG_REV_001', type: AlgorithmType.HOT_REVIVE_AD, channel: RecommendChannel.HOME, placementInterface: PlacementInterface.HOME, brand: AppType.SHANFENG, status: ServiceStatus.ENABLED, slotCount: 3 },
  { id: 10, name: '盤活復蘇-美食外賣閃峰版B', code: 'ALG_REV_002', type: AlgorithmType.HOT_REVIVE_AD, channel: RecommendChannel.DELIVERY, placementInterface: PlacementInterface.DELIVERY, brand: AppType.SHANFENG, status: ServiceStatus.ENABLED, slotCount: 2 },
  { id: 11, name: '盤活復蘇-超市百貨閃峰版', code: 'ALG_REV_003', type: AlgorithmType.HOT_REVIVE_AD, channel: RecommendChannel.SUPERMARKET, placementInterface: PlacementInterface.SUPERMARKET, brand: AppType.SHANFENG, status: ServiceStatus.DISABLED, slotCount: 1 },
  { id: 12, name: '盤活復蘇-團購到店閃峰版', code: 'ALG_REV_004', type: AlgorithmType.HOT_REVIVE_AD, channel: RecommendChannel.GROUP_BUY, placementInterface: PlacementInterface.GROUP_BUY, brand: AppType.SHANFENG, status: ServiceStatus.ENABLED, slotCount: 2 },
  { id: 13, name: '盤活復蘇-美食外賣mFood版', code: 'ALG_REV_005', type: AlgorithmType.HOT_REVIVE_AD, channel: RecommendChannel.HOME, placementInterface: PlacementInterface.HOME, brand: AppType.MFOOD, status: ServiceStatus.ENABLED, slotCount: 3 },
  { id: 14, name: '盤活復蘇-美食外賣mFood版B', code: 'ALG_REV_006', type: AlgorithmType.HOT_REVIVE_AD, channel: RecommendChannel.DELIVERY, placementInterface: PlacementInterface.DELIVERY, brand: AppType.MFOOD, status: ServiceStatus.ENABLED, slotCount: 2 },
  { id: 15, name: '盤活復蘇-超市百貨mFood版', code: 'ALG_REV_007', type: AlgorithmType.HOT_REVIVE_AD, channel: RecommendChannel.SUPERMARKET, placementInterface: PlacementInterface.SUPERMARKET, brand: AppType.MFOOD, status: ServiceStatus.DISABLED, slotCount: 1 },
  // 團購到店 - 無敵星星
  { id: 16, name: '無敵星星-團購到店閃峰版', code: 'ALG_STAR_009', type: AlgorithmType.INVINCIBLE_STAR, channel: RecommendChannel.GROUP_BUY, placementInterface: PlacementInterface.GROUP_BUY, brand: AppType.SHANFENG, status: ServiceStatus.ENABLED, slotCount: 2 },
  { id: 17, name: '無敵星星-團購到店mFood版', code: 'ALG_STAR_010', type: AlgorithmType.INVINCIBLE_STAR, channel: RecommendChannel.GROUP_BUY, placementInterface: PlacementInterface.GROUP_BUY, brand: AppType.MFOOD, status: ServiceStatus.ENABLED, slotCount: 1 },
  // 團購到店 - 盤活復蘇
  { id: 18, name: '盤活復蘇-團購到店閃峰版', code: 'ALG_REV_008', type: AlgorithmType.HOT_REVIVE_AD, channel: RecommendChannel.GROUP_BUY, placementInterface: PlacementInterface.GROUP_BUY, brand: AppType.SHANFENG, status: ServiceStatus.ENABLED, slotCount: 2 },
  { id: 19, name: '盤活復蘇-團購到店mFood版', code: 'ALG_REV_009', type: AlgorithmType.HOT_REVIVE_AD, channel: RecommendChannel.GROUP_BUY, placementInterface: PlacementInterface.GROUP_BUY, brand: AppType.MFOOD, status: ServiceStatus.DISABLED, slotCount: 1 },
]

export default function Algorithm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [searchForm] = Form.useForm()

  // 从 URL 参数恢复列表状态（从新增页返回时）
  const typeParam = searchParams.get('type')
  const tabParam = searchParams.get('tab') as 'delivery' | 'groupBuy' | null
  const initialType = typeParam ? Number(typeParam) as AlgorithmType : null
  const [selectedType, setSelectedType] = useState<AlgorithmType | null>(initialType)
  const [businessType, setBusinessType] = useState<'delivery' | 'groupBuy'>(tabParam || 'delivery')

  /** 根据业务类型过滤数据 */
  const filterByBusinessType = (data: AlgorithmRecord[]) => {
    if (businessType === 'groupBuy') {
      return data.filter(item => item.channel === RecommendChannel.GROUP_BUY)
    }
    return data.filter(item => item.channel !== RecommendChannel.GROUP_BUY)
  }

  const [filteredData, setFilteredData] = useState<AlgorithmRecord[]>(
    initialType ? filterByBusinessType(mockAlgorithmData.filter(item => item.type === initialType)) : mockAlgorithmData
  )

  // 统计每种广告类型的算法数量
  const typeCountMap = useMemo(() => {
    const map: Record<number, number> = {}
    mockAlgorithmData.forEach(item => {
      map[item.type] = (map[item.type] || 0) + 1
    })
    return map
  }, [])

  // 点击卡片 → 进入列表
  const handleSelectType = (type: AlgorithmType, tab: 'delivery' | 'groupBuy') => {
    setSelectedType(type)
    setBusinessType(tab)
    const data = filterByBusinessType(mockAlgorithmData.filter(item => item.type === type))
    setFilteredData(data)
    searchForm.resetFields()
  }

  // 返回卡片选择页
  const handleBackToCards = () => {
    setSelectedType(null)
    setFilteredData(mockAlgorithmData)
    setBusinessType('delivery')
    searchForm.resetFields()
  }

  // 搜索处理
  const handleSearch = (values: any) => {
    let result = filterByBusinessType(mockAlgorithmData.filter(item => item.type === selectedType))
    
    if (values.name) {
      result = result.filter(item => item.name.includes(values.name))
    }
    if (values.code) {
      result = result.filter(item => item.code.includes(values.code))
    }
    if (values.brand !== undefined && values.brand !== null) {
      result = result.filter(item => item.brand === values.brand)
    }
    if (values.status !== undefined && values.status !== null) {
      result = result.filter(item => item.status === values.status)
    }
    
    setFilteredData(result)
  }

  // 重置搜索
  const handleReset = () => {
    searchForm.resetFields()
    setFilteredData(filterByBusinessType(mockAlgorithmData.filter(item => item.type === selectedType)))
  }

  // 跳转到新增页面（携带当前算法类型和业务类型）
  const handleGoToAdd = () => {
    navigate(`/promotion-algorithm-add?type=${selectedType}&tab=${businessType}`)
  }

  // 当前选中的类型信息
  const selectedTypeCard = ALGORITHM_TYPE_CARDS.find(c => c.type === selectedType)

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'code', title: '算法ID' },
    { key: 'name', title: '算法名稱' },
    { key: 'brand', title: '所屬品牌' },
    { key: 'status', title: '狀態' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('algorithm', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: ColumnsType<AlgorithmRecord> = [
    { title: '算法ID', dataIndex: 'code', key: 'code', width: 120, render: (v) => <Tag color="blue">{v}</Tag> },
    { title: '算法名稱', dataIndex: 'name', key: 'name', width: 200 },
    {
      title: '所屬品牌', dataIndex: 'brand', key: 'brand', width: 100,
      render: (v: AppType) => v ? <Tag color={BRAND_COLOR[v]}>{BRAND_LABEL[v]}</Tag> : '-',
    },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 100,
      render: (v: ServiceStatus) => (
        <Badge
          status={v === ServiceStatus.ENABLED ? 'success' : 'default'}
          text={v === ServiceStatus.ENABLED ? '啟用' : '停用'}
        />
      ),
    },
    {
      title: '操作', key: 'action', width: 180,
      render: (_, record) => (
        <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/promotion-algorithm-add?type=${record.type}&id=${record.id}&tab=${businessType}`)}>編輯</Button>
          <Button type="link" size="small" danger={record.status === ServiceStatus.ENABLED}>
            {record.status === ServiceStatus.ENABLED ? '停用' : '啟用'}
          </Button>
        </Space>
      ),
    },
  ]

  // ===== Step 1: 卡片选择页 =====
  if (selectedType === null) {
    return (
      <div className="content-area">
        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '5px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20 }}>
                <AppstoreOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                算法庫
              </h2>
              <p style={{ margin: '8px 0 0', color: '#8c8c8c', fontSize: 13 }}>
                管理各廣告類型的算法策略配置，選擇類型查看詳情
              </p>
            </div>
            <Button
              icon={<ApartmentOutlined />}
              onClick={() => navigate('/promotion-algorithm-flow')}
              style={{ fontSize: 14 }}
            >
              業務流程
            </Button>
          </div>
        </Card>

        <Card title="請選擇算法類型" style={{ marginBottom: 16 }} bodyStyle={{ padding: '5px 24px' }}>
          <Tabs
            defaultActiveKey="delivery"
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
                    {ALGORITHM_TYPE_CARDS
                      .filter(card => TAB_ALGORITHM_MAP.delivery.includes(card.type))
                      .map(card => {
                        const enabled = card.type === AlgorithmType.INVINCIBLE_STAR || card.type === AlgorithmType.HOT_REVIVE_AD
                        return (
                          <Card
                            key={card.type}
                            hoverable={enabled}
                            onClick={() => enabled && handleSelectType(card.type, 'delivery')}
                            style={{
                              cursor: enabled ? 'pointer' : 'not-allowed',
                              opacity: enabled ? 1 : 0.5,
                            }}
                            bodyStyle={{ padding: 20 }}
                          >
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 48, marginBottom: 12 }}>{card.icon}</div>
                              <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>{TYPE_LABEL[card.type]}</h3>
                              <p style={{ margin: 0, color: '#8c8c8c', fontSize: 13, lineHeight: 1.6 }}>
                                {card.description}
                              </p>
                              {enabled ? (
                                <Tag color="blue" style={{ marginTop: 12 }}>{typeCountMap[card.type] || 0} 個算法</Tag>
                              ) : (
                                <Tag color="default" style={{ marginTop: 12 }}>敬請期待</Tag>
                              )}
                            </div>
                          </Card>
                        )
                      })}
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
                    {ALGORITHM_TYPE_CARDS
                      .filter(card => TAB_ALGORITHM_MAP.groupBuy.includes(card.type))
                      .map(card => {
                        const enabled = true
                        return (
                          <Card
                            key={card.type}
                            hoverable={enabled}
                            onClick={() => enabled && handleSelectType(card.type, 'groupBuy')}
                            style={{
                              cursor: enabled ? 'pointer' : 'not-allowed',
                              opacity: enabled ? 1 : 0.5,
                            }}
                            bodyStyle={{ padding: 20 }}
                          >
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 48, marginBottom: 12 }}>{card.icon}</div>
                              <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>{TYPE_LABEL[card.type]}</h3>
                              <p style={{ margin: 0, color: '#8c8c8c', fontSize: 13, lineHeight: 1.6 }}>
                                {card.description}
                              </p>
                              <Tag color="blue" style={{ marginTop: 12 }}>{typeCountMap[card.type] || 0} 個算法</Tag>
                            </div>
                          </Card>
                        )
                      })}
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </div>
    )
  }

  // ===== Step 2: 列表页 =====
  return (
    <div className="content-area">
      {/* 页面头部 */}
      <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '5px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space size={16}>
            <h2 style={{ margin: 0, fontSize: 20 }}>
              <span style={{ marginRight: 8 }}>{selectedTypeCard?.icon}</span>
              {TYPE_LABEL[selectedType]} - 算法列表
            </h2>
            <Tag color="blue">{filteredData.length} 個算法</Tag>
          </Space>
          <Space>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={handleBackToCards}
              style={{ fontSize: 14 }}
            >
              返回
            </Button>
          </Space>
        </div>
      </Card>

      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline" form={searchForm} onFinish={handleSearch}>
          <Form.Item label="算法ID" name="code">
            <Input placeholder="請輸入算法ID" allowClear />
          </Form.Item>
          <Form.Item label="算法名稱" name="name">
            <Input placeholder="請輸入算法名稱" allowClear />
          </Form.Item>
          <Form.Item label="所屬品牌" name="brand">
            <Select placeholder="全部" options={APP_OPTIONS} allowClear />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select placeholder="全部" options={SERVICE_STATUS_OPTIONS} allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查詢</Button>
              <Button onClick={handleReset} icon={<ReloadOutlined />}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleGoToAdd}>新增算法</Button>
        </Space>
        {configComponent}
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<AlgorithmRecord>
          rowKey="id"
          columns={applyConfig(columns)}
          dataSource={filteredData}
          pagination={{
            pageSize: 10,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showQuickJumper: true,
          }}
        />
      </div>
    </div>
  )
}
