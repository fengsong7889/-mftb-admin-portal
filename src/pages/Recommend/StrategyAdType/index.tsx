import { useState } from 'react'
import { Button, Space, Table, Tag, Badge, Input, Select, Form, Modal, message, InputNumber, Switch, Descriptions, Divider, Card, Row, Col } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, EyeOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { 
  AppType, 
  RecommendChannel, 
  ServiceStatus, 
  AlgorithmType,
  TimeSlot,
  APP_OPTIONS,
  SERVICE_STATUS_OPTIONS,
  RECOMMEND_CHANNEL_OPTIONS,
  ALGORITHM_TYPE_OPTIONS,
  TIME_SLOT_OPTIONS,
} from '../constants'

const { TextArea } = Input

const ALGORITHM_LABEL: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: '無敵星星',
  [AlgorithmType.NEW_STORE_AD]: '新店廣告',
  [AlgorithmType.HOT_REVIVE_AD]: '盤活復蘇',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: '獨家商家',
  [AlgorithmType.TRAFFIC_AD]: '流量廣告',
  [AlgorithmType.GUESS_YOU_LIKE]: '猜你喜歡',
  [AlgorithmType.ORGANIC_TRAFFIC]: '自然流量',
  [AlgorithmType.SEARCH_ALGORITHM]: '搜索算法',
}

const ALGORITHM_COLOR: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: 'gold',
  [AlgorithmType.NEW_STORE_AD]: 'green',
  [AlgorithmType.HOT_REVIVE_AD]: 'volcano',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: 'purple',
  [AlgorithmType.TRAFFIC_AD]: 'cyan',
  [AlgorithmType.GUESS_YOU_LIKE]: 'blue',
  [AlgorithmType.ORGANIC_TRAFFIC]: 'lime',
  [AlgorithmType.SEARCH_ALGORITHM]: 'magenta',
}

const CHANNEL_LABEL: Record<RecommendChannel, string> = {
  [RecommendChannel.HOME]: '大首頁',
  [RecommendChannel.DELIVERY]: '外賣',
  [RecommendChannel.GROUP_BUY]: '團購',
  [RecommendChannel.SUPERMARKET]: '超市',
}

const TIME_SLOT_LABEL: Record<TimeSlot, string> = {
  [TimeSlot.ALL_DAY]: '全天',
  [TimeSlot.BREAKFAST]: '早餐',
  [TimeSlot.LUNCH]: '午餐',
  [TimeSlot.AFTERNOON]: '下午茶',
  [TimeSlot.DINNER]: '晚餐',
  [TimeSlot.NIGHT_SNACK]: '夜宵',
}

