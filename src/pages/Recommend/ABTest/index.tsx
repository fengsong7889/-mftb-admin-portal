import { useState } from 'react'
import { Button, Space, Table, Tag, Badge, Input, Select, Form, Modal, message, InputNumber, Switch, Descriptions, Divider, Card, Row, Col, Progress, Alert, Statistic } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  ExperimentOutlined,
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

const TEST_STATUS_LABEL: Record<string, string> = {
  running: '運行中',
  completed: '已完成',
  paused: '已暫停',
  draft: '草稿',
}

const TEST_STATUS_COLOR: Record<string, string> = {
  running: 'processing',
  completed: 'success',
  paused: 'default',
  draft: 'warning',
}

const WINNER_LABEL: Record<string, string> = {
  control: '對照組',
  variant: '實驗組',
  tie: '平局',
}

const WINNER_COLOR: Record<string, string> = {
  control: 'blue',
  variant: 'green',
  tie: 'default',
}

// Mock数据 - A/B测试
const mockData = [
  {
    id: 1,
    name: '外賣CTR模型v3.2 vs v3.3',
    app: AppType.SHANFENG,
    channel: RecommendChannel.DELIVERY,
    testType: '精排模型',
    status: 'running',
    trafficSplit: {
      control: 50,
      variant: 50,
    },
    startDate: '2024-01-15',
    endDate: '2024-02-15',
    metrics: {
      ctr: { control: 4.2, variant: 4.8, lift: '+14.3%' },
      cvr: { control: 12.5, variant: 13.1, lift: '+4.8%' },
      gmv: { control: 125000, variant: 132000, lift: '+5.6%' },
    },
    winner: null,
    description: '測試新版精排模型CTR預估效果提升',
    createdAt: '2024-01-10 10:30:00',
    updatedAt: '2024-01-20 14:20:00',
  },
  {
    id: 2,
    name: '新店保護期7天vs14天',
    app: AppType.SHANFENG,
    channel: RecommendChannel.DELIVERY,
    testType: '策略參數',
    status: 'completed',
    trafficSplit: {
      control: 50,
      variant: 50,
    },
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    metrics: {
      newStoreOrder: { control: 850, variant: 1020, lift: '+20.0%' },
      retention: { control: 65.2, variant: 72.8, lift: '+11.7%' },
    },
    winner: 'variant',
    description: '測試延長新店保護期對訂單量和留存率的影響',
    createdAt: '2023-12-28 09:00:00',
    updatedAt: '2024-02-01 10:00:00',
  },
  {
    id: 3,
    name: '無敵星星競價策略優化',
    app: AppType.SHANFENG,
    channel: RecommendChannel.HOME,
    testType: '競價策略',
    status: 'running',
    trafficSplit: {
      control: 70,
      variant: 30,
    },
    startDate: '2024-01-20',
    endDate: '2024-02-20',
    metrics: {
      adRevenue: { control: 52000, variant: 58500, lift: '+12.5%' },
      organicCvr: { control: 11.2, variant: 10.8, lift: '-3.6%' },
    },
    winner: null,
    description: '測試新版競價策略廣告收入提升,觀察自然流量轉化率影響',
    createdAt: '2024-01-18 11:00:00',
    updatedAt: '2024-01-22 16:30:00',
  },
  {
    id: 4,
    name: '團購多樣性打散策略',
    app: AppType.SHANFENG,
    channel: RecommendChannel.GROUP_BUY,
    testType: '重排策略',
    status: 'completed',
    trafficSplit: {
      control: 50,
      variant: 50,
    },
    startDate: '2024-01-05',
    endDate: '2024-01-25',
    metrics: {
      diversity: { control: 0.65, variant: 0.78, lift: '+20.0%' },
      userEngagement: { control: 8.5, variant: 9.2, lift: '+8.2%' },
    },
    winner: 'variant',
    description: '測試多樣性打散策略對用戶參與度的提升效果',
    createdAt: '2024-01-03 14:00:00',
    updatedAt: '2024-01-26 09:00:00',
  },
  {
    id: 5,
    name: '超市即時推薦鏈路優化',
    app: AppType.MFOOD,
    channel: RecommendChannel.SUPERMARKET,
    testType: '推薦鏈路',
    status: 'paused',
    trafficSplit: {
      control: 50,
      variant: 50,
    },
    startDate: '2024-01-10',
    endDate: null,
    metrics: {
      ctr: { control: 3.8, variant: 3.9, lift: '+2.6%' },
    },
    winner: null,
    description: '測試簡化推薦鏈路效果,暫時暫停觀察數據',
    createdAt: '2024-01-08 10:00:00',
    updatedAt: '2024-01-15 11:00:00',
  },
]

