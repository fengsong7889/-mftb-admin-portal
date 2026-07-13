import { useState } from 'react'
import { Button, Space, Table, Tag, Badge, Input, Select, Form, Modal, message, InputNumber, Switch } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { 
  AppType, 
  RecommendChannel, 
  ServiceStatus, 
  RecallDimension,
  TimeSlot,
  APP_OPTIONS, 
  SERVICE_STATUS_OPTIONS,
  RECOMMEND_CHANNEL_OPTIONS,
  RECALL_DIMENSION_OPTIONS,
  RECALL_DIMENSION_COLOR,
  TIME_SLOT_OPTIONS,
} from '../constants'
import type { RecallStrategy } from '../types'

const { TextArea } = Input

// 召回源Mock数据
const RECALL_SOURCE_OPTIONS = [
  { label: '新店保護期召回', value: 'new_store' },
  { label: '商家評分召回', value: 'merchant_rating' },
  { label: '獨家商家召回', value: 'exclusive_merchant' },
  { label: '營業狀態召回', value: 'business_status' },
  { label: '商家距離召回', value: 'merchant_distance' },
  { label: '購買廣告商家召回', value: 'advertiser' },
  { label: '商品類目匹配召回', value: 'item_category' },
  { label: '商品標籤相似召回', value: 'item_tag' },
  { label: '商品銷量召回', value: 'item_sales' },
  { label: '廣告主召回', value: 'commercial_advertiser' },
  { label: '競價排名召回', value: 'commercial_bidding' },
  { label: '套餐推廣召回', value: 'commercial_package' },
  { label: '用戶瀏覽歷史召回', value: 'user_browse' },
  { label: '用戶購買偏好召回', value: 'user_preference' },
  { label: '用戶地理位置召回', value: 'user_location' },
  { label: '熱門商家召回', value: 'hot_merchant' },
  { label: '熱門商品召回', value: 'hot_item' },
  { label: '平台主推召回', value: 'platform_recommend' },
]

const DIMENSION_LABEL: Record<RecallDimension, string> = {
  [RecallDimension.MERCHANT]: '商家維度',
  [RecallDimension.ITEM]: '商品維度',
  [RecallDimension.COMMERCIAL]: '商業維度',
  [RecallDimension.USER]: '用戶維度',
  [RecallDimension.PLATFORM]: '平台維度',
}

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

const TIME_SLOT_LABEL: Record<TimeSlot, string> = {
  [TimeSlot.ALL_DAY]: '全天',
  [TimeSlot.BREAKFAST]: '早餐',
  [TimeSlot.LUNCH]: '午餐',
  [TimeSlot.AFTERNOON]: '下午茶',
  [TimeSlot.DINNER]: '晚餐',
  [TimeSlot.NIGHT_SNACK]: '夜宵',
}

