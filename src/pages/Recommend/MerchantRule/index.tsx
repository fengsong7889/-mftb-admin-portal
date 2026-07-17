import { useState } from 'react'
import { Button, Space, Table, Tag, Badge, Input, Select, Form, Modal, message, InputNumber, Switch, Descriptions, Divider, Card, Row, Col, Alert } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import BrandTag from '../../../components/BrandTag'
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  ShopOutlined,
} from '@ant-design/icons'
import { 
  AppType, 
  RecommendChannel, 
  ServiceStatus, 
  APP_OPTIONS,
  SERVICE_STATUS_OPTIONS,
  RECOMMEND_CHANNEL_OPTIONS,
} from '../constants'

const { TextArea } = Input

const CHANNEL_LABEL: Record<RecommendChannel, string> = {
  [RecommendChannel.HOME]: '大首頁',
  [RecommendChannel.DELIVERY]: '外賣',
  [RecommendChannel.GROUP_BUY]: '團購',
  [RecommendChannel.SUPERMARKET]: '超市',
}

const RULE_TYPE_LABEL: Record<string, string> = {
  new_store: '新店推薦',
  high_rating: '高評分推薦',
  popular: '熱門銷量推薦',
  exclusive: '獨家商家推薦',
  promotion: '促銷活動推薦',
  nearby: '附近商家推薦',
}

const RULE_TYPE_COLOR: Record<string, string> = {
  new_store: 'green',
  high_rating: 'gold',
  popular: 'blue',
  exclusive: 'purple',
  promotion: 'volcano',
  nearby: 'cyan',
}

// Mock数据 - 商家推荐规则
const mockData = [
  {
    id: 1,
    name: '新店推薦規則-外賣',
    app: AppType.SHANFENG,
    channel: RecommendChannel.DELIVERY,
    ruleType: 'new_store',
    config: {
      newStoreDays: 7,
      minRating: 4.0,
      prioritySlots: 3,
      dailyBudget: 500,
      boostFactor: 1.5,
      condition: '開店7天內且評分≥4.0',
    },
    status: ServiceStatus.ENABLED,
    description: '外賣新店保護期7天,前3坑位優先展示,日預算500元,提升因子1.5',
    createdAt: '2024-01-15 10:30:00',
    updatedAt: '2024-01-20 14:20:00',
  },
  {
    id: 2,
    name: '高評分商家推薦-團購',
    app: AppType.SHANFENG,
    channel: RecommendChannel.GROUP_BUY,
    ruleType: 'high_rating',
    config: {
      minRating: 4.8,
      minReviewCount: 100,
      prioritySlots: 5,
      boostFactor: 1.3,
      condition: '評分≥4.8且評論數≥100',
    },
    status: ServiceStatus.ENABLED,
    description: '團購高評分商家推薦,評分門檻4.8,評論數100+,前5坑位優先',
    createdAt: '2024-01-16 09:15:00',
    updatedAt: '2024-01-19 16:45:00',
  },
  {
    id: 3,
    name: '熱門銷量推薦-大首頁',
    app: AppType.SHANFENG,
    channel: RecommendChannel.HOME,
    ruleType: 'popular',
    config: {
      minMonthlySales: 1000,
      minRating: 4.5,
      prioritySlots: 4,
      boostFactor: 1.4,
      condition: '月銷量≥1000且評分≥4.5',
    },
    status: ServiceStatus.ENABLED,
    description: '大首頁熱門商家推薦,月銷量1000+,評分4.5+,前4坑位優先',
    createdAt: '2024-01-17 11:20:00',
    updatedAt: '2024-01-21 10:30:00',
  },
  {
    id: 4,
    name: '獨家商家推薦-團購',
    app: AppType.SHANFENG,
    channel: RecommendChannel.GROUP_BUY,
    ruleType: 'exclusive',
    config: {
      exclusiveType: '平台獨家',
      minRating: 4.5,
      prioritySlots: 6,
      boostFactor: 1.6,
      condition: '平台獨家商家且評分≥4.5',
    },
    status: ServiceStatus.ENABLED,
    description: '團購獨家商家優先推薦,前6坑位展示,提升因子1.6',
    createdAt: '2024-01-18 14:00:00',
    updatedAt: '2024-01-22 09:15:00',
  },
  {
    id: 5,
    name: '促銷活動推薦-超市',
    app: AppType.MFOOD,
    channel: RecommendChannel.SUPERMARKET,
    ruleType: 'promotion',
    config: {
      minDiscount: 15,
      promotionTypes: ['限時秒殺', '满减活動', '買一送一'],
      prioritySlots: 3,
      boostFactor: 1.2,
      condition: '折扣≥15%且參與促銷活動',
    },
    status: ServiceStatus.ENABLED,
    description: '超市促銷活動商家推薦,折扣15%+,前3坑位優先',
    createdAt: '2024-01-19 08:30:00',
    updatedAt: '2024-01-23 15:00:00',
  },
  {
    id: 6,
    name: '附近商家推薦-外賣',
    app: AppType.SHANFENG,
    channel: RecommendChannel.DELIVERY,
    ruleType: 'nearby',
    config: {
      maxDistance: 3000,
      minRating: 4.2,
      prioritySlots: 5,
      boostFactor: 1.3,
      distanceWeight: 0.3,
      condition: '距離≤3km且評分≥4.2',
    },
    status: ServiceStatus.ENABLED,
    description: '外賣附近商家推薦,3公里內,評分4.2+,距離權重0.3',
    createdAt: '2024-01-20 07:00:00',
    updatedAt: '2024-01-24 10:00:00',
  },
]