// Mock数据 - 广告类型策略
const mockData = [
  {
    id: 1,
    algorithmType: AlgorithmType.NEW_STORE_AD,
    name: '新店推廣策略-外賣',
    app: AppType.SHANFENG,
    channel: RecommendChannel.DELIVERY,
    timeSlot: TimeSlot.ALL_DAY,
    config: {
      protectionDays: 7,
      minRating: 4.0,
      prioritySlots: 3,
      recallStrategy: '新店優先召回',
      displayPosition: '前3坑位',
    },
    status: ServiceStatus.ENABLED,
    description: '外賣頻道新店保護期7天,前3坑位優先展示,評分門檻4.0',
    createdAt: '2024-01-15 10:30:00',
    updatedAt: '2024-01-20 14:20:00',
  },
  {
    id: 2,
    algorithmType: AlgorithmType.HOT_REVIVE_AD,
    name: '盤活復蘇策略-團購',
    app: AppType.SHANFENG,
    channel: RecommendChannel.GROUP_BUY,
    timeSlot: TimeSlot.ALL_DAY,
    config: {
      inactiveDays: 30,
      maxDisplayFrequency: 2,
      recallStrategy: '盤活復蘇召回',
      frequencyControl: '每用戶每天最多展示2次',
    },
    status: ServiceStatus.ENABLED,
    description: '團購頻道30天無訂單商家盤活,控制展示頻率避免過度打擾',
    createdAt: '2024-01-16 09:15:00',
    updatedAt: '2024-01-19 16:45:00',
  },
  {
    id: 3,
    algorithmType: AlgorithmType.INVINCIBLE_STAR,
    name: '無敵星星競價策略',
    app: AppType.SHANFENG,
    channel: RecommendChannel.HOME,
    timeSlot: TimeSlot.LUNCH,
    config: {
      bidMode: 'CPC',
      minBid: 1.0,
      qualityScoreWeight: 0.4,
      rankingRule: '出價*質量分',
    },
    status: ServiceStatus.ENABLED,
    description: '大首頁午市時段無敵星星競價排名,出價*質量分排序',
    createdAt: '2024-01-17 11:20:00',
    updatedAt: '2024-01-21 10:30:00',
  },
  {
    id: 4,
    algorithmType: AlgorithmType.TRAFFIC_AD,
    name: '流量廣告策略-超市',
    app: AppType.MFOOD,
    channel: RecommendChannel.SUPERMARKET,
    timeSlot: TimeSlot.ALL_DAY,
    config: {
      bidMode: 'CPM',
      minBid: 5.0,
      dailyBudget: 1000,
      budgetControl: '日預算控制',
    },
    status: ServiceStatus.ENABLED,
    description: '超市頻道流量廣告CPM計費,日預算1000元',
    createdAt: '2024-01-18 14:00:00',
    updatedAt: '2024-01-22 09:15:00',
  },
  {
    id: 5,
    algorithmType: AlgorithmType.GUESS_YOU_LIKE,
    name: '猜你喜歡個性化策略',
    app: AppType.SHANFENG,
    channel: RecommendChannel.HOME,
    timeSlot: TimeSlot.ALL_DAY,
    config: {
      recallStrategy: '用戶畫像召回',
      explorationRate: 0.1,
      algorithm: 'Epsilon-Greedy',
      balanceStrategy: '探索與利用平衡',
    },
    status: ServiceStatus.ENABLED,
    description: '大首頁猜你喜歡基於用戶畫像,探索率10%平衡新舊推薦',
    createdAt: '2024-01-19 08:30:00',
    updatedAt: '2024-01-23 15:00:00',
  },
  {
    id: 6,
    algorithmType: AlgorithmType.EXCLUSIVE_MERCHANT,
    name: '獨家商家優先策略',
    app: AppType.SHANFENG,
    channel: RecommendChannel.GROUP_BUY,
    timeSlot: TimeSlot.DINNER,
    config: {
      exclusiveType: '平台獨家',
      prioritySlots: 5,
      minRating: 4.5,
      displayRule: '晚市前5坑位優先',
    },
    status: ServiceStatus.ENABLED,
    description: '團購晚市時段獨家商家前5坑位優先展示,評分門檻4.5',
    createdAt: '2024-01-20 07:00:00',
    updatedAt: '2024-01-24 10:00:00',
  },
]

