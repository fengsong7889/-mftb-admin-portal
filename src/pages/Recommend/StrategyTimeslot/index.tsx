import { useState } from 'react'
import { Button, Space, Table, Tag, Badge, Input, Select, Form, Modal, message, InputNumber, Switch, Descriptions, Divider, Card, Row, Col, TimePicker, Alert } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, EyeOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { 
  AppType, 
  RecommendChannel, 
  ServiceStatus, 
  TimeSlot,
  APP_OPTIONS,
  SERVICE_STATUS_OPTIONS,
  RECOMMEND_CHANNEL_OPTIONS,
  TIME_SLOT_OPTIONS,
} from '../constants'

const { TextArea } = Input

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

const TIME_SLOT_TIME: Record<TimeSlot, string> = {
  [TimeSlot.ALL_DAY]: '00:00-23:59',
  [TimeSlot.BREAKFAST]: '06:00-09:00',
  [TimeSlot.LUNCH]: '11:00-13:30',
  [TimeSlot.AFTERNOON]: '14:00-16:30',
  [TimeSlot.DINNER]: '17:00-20:00',
  [TimeSlot.NIGHT_SNACK]: '20:30-02:00',
}

const TIME_SLOT_COLOR: Record<TimeSlot, string> = {
  [TimeSlot.ALL_DAY]: 'default',
  [TimeSlot.BREAKFAST]: 'orange',
  [TimeSlot.LUNCH]: 'red',
  [TimeSlot.AFTERNOON]: 'green',
  [TimeSlot.DINNER]: 'volcano',
  [TimeSlot.NIGHT_SNACK]: 'purple',
}

// Mock数据 - 时段策略
const mockData = [
  {
    id: 1,
    name: '早餐時段策略-外賣',
    app: AppType.SHANFENG,
    channel: RecommendChannel.DELIVERY,
    timeSlot: TimeSlot.BREAKFAST,
    timeRange: '06:00-09:00',
    config: {
      recallStrategy: '早餐專屬召回',
      boostMerchant: '早餐店優先',
      minDiscount: 10,
      prioritySlots: 2,
    },
    status: ServiceStatus.ENABLED,
    description: '早餐時段專屬策略,召回早餐店,前2坑位優先展示,折扣門檻10%',
    createdAt: '2024-01-15 10:30:00',
    updatedAt: '2024-01-20 14:20:00',
  },
  {
    id: 2,
    name: '午市高峰策略-外賣',
    app: AppType.SHANFENG,
    channel: RecommendChannel.DELIVERY,
    timeSlot: TimeSlot.LUNCH,
    timeRange: '11:00-13:30',
    config: {
      recallStrategy: '午市高峰召回',
      boostMerchant: '熱門餐廳優先',
      fastDelivery: true,
      candidateCount: 500,
    },
    status: ServiceStatus.ENABLED,
    description: '午市高峰時段加大召回量,優先快速配送商家',
    createdAt: '2024-01-16 09:15:00',
    updatedAt: '2024-01-19 16:45:00',
  },
  {
    id: 3,
    name: '下午茶時段策略-團購',
    app: AppType.SHANFENG,
    channel: RecommendChannel.GROUP_BUY,
    timeSlot: TimeSlot.AFTERNOON,
    timeRange: '14:00-16:30',
    config: {
      recallStrategy: '下午茶套餐召回',
      boostCategory: '咖啡廳、甜品店',
      groupSize: '2-4人',
    },
    status: ServiceStatus.ENABLED,
    description: '下午茶時段推廣咖啡廳和甜品店套餐',
    createdAt: '2024-01-17 11:20:00',
    updatedAt: '2024-01-21 10:30:00',
  },
  {
    id: 4,
    name: '晚餐高峰策略-外賣',
    app: AppType.SHANFENG,
    channel: RecommendChannel.DELIVERY,
    timeSlot: TimeSlot.DINNER,
    timeRange: '17:00-20:00',
    config: {
      recallStrategy: '晚餐高峰召回',
      boostMerchant: '正餐餐廳優先',
      familyMeal: true,
      candidateCount: 600,
    },
    status: ServiceStatus.ENABLED,
    description: '晚餐高峰最大召回量,優先正餐餐廳和家庭套餐',
    createdAt: '2024-01-18 14:00:00',
    updatedAt: '2024-01-22 09:15:00',
  },
  {
    id: 5,
    name: '夜宵時段策略-外賣',
    app: AppType.MFOOD,
    channel: RecommendChannel.DELIVERY,
    timeSlot: TimeSlot.NIGHT_SNACK,
    timeRange: '20:30-02:00',
    config: {
      recallStrategy: '夜宵商家召回',
      boostCategory: '燒烤、快餐、飲品',
      nightDelivery: true,
      candidateCount: 200,
    },
    status: ServiceStatus.ENABLED,
    description: '夜宵時段召回支持夜間配送商家,燒烤快餐為主',
    createdAt: '2024-01-19 08:30:00',
    updatedAt: '2024-01-23 15:00:00',
  },
  {
    id: 6,
    name: '全天策略-大首頁',
    app: AppType.SHANFENG,
    channel: RecommendChannel.HOME,
    timeSlot: TimeSlot.ALL_DAY,
    timeRange: '00:00-23:59',
    config: {
      recallStrategy: '全天多路召回',
      mixRatio: {
        ad: 0.3,
        organic: 0.7,
      },
      candidateCount: 1000,
    },
    status: ServiceStatus.ENABLED,
    description: '大首頁全天策略,廣告占比30%,自然流量70%',
    createdAt: '2024-01-20 07:00:00',
    updatedAt: '2024-01-24 10:00:00',
  },
]

