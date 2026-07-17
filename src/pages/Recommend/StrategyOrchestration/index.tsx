import { useState } from 'react'
import { Button, Space, Table, Tag, Badge, Input, Select, Form, Modal, message, InputNumber, Switch, Descriptions, Divider, Card, Row, Col, Timeline, Alert } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import BrandTag from '../../../components/BrandTag'
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  BranchesOutlined,
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

const TRIGGER_TYPE_LABEL: Record<string, string> = {
  search: '搜索觸發',
  browse: '瀏覽觸發',
  time: '時段觸發',
  event: '事件觸發',
}

const TRIGGER_TYPE_COLOR: Record<string, string> = {
  search: 'blue',
  browse: 'green',
  time: 'gold',
  event: 'purple',
}

// Mock数据 - 策略编排
const mockData = [
  {
    id: 1,
    name: '外賣午市完整策略鏈路',
    app: AppType.SHANFENG,
    channel: RecommendChannel.DELIVERY,
    triggerType: 'search',
    steps: [
      { order: 1, type: 'recall', name: '召回層', strategy: '午市高峰召回策略', desc: '召回500個候選' },
      { order: 2, type: 'coarse', name: '粗排層', strategy: '外賣粗排過濾規則', desc: '過濾低質量商家,保留300條' },
      { order: 3, type: 'fine', name: '精排層', strategy: '外賣CTR預估模型', desc: 'CTR+CVR多目標排序' },
      { order: 4, type: 'rerank', name: '重排層', strategy: '午市多樣性控制', desc: '同類目打散+新店保護' },
      { order: 5, type: 'display', name: '展示層', strategy: '瀑布流展示', desc: '前3坑位新店保護' },
    ],
    status: ServiceStatus.ENABLED,
    description: '外賣午市完整推薦鏈路:召回→粗排→精排→重排→展示',
    createdAt: '2024-01-15 10:30:00',
    updatedAt: '2024-01-20 14:20:00',
  },
  {
    id: 2,
    name: '團購晚市推廣鏈路',
    app: AppType.SHANFENG,
    channel: RecommendChannel.GROUP_BUY,
    triggerType: 'time',
    steps: [
      { order: 1, type: 'recall', name: '召回層', strategy: '團購熱門召回', desc: '召回400個候選' },
      { order: 2, type: 'fine', name: '精排層', strategy: '團購CVR預估模型', desc: '轉化率優先排序' },
      { order: 3, type: 'rerank', name: '重排層', strategy: '獨家商家優先', desc: '前5坑位獨家商家' },
      { order: 4, type: 'display', name: '展示層', strategy: '列表展示', desc: '晚市時段展示' },
    ],
    status: ServiceStatus.ENABLED,
    description: '團購晚市時段推薦鏈路:召回→精排→獨家商家優先→展示',
    createdAt: '2024-01-16 09:15:00',
    updatedAt: '2024-01-19 16:45:00',
  },
  {
    id: 3,
    name: '大首頁瀑布流推薦鏈路',
    app: AppType.SHANFENG,
    channel: RecommendChannel.HOME,
    triggerType: 'browse',
    steps: [
      { order: 1, type: 'recall', name: '召回層', strategy: '多路召回融合', desc: '召回1000個候選' },
      { order: 2, type: 'coarse', name: '粗排層', strategy: '大首頁粗排綜合規則', desc: '過濾低質量,保留500條' },
      { order: 3, type: 'fine', name: '精排層', strategy: '綜合排序模型', desc: 'CTR+CVR+GMV多目標' },
      { order: 4, type: 'rerank', name: '重排層', strategy: '流量調控+打散', desc: '廣告占比30%' },
      { order: 5, type: 'display', name: '展示層', strategy: '瀑布流', desc: '混合展示' },
    ],
    status: ServiceStatus.ENABLED,
    description: '大首頁瀑布流完整推薦鏈路,支持廣告和自然流量混合',
    createdAt: '2024-01-17 11:20:00',
    updatedAt: '2024-01-21 10:30:00',
  },
  {
    id: 4,
    name: '超市即時推薦鏈路',
    app: AppType.MFOOD,
    channel: RecommendChannel.SUPERMARKET,
    triggerType: 'search',
    steps: [
      { order: 1, type: 'recall', name: '召回層', strategy: '庫存優先召回', desc: '召回300個候選' },
      { order: 2, type: 'fine', name: '精排層', strategy: '超市多目標優化模型', desc: 'CTR+CVR+配送時間' },
      { order: 3, type: 'display', name: '展示層', strategy: '列表展示', desc: '按距離排序' },
    ],
    status: ServiceStatus.ENABLED,
    description: '超市快速推薦鏈路:召回→精排→展示(簡化版)',
    createdAt: '2024-01-18 14:00:00',
    updatedAt: '2024-01-22 09:15:00',
  },
]

