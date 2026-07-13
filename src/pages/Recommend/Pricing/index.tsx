import { useState } from 'react'
import { Button, Space, Table, Tag, Input, Select, Form } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import {
  AppType, AlgorithmType, RecommendChannel, ServiceStatus,
  APP_OPTIONS, SERVICE_STATUS_OPTIONS,
} from '../constants'

const { Search } = Input

interface PricingRecord {
  id: number
  app: AppType
  channel: RecommendChannel
  slotIndex: number
  algorithmType: AlgorithmType
  region: string
  dailyPrice: number
  minDays: number
  discountTiers: string
  status: ServiceStatus
}

const CHANNEL_LABEL: Record<RecommendChannel, string> = {
  [RecommendChannel.HOME]: '大首頁瀑布流',
  [RecommendChannel.DELIVERY]: '外賣頻道瀑布流',
  [RecommendChannel.GROUP_BUY]: '團購頻道瀑布流',
  [RecommendChannel.SUPERMARKET]: '超市頻道瀑布流',
}

const ALG_LABEL: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: '無敵星星',
  [AlgorithmType.NEW_STORE_AD]: '新店廣告',
  [AlgorithmType.HOT_REVIVE_AD]: '盤活復蘇',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: '獨家商家',
  [AlgorithmType.TRAFFIC_AD]: '流量廣告',
  [AlgorithmType.GUESS_YOU_LIKE]: '猜你喜歡',
  [AlgorithmType.ORGANIC_TRAFFIC]: '自然流量',
  [AlgorithmType.SEARCH_ALGORITHM]: '搜索算法',
} as Record<AlgorithmType, string>

const ALG_COLOR: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: 'gold',
  [AlgorithmType.NEW_STORE_AD]: 'green',
  [AlgorithmType.HOT_REVIVE_AD]: 'volcano',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: 'purple',
  [AlgorithmType.TRAFFIC_AD]: 'cyan',
  [AlgorithmType.GUESS_YOU_LIKE]: 'blue',
  [AlgorithmType.ORGANIC_TRAFFIC]: 'lime',
  [AlgorithmType.SEARCH_ALGORITHM]: 'magenta',
} as Record<AlgorithmType, string>