export default function StrategyTimeslot() {
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

    if (values.timeSlot !== undefined && values.timeSlot !== null) {
      result = result.filter(item => item.timeSlot === values.timeSlot)
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
      content: `確定要刪除時段策略「${record.name}」嗎？`,
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
      width: 120,
      render: (v: TimeSlot) => (
        <Tag color={TIME_SLOT_COLOR[v]}>{TIME_SLOT_LABEL[v]}</Tag>
      ),
    },
    {
      title: '時間範圍',
      dataIndex: 'timeRange',
      key: 'timeRange',
      width: 120,
      render: (v: string) => (
        <Space>
          <ClockCircleOutlined style={{ color: '#999' }} />
          {v}
        </Space>
      ),
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
              <Tag style={{ margin: 0 }}>{key}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}</Tag>
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
      {/* 提示 */}
      <Alert
        message="時段策略說明"
        description="時段策略用於配置不同時間段的推薦策略,支持6個時段:全天(00:00-23:59)、早餐(06:00-09:00)、午餐(11:00-13:30)、下午茶(14:00-16:30)、晚餐(17:00-20:00)、夜宵(20:30-02:00)。"
        type="info"
        showIcon
        icon={<ClockCircleOutlined />}
        style={{ marginBottom: 16 }}
      />

      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline" form={searchForm} onFinish={handleSearch}>
          <Form.Item label="所屬品牌" name="app">
            <Select placeholder="全部" options={APP_OPTIONS} allowClear style={{ width: 120 }} />
          </Form.Item>
          <Form.Item label="策略名稱" name="name">
            <Input placeholder="請輸入策略名稱" allowClear style={{ width: 180 }} />
          </Form.Item>
          <Form.Item label="生效時段" name="timeSlot">
            <Select 
              placeholder="全部" 
              options={TIME_SLOT_OPTIONS} 
              allowClear 
              style={{ width: 120 }}
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
            新增時段策略
          </Button>
        </Space>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredData}
          scroll={{ x: 1200 }}
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
        title={editingRecord ? '編輯時段策略' : '新增時段策略'}
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
            <Input placeholder="例如：早餐時段策略-外賣" />
          </Form.Item>

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
  "recallStrategy": "早餐專屬召回",
  "boostMerchant": "早餐店優先",
  "minDiscount": 10,
  "prioritySlots": 2
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
        title="時段策略詳情"
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
              <Descriptions.Item label="生效時段">
                <Tag color={TIME_SLOT_COLOR[viewingRecord.timeSlot]}>
                  {TIME_SLOT_LABEL[viewingRecord.timeSlot]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="業務頻道">
                {CHANNEL_LABEL[viewingRecord.channel]}
              </Descriptions.Item>
              <Descriptions.Item label="時間範圍">
                <Space>
                  <ClockCircleOutlined style={{ color: '#999' }} />
                  {viewingRecord.timeRange}
                </Space>
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
                  {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
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
