import { useState } from 'react'
import { Button, Space, Table, Tag, Badge, Input, Select, Form, Modal, message, InputNumber, Switch, Descriptions, Divider, Card, Row, Col } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { 
  AppType, 
  RecommendChannel, 
  ServiceStatus, 
  RankingStage,
  RANKING_STAGE_OPTIONS,
  APP_OPTIONS,
  SERVICE_STATUS_OPTIONS,
  RECOMMEND_CHANNEL_OPTIONS,
} from '../constants'
import type { RankingConfig } from '../types'

const { TextArea } = Input

const STAGE_LABEL: Record<RankingStage, string> = {
  [RankingStage.COARSE]: '粗排',
  [RankingStage.FINE]: '精排',
  [RankingStage.RERANK]: '重排',
}

const STAGE_COLOR: Record<RankingStage, string> = {
  [RankingStage.COARSE]: 'blue',
  [RankingStage.FINE]: 'green',
  [RankingStage.RERANK]: 'purple',
}

const CHANNEL_LABEL: Record<RecommendChannel, string> = {
  [RecommendChannel.HOME]: '大首頁',
  [RecommendChannel.DELIVERY]: '外賣',
  [RecommendChannel.GROUP_BUY]: '團購',
  [RecommendChannel.SUPERMARKET]: '超市',
}

// Mock数据 - 粗排配置
const mockData: RankingConfig[] = [
  {
    id: 1,
    stage: RankingStage.COARSE,
    name: '外賣粗排過濾規則',
    modelVersion: 'v2.1.0',
    threshold: 0.3,
    candidateCount: 500,
    features: ['商家評分', '營業狀態', '距離', '歷史銷量'],
    app: AppType.SHANFENG,
    channel: RecommendChannel.DELIVERY,
    status: ServiceStatus.ENABLED,
    description: '外賣頻道粗排快速過濾低質量商家,保留500個候選進入精排',
    createdAt: '2024-01-15 10:30:00',
    updatedAt: '2024-01-20 14:20:00',
  },
  {
    id: 2,
    stage: RankingStage.COARSE,
    name: '團購粗排基礎篩選',
    modelVersion: 'v1.8.0',
    threshold: 0.25,
    candidateCount: 400,
    features: ['商家評分', '套餐銷量', '用戶評分'],
    app: AppType.SHANFENG,
    channel: RecommendChannel.GROUP_BUY,
    status: ServiceStatus.ENABLED,
    description: '團購頻道粗排基礎篩選,過濾低評分和低銷量商家',
    createdAt: '2024-01-16 09:15:00',
    updatedAt: '2024-01-19 16:45:00',
  },
  {
    id: 3,
    stage: RankingStage.COARSE,
    name: '超市粗排規則',
    modelVersion: 'v1.5.0',
    threshold: 0.35,
    candidateCount: 300,
    features: ['商品庫存', '商家評分', '配送時間'],
    app: AppType.MFOOD,
    channel: RecommendChannel.SUPERMARKET,
    status: ServiceStatus.ENABLED,
    description: '超市頻道粗排,優先過濾缺貨和配送時間過長的商品',
    createdAt: '2024-01-17 11:20:00',
    updatedAt: '2024-01-21 10:30:00',
  },
  {
    id: 4,
    stage: RankingStage.COARSE,
    name: '大首頁粗排綜合規則',
    modelVersion: 'v2.3.0',
    threshold: 0.4,
    candidateCount: 600,
    features: ['商家評分', '銷量', '距離', '廣告狀態'],
    app: AppType.SHANFENG,
    channel: RecommendChannel.HOME,
    status: ServiceStatus.ENABLED,
    description: '大首頁瀑布流粗排,綜合多個維度快速篩選',
    createdAt: '2024-01-18 14:00:00',
    updatedAt: '2024-01-22 09:15:00',
  },
  {
    id: 5,
    stage: RankingStage.COARSE,
    name: '外賣夜間粗排規則',
    modelVersion: 'v1.2.0',
    threshold: 0.2,
    candidateCount: 200,
    features: ['營業狀態', '夜間配送', '商家評分'],
    app: AppType.MFOOD,
    channel: RecommendChannel.DELIVERY,
    status: ServiceStatus.DISABLED,
    description: '外賣夜間時段粗排,優先過濾不支持夜間配送的商家',
    createdAt: '2024-01-19 08:30:00',
    updatedAt: '2024-01-20 07:00:00',
  },
]