// Mock数据
const mockData: RecallStrategy[] = [
  {
    id: 1,
    name: '外賣午市多路召回',
    dimension: RecallDimension.MERCHANT,
    sources: ['new_store', 'merchant_rating', 'business_status'],
    priority: 1,
    recallCount: 200,
    app: AppType.SHANFENG,
    channels: [RecommendChannel.DELIVERY],
    timeSlots: [TimeSlot.LUNCH],
    status: ServiceStatus.ENABLED,
    description: '外賣頻道午市時段，優先召回新店和高評分商家',
    createdAt: '2024-01-15 10:30:00',
    updatedAt: '2024-01-20 14:20:00',
  },
  {
    id: 2,
    name: '團購個性化召回',
    dimension: RecallDimension.USER,
    sources: ['user_browse', 'user_preference', 'user_location'],
    priority: 2,
    recallCount: 150,
    app: AppType.MFOOD,
    channels: [RecommendChannel.GROUP_BUY],
    timeSlots: [TimeSlot.ALL_DAY],
    status: ServiceStatus.ENABLED,
    description: '基於用戶瀏覽歷史和購買偏好進行個性化召回',
    createdAt: '2024-01-16 09:15:00',
    updatedAt: '2024-01-19 16:45:00',
  },
  {
    id: 3,
    name: '超市熱門商品召回',
    dimension: RecallDimension.PLATFORM,
    sources: ['hot_item', 'item_sales', 'platform_recommend'],
    priority: 3,
    recallCount: 180,
    app: AppType.SHANFENG,
    channels: [RecommendChannel.SUPERMARKET],
    timeSlots: [TimeSlot.ALL_DAY],
    status: ServiceStatus.ENABLED,
    description: '超市頻道熱賣商品和平臺主推商品召回',
    createdAt: '2024-01-17 11:20:00',
    updatedAt: '2024-01-21 10:30:00',
  },
  {
    id: 4,
    name: '商業廣告主優先召回',
    dimension: RecallDimension.COMMERCIAL,
    sources: ['commercial_advertiser', 'commercial_bidding', 'commercial_package'],
    priority: 1,
    recallCount: 100,
    app: AppType.SHANFENG,
    channels: [RecommendChannel.DELIVERY, RecommendChannel.GROUP_BUY],
    timeSlots: [TimeSlot.LUNCH, TimeSlot.DINNER],
    status: ServiceStatus.ENABLED,
    description: '購買了推廣服務的廣告主優先召回',
    createdAt: '2024-01-18 14:00:00',
    updatedAt: '2024-01-22 09:15:00',
  },
  {
    id: 5,
    name: '大首頁混合召回',
    dimension: RecallDimension.MERCHANT,
    sources: ['new_store', 'hot_merchant', 'exclusive_merchant', 'advertiser'],
    priority: 4,
    recallCount: 250,
    app: AppType.MFOOD,
    channels: [RecommendChannel.HOME],
    timeSlots: [TimeSlot.ALL_DAY],
    status: ServiceStatus.ENABLED,
    description: '大首頁瀑布流混合召回策略，綜合新店、熱門、獨家和廣告主',
    createdAt: '2024-01-19 08:30:00',
    updatedAt: '2024-01-23 15:00:00',
  },
  {
    id: 6,
    name: '外賣早餐時段召回',
    dimension: RecallDimension.ITEM,
    sources: ['item_category', 'item_tag'],
    priority: 2,
    recallCount: 120,
    app: AppType.SHANFENG,
    channels: [RecommendChannel.DELIVERY],
    timeSlots: [TimeSlot.BREAKFAST],
    status: ServiceStatus.DISABLED,
    description: '早餐時段快餐、粥店優先召回',
    createdAt: '2024-01-20 07:00:00',
    updatedAt: '2024-01-20 07:00:00',
  },
]

