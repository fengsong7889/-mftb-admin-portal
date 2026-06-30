import { useState, useMemo } from 'react'
import { Button, Space, Table, Tag, Badge, Input, Select, Form, Modal, message, InputNumber, Switch, Descriptions, Divider, Card, Checkbox, Alert, DatePicker } from 'antd'
const { RangePicker } = DatePicker
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, EyeOutlined, LayoutOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { 
  AppType, 
  RecommendChannel, 
  AlgorithmType,
  ServiceStatus,
  Region,
  APP_OPTIONS,
  SERVICE_STATUS_OPTIONS,
  RECOMMEND_CHANNEL_OPTIONS,
  ALGORITHM_TYPE_OPTIONS,
  REGION_OPTIONS,
} from '../constants'
import type { WaterfallSlotConfig } from '../types'
import { mockAlgorithmData } from '../Algorithm'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

const CHANNEL_LABEL: Record<RecommendChannel, string> = {
  [RecommendChannel.HOME]: '大首頁',
  [RecommendChannel.DELIVERY]: '外賣頻道',
  [RecommendChannel.SUPERMARKET]: '超市百貨',
  [RecommendChannel.GROUP_BUY]: '團購到店',
}

const ALGORITHM_TYPE_LABEL: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: '無敵星星',
  [AlgorithmType.NEW_STORE_AD]: '新店廣告',
  [AlgorithmType.HOT_REVIVE_AD]: '盤活復蘇',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: '獨家商家',
  [AlgorithmType.TRAFFIC_AD]: '流量廣告',
  [AlgorithmType.GUESS_YOU_LIKE]: '猜你喜歡',
  [AlgorithmType.ORGANIC_TRAFFIC]: '自然流量',
  [AlgorithmType.SEARCH_ALGORITHM]: '搜索算法',
}

const ALGORITHM_TYPE_COLOR: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: 'gold',
  [AlgorithmType.NEW_STORE_AD]: 'green',
  [AlgorithmType.HOT_REVIVE_AD]: 'volcano',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: 'purple',
  [AlgorithmType.TRAFFIC_AD]: 'cyan',
  [AlgorithmType.GUESS_YOU_LIKE]: 'blue',
  [AlgorithmType.ORGANIC_TRAFFIC]: 'lime',
  [AlgorithmType.SEARCH_ALGORITHM]: 'magenta',
}