export default function ABTest() {
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

    if (values.testType) {
      result = result.filter(item => item.testType === values.testType)
    }

    if (values.channel !== undefined && values.channel !== null) {
      result = result.filter(item => item.channel === values.channel)
    }
    
    if (values.status) {
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
      content: `確定要刪除A/B測試「${record.name}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        message.success('刪除成功')
      },
    })
  }

  // 切换状态
  const handleToggleStatus = (record: any) => {
    const actionText = record.status === 'running' ? '暫停' : '啟動'
    Modal.confirm({
      title: `確認${actionText}`,
      content: `確定要${actionText}A/B測試「${record.name}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        if (record.status === 'running') {
          message.success('已暫停測試')
        } else if (record.status === 'paused' || record.status === 'draft') {
          message.success('已啟動測試')
        }
      },
    })
  }

  const columns: ColumnsType<any> = [
    { 
      title: '測試名稱', 
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
      title: '測試類型',
      dataIndex: 'testType',
      key: 'testType',
      width: 110,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: '流量分配',
      dataIndex: 'trafficSplit',
      key: 'trafficSplit',
      width: 120,
      render: (v: any) => (
        <Space>
          <span style={{ fontSize: 12 }}>對照:{v.control}%</span>
          <span style={{ fontSize: 12 }}>實驗:{v.variant}%</span>
        </Space>
      ),
    },
    {
      title: '測試狀態',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: string) => (
        <Badge
          status={TEST_STATUS_COLOR[v] as any}
          text={TEST_STATUS_LABEL[v]}
        />
      ),
    },
    {
      title: '勝出組',
      dataIndex: 'winner',
      key: 'winner',
      width: 100,
      render: (v: string | null) => (
        v ? <Tag color={WINNER_COLOR[v]}>{WINNER_LABEL[v]}</Tag> : '-'
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
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
            
            onClick={() => handleToggleStatus(record)}
            disabled={record.status === 'completed'}
          >
            {record.status === 'running' ? '暫停' : record.status === 'completed' ? '-' : '啟動'}
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
            danger
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
      {/* 提示 */}
      <Alert
        message="A/B測試平台說明"
        description="A/B測試用於驗證不同策略、模型、參數的效果。支持精排模型、策略參數、競價策略、重排策略、推薦鏈路等多種測試類型。測試完成後自動判定勝出組。"
        type="info"
        showIcon
        icon={<ExperimentOutlined />}
        style={{ marginBottom: 16 }}
      />

      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline" form={searchForm} onFinish={handleSearch}>
          <Form.Item label="所屬品牌" name="app">
            <Select placeholder="全部" options={APP_OPTIONS} allowClear style={{ width: 120 }} />
          </Form.Item>
          <Form.Item label="測試名稱" name="name">
            <Input placeholder="請輸入測試名稱" allowClear style={{ width: 180 }} />
          </Form.Item>
          <Form.Item label="測試類型" name="testType">
            <Select 
              placeholder="全部" 
              options={[
                { label: '精排模型', value: '精排模型' },
                { label: '策略參數', value: '策略參數' },
                { label: '競價策略', value: '競價策略' },
                { label: '重排策略', value: '重排策略' },
                { label: '推薦鏈路', value: '推薦鏈路' },
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
          <Form.Item label="測試狀態" name="status">
            <Select 
              placeholder="全部" 
              options={[
                { label: '運行中', value: 'running' },
                { label: '已完成', value: 'completed' },
                { label: '已暫停', value: 'paused' },
                { label: '草稿', value: 'draft' },
              ]} 
              allowClear 
              style={{ width: 110 }}
            />
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
            新增A/B測試
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
        title={editingRecord ? '編輯A/B測試' : '新增A/B測試'}
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
            label="測試名稱" 
            name="name" 
            rules={[{ required: true, message: '請輸入測試名稱' }]}
          >
            <Input placeholder="例如：外賣CTR模型v3.2 vs v3.3" />
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
            label="測試類型" 
            name="testType" 
            rules={[{ required: true, message: '請選擇測試類型' }]}
          >
            <Select 
              placeholder="請選擇" 
              options={[
                { label: '精排模型', value: '精排模型' },
                { label: '策略參數', value: '策略參數' },
                { label: '競價策略', value: '競價策略' },
                { label: '重排策略', value: '重排策略' },
                { label: '推薦鏈路', value: '推薦鏈路' },
              ]}
            />
          </Form.Item>

          <Form.Item 
            label="流量分配" 
            name="trafficSplit"
            rules={[{ required: true, message: '請輸入流量分配' }]}
            tooltip='請以JSON格式配置,例如:{"control":50,"variant":50}'
          >
            <TextArea 
              rows={3} 
              placeholder={`示例：
{
  "control": 50,
  "variant": 50
}`}
            />
          </Form.Item>

          <Form.Item 
            label="測試開始日期" 
            name="startDate"
            rules={[{ required: true, message: '請選擇測試開始日期' }]}
          >
            <Input placeholder="例如：2024-01-15" />
          </Form.Item>

          <Form.Item 
            label="測試結束日期" 
            name="endDate"
          >
            <Input placeholder="例如：2024-02-15(可選)" />
          </Form.Item>

          <Form.Item 
            label="備註說明" 
            name="description"
          >
            <TextArea 
              rows={3} 
              placeholder="請輸入測試說明"
            />
          </Form.Item>

          <Form.Item 
            label="狀態" 
            name="status" 
            rules={[{ required: true, message: '請選擇狀態' }]}
          >
            <Select 
              placeholder="請選擇" 
              options={[
                { label: '草稿', value: 'draft' },
                { label: '運行中', value: 'running' },
                { label: '已暫停', value: 'paused' },
                { label: '已完成', value: 'completed' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 查看详情弹窗 */}
      <Modal
        title="A/B測試詳情"
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
        width={1000}
      >
        {viewingRecord && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="測試名稱" span={2}>
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
              <Descriptions.Item label="測試類型">
                <Tag>{viewingRecord.testType}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="業務頻道">
                {CHANNEL_LABEL[viewingRecord.channel]}
              </Descriptions.Item>
              <Descriptions.Item label="測試狀態">
                <Badge
                  status={TEST_STATUS_COLOR[viewingRecord.status] as any}
                  text={TEST_STATUS_LABEL[viewingRecord.status]}
                />
              </Descriptions.Item>
              <Descriptions.Item label="流量分配">
                <Space>
                  <span>對照組:{viewingRecord.trafficSplit.control}%</span>
                  <span>實驗組:{viewingRecord.trafficSplit.variant}%</span>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="勝出組">
                {viewingRecord.winner ? (
                  <Tag color={WINNER_COLOR[viewingRecord.winner]}>
                    {WINNER_LABEL[viewingRecord.winner]}
                  </Tag>
                ) : '-'}
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">核心指標對比</Divider>
            <Row gutter={16}>
              {Object.entries(viewingRecord.metrics).map(([metric, data]: [string, any]) => (
                <Col span={8} key={metric}>
                  <Card size="small" style={{ marginBottom: 16 }}>
                    <Statistic title={metric.toUpperCase()} value={data.variant} suffix={metric.includes('ctr') || metric.includes('cvr') || metric.includes('diversity') || metric.includes('retention') ? '%' : ''} />
                    <div style={{ marginTop: 8, fontSize: 12 }}>
                      <div>對照組: {data.control}</div>
                      <div style={{ color: data.lift.startsWith('+') ? '#52c41a' : '#ff4d4f', fontWeight: 'bold' }}>
                        提升: {data.lift}
                      </div>
                    </div>
                    <Progress 
                      percent={Math.min(Math.abs(parseFloat(data.lift)), 100)} 
                      status={data.lift.startsWith('+') ? 'success' : 'exception'}
                      style={{ marginTop: 8 }}
                    />
                  </Card>
                </Col>
              ))}
            </Row>

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
