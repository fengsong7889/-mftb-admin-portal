import { useState, useMemo } from 'react'
import { Button, Space, Table, Tag, Badge, Input, Select, Form } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { AlgorithmType, RecommendChannel, ServiceStatus, SERVICE_STATUS_OPTIONS } from '../constants'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

const { Search } = Input

interface AlgorithmRecord {
  id: number
  name: string
  code: string
  type: AlgorithmType
  channel: RecommendChannel
  status: ServiceStatus
  slotCount: number
}

const TYPE_LABEL: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: '無敵星星',
  [AlgorithmType.NEW_STORE_AD]: '新店廣告',
  [AlgorithmType.HOT_REVIVE_AD]: '盤活廣告',
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
  [RecommendChannel.HOME]: '大首頁瀑布流',
  [RecommendChannel.DELIVERY]: '外賣頻道瀑布流',
  [RecommendChannel.GROUP_BUY]: '團購頻道瀑布流',
  [RecommendChannel.SUPERMARKET]: '超市頻道瀑布流',
}

const TIME_SLOT_LABEL: Record<string, string> = {
  allDay: '全天',
  breakfast: '早餐(06:00-09:00)',
  lunch: '午餐(11:00-14:00)',
  afternoon: '下午茶(14:00-17:00)',
  dinner: '晚餐(17:00-20:00)',
  nightSnack: '夜宵(20:00-02:00)',
}

export const mockAlgorithmData: AlgorithmRecord[] = [
  { id: 1, name: '無敵星星-首頁版', code: 'ALG_STAR_HOME', type: AlgorithmType.INVINCIBLE_STAR, channel: RecommendChannel.HOME, status: ServiceStatus.ENABLED, slotCount: 3 },
  { id: 2, name: '新店廣告-外賣版', code: 'ALG_NEWSTORE_DELIVERY', type: AlgorithmType.NEW_STORE_AD, channel: RecommendChannel.DELIVERY, status: ServiceStatus.ENABLED, slotCount: 2 },
  { id: 3, name: '盤活廣告-團購版', code: 'ALG_REVIVE_GROUPBUY', type: AlgorithmType.HOT_REVIVE_AD, channel: RecommendChannel.GROUP_BUY, status: ServiceStatus.ENABLED, slotCount: 2 },
  { id: 4, name: '獨家商家-超市版', code: 'ALG_EXCLUSIVE_SUPER', type: AlgorithmType.EXCLUSIVE_MERCHANT, channel: RecommendChannel.SUPERMARKET, status: ServiceStatus.ENABLED, slotCount: 1 },
  { id: 5, name: '流量廣告-全渠道', code: 'ALG_TRAFFIC_ALL', type: AlgorithmType.TRAFFIC_AD, channel: RecommendChannel.HOME, status: ServiceStatus.ENABLED, slotCount: 4 },
  { id: 6, name: '猜你喜歡-主力版', code: 'ALG_GUESS_MAIN', type: AlgorithmType.GUESS_YOU_LIKE, channel: RecommendChannel.HOME, status: ServiceStatus.ENABLED, slotCount: 3 },
  { id: 7, name: '自然流量-默認', code: 'ALG_ORGANIC_DEFAULT', type: AlgorithmType.ORGANIC_TRAFFIC, channel: RecommendChannel.HOME, status: ServiceStatus.ENABLED, slotCount: 0 },
  { id: 8, name: '搜索算法-綜合版', code: 'ALG_SEARCH_COMPOSITE', type: AlgorithmType.SEARCH_ALGORITHM, channel: RecommendChannel.HOME, status: ServiceStatus.ENABLED, slotCount: 0 },
  { id: 9, name: '無敵星星-夜間版', code: 'ALG_STAR_NIGHT', type: AlgorithmType.INVINCIBLE_STAR, channel: RecommendChannel.DELIVERY, status: ServiceStatus.ENABLED, slotCount: 2 },
  { id: 10, name: '新店廣告-早餐版', code: 'ALG_NEWSTORE_BREAKFAST', type: AlgorithmType.NEW_STORE_AD, channel: RecommendChannel.SUPERMARKET, status: ServiceStatus.ENABLED, slotCount: 1 },
  { id: 11, name: '盤活廣告-午市版', code: 'ALG_REVIVE_LUNCH', type: AlgorithmType.HOT_REVIVE_AD, channel: RecommendChannel.HOME, status: ServiceStatus.ENABLED, slotCount: 3 },
  { id: 12, name: '獨家商家-晚市版', code: 'ALG_EXCLUSIVE_DINNER', type: AlgorithmType.EXCLUSIVE_MERCHANT, channel: RecommendChannel.GROUP_BUY, status: ServiceStatus.ENABLED, slotCount: 2 },
  { id: 13, name: '流量廣告-下午茶', code: 'ALG_TRAFFIC_AFTERNOON', type: AlgorithmType.TRAFFIC_AD, channel: RecommendChannel.DELIVERY, status: ServiceStatus.ENABLED, slotCount: 2 },
  { id: 14, name: '猜你喜歡-週末版', code: 'ALG_GUESS_WEEKEND', type: AlgorithmType.GUESS_YOU_LIKE, channel: RecommendChannel.GROUP_BUY, status: ServiceStatus.ENABLED, slotCount: 4 },
  { id: 15, name: '搜索算法-深夜版', code: 'ALG_SEARCH_NIGHT', type: AlgorithmType.SEARCH_ALGORITHM, channel: RecommendChannel.SUPERMARKET, status: ServiceStatus.ENABLED, slotCount: 1 },
]