export default function MerchantRule() {
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

    if (values.ruleType) {
      result = result.filter(item => item.ruleType === values.ruleType)
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
      content: `確定要刪除商家規則「${record.name}」嗎？`,
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
    const actionText = newStatus === ServiceStatus.ENABLED ? '啟用' : '停用'
    Modal.confirm({
      title: `確認${actionText}`,
      content: `確定要${actionText}商家規則「${record.name}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => message.success(`已${actionText}規則「${record.name}」`),
    })
  }

  const columns: ColumnsType<any> = [
    { 
      title: '規則名稱', 
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
        <BrandTag value={v} />
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
      title: '規則類型',
      dataIndex: 'ruleType',
      key: 'ruleType',
      width: 130,
      render: (v: string) => (
        <Tag color={RULE_TYPE_COLOR[v]}>{RULE_TYPE_LABEL[v]}</Tag>
      ),
    },
    {
      title: '優先坑位',
      dataIndex: 'config',
      key: 'prioritySlots',
      width: 90,
      render: (config: any) => `前${config.prioritySlots}個`,
    },
    {
      title: '提升因子',
      dataIndex: 'config',
      key: 'boostFactor',
      width: 90,
      render: (config: any) => (
        <Badge count={`×${config.boostFactor}`} style={{ backgroundColor: config.boostFactor > 1.5 ? '#52c41a' : '#1890ff' }} />
      ),
    },
    {
      title: '觸發條件',
      dataIndex: 'config',
      key: 'condition',
      width: 200,
      render: (config: any) => config.condition,
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
            style={record.status !== ServiceStatus.ENABLED ? { color: '#52c41a' } : undefined}
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
        message="商家推薦規則說明"
        description="商家推薦規則用於配置特定類型商家的優先展示策略,包括新店、高評分、熱門銷量、獨家商家、促銷活動、附近商家等。每個規則包含觸發條件、優先坑位、提升因子等配置。"
        type="info"
        showIcon
        icon={<ShopOutlined />}
        style={{ marginBottom: 16 }}
      />

      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline" form={searchForm} onFinish={handleSearch}>
          <Form.Item label="所屬品牌" name="app">
            <Select placeholder="全部" options={APP_OPTIONS} allowClear style={{ width: 120 }} />
          </Form.Item>
          <Form.Item label="規則名稱" name="name">
            <Input placeholder="請輸入規則名稱" allowClear style={{ width: 180 }} />
          </Form.Item>
          <Form.Item label="規則類型" name="ruleType">
            <Select 
              placeholder="全部" 
              options={[
                { label: '新店推薦', value: 'new_store' },
                { label: '高評分推薦', value: 'high_rating' },
                { label: '熱門銷量推薦', value: 'popular' },
                { label: '獨家商家推薦', value: 'exclusive' },
                { label: '促銷活動推薦', value: 'promotion' },
                { label: '附近商家推薦', value: 'nearby' },
              ]} 
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
            新增商家規則
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
        title={editingRecord ? '編輯商家規則' : '新增商家規則'}
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
            label="規則名稱" 
            name="name" 
            rules={[{ required: true, message: '請輸入規則名稱' }]}
          >
            <Input placeholder="例如：新店推薦規則-外賣" />
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
            label="規則類型" 
            name="ruleType" 
            rules={[{ required: true, message: '請選擇規則類型' }]}
          >
            <Select 
              placeholder="請選擇" 
              options={[
                { label: '新店推薦', value: 'new_store' },
                { label: '高評分推薦', value: 'high_rating' },
                { label: '熱門銷量推薦', value: 'popular' },
                { label: '獨家商家推薦', value: 'exclusive' },
                { label: '促銷活動推薦', value: 'promotion' },
                { label: '附近商家推薦', value: 'nearby' },
              ]}
            />
          </Form.Item>

          <Form.Item 
            label="配置參數 (JSON格式)" 
            name="config"
            tooltip="請以JSON格式配置規則參數"
          >
            <TextArea 
              rows={10} 
              placeholder={`示例(新店推薦):
{
  "newStoreDays": 7,
  "minRating": 4.0,
  "prioritySlots": 3,
  "dailyBudget": 500,
  "boostFactor": 1.5,
  "condition": "開店7天內且評分≥4.0"
}`}
            />
          </Form.Item>

          <Form.Item 
            label="備註說明" 
            name="description"
          >
            <TextArea 
              rows={3} 
              placeholder="請輸入規則說明"
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
        title="商家規則詳情"
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
              <Descriptions.Item label="規則名稱" span={2}>
                <strong>{viewingRecord.name}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="所屬品牌">
                <BrandTag value={viewingRecord.app} />
              </Descriptions.Item>
              <Descriptions.Item label="規則類型">
                <Tag color={RULE_TYPE_COLOR[viewingRecord.ruleType]}>
                  {RULE_TYPE_LABEL[viewingRecord.ruleType]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="業務頻道">
                {CHANNEL_LABEL[viewingRecord.channel]}
              </Descriptions.Item>
              <Descriptions.Item label="優先坑位">
                前{viewingRecord.config.prioritySlots}個
              </Descriptions.Item>
              <Descriptions.Item label="提升因子">
                <Badge count={`×${viewingRecord.config.boostFactor}`} style={{ backgroundColor: viewingRecord.config.boostFactor > 1.5 ? '#52c41a' : '#1890ff' }} />
              </Descriptions.Item>
              <Descriptions.Item label="狀態">
                <Badge
                  status={viewingRecord.status === ServiceStatus.ENABLED ? 'success' : 'default'}
                  text={viewingRecord.status === ServiceStatus.ENABLED ? '啟用' : '停用'}
                />
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">完整配置</Divider>
            <Descriptions bordered column={1} size="small">
              {Object.entries(viewingRecord.config).map(([key, value]) => (
                <Descriptions.Item key={key} label={key}>
                  {Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
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