// Mock数据 - 瀑布流坑位配置（15天虚拟数据）
const generateMockData = (): WaterfallSlotConfig[] => {
  const data: WaterfallSlotConfig[] = []
  const channels = [
    RecommendChannel.DELIVERY,
    RecommendChannel.GROUP_BUY,
    RecommendChannel.SUPERMARKET,
  ]
  const apps = [AppType.SHANFENG, AppType.MFOOD]
  const algorithms = [
    { id: 1, name: '無敵星星-首頁版', type: AlgorithmType.INVINCIBLE_STAR },
    { id: 2, name: '新店廣告-外賣版', type: AlgorithmType.NEW_STORE_AD },
    { id: 3, name: '盤活復蘇-團購版', type: AlgorithmType.HOT_REVIVE_AD },
    { id: 4, name: '獨家商家-超市版', type: AlgorithmType.EXCLUSIVE_MERCHANT },
    { id: 5, name: '流量廣告-全渠道', type: AlgorithmType.TRAFFIC_AD },
    { id: 6, name: '猜你喜歡-主力版', type: AlgorithmType.GUESS_YOU_LIKE },
    { id: 7, name: '自然流量-默認', type: AlgorithmType.ORGANIC_TRAFFIC },
    { id: 8, name: '搜索算法-綜合版', type: AlgorithmType.SEARCH_ALGORITHM },
  ]
  const users = ['admin', 'operator', 'user001', 'user002']

  // 推广名称虚拟数据
  const promotionNames = [
    '无敌星星国庆推广',
    '新店广告中秋特惠',
    '盘活广告双十一狂欢',
    '独家商家周年庆',
    '流量广告圣诞特卖',
    '猜你喜欢新年推荐',
    '自然流量春季大促',
    '搜索算法开学季',
    '无敌星星情人节专场',
    '新店广告夏季清凉',
    '盘活广告秋季美食',
    '独家商家冬季暖锅',
    '流量广告周末特惠',
    '猜你喜欢月末冲刺',
    '自然流量节日庆典',
    '搜索算法品牌周',
  ]

  let id = 1
  
  // 使用固定种子生成可预期的数据（避免每次刷新数据不同）
  const pseudoRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000
    return x - Math.floor(x)
  }
  
  // 生成15条数据
  for (let i = 0; i < 15; i++) {
    const seed = i * 100
    const date = new Date()
    date.setDate(date.getDate() - Math.floor(i / 2))
    const dateStr = date.toISOString().split('T')[0]
    
    const app = apps[Math.floor(pseudoRandom(seed + 1) * apps.length)]
    const channel = channels[Math.floor(pseudoRandom(seed + 2) * channels.length)]
    const slotPosition = 1 + Math.floor(pseudoRandom(seed + 3) * 10) // 1-10号位
    const algorithm = algorithms[Math.floor(pseudoRandom(seed + 4) * algorithms.length)]
    const status = i < 10 ? ServiceStatus.ENABLED : ServiceStatus.DISABLED // 前10条启用,后5条停用
    const user = users[Math.floor(pseudoRandom(seed + 6) * users.length)]
    const promotionName = promotionNames[i % promotionNames.length] // 循环使用推广名称
    
    const hour = 8 + Math.floor(pseudoRandom(seed + 7) * 12)
    const minute = Math.floor(pseudoRandom(seed + 8) * 60)
    
    data.push({
      id: id++,
      adId: `AD${String(id).padStart(6, '0')}`,
      promotionName,
      app,
      channel,
      slotPosition,
      region: pseudoRandom(seed + 8) > 0.5 ? Region.MACAU : (pseudoRandom(seed + 9) > 0.5 ? Region.TAIPA : Region.ZHUHAI),
      algorithmId: algorithm.id,
      algorithmName: algorithm.name,
      algorithmType: algorithm.type,
      salesStartDate: `2024-01-${String(1 + Math.floor(pseudoRandom(seed + 10) * 15)).padStart(2, '0')}`,
      salesEndDate: `2024-01-${String(16 + Math.floor(pseudoRandom(seed + 11) * 15)).padStart(2, '0')}`,
      purchaseLimit: pseudoRandom(seed + 12) > 0.5 ? { days: 7, quantity: 3 + Math.floor(pseudoRandom(seed + 13) * 5) } : undefined,
      purchaseInterval: pseudoRandom(seed + 14) > 0.5 ? 1 + Math.floor(pseudoRandom(seed + 15) * 5) : undefined,
      merchantLimit: pseudoRandom(seed + 16) > 0.5 ? 'limited' : 'unlimited',
      merchantIds: pseudoRandom(seed + 17) > 0.5 ? [100 + Math.floor(pseudoRandom(seed + 18) * 50), 100 + Math.floor(pseudoRandom(seed + 19) * 50)] : undefined,
      regionLimit: pseudoRandom(seed + 20) > 0.5 ? 'limited' : 'unlimited',
      regionIds: pseudoRandom(seed + 21) > 0.5 ? [1, 2, 3].slice(0, 1 + Math.floor(pseudoRandom(seed + 22) * 3)) : undefined,
      status,
      updatedBy: user,
      updatedAt: `${dateStr} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
      createdAt: `${dateStr} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
    })
  }

  // 按更新时间倒序排列（最新的在前面）
  return data.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

const mockData: WaterfallSlotConfig[] = generateMockData()

