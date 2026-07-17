import { useState } from 'react'
import { Button, Space, Table, Tag, Badge, Input, Select, Form, Modal, message, InputNumber, Switch, Descriptions, Divider, Card, Row, Col, Alert } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import BrandTag from '../../../components/BrandTag'
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  FilterOutlined,
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
  diversity: '多樣性控制',
  scatter: '打散規則',
  business: '業務規則干預',
  traffic: '流量調控',
}

const RULE_TYPE_COLOR: Record<string, string> = {
  diversity: 'blue',
  scatter: 'green',
  business: 'gold',
  traffic: 'purple',
}

// Mock数据 - 重排策略
const mockData = [
  {
    id: 1,
    name: '同類目商品打散',
    type: 'diversity',
    app: AppType.SHANFENG,
    channel: RecommendChannel.DELIVERY,
    config: {
      windowSize: 5,
      maxSameCategory: 2,
      description: '每5個商品中最多2個同類目',
    },
    priority: 1,
    status: ServiceStatus.ENABLED,
    createdAt: '2024-01-15 10:30:00',
    updatedAt: '2024-01-20 14:20:00',
  },
  {
    id: 2,
    name: '廣告類型打散',
    type: 'scatter',
    app: AppType.SHANFENG,
    channel: RecommendChannel.HOME,
    config: {
      minDistance: 3,
      adTypes: ['無敵星星', '流量廣告'],
      description: '相同廣告類型至少間隔3個坑位',
    },
    priority: 2,
    status: ServiceStatus.ENABLED,
    createdAt: '2024-01-16 09:15:00',
    updatedAt: '2024-01-19 16:45:00',
  },
  {
    id: 3,
    name: '新店保護優先',
    type: 'business',
    app: AppType.SHANFENG,
    channel: RecommendChannel.DELIVERY,
    config: {
      protectSlots: 3,
      newStoreDays: 7,
      description: '前3個坑位優先展示新店(開店7天內)',
    },
    priority: 1,
    status: ServiceStatus.ENABLED,
    createdAt: '2024-01-17 11:20:00',
    updatedAt: '2024-01-21 10:30:00',
  },
  {
    id: 4,
    name: '廣告流量占比控制',
    type: 'traffic',
    app: AppType.SHANFENG,
    channel: RecommendChannel.HOME,
    config: {
      maxAdRatio: 0.3,
      minOrganicRatio: 0.4,
      description: '廣告占比不超過30%,自然流量保底40%',
    },
    priority: 3,
    status: ServiceStatus.ENABLED,
    createdAt: '2024-01-18 14:00:00',
    updatedAt: '2024-01-22 09:15:00',
  },
  {
    id: 5,
    name: '團購多樣性控制',
    type: 'diversity',
    app: AppType.MFOOD,
    channel: RecommendChannel.GROUP_BUY,
    config: {
      windowSize: 6,
      maxSameMerchant: 1,
      description: '每6個商品中最多1個同商家',
    },
    priority: 2,
    status: ServiceStatus.ENABLED,
    createdAt: '2024-01-19 08:30:00',
    updatedAt: '2024-01-23 15:00:00',
  },
  {
    id: 6,
    name: '獨家商家優先展示',
    type: 'business',
    app: AppType.SHANFENG,
    channel: RecommendChannel.GROUP_BUY,
    config: {
      prioritySlots: 5,
      exclusiveType: '平台獨家',
      description: '前5個坑位優先展示獨家商家',
    },
    priority: 2,
    status: ServiceStatus.DISABLED,
    createdAt: '2024-01-20 07:00:00',
    updatedAt: '2024-01-20 07:00:00',
  },
]