export default function StrategyAdType() {
  const [searchForm] = Form.useForm()
  const [filteredData, setFilteredData] = useState(mockData)
  const [modalVisible, setModalVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [editingRecord, setEditingRecord] = useState<any>(null)
  const [viewingRecord, setViewingRecord] = useState<any>(null)
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

    if (values.algorithmType !== undefined && values.algorithmType !== null) {
      result = result.filter(item => item.algorithmType === values.algorithmType)
    }

    if (values.channel !== undefined && values.channel !== null) {
      result = result.filter(item => item.channel === values.channel)
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
  const handleDelete = (record: any) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除廣告策略「${record.name}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        message.success('刪除成功')
      },
    })
  }

  // 切换状态
  const handleToggleStatus = (record: any) => {
    const newStatus = record.status === ServiceStatus.ENABLED ? ServiceStatus.DISABLED : ServiceStatus.ENABLED
    message.success(`已${newStatus === ServiceStatus.ENABLED ? '啟用' : '停用'}策略「${record.name}」`)
  }

  const columns: ColumnsType<any> = [
    { 
      title: '策略名稱', 
      dataIndex: 'name', 
      key: 'name', 
      width: 200,
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
      title: '廣告類型',
      dataIndex: 'algorithmType',
      key: 'algorithmType',
      width: 120,
      render: (v: AlgorithmType) => (
        <Tag color={ALGORITHM_COLOR[v]}>{ALGORITHM_LABEL[v]}</Tag>
      ),
    },
    { 
      title: '業務頻道', 
      dataIndex: 'channel', 
      key: 'channel', 
      width: 110,
      render: (v: RecommendChannel) => CHANNEL_LABEL[v],
    },
    {
      title: '生效時段',
      dataIndex: 'timeSlot',
      key: 'timeSlot',
      width: 100,
      render: (v: TimeSlot) => TIME_SLOT_LABEL[v],
    },
    {
      title: '策略配置',
      dataIndex: 'config',
      key: 'config',
      width: 250,
      render: (config: any) => (
        <div style={{ fontSize: 12 }}>
          {Object.entries(config).slice(0, 2).map(([key, value]) => (
            <div key={key} style={{ marginBottom: 4 }}>
              <Tag style={{ margin: 0 }}>{key}: {value}</Tag>
            </div>
          ))}
          {Object.keys(config).length > 2 && (
            <div style={{ color: '#999' }}>+{Object.keys(config).length - 2} 更多配置</div>
          )}
        </div>
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
              form.setFieldsValue(record)
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
            <Input placeholder="請輸入策略名稱" allowClear style={{ width: 180 }} />
          </Form.Item>
          <Form.Item label="廣告類型" name="algorithmType">
            <Select 
              placeholder="全部" 
              options={ALGORITHM_TYPE_OPTIONS} 
              allowClear 
              style={{ width: 140 }}
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
            新增廣告策略
          </Button>
        </Space>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table
          rowKey="id"
          columns={columns}
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

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRecord ? '編輯廣告策略' : '新增廣告策略'}
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
            <Input placeholder="例如：新店推廣策略-外賣" />
          </Form.Item>

          <Form.Item 
            label="所屬品牌" 
            name="app" 
            rules={[{ required: true, message: '請選擇所屬品牌' }]}
          >
            <Select placeholder="請選擇" options={APP_OPTIONS} />
          </Form.Item>

          <Form.Item 
            label="廣告類型" 
            name="algorithmType" 
            rules={[{ required: true, message: '請選擇廣告類型' }]}
          >
            <Select placeholder="請選擇" options={ALGORITHM_TYPE_OPTIONS} />
          </Form.Item>

          <Form.Item 
            label="業務頻道" 
            name="channel" 
            rules={[{ required: true, message: '請選擇業務頻道' }]}
          >
            <Select placeholder="請選擇" options={RECOMMEND_CHANNEL_OPTIONS} />
          </Form.Item>

          <Form.Item 
            label="生效時段" 
            name="timeSlot" 
            rules={[{ required: true, message: '請選擇生效時段' }]}
          >
            <Select placeholder="請選擇" options={TIME_SLOT_OPTIONS} />
          </Form.Item>

          <Form.Item 
            label="策略配置 (JSON格式)" 
            name="config"
            tooltip="請以JSON格式配置策略參數"
          >
            <TextArea 
              rows={8} 
              placeholder={`示例：
{
  "protectionDays": 7,
  "minRating": 4.0,
  "prioritySlots": 3,
  "recallStrategy": "新店優先召回"
}`}
            />
          </Form.Item>

          <Form.Item 
            label="備註說明" 
            name="description"
          >
            <TextArea 
              rows={3} 
              placeholder="請輸入策略說明"
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

      {/* 查看详情弹窗 */}
      <Modal
        title="廣告策略詳情"
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
              <Descriptions.Item label="策略名稱" span={2}>
                <strong>{viewingRecord.name}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="所屬品牌">
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
              <Descriptions.Item label="廣告類型">
                <Tag color={ALGORITHM_COLOR[viewingRecord.algorithmType]}>
                  {ALGORITHM_LABEL[viewingRecord.algorithmType]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="業務頻道">
                {CHANNEL_LABEL[viewingRecord.channel]}
              </Descriptions.Item>
              <Descriptions.Item label="生效時段">
                {TIME_SLOT_LABEL[viewingRecord.timeSlot]}
              </Descriptions.Item>
              <Descriptions.Item label="狀態">
                <Badge
                  status={viewingRecord.status === ServiceStatus.ENABLED ? 'success' : 'default'}
                  text={viewingRecord.status === ServiceStatus.ENABLED ? '啟用' : '停用'}
                />
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">策略配置</Divider>
            <Descriptions bordered column={1} size="small">
              {Object.entries(viewingRecord.config).map(([key, value]) => (
                <Descriptions.Item key={key} label={key}>
                  {Array.isArray(value) ? value.join(', ') : String(value)}
                </Descriptions.Item>
              ))}
            </Descriptions>

            {viewingRecord.description && (
              <>
                <Divider orientation="left">備註說明</Divider>
                <div style={{ padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
                  {viewingRecord.description}
                </div>
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  )
}