export default function Waterfall() {
  const navigate = useNavigate()
  const [searchForm] = Form.useForm()
  const [filteredData, setFilteredData] = useState<WaterfallSlotConfig[]>(mockData)
  const [modalVisible, setModalVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [editingRecord, setEditingRecord] = useState<WaterfallSlotConfig | null>(null)
  const [viewingRecord, setViewingRecord] = useState<WaterfallSlotConfig | null>(null)
  const [form] = Form.useForm()
  
  // 算法选择相关状态
  const [algorithmType, setAlgorithmType] = useState<AlgorithmType | undefined>(undefined)
  const [algorithmOptions, setAlgorithmOptions] = useState<any[]>([])
  const [continuousPurchase, setContinuousPurchase] = useState<string>('notSupport')
  const [merchantLimit, setMerchantLimit] = useState<'limited' | 'unlimited'>('unlimited')
  const [selectedMerchants, setSelectedMerchants] = useState<number[]>([])
  const [merchantModalVisible, setMerchantModalVisible] = useState(false)
  const [regionLimit, setRegionLimit] = useState<'limited' | 'unlimited'>('unlimited')

  // 搜索处理
  const handleSearch = (values: any) => {
    let result = [...mockData]
    
    if (values.app !== undefined && values.app !== null) {
      result = result.filter(item => item.app === values.app)
    }
    
    if (values.channel !== undefined && values.channel !== null) {
      result = result.filter(item => item.channel === values.channel)
    }

    if (values.slotPosition !== undefined && values.slotPosition !== null) {
      result = result.filter(item => item.slotPosition === values.slotPosition)
    }

    if (values.algorithm) {
      result = result.filter(item => 
        item.algorithmName.includes(values.algorithm) || 
        String(item.algorithmId).includes(values.algorithm)
      )
    }
    
    if (values.status !== undefined && values.status !== null) {
      result = result.filter(item => item.status === values.status)
    }
    
    if (values.updatedBy) {
      result = result.filter(item => 
        item.updatedBy && item.updatedBy.includes(values.updatedBy)
      )
    }
    
    if (values.updatedAt) {
      const searchDate = values.updatedAt.format('YYYY-MM-DD')
      result = result.filter(item => 
        item.updatedAt && item.updatedAt.startsWith(searchDate)
      )
    }
    
    if (values.salesDateRange && values.salesDateRange.length === 2) {
      const startDate = values.salesDateRange[0].format('YYYY-MM-DD')
      const endDate = values.salesDateRange[1].format('YYYY-MM-DD')
      result = result.filter(item => 
        item.salesStartDate && item.salesEndDate &&
        item.salesStartDate <= endDate &&
        item.salesEndDate >= startDate
      )
    }
    
    setFilteredData(result)
  }

  // 重置搜索
  const handleReset = () => {
    searchForm.resetFields()
    setFilteredData(mockData)
  }

  // 算法类型变化
  const handleAlgorithmTypeChange = (type: AlgorithmType) => {
    setAlgorithmType(type)
    const availableAlgorithms = mockAlgorithmData.filter(
      alg => alg.type === type && alg.status === ServiceStatus.ENABLED
    )
    setAlgorithmOptions(availableAlgorithms)
    form.setFieldsValue({ algorithmId: undefined })
  }

  // 算法选择变化
  const handleAlgorithmChange = (algorithmId: number) => {
    const selectedAlgorithm = mockAlgorithmData.find(alg => alg.id === algorithmId)
    if (selectedAlgorithm) {
      form.setFieldsValue({
        algorithmName: selectedAlgorithm.name,
        algorithmType: selectedAlgorithm.type,
      })
      // TODO: 从算法配置中加载continuousPurchase等参数默认值
      setContinuousPurchase('notSupport')
    }
  }

  // 新增/编辑
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('表单数据:', values)
      message.success(editingRecord ? '編輯成功' : '新增成功')
      setModalVisible(false)
      form.resetFields()
      setEditingRecord(null)
      setAlgorithmType(undefined)
      setAlgorithmOptions([])
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  // 删除
  const handleDelete = (record: WaterfallSlotConfig) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除位置${record.slotPosition}的配置嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        message.success('刪除成功')
      },
    })
  }

  // 切换状态（启用/停用）
  const handleToggleStatus = (record: WaterfallSlotConfig) => {
    const newStatus = record.status === ServiceStatus.ENABLED ? ServiceStatus.DISABLED : ServiceStatus.ENABLED
    const actionText = newStatus === ServiceStatus.ENABLED ? '啟用' : '停用'
    
    Modal.confirm({
      title: `確認${actionText}`,
      content: `確定要${actionText}位置${record.slotPosition}的配置嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        message.success(`${actionText}成功`)
      },
    })
  }

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'adId', title: '廣告ID' },
    { key: 'promotionName', title: '廣告名稱' },
    { key: 'channel', title: '業務頻道' },
    { key: 'app', title: '所屬品牌' },
    { key: 'slotPosition', title: '展示位置' },
    { key: 'algorithmType', title: '推薦類型' },
    { key: 'algorithmId', title: '關聯算法ID' },
    { key: 'algorithmName', title: '關聯算法名稱' },
    { key: 'salesStartDate', title: '銷售日期起' },
    { key: 'salesEndDate', title: '銷售日期止' },
    { key: 'status', title: '狀態' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('waterfall', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  // 完整列定义（带自定义渲染）
  const columns: ColumnsType<WaterfallSlotConfig> = [
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
      width: 140,
      ellipsis: true,
    },
    { 
      title: '業務頻道', 
      dataIndex: 'channel', 
      key: 'channel', 
      width: 140,
      render: (v: RecommendChannel) => CHANNEL_LABEL[v],
    },
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
      title: '展示位置',
      dataIndex: 'slotPosition',
      key: 'slotPosition',
      width: 100,
      render: (v: number) => (
        <Badge count={`${v}號位`} style={{ backgroundColor: '#1890ff' }} />
      ),
    },
    {
      title: '推薦類型',
      dataIndex: 'algorithmType',
      key: 'algorithmType',
      width: 120,
      render: (v: AlgorithmType) => (
        <Tag color={ALGORITHM_TYPE_COLOR[v]}>
          {ALGORITHM_TYPE_LABEL[v]}
        </Tag>
      ),
    },
    {
      title: '關聯算法ID',
      dataIndex: 'algorithmId',
      key: 'algorithmId',
      width: 120,
      render: (id: number) => (
        <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>
          {String(id).padStart(6, '0')}
        </code>
      ),
    },
    {
      title: '關聯算法名稱',
      dataIndex: 'algorithmName',
      key: 'algorithmName',
      width: 200,
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: '銷售日期起',
      dataIndex: 'salesStartDate',
      key: 'salesStartDate',
      width: 120,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '銷售日期止',
      dataIndex: 'salesEndDate',
      key: 'salesEndDate',
      width: 120,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: ServiceStatus) => (
        <Tag color={v === ServiceStatus.ENABLED ? 'green' : 'default'}>
          {v === ServiceStatus.ENABLED ? '啟用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '最後更新人',
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 120,
      render: (v: string) => (
        <span style={{ whiteSpace: 'nowrap' }}>{v}</span>
      ),
    },
    {
      title: '最後更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (v: string) => (
        <span style={{ whiteSpace: 'nowrap' }}>{v}</span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Button 
            type="link" 
            size="small" 
            icon={<EyeOutlined />}
            onClick={() => {
              setViewingRecord(record)
              setDetailVisible(true)
            }}
          >
            查看
          </Button>
          <Button 
            type="link" 
            size="small" 
            icon={<EditOutlined />}
            onClick={() => {
              setEditingRecord(record)
              form.setFieldsValue({
                app: record.app,
                channel: record.channel,
                slotPosition: record.slotPosition,
                algorithmType: record.algorithmType,
                algorithmId: record.algorithmId,
                algorithmName: record.algorithmName,
                purchaseLimit: record.purchaseLimit,
                purchaseInterval: record.purchaseInterval,
                merchantLimit: record.merchantLimit,
                merchantIds: record.merchantIds,
                regionLimit: record.regionLimit,
                regionIds: record.regionIds,
                status: record.status,
              })
              setAlgorithmType(record.algorithmType)
              setContinuousPurchase(record.purchaseLimit ? 'support' : 'notSupport')
              setMerchantLimit(record.merchantLimit)
              setSelectedMerchants(record.merchantIds || [])
              setRegionLimit(record.regionLimit)
              setModalVisible(true)
            }}
          >
            編輯
          </Button>
          <Button 
            type="link" 
            size="small" 
            danger={record.status === ServiceStatus.ENABLED}
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === ServiceStatus.ENABLED ? '停用' : '啟用'}
          </Button>
          <Button 
            type="link" 
            size="small" 
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          >
            刪除
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
          <Form.Item label="業務頻道" name="channel">
            <Select 
              placeholder="全部" 
              options={RECOMMEND_CHANNEL_OPTIONS} 
              allowClear
            />
          </Form.Item>
          <Form.Item label="所屬品牌" name="app">
            <Select placeholder="全部" options={APP_OPTIONS} allowClear />
          </Form.Item>
          <Form.Item label="展示位置" name="slotPosition">
            <InputNumber placeholder="坑位序號" min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="關聯算法名稱" name="algorithm">
            <Input placeholder="算法名稱/ID" allowClear />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select placeholder="全部" options={SERVICE_STATUS_OPTIONS} allowClear />
          </Form.Item>
          <Form.Item label="銷售日期" name="salesDateRange">
            <RangePicker placeholder={['開始日期', '結束日期']} allowClear />
          </Form.Item>
          <Form.Item label="最後更新人" name="updatedBy">
            <Input placeholder="請輸入更新人" allowClear />
          </Form.Item>
          <Form.Item label="最後更新時間" name="updatedAt">
            <DatePicker placeholder="選擇日期" allowClear />
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
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => navigate('/promotion-waterfall-add')}
          >
            新增
          </Button>
        </Space>
        {configComponent}
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<WaterfallSlotConfig>
          rowKey="id"
          columns={applyConfig(columns)}
          dataSource={filteredData}
          scroll={{ x: 1300 }}
          pagination={{
            pageSize: 10,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showQuickJumper: true,
          }}
        />
      </div>

      {/* 空数据时展示手机模型 */}
      {filteredData.length === 0 && (
        <Card 
          title="瀑布流預覽" 
          style={{ marginTop: 16 }}
          extra={<Tag color="blue">自然流量展示</Tag>}
        >
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <div style={{ width: 375, background: '#1a1a1a', borderRadius: 40, padding: '12px 8px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
              <div style={{ background: '#f5f5f5', borderRadius: 32, overflow: 'hidden', minHeight: 667 }}>
                <div style={{ background: '#fff', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontWeight: 600 }}>
                  <span>9:41</span>
                  <Space size={4}><span>📶</span><span>🔋</span></Space>
                </div>
                <div style={{ background: '#fff', padding: '16px', borderBottom: '1px solid #e8e8e8' }}>
                  <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, color: '#262626' }}>瀑布流展示</div>
                  <div style={{ fontSize: 12, color: '#8c8c8c', lineHeight: 1.5 }}>(只展示啟用的坑位)</div>
                </div>
                <div style={{ padding: '12px', minHeight: 550 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    {[{ position: 1, name: '自然流量-默认推荐' }, { position: 2, name: '自然流量-热门商家' }, { position: 3, name: '自然流量-附近推荐' }, { position: 4, name: '自然流量-新品上市' }, { position: 5, name: '自然流量-优质评价' }, { position: 6, name: '自然流量-销量排行' }].map((item) => (
                      <div key={item.position} style={{ background: '#fff', borderRadius: 8, padding: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                        <Badge count={`位置${item.position}`} style={{ backgroundColor: '#8c8c8c', marginBottom: 8, display: 'block' }} />
                        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#595959', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                        <Tag color="default" style={{ fontSize: 11, padding: '0 6px', margin: 0 }}>自然流量</Tag>
                        <div style={{ marginTop: 12, height: 60, background: 'linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8c8c8c', fontSize: 24 }}>🌊</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background: '#fff', borderTop: '1px solid #e8e8e8', padding: '12px 0', display: 'flex', justifyContent: 'space-around' }}>
                  <span style={{ fontSize: 20 }}>🏠</span>
                  <span style={{ fontSize: 20 }}>🔍</span>
                  <span style={{ fontSize: 20 }}>📋</span>
                  <span style={{ fontSize: 20 }}>👤</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRecord ? '編輯坑位配置' : '新增坑位配置'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setModalVisible(false)
          form.resetFields()
          setEditingRecord(null)
          setAlgorithmType(undefined)
          setAlgorithmOptions([])
        }}
        width={900}
        okText="確定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          {/* 基础信息区 */}
          <Card title="基礎信息" size="small" style={{ marginBottom: 16 }}>
            <Form.Item 
              label="所屬品牌" 
              name="app" 
              rules={[{ required: true, message: '請選擇所屬品牌' }]}
            >
              <Select placeholder="請選擇" options={APP_OPTIONS} />
            </Form.Item>

            <Form.Item 
              label="業務頻道" 
              name="channel" 
              rules={[{ required: true, message: '請選擇業務頻道' }]}
            >
              <Select placeholder="請選擇" options={RECOMMEND_CHANNEL_OPTIONS} />
            </Form.Item>

            <Form.Item 
              label="展示位置" 
              name="slotPosition" 
              rules={[{ required: true, message: '請輸入展示位置(坑位序號)' }]}
            >
              <InputNumber min={1} placeholder="例如:1、2、3" style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item 
              label="算法類型" 
              rules={[{ required: true, message: '請選擇算法類型' }]}
            >
              <Select 
                placeholder="請選擇算法類型" 
                options={ALGORITHM_TYPE_OPTIONS}
                onChange={handleAlgorithmTypeChange}
                value={algorithmType}
              />
            </Form.Item>

            <Form.Item 
              label="關聯算法" 
              name="algorithmId"
              rules={[{ required: true, message: '請選擇關聯算法' }]}
            >
              <Select 
                placeholder="請先選擇算法類型" 
                options={algorithmOptions.map(alg => ({ label: alg.name, value: alg.id }))}
                onChange={handleAlgorithmChange}
                disabled={!algorithmType}
              />
            </Form.Item>

            <Form.Item 
              label="推薦類型" 
              name="algorithmType"
            >
              <Input 
                placeholder="選擇算法後自動顯示" 
                disabled 
                suffix={
                  (() => {
                    const algorithmType = form.getFieldValue('algorithmType') as AlgorithmType | undefined
                    return algorithmType ? (
                      <Tag color={ALGORITHM_TYPE_COLOR[algorithmType]}>
                        {ALGORITHM_TYPE_LABEL[algorithmType]}
                      </Tag>
                    ) : null
                  })()
                }
              />
            </Form.Item>
          </Card>

          {/* 关键参数调整区 */}
          <Card title="坑位參數配置" size="small" style={{ marginBottom: 16 }}>
            <Alert
              message="提示"
              description="以下參數將覆蓋算法配置的默認值,僅對當前坑位生效。"
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />

            {/* 购买上限/间隔天数 */}
            {continuousPurchase === 'support' && (
              <Form.Item 
                label="購買上限" 
                name="purchaseLimit"
                rules={[{ required: true, message: '請配置購買上限' }]}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#595959', fontWeight: 500 }}>近</span>
                  <InputNumber min={1} max={365} placeholder="天數" style={{ width: 100 }} />
                  <span style={{ color: '#595959', fontWeight: 500 }}>天內,最多可購買</span>
                  <InputNumber min={1} max={100} placeholder="數量" style={{ width: 100 }} />
                  <span style={{ color: '#595959', fontWeight: 500 }}>個時段</span>
                </div>
              </Form.Item>
            )}

            {continuousPurchase === 'notSupport' && (
              <Form.Item 
                label="間隔天數" 
                name="purchaseInterval"
                rules={[{ required: true, message: '請配置間隔天數' }]}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#595959', fontWeight: 500 }}>間隔</span>
                  <InputNumber min={1} max={365} placeholder="天數" style={{ width: 100 }} />
                  <span style={{ color: '#595959', fontWeight: 500 }}>天可購買</span>
                </div>
              </Form.Item>
            )}

            {/* 商家限制 */}
            <Form.Item 
              label="商家限制" 
              name="merchantLimit"
              valuePropName="checked"
              getValueFromEvent={(checked) => checked ? 'unlimited' : 'limited'}
              getValueProps={(value) => ({ checked: value === 'unlimited' })}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Switch 
                  checkedChildren="不限制" 
                  unCheckedChildren="限制"
                  defaultChecked
                />
                {merchantLimit === 'limited' && (
                  <Button 
                    size="small"
                    onClick={() => setMerchantModalVisible(true)}
                  >
                    選擇商家
                  </Button>
                )}
              </div>
            </Form.Item>

            {/* 销售区域 */}
            <Form.Item 
              label="销售区域" 
              name="regionLimit"
              valuePropName="checked"
              getValueFromEvent={(checked) => checked ? 'unlimited' : 'limited'}
              getValueProps={(value) => ({ checked: value === 'unlimited' })}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Switch 
                  checkedChildren="不限制" 
                  unCheckedChildren="限制"
                  defaultChecked
                />
                {regionLimit === 'limited' && (
                  <Checkbox.Group options={REGION_OPTIONS} />
                )}
              </div>
            </Form.Item>
          </Card>

          {/* 状态区 */}
          <Form.Item 
            label="狀態" 
            name="status" 
            valuePropName="checked"
            getValueFromEvent={(checked) => checked ? ServiceStatus.ENABLED : ServiceStatus.DISABLED}
            getValueProps={(value) => ({ checked: value === ServiceStatus.ENABLED })}
          >
            <Switch checkedChildren="啟用" unCheckedChildren="停用" defaultChecked />
          </Form.Item>
        </Form>
      </Modal>

      {/* 商家选择弹窗 */}
      <Modal
        title="選擇商家"
        open={merchantModalVisible}
        onOk={() => {
          setMerchantModalVisible(false)
          form.setFieldsValue({ merchantIds: selectedMerchants })
        }}
        onCancel={() => setMerchantModalVisible(false)}
        width={800}
      >
        <div style={{ padding: '16px 0' }}>
          <Alert
            message="支持批量選擇商家,選中的商家將在當前坑位生效"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Table
            rowKey="id"
            columns={[
              { title: '商家ID', dataIndex: 'id', width: 100 },
              { title: '商家名稱', dataIndex: 'name' },
              { title: '所屬區域', dataIndex: 'region' },
            ]}
            dataSource={[
              { id: 101, name: '商家A', region: '澳門' },
              { id: 102, name: '商家B', region: '氹仔' },
              { id: 103, name: '商家C', region: '珠海' },
            ]}
            rowSelection={{
              type: 'checkbox',
              selectedRowKeys: selectedMerchants,
              onChange: (selectedRowKeys) => setSelectedMerchants(selectedRowKeys as number[]),
            }}
            pagination={{ pageSize: 10 }}
          />
        </div>
      </Modal>

      {/* 查看详情弹窗 */}
      <Modal
        title="坑位配置詳情"
        open={detailVisible}
        onCancel={() => {
          setDetailVisible(false)
          setViewingRecord(null)
        }}
        footer={[
          <Button key="close" onClick={() => {
            setDetailVisible(false)
            setViewingRecord(null)
          }}>
            關閉
          </Button>,
        ]}
        width={800}
      >
        {viewingRecord && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="所屬品牌" span={2}>
                <Tag style={{ 
                  margin: 0,
                  padding: '2px 10px',
                  border: viewingRecord.app === AppType.SHANFENG ? '1px solid #fadb14' : '1px solid #fa8c16',
                  color: viewingRecord.app === AppType.SHANFENG ? '#d4b106' : '#d46b08',
                  background: viewingRecord.app === AppType.SHANFENG ? '#fffbe6' : '#fff7e6',
                  borderRadius: 4,
                  fontWeight: 500
                }}>
                  {viewingRecord.app === AppType.SHANFENG ? '閃峰' : 'mFood'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="業務頻道">
                {CHANNEL_LABEL[viewingRecord.channel]}
              </Descriptions.Item>
              <Descriptions.Item label="展示位置">
                <Badge count={`${viewingRecord.slotPosition}號位`} style={{ backgroundColor: '#1890ff' }} />
              </Descriptions.Item>
              <Descriptions.Item label="算法名稱" span={2}>
                <strong>{viewingRecord.algorithmName}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="算法類型">
                <Tag color={ALGORITHM_TYPE_COLOR[viewingRecord.algorithmType]}>
                  {ALGORITHM_TYPE_LABEL[viewingRecord.algorithmType]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="算法ID">
                <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>
                  {String(viewingRecord.algorithmId).padStart(6, '0')}
                </code>
              </Descriptions.Item>
              <Descriptions.Item label="狀態" span={2}>
                <Badge
                  status={viewingRecord.status === ServiceStatus.ENABLED ? 'success' : 'default'}
                  text={viewingRecord.status === ServiceStatus.ENABLED ? '啟用' : '停用'}
                />
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">關鍵參數配置</Divider>
            <Card size="small">
              <Descriptions column={1} size="small">
                {viewingRecord.purchaseLimit && (
                  <Descriptions.Item label="購買上限">
                    近 {viewingRecord.purchaseLimit.days} 天內,最多可購買 {viewingRecord.purchaseLimit.quantity} 個時段
                  </Descriptions.Item>
                )}
                {viewingRecord.purchaseInterval && (
                  <Descriptions.Item label="間隔天數">
                    間隔 {viewingRecord.purchaseInterval} 天可購買
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="商家限制">
                  <Tag color={viewingRecord.merchantLimit === 'limited' ? 'red' : 'green'}>
                    {viewingRecord.merchantLimit === 'limited' ? `限制(${viewingRecord.merchantIds?.length || 0}個商家)` : '不限制'}
                  </Tag>
                  {viewingRecord.merchantLimit === 'limited' && viewingRecord.merchantIds && viewingRecord.merchantIds.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      已選商家ID: {viewingRecord.merchantIds.join(', ')}
                    </div>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="销售区域">
                  <Tag color={viewingRecord.regionLimit === 'limited' ? 'red' : 'green'}>
                    {viewingRecord.regionLimit === 'limited' ? `限制(${viewingRecord.regionIds?.length || 0}個區域)` : '不限制'}
                  </Tag>
                  {viewingRecord.regionLimit === 'limited' && viewingRecord.regionIds && viewingRecord.regionIds.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      已選區域: {viewingRecord.regionIds.map(id => REGION_OPTIONS.find(opt => opt.value === id)?.label).join(', ')}
                    </div>
                  )}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Divider orientation="left">更新信息</Divider>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="最後更新人">
                {viewingRecord.updatedBy}
              </Descriptions.Item>
              <Descriptions.Item label="最後更新時間">
                {viewingRecord.updatedAt}
              </Descriptions.Item>
              <Descriptions.Item label="創建時間" span={2}>
                {viewingRecord.createdAt}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Modal>
    </div>
  )
}