export default function RankingCoarse() {
  const [searchForm] = Form.useForm()
  const [filteredData, setFilteredData] = useState<RankingConfig[]>(mockData)
  const [modalVisible, setModalVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [editingRecord, setEditingRecord] = useState<RankingConfig | null>(null)
  const [viewingRecord, setViewingRecord] = useState<RankingConfig | null>(null)
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
  const handleDelete = (record: RankingConfig) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除粗排配置「${record.name}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        message.success('刪除成功')
      },
    })
  }

  // 切换状态
  const handleToggleStatus = (record: RankingConfig) => {
    const newStatus = record.status === ServiceStatus.ENABLED ? ServiceStatus.DISABLED : ServiceStatus.ENABLED
    const actionText = newStatus === ServiceStatus.ENABLED ? '啟用' : '停用'
    Modal.confirm({
      title: `確認${actionText}`,
      content: `確定要${actionText}粗排配置「${record.name}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => message.success(`已${actionText}配置「${record.name}」`),
    })
  }

  const columns: ColumnsType<RankingConfig> = [
    { 
      title: '配置名稱', 
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
      title: '排序階段',
      dataIndex: 'stage',
      key: 'stage',
      width: 90,
      render: (v: RankingStage) => (
        <Tag color={STAGE_COLOR[v]}>{STAGE_LABEL[v]}</Tag>
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
      title: '模型版本',
      dataIndex: 'modelVersion',
      key: 'modelVersion',
      width: 110,
      render: (v: string) => <Tag color="cyan">{v}</Tag>,
    },
    {
      title: '過濾閾值',
      dataIndex: 'threshold',
      key: 'threshold',
      width: 100,
      render: (v: number) => (
        <Badge count={v} style={{ backgroundColor: v > 0.3 ? '#52c41a' : '#faad14' }} />
      ),
    },
    {
      title: '候選集大小',
      dataIndex: 'candidateCount',
      key: 'candidateCount',
      width: 110,
      render: (v: number) => `${v}條`,
    },
    {
      title: '特徵工程',
      dataIndex: 'features',
      key: 'features',
      width: 200,
      render: (features: string[]) => (
        <Space size={[0, 4]} wrap>
          {features.slice(0, 3).map(feature => (
            <Tag key={feature} style={{ margin: 0 }}>{feature}</Tag>
          ))}
          {features.length > 3 && <Tag style={{ margin: 0 }}>+{features.length - 3}</Tag>}
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
              form.setFieldsValue({
                ...record,
                features: record.features.join(','),
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
          <Form.Item label="配置名稱" name="name">
            <Input placeholder="請輸入配置名稱" allowClear style={{ width: 180 }} />
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
              form.setFieldsValue({ stage: RankingStage.COARSE })
              setModalVisible(true)
            }}
          >
            新增粗排配置
          </Button>
        </Space>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<RankingConfig>
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
        title={editingRecord ? '編輯粗排配置' : '新增粗排配置'}
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
            label="配置名稱" 
            name="name" 
            rules={[{ required: true, message: '請輸入配置名稱' }]}
          >
            <Input placeholder="例如：外賣粗排過濾規則" />
          </Form.Item>

          <Form.Item 
            label="所屬品牌" 
            name="app" 
            rules={[{ required: true, message: '請選擇所屬品牌' }]}
          >
            <Select placeholder="請選擇" options={APP_OPTIONS} />
          </Form.Item>

          <Form.Item 
            label="排序階段" 
            name="stage" 
            rules={[{ required: true, message: '請選擇排序階段' }]}
          >
            <Select 
              placeholder="請選擇" 
              options={RANKING_STAGE_OPTIONS}
              disabled
            />
          </Form.Item>

          <Form.Item 
            label="業務頻道" 
            name="channel" 
            rules={[{ required: true, message: '請選擇業務頻道' }]}
          >
            <Select placeholder="請選擇" options={RECOMMEND_CHANNEL_OPTIONS} />
          </Form.Item>

          <Form.Item 
            label="模型版本" 
            name="modelVersion" 
            rules={[{ required: true, message: '請輸入模型版本' }]}
            tooltip="例如: v2.1.0"
          >
            <Input placeholder="例如：v2.1.0" />
          </Form.Item>

          <Form.Item 
            label="過濾閾值" 
            name="threshold" 
            rules={[{ required: true, message: '請輸入過濾閾值' }]}
            tooltip="打分低於閾值的候選直接過濾,建議0.2-0.5"
          >
            <InputNumber 
              min={0} 
              max={1} 
              step={0.05}
              style={{ width: '100%' }}
              placeholder="例如：0.3"
            />
          </Form.Item>

          <Form.Item 
            label="候選集大小" 
            name="candidateCount" 
            rules={[{ required: true, message: '請輸入候選集大小' }]}
            tooltip="粗排後保留多少候選進入精排,建議300-600"
          >
            <InputNumber 
              min={100} 
              max={2000} 
              step={50}
              style={{ width: '100%' }}
              placeholder="例如：500"
              addonAfter="條"
            />
          </Form.Item>

          <Form.Item 
            label="特徵工程" 
            name="features" 
            rules={[{ required: true, message: '請輸入特徵列表' }]}
            tooltip="多個特徵用逗號分隔,例如：商家評分,營業狀態,距離"
          >
            <TextArea 
              rows={3} 
              placeholder="例如：商家評分,營業狀態,距離,歷史銷量"
            />
          </Form.Item>

          <Form.Item 
            label="備註說明" 
            name="description"
          >
            <TextArea 
              rows={3} 
              placeholder="請輸入配置說明"
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
        title="粗排配置詳情"
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
              <Descriptions.Item label="配置名稱" span={2}>
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
              <Descriptions.Item label="排序階段">
                <Tag color={STAGE_COLOR[viewingRecord.stage]}>{STAGE_LABEL[viewingRecord.stage]}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="業務頻道">
                {CHANNEL_LABEL[viewingRecord.channel]}
              </Descriptions.Item>
              <Descriptions.Item label="模型版本">
                <Tag color="cyan">{viewingRecord.modelVersion}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="過濾閾值">
                <Badge count={viewingRecord.threshold} style={{ backgroundColor: viewingRecord.threshold > 0.3 ? '#52c41a' : '#faad14' }} />
              </Descriptions.Item>
              <Descriptions.Item label="候選集大小">
                {viewingRecord.candidateCount}條
              </Descriptions.Item>
              <Descriptions.Item label="狀態">
                <Badge
                  status={viewingRecord.status === ServiceStatus.ENABLED ? 'success' : 'default'}
                  text={viewingRecord.status === ServiceStatus.ENABLED ? '啟用' : '停用'}
                />
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">特徵工程</Divider>
            <Space size={[0, 8]} wrap>
              {viewingRecord.features.map(feature => (
                <Tag key={feature} color="blue" style={{ margin: 0 }}>{feature}</Tag>
              ))}
            </Space>

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