export default function RecallStrategy() {
  const [searchForm] = Form.useForm()
  const [filteredData, setFilteredData] = useState<RecallStrategy[]>(mockData)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingRecord, setEditingRecord] = useState<RecallStrategy | null>(null)
  const [form] = Form.useForm()

  // 搜索处理
  const handleSearch = (values: any) => {
    let result = [...mockData]
    
    if (values.app !== undefined && values.app !== null) {
      result = result.filter(item => item.app === values.app)
    }
    
    if (values.name) {
      result = result.filter(item => item.name.includes(values.name))
    }
    
    if (values.dimension !== undefined && values.dimension !== null) {
      result = result.filter(item => item.dimension === values.dimension)
    }

    if (values.channel !== undefined && values.channel !== null) {
      result = result.filter(item => item.channels.includes(values.channel))
    }
    
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

  // 新增/编辑
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('表单数据:', values)
      message.success(editingRecord ? '編輯成功' : '新增成功')
      setModalVisible(false)
      form.resetFields()
      setEditingRecord(null)
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  // 删除
  const handleDelete = (record: RecallStrategy) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除召回策略「${record.name}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        message.success('刪除成功')
      },
    })
  }

  // 切换状态
  const handleToggleStatus = (record: RecallStrategy) => {
    const newStatus = record.status === ServiceStatus.ENABLED ? ServiceStatus.DISABLED : ServiceStatus.ENABLED
    const actionText = newStatus === ServiceStatus.ENABLED ? '啟用' : '停用'
    Modal.confirm({
      title: `確認${actionText}`,
      content: `確定要${actionText}策略「${record.name}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => message.success(`已${actionText}策略「${record.name}」`),
    })
  }

  const columns: ColumnsType<RecallStrategy> = [
    { 
      title: '策略名稱', 
      dataIndex: 'name', 
      key: 'name', 
      width: 180,
      render: (text) => <strong>{text}</strong>,
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
      title: '召回維度',
      dataIndex: 'dimension',
      key: 'dimension',
      width: 110,
      render: (v: RecallDimension) => (
        <Tag color={RECALL_DIMENSION_COLOR[v]}>{DIMENSION_LABEL[v]}</Tag>
      ),
    },
    {
      title: '業務頻道',
      dataIndex: 'channels',
      key: 'channels',
      width: 150,
      render: (channels: RecommendChannel[]) => (
        <Space size={[0, 4]} wrap>
          {channels.map(channel => (
            <Tag key={channel} color={CHANNEL_COLOR[channel]} style={{ margin: 0 }}>
              {CHANNEL_LABEL[channel]}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '召回源數量',
      dataIndex: 'sources',
      key: 'sources',
      width: 100,
      render: (sources: string[]) => (
        <Badge count={sources.length} style={{ backgroundColor: '#722ed1' }} />
      ),
    },
    {
      title: '召回數量',
      dataIndex: 'recallCount',
      key: 'recallCount',
      width: 90,
      render: (v: number) => `${v}條`,
    },
    {
      title: '優先級',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      sorter: (a, b) => a.priority - b.priority,
      render: (v: number) => (
        <Tag color={v <= 2 ? 'red' : v <= 4 ? 'orange' : 'default'}>
          {v}
        </Tag>
      ),
    },
    {
      title: '生效時段',
      dataIndex: 'timeSlots',
      key: 'timeSlots',
      width: 150,
      render: (timeSlots: TimeSlot[]) => (
        <Space size={[0, 4]} wrap>
          {timeSlots.map(slot => (
            <Tag key={slot} style={{ margin: 0, fontSize: 12 }}>
              {TIME_SLOT_LABEL[slot]}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: ServiceStatus) => (
        <Badge
          status={v === ServiceStatus.ENABLED ? 'success' : 'default'}
          text={v === ServiceStatus.ENABLED ? '啟用' : '停用'}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Button 
            type="link" 
            size="small" 
            icon={<EditOutlined />}
            onClick={() => {
              setEditingRecord(record)
              form.setFieldsValue({
                ...record,
                channels: record.channels,
                timeSlots: record.timeSlots,
                sources: record.sources,
              })
              setModalVisible(true)
            }}
          >
            編輯
          </Button>
          <Button 
            type="link" 
            size="small"
            danger={record.status === ServiceStatus.ENABLED}
            style={record.status !== ServiceStatus.ENABLED ? { color: '#52c41a' } : undefined}
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
          <Form.Item label="所屬品牌" name="app">
            <Select placeholder="全部" options={APP_OPTIONS} allowClear style={{ width: 120 }} />
          </Form.Item>
          <Form.Item label="策略名稱" name="name">
            <Input placeholder="請輸入策略名稱" allowClear style={{ width: 160 }} />
          </Form.Item>
          <Form.Item label="召回維度" name="dimension">
            <Select 
              placeholder="全部" 
              options={RECALL_DIMENSION_OPTIONS} 
              allowClear 
              style={{ width: 130 }}
            />
          </Form.Item>
          <Form.Item label="業務頻道" name="channel">
            <Select 
              placeholder="全部" 
              options={RECOMMEND_CHANNEL_OPTIONS} 
              allowClear 
              style={{ width: 140 }}
            />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select placeholder="全部" options={SERVICE_STATUS_OPTIONS} allowClear style={{ width: 100 }} />
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
            onClick={() => {
              setEditingRecord(null)
              form.resetFields()
              setModalVisible(true)
            }}
          >
            新增召回策略
          </Button>
        </Space>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<RecallStrategy>
          rowKey="id"
          columns={columns}
          dataSource={filteredData}
          scroll={{ x: 1400 }}
          pagination={{
            pageSize: 10,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showQuickJumper: true,
          }}
        />
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRecord ? '編輯召回策略' : '新增召回策略'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setModalVisible(false)
          form.resetFields()
          setEditingRecord(null)
        }}
        width={800}
        okText="確定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item 
            label="策略名稱" 
            name="name" 
            rules={[{ required: true, message: '請輸入策略名稱' }]}
          >
            <Input placeholder="例如：外賣午市多路召回" />
          </Form.Item>

          <Form.Item 
            label="所屬品牌" 
            name="app" 
            rules={[{ required: true, message: '請選擇所屬品牌' }]}
          >
            <Select placeholder="請選擇" options={APP_OPTIONS} />
          </Form.Item>

          <Form.Item 
            label="召回維度" 
            name="dimension" 
            rules={[{ required: true, message: '請選擇召回維度' }]}
          >
            <Select placeholder="請選擇" options={RECALL_DIMENSION_OPTIONS} />
          </Form.Item>

          <Form.Item 
            label="業務頻道" 
            name="channels" 
            rules={[{ required: true, message: '請選擇業務頻道' }]}
          >
            <Select 
              mode="multiple" 
              placeholder="請選擇" 
              options={RECOMMEND_CHANNEL_OPTIONS}
            />
          </Form.Item>

          <Form.Item 
            label="召回源" 
            name="sources" 
            rules={[{ required: true, message: '請選擇召回源' }]}
          >
            <Select 
              mode="multiple" 
              placeholder="請選擇召回源" 
              options={RECALL_SOURCE_OPTIONS}
            />
          </Form.Item>

          <Form.Item 
            label="召回候选集大小" 
            name="recallCount" 
            rules={[{ required: true, message: '請輸入召回數量' }]}
          >
            <InputNumber 
              min={10} 
              max={1000} 
              style={{ width: '100%' }}
              placeholder="例如：200"
              addonAfter="條"
            />
          </Form.Item>

          <Form.Item 
            label="優先級" 
            name="priority" 
            rules={[{ required: true, message: '請輸入優先級' }]}
            tooltip="數字越小優先級越高，建議1-100"
          >
            <InputNumber 
              min={1} 
              max={100} 
              style={{ width: '100%' }}
              placeholder="例如：1"
            />
          </Form.Item>

          <Form.Item 
            label="生效時段" 
            name="timeSlots" 
            rules={[{ required: true, message: '請選擇生效時段' }]}
          >
            <Select 
              mode="multiple" 
              placeholder="請選擇" 
              options={TIME_SLOT_OPTIONS}
            />
          </Form.Item>

          <Form.Item 
            label="備註說明" 
            name="description"
          >
            <TextArea 
              rows={3} 
              placeholder="請輸入策略說明，例如：外賣頻道午市時段，優先召回新店和高評分商家"
            />
          </Form.Item>

          <Form.Item 
            label="狀態" 
            name="status" 
            valuePropName="checked"
            getValueFromEvent={(checked) => checked ? ServiceStatus.ENABLED : ServiceStatus.DISABLED}
            getValueProps={(value) => ({ checked: value === ServiceStatus.ENABLED })}
          >
            <Switch 
              checkedChildren="啟用" 
              unCheckedChildren="停用"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