export default function StrategyOrchestration() {
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

    if (values.triggerType) {
      result = result.filter(item => item.triggerType === values.triggerType)
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
      content: `確定要刪除策略鏈路「${record.name}」嗎？`,
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
      content: `確定要${actionText}鏈路「${record.name}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => message.success(`已${actionText}鏈路「${record.name}」`),
    })
  }

  const columns: ColumnsType<any> = [
    { 
      title: '鏈路名稱', 
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
      title: '觸發方式',
      dataIndex: 'triggerType',
      key: 'triggerType',
      width: 110,
      render: (v: string) => (
        <Tag color={TRIGGER_TYPE_COLOR[v]}>{TRIGGER_TYPE_LABEL[v]}</Tag>
      ),
    },
    {
      title: '執行步驟',
      dataIndex: 'steps',
      key: 'steps',
      width: 250,
      render: (steps: any[]) => (
        <div style={{ fontSize: 12 }}>
          {steps.map((step, index) => (
            <div key={step.order} style={{ marginBottom: 4 }}>
              <Tag color={step.type === 'recall' ? 'blue' : step.type === 'coarse' ? 'orange' : step.type === 'fine' ? 'green' : step.type === 'rerank' ? 'purple' : 'default'}>
                {step.order}. {step.name}
              </Tag>
            </div>
          ))}
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
        message="策略編排說明"
        description="策略編排引擎用於配置完整的推薦鏈路,從召回到展示的多個階段。每個鏈路包含多個執行步驟,按順序依次執行。"
        type="info"
        showIcon
        icon={<BranchesOutlined />}
        style={{ marginBottom: 16 }}
      />

      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline" form={searchForm} onFinish={handleSearch}>
          <Form.Item label="所屬品牌" name="app">
            <Select placeholder="全部" options={APP_OPTIONS} allowClear style={{ width: 120 }} />
          </Form.Item>
          <Form.Item label="鏈路名稱" name="name">
            <Input placeholder="請輸入鏈路名稱" allowClear style={{ width: 180 }} />
          </Form.Item>
          <Form.Item label="觸發方式" name="triggerType">
            <Select 
              placeholder="全部" 
              options={[
                { label: '搜索觸發', value: 'search' },
                { label: '瀏覽觸發', value: 'browse' },
                { label: '時段觸發', value: 'time' },
                { label: '事件觸發', value: 'event' },
              ]} 
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
            新增策略鏈路
          </Button>
        </Space>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredData}
          scroll={{ x: 1100 }}
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
        title={editingRecord ? '編輯策略鏈路' : '新增策略鏈路'}
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
            label="鏈路名稱" 
            name="name" 
            rules={[{ required: true, message: '請輸入鏈路名稱' }]}
          >
            <Input placeholder="例如：外賣午市完整策略鏈路" />
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
            label="觸發方式" 
            name="triggerType" 
            rules={[{ required: true, message: '請選擇觸發方式' }]}
          >
            <Select 
              placeholder="請選擇" 
              options={[
                { label: '搜索觸發', value: 'search' },
                { label: '瀏覽觸發', value: 'browse' },
                { label: '時段觸發', value: 'time' },
                { label: '事件觸發', value: 'event' },
              ]}
            />
          </Form.Item>

          <Form.Item 
            label="執行步驟 (JSON格式)" 
            name="steps"
            tooltip="請以JSON格式配置執行步驟,包含order,type,name,strategy,desc字段"
          >
            <TextArea 
              rows={10} 
              placeholder={`示例：
[
  {
    "order": 1,
    "type": "recall",
    "name": "召回層",
    "strategy": "午市高峰召回策略",
    "desc": "召回500個候選"
  },
  {
    "order": 2,
    "type": "coarse",
    "name": "粗排層",
    "strategy": "外賣粗排過濾規則",
    "desc": "過濾低質量商家"
  }
]`}
            />
          </Form.Item>

          <Form.Item 
            label="備註說明" 
            name="description"
          >
            <TextArea 
              rows={3} 
              placeholder="請輸入鏈路說明"
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
        title="策略鏈路詳情"
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
        width={900}
      >
        {viewingRecord && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="鏈路名稱" span={2}>
                <strong>{viewingRecord.name}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="所屬品牌">
                <BrandTag value={viewingRecord.app} />
              </Descriptions.Item>
              <Descriptions.Item label="觸發方式">
                <Tag color={TRIGGER_TYPE_COLOR[viewingRecord.triggerType]}>
                  {TRIGGER_TYPE_LABEL[viewingRecord.triggerType]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="業務頻道">
                {CHANNEL_LABEL[viewingRecord.channel]}
              </Descriptions.Item>
              <Descriptions.Item label="狀態">
                <Badge
                  status={viewingRecord.status === ServiceStatus.ENABLED ? 'success' : 'default'}
                  text={viewingRecord.status === ServiceStatus.ENABLED ? '啟用' : '停用'}
                />
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">執行流程</Divider>
            <Card style={{ background: '#fafafa' }}>
              <Timeline>
                {viewingRecord.steps.map((step: any) => (
                  <Timeline.Item 
                    key={step.order}
                    color={step.type === 'recall' ? 'blue' : step.type === 'coarse' ? 'orange' : step.type === 'fine' ? 'green' : step.type === 'rerank' ? 'purple' : 'gray'}
                  >
                    <strong>{step.name}</strong>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{step.desc}</div>
                    <div style={{ marginTop: 8 }}>
                      <Tag color={step.type === 'recall' ? 'blue' : step.type === 'coarse' ? 'orange' : step.type === 'fine' ? 'green' : step.type === 'rerank' ? 'purple' : 'default'}>
                        {step.strategy}
                      </Tag>
                    </div>
                  </Timeline.Item>
                ))}
              </Timeline>
            </Card>

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