export default function Algorithm() {
  const navigate = useNavigate()
  const [searchForm] = Form.useForm()
  const [filteredData, setFilteredData] = useState<AlgorithmRecord[]>(mockAlgorithmData)

  // 搜索处理
  const handleSearch = (values: any) => {
    let result = [...mockAlgorithmData]
    
    // 算法名称筛选
    if (values.name) {
      result = result.filter(item => item.name.includes(values.name))
    }
    
    // 算法ID筛选
    if (values.code) {
      result = result.filter(item => item.code.includes(values.code))
    }
    
    // 算法类型筛选
    if (values.type !== undefined && values.type !== null) {
      result = result.filter(item => item.type === values.type)
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
    setFilteredData(mockAlgorithmData)
  }

  // 跳转到新增页面
  const handleGoToAdd = () => {
    navigate('/promotion-algorithm-add')
  }

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'code', title: '算法ID' },
    { key: 'name', title: '算法名稱' },
    { key: 'type', title: '算法類型' },
    { key: 'channel', title: '業務頻道' },
    { key: 'status', title: '狀態' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('algorithm', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: ColumnsType<AlgorithmRecord> = [
    { title: '算法ID', dataIndex: 'code', key: 'code', width: 180, render: (v) => <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>{v}</code> },
    { title: '算法名稱', dataIndex: 'name', key: 'name', width: 200 },
    {
      title: '算法類型', dataIndex: 'type', key: 'type', width: 120,
      render: (v: AlgorithmType) => <Tag color={TYPE_COLOR[v]}>{TYPE_LABEL[v]}</Tag>,
    },
    {
      title: '業務頻道', dataIndex: 'channel', key: 'channel', width: 150,
      render: (v: RecommendChannel) => CHANNEL_LABEL[v],
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
          <Button type="link" size="small">編輯</Button>
          <Button type="link" size="small" danger={record.status === ServiceStatus.ENABLED}>
            {record.status === ServiceStatus.ENABLED ? '停用' : '啟用'}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline" form={searchForm} onFinish={handleSearch}>
          <Form.Item label="算法ID" name="code">
            <Input placeholder="請輸入算法ID" allowClear />
          </Form.Item>
          <Form.Item label="算法名稱" name="name">
            <Input placeholder="請輸入算法名稱" allowClear />
          </Form.Item>
          <Form.Item label="算法類型" name="type">
            <Select 
              placeholder="全部" 
              options={[
                { label: '無敵星星', value: AlgorithmType.INVINCIBLE_STAR },
                { label: '新店廣告', value: AlgorithmType.NEW_STORE_AD },
                { label: '盤活廣告', value: AlgorithmType.HOT_REVIVE_AD },
                { label: '獨家商家', value: AlgorithmType.EXCLUSIVE_MERCHANT },
                { label: '流量廣告', value: AlgorithmType.TRAFFIC_AD },
                { label: '猜你喜歡', value: AlgorithmType.GUESS_YOU_LIKE },
                { label: '自然流量', value: AlgorithmType.ORGANIC_TRAFFIC },
                { label: '搜索算法', value: AlgorithmType.SEARCH_ALGORITHM },
              ]}
              allowClear
            />
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