// 扩展Mock数据到15条
const mockData: PricingRecord[] = [
  { id: 1, app: AppType.SHANFENG, channel: RecommendChannel.HOME, slotIndex: 1, algorithmType: AlgorithmType.INVINCIBLE_STAR, region: '澳門', dailyPrice: 2800, minDays: 7, discountTiers: '7天9折 / 30天8折', status: ServiceStatus.ENABLED },
  { id: 2, app: AppType.SHANFENG, channel: RecommendChannel.DELIVERY, slotIndex: 1, algorithmType: AlgorithmType.GUESS_YOU_LIKE, region: '氹仔', dailyPrice: 1800, minDays: 3, discountTiers: '7天9折', status: ServiceStatus.ENABLED },
  { id: 3, app: AppType.MFOOD, channel: RecommendChannel.SUPERMARKET, slotIndex: 2, algorithmType: AlgorithmType.TRAFFIC_AD, region: '珠海', dailyPrice: 1200, minDays: 1, discountTiers: '30天75折', status: ServiceStatus.ENABLED },
  { id: 4, app: AppType.SHANFENG, channel: RecommendChannel.HOME, slotIndex: 2, algorithmType: AlgorithmType.NEW_STORE_AD, region: '澳門', dailyPrice: 2500, minDays: 7, discountTiers: '7天9折 / 30天85折', status: ServiceStatus.ENABLED },
  { id: 5, app: AppType.MFOOD, channel: RecommendChannel.GROUP_BUY, slotIndex: 1, algorithmType: AlgorithmType.HOT_REVIVE_AD, region: '氹仔', dailyPrice: 1500, minDays: 5, discountTiers: '15天8折', status: ServiceStatus.ENABLED },
  { id: 6, app: AppType.SHANFENG, channel: RecommendChannel.DELIVERY, slotIndex: 3, algorithmType: AlgorithmType.EXCLUSIVE_MERCHANT, region: '澳門', dailyPrice: 2200, minDays: 7, discountTiers: '30天8折', status: ServiceStatus.DISABLED },
  { id: 7, app: AppType.MFOOD, channel: RecommendChannel.HOME, slotIndex: 3, algorithmType: AlgorithmType.ORGANIC_TRAFFIC, region: '珠海', dailyPrice: 800, minDays: 1, discountTiers: '无折扣', status: ServiceStatus.ENABLED },
  { id: 8, app: AppType.SHANFENG, channel: RecommendChannel.SUPERMARKET, slotIndex: 1, algorithmType: AlgorithmType.SEARCH_ALGORITHM, region: '澳門', dailyPrice: 1600, minDays: 3, discountTiers: '7天9折', status: ServiceStatus.ENABLED },
  { id: 9, app: AppType.MFOOD, channel: RecommendChannel.DELIVERY, slotIndex: 2, algorithmType: AlgorithmType.INVINCIBLE_STAR, region: '氹仔', dailyPrice: 2000, minDays: 7, discountTiers: '15天85折 / 30天75折', status: ServiceStatus.ENABLED },
  { id: 10, app: AppType.SHANFENG, channel: RecommendChannel.GROUP_BUY, slotIndex: 2, algorithmType: AlgorithmType.TRAFFIC_AD, region: '澳門', dailyPrice: 1400, minDays: 5, discountTiers: '30天8折', status: ServiceStatus.ENABLED },
  { id: 11, app: AppType.MFOOD, channel: RecommendChannel.HOME, slotIndex: 4, algorithmType: AlgorithmType.GUESS_YOU_LIKE, region: '珠海', dailyPrice: 2600, minDays: 7, discountTiers: '7天9折 / 30天8折', status: ServiceStatus.ENABLED },
  { id: 12, app: AppType.SHANFENG, channel: RecommendChannel.SUPERMARKET, slotIndex: 3, algorithmType: AlgorithmType.NEW_STORE_AD, region: '澳門', dailyPrice: 1100, minDays: 3, discountTiers: '15天85折', status: ServiceStatus.DISABLED },
  { id: 13, app: AppType.MFOOD, channel: RecommendChannel.GROUP_BUY, slotIndex: 3, algorithmType: AlgorithmType.HOT_REVIVE_AD, region: '氹仔', dailyPrice: 1300, minDays: 5, discountTiers: '30天75折', status: ServiceStatus.ENABLED },
  { id: 14, app: AppType.SHANFENG, channel: RecommendChannel.HOME, slotIndex: 5, algorithmType: AlgorithmType.EXCLUSIVE_MERCHANT, region: '澳門', dailyPrice: 3000, minDays: 7, discountTiers: '15天8折 / 30天7折', status: ServiceStatus.ENABLED },
  { id: 15, app: AppType.MFOOD, channel: RecommendChannel.DELIVERY, slotIndex: 4, algorithmType: AlgorithmType.SEARCH_ALGORITHM, region: '珠海', dailyPrice: 1700, minDays: 3, discountTiers: '7天9折', status: ServiceStatus.ENABLED },
]