export default function RankingRerank() {
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

    if (values.channel !== undefined && values.channel !== null) {
      result = result.filter(item => item.channel === values.channel)
    }

    if (values.type) {
      result = result.filter(item => item.type === values.type)
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
      content: `確定要刪除重排策略「${record.name}」嗎？`,
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
      content: `確定要${actionText}重排策略「${record.name}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => message.success(`已${actionText}策略「${record.name}」`),
    })
  }

  const columns: ColumnsType<any> = [
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
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (v: string) => (
        <Tag color={RULE_TYPE_COLOR[v]}>{RULE_TYPE_LABEL[v]}</Tag>
      ),
    },
    {
      title: '優先級',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      sorter: (a, b) => a.priority - b.priority,
      render: (v: number) => (
        <Tag color={v === 1 ? 'red' : v === 2 ? 'orange' : 'default'}>
          {v}
        </Tag>
      ),
    },
    {
      title: '配置說明',
      dataIndex: 'config',
      key: 'config',
      width: 250,
      render: (config: any) => config.description,
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
      {/* 告警提示 */}
      <Alert
        message="重排策略執行順序提示"
        description="重排策略按優先級從低到高依次執行：1.多樣性控制 → 2.打散規則 → 3.業務規則干預 → 4.流量調控。優先級數字越小越先執行。"
        type="info"
        showIcon
        icon={<FilterOutlined />}
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
          <Form.Item label="規則類型" name="type">
            <Select 
              placeholder="全部" 
              options={[
                { label: '多樣性控制', value: 'diversity' },
                { label: '打散規則', value: 'scatter' },
                { label: '業務規則干預', value: 'business' },
                { label: '流量調控', value: 'traffic' },
              ]} 
              allowClear 
              style={{ width: 150 }}
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
            新增重排策略
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
        title={editingRecord ? '編輯重排策略' : '新增重排策略'}
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
            <Input placeholder="例如：同類目商品打散" />
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
            name="type" 
            rules={[{ required: true, message: '請選擇規則類型' }]}
          >
            <Select 
              placeholder="請選擇" 
              options={[
                { label: '多樣性控制', value: 'diversity' },
                { label: '打散規則', value: 'scatter' },
                { label: '業務規則干預', value: 'business' },
                { label: '流量調控', value: 'traffic' },
              ]}
            />
          </Form.Item>

          <Form.Item 
            label="優先級" 
            name="priority" 
            rules={[{ required: true, message: '請輸入優先級' }]}
            tooltip="數字越小優先級越高,建議1-10"
          >
            <InputNumber 
              min={1} 
              max={10} 
              style={{ width: '100%' }}
              placeholder="例如：1"
            />
          </Form.Item>

          <Form.Item 
            label="配置說明" 
            name={['config', 'description']}
            rules={[{ required: true, message: '請輸入配置說明' }]}
          >
            <TextArea 
              rows={4} 
              placeholder="例如：每5個商品中最多2個同類目"
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
        title="重排策略詳情"
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
                <BrandTag value={viewingRecord.app} />
              </Descriptions.Item>
              <Descriptions.Item label="規則類型">
                <Tag color={RULE_TYPE_COLOR[viewingRecord.type]}>{RULE_TYPE_LABEL[viewingRecord.type]}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="業務頻道">
                {CHANNEL_LABEL[viewingRecord.channel]}
              </Descriptions.Item>
              <Descriptions.Item label="優先級">
                <Tag color={viewingRecord.priority === 1 ? 'red' : viewingRecord.priority === 2 ? 'orange' : 'default'}>
                  {viewingRecord.priority}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="狀態">
                <Badge
                  status={viewingRecord.status === ServiceStatus.ENABLED ? 'success' : 'default'}
                  text={viewingRecord.status === ServiceStatus.ENABLED ? '啟用' : '停用'}
                />
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">配置詳情</Divider>
            <div style={{ padding: 16, background: '#f5f5f5', borderRadius: 4 }}>
              <div style={{ marginBottom: 8, color: '#999' }}>規則說明:</div>
              <div style={{ fontSize: 14 }}>{viewingRecord.config.description}</div>
            </div>

            <Alert
              message="執行順序提示"
              description={`該策略優先級為${viewingRecord.priority},將在${viewingRecord.priority === 1 ? '第一' : viewingRecord.priority === 2 ? '第二' : '後續'}階段執行`}
              type="warning"
              showIcon
              style={{ marginTop: 16 }}
            />
          </>
        )}
      </Modal>
    </div>
  )
}
