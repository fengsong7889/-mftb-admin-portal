import { useState } from 'react'
import { Button, Space, Table, Badge, Input, Select, Form, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { AppType, RecommendChannel, ServiceStatus, AlgorithmType, APP_OPTIONS, SERVICE_STATUS_OPTIONS } from '../constants'

const { Search } = Input

interface SlotRecord {
  id: number
  app: AppType
  index: number
  name: string
  channel: RecommendChannel
  defaultAlgorithm: AlgorithmType
  status: ServiceStatus
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

const CHANNEL_LABEL: Record<RecommendChannel, string> = {
  [RecommendChannel.HOME]: '大首頁',
  [RecommendChannel.DELIVERY]: '外賣',
  [RecommendChannel.GROUP_BUY]: '團購',
  [RecommendChannel.SUPERMARKET]: '超市',
}

const CHANNEL_COLOR: Record<RecommendChannel, string> = {
  [RecommendChannel.HOME]: 'blue',
  [RecommendChannel.DELIVERY]: 'orange',
  [RecommendChannel.GROUP_BUY]: 'green',
  [RecommendChannel.SUPERMARKET]: 'purple',
}

// 扩展Mock数据到15条
const mockData: SlotRecord[] = [
  { id: 1, app: AppType.SHANFENG, index: 1, name: '首頁第一坑', channel: RecommendChannel.HOME, defaultAlgorithm: AlgorithmType.GUESS_YOU_LIKE, status: ServiceStatus.ENABLED },
  { id: 2, app: AppType.SHANFENG, index: 2, name: '首頁第二坑', channel: RecommendChannel.HOME, defaultAlgorithm: AlgorithmType.INVINCIBLE_STAR, status: ServiceStatus.ENABLED },
  { id: 3, app: AppType.MFOOD, index: 3, name: '首頁第三坑', channel: RecommendChannel.HOME, defaultAlgorithm: AlgorithmType.TRAFFIC_AD, status: ServiceStatus.DISABLED },
  { id: 4, app: AppType.SHANFENG, index: 4, name: '外賣推薦坑位1', channel: RecommendChannel.DELIVERY, defaultAlgorithm: AlgorithmType.GUESS_YOU_LIKE, status: ServiceStatus.ENABLED },
  { id: 5, app: AppType.MFOOD, index: 5, name: '外賣推薦坑位2', channel: RecommendChannel.DELIVERY, defaultAlgorithm: AlgorithmType.NEW_STORE_AD, status: ServiceStatus.ENABLED },
  { id: 6, app: AppType.SHANFENG, index: 6, name: '外賣熱門坑位', channel: RecommendChannel.DELIVERY, defaultAlgorithm: AlgorithmType.HOT_REVIVE_AD, status: ServiceStatus.ENABLED },
  { id: 7, app: AppType.MFOOD, index: 7, name: '團購首選坑位', channel: RecommendChannel.GROUP_BUY, defaultAlgorithm: AlgorithmType.EXCLUSIVE_MERCHANT, status: ServiceStatus.ENABLED },
  { id: 8, app: AppType.SHANFENG, index: 8, name: '團購推薦坑位1', channel: RecommendChannel.GROUP_BUY, defaultAlgorithm: AlgorithmType.GUESS_YOU_LIKE, status: ServiceStatus.ENABLED },
  { id: 9, app: AppType.MFOOD, index: 9, name: '團購推薦坑位2', channel: RecommendChannel.GROUP_BUY, defaultAlgorithm: AlgorithmType.TRAFFIC_AD, status: ServiceStatus.DISABLED },
  { id: 10, app: AppType.SHANFENG, index: 10, name: '超市熱賣坑位', channel: RecommendChannel.SUPERMARKET, defaultAlgorithm: AlgorithmType.HOT_REVIVE_AD, status: ServiceStatus.ENABLED },
  { id: 11, app: AppType.MFOOD, index: 11, name: '超市推薦坑位1', channel: RecommendChannel.SUPERMARKET, defaultAlgorithm: AlgorithmType.GUESS_YOU_LIKE, status: ServiceStatus.ENABLED },
  { id: 12, app: AppType.SHANFENG, index: 12, name: '超市推薦坑位2', channel: RecommendChannel.SUPERMARKET, defaultAlgorithm: AlgorithmType.NEW_STORE_AD, status: ServiceStatus.ENABLED },
  { id: 13, app: AppType.MFOOD, index: 13, name: '首頁廣告坑位', channel: RecommendChannel.HOME, defaultAlgorithm: AlgorithmType.ORGANIC_TRAFFIC, status: ServiceStatus.ENABLED },
  { id: 14, app: AppType.SHANFENG, index: 14, name: '外賣夜宵坑位', channel: RecommendChannel.DELIVERY, defaultAlgorithm: AlgorithmType.SEARCH_ALGORITHM, status: ServiceStatus.DISABLED },
  { id: 15, app: AppType.MFOOD, index: 15, name: '團購特惠坑位', channel: RecommendChannel.GROUP_BUY, defaultAlgorithm: AlgorithmType.INVINCIBLE_STAR, status: ServiceStatus.ENABLED },
]

export default function Slot() {
  const [searchForm] = Form.useForm()
  const [filteredData, setFilteredData] = useState<SlotRecord[]>(mockData)

  // 搜索处理
  const handleSearch = (values: any) => {
    let result = [...mockData]
    
    // 所属品牌筛选
    if (values.app !== undefined && values.app !== null) {
      result = result.filter(item => item.app === values.app)
    }
    
    // 坑位名称筛选
    if (values.name) {
      result = result.filter(item => item.name.includes(values.name))
    }
    
    // 业务频道筛选
    if (values.channel !== undefined && values.channel !== null) {
      result = result.filter(item => item.channel === values.channel)
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

  const columns: ColumnsType<SlotRecord> = [
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
    { title: '序號', dataIndex: 'index', key: 'index', width: 60 },
    { title: '坑位名稱', dataIndex: 'name', key: 'name', width: 150 },
    { 
      title: '業務頻道', 
      dataIndex: 'channel', 
      key: 'channel', 
      width: 120,
      render: (v: RecommendChannel) => (
        <span style={{ 
          padding: '2px 8px', 
          borderRadius: 4, 
          fontSize: 12,
          background: `${CHANNEL_COLOR[v]}15`,
          color: CHANNEL_COLOR[v] === 'blue' ? '#1677ff' : CHANNEL_COLOR[v] === 'orange' ? '#fa8c16' : CHANNEL_COLOR[v] === 'green' ? '#52c41a' : '#722ed1',
          border: `1px solid ${CHANNEL_COLOR[v]}30`
        }}>
          {CHANNEL_LABEL[v]}
        </span>
      ),
    },
    {
      title: '默認算法', dataIndex: 'defaultAlgorithm', key: 'defaultAlgorithm', width: 120,
      render: (v: AlgorithmType) => ALG_LABEL[v],
    },
    {
      title: '當前狀態', dataIndex: 'status', key: 'status', width: 100,
      render: (v: ServiceStatus) => (
        <Badge
          status={v === ServiceStatus.ENABLED ? 'success' : 'default'}
          text={v === ServiceStatus.ENABLED ? '啟用' : '停用'}
        />
      ),
    },
    {
      title: '操作', key: 'action', width: 180,
      render: () => (
        <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Button type="link" size="small">編輯</Button>
          <Button type="link" size="small">配置規則</Button>
        </Space>
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
          <Form.Item label="坑位名稱" name="name">
            <Input placeholder="請輸入坑位名稱" allowClear />
          </Form.Item>
          <Form.Item label="業務頻道" name="channel">
            <Select 
              placeholder="全部" 
              options={[
                { label: '大首頁', value: RecommendChannel.HOME },
                { label: '外賣', value: RecommendChannel.DELIVERY },
                { label: '團購', value: RecommendChannel.GROUP_BUY },
                { label: '超市', value: RecommendChannel.SUPERMARKET },
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
          <Button type="primary" icon={<PlusOutlined />}>新增坑位</Button>
        </Space>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<SlotRecord>
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