export default function Pricing() {
  const [searchForm] = Form.useForm()
  const [filteredData, setFilteredData] = useState<PricingRecord[]>(mockData)

  // 搜索处理
  const handleSearch = (values: any) => {
    let result = [...mockData]
    
    // 所属品牌筛选
    if (values.app !== undefined && values.app !== null) {
      result = result.filter(item => item.app === values.app)
    }
    
    // 业务频道筛选
    if (values.channel !== undefined && values.channel !== null) {
      result = result.filter(item => item.channel === values.channel)
    }
    
    // 算法类型筛选
    if (values.algorithmType !== undefined && values.algorithmType !== null) {
      result = result.filter(item => item.algorithmType === values.algorithmType)
    }
    
    // 状态筛选
    if (values.status !== undefined && values.status !== null) {
      result = result.filter(item => item.status === values.status)
    }
    
    setFilteredData(result)
  }

  // 重置搜索
  const handleReset = () => {
    searchForm.resetFields()
    setFilteredData(mockData)
  }

  const columns: ColumnsType<PricingRecord> = [
    { 
      title: '所屬品牌', 
      dataIndex: 'app', 
      key: 'app', 
      width: 100,
      render: (v: AppType) => (
        <Tag style={{ 
          margin: 0,
          padding: '2px 10px',
          border: v === AppType.SHANFENG ? '1px solid #fadb14' : '1px solid #fa8c16',
          color: v === AppType.SHANFENG ? '#d4b106' : '#d46b08',
          background: v === AppType.SHANFENG ? '#fffbe6' : '#fff7e6',
          borderRadius: 4,
          fontWeight: 500
        }}>
          {v === AppType.SHANFENG ? '閃峰' : 'mFood'}
        </Tag>
      ),
    },
    { 
      title: '頻道', 
      dataIndex: 'channel', 
      key: 'channel', 
      width: 150,
      render: (v: RecommendChannel) => CHANNEL_LABEL[v],
    },
    { 
      title: '坑位序號', 
      dataIndex: 'slotIndex', 
      key: 'slotIndex',
      width: 100,
    },
    { 
      title: '區域', 
      dataIndex: 'region', 
      key: 'region',
      width: 80,
    },
    { 
      title: '單日單價 (MOP)', 
      dataIndex: 'dailyPrice', 
      key: 'dailyPrice',
      width: 140,
      render: (v: number) => <span style={{ fontWeight: 'bold', color: '#fa8c16' }}>MOP {v.toLocaleString()}</span>,
    },
    { 
      title: '最低購買天數', 
      dataIndex: 'minDays', 
      key: 'minDays',
      width: 120,
      render: (v: number) => `${v}天`,
    },
    { 
      title: '折扣階梯', 
      dataIndex: 'discountTiers', 
      key: 'discountTiers',
    },
    {
      title: '狀態', 
      dataIndex: 'status', 
      key: 'status',
      width: 80,
      render: (v: ServiceStatus) => (
        <span style={{ color: v === ServiceStatus.ENABLED ? '#52c41a' : '#999' }}>
          {v === ServiceStatus.ENABLED ? '啟用' : '停用'}
        </span>
      ),
    },
    {
      title: '操作', 
      key: 'action',
      width: 100,
      render: () => (
        <Button type="link" size="small">編輯</Button>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline" form={searchForm} onFinish={handleSearch}>
          <Form.Item label="所屬品牌" name="app">
            <Select placeholder="全部" options={APP_OPTIONS} allowClear />
          </Form.Item>
          <Form.Item label="業務頻道" name="channel">
            <Select 
              placeholder="全部" 
              options={[
                { label: '大首頁瀑布流', value: RecommendChannel.HOME },
                { label: '外賣頻道瀑布流', value: RecommendChannel.DELIVERY },
                { label: '團購頻道瀑布流', value: RecommendChannel.GROUP_BUY },
                { label: '超市頻道瀑布流', value: RecommendChannel.SUPERMARKET },
              ]}
              allowClear
            />
          </Form.Item>
          <Form.Item label="廣告類型" name="algorithmType">
            <Select 
              placeholder="全部" 
              options={[
                { label: '無敵星星', value: AlgorithmType.INVINCIBLE_STAR },
                { label: '新店廣告', value: AlgorithmType.NEW_STORE_AD },
                { label: '盤活復蘇', value: AlgorithmType.HOT_REVIVE_AD },
                { label: '獨家商家', value: AlgorithmType.EXCLUSIVE_MERCHANT },
                { label: '流量廣告', value: AlgorithmType.TRAFFIC_AD },
                { label: '猜你喜歡', value: AlgorithmType.GUESS_YOU_LIKE },
                { label: '自然流量', value: AlgorithmType.ORGANIC_TRAFFIC },
                { label: '搜索算法', value: AlgorithmType.SEARCH_ALGORITHM },
              ]}
              allowClear
            />
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
          <Button type="primary" icon={<PlusOutlined />}>新增價格</Button>
        </Space>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<PricingRecord>
          rowKey="id"
          columns={columns}
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
