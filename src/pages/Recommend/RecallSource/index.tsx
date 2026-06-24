import { useState } from 'react'
import { Button, Space, Table, Tag, Badge, Input, Select, Form, Modal, message, InputNumber, Switch, Descriptions, Divider } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, EyeOutlined, SettingOutlined } from '@ant-design/icons'
import { 
  ServiceStatus, 
  RecallDimension,
  RECALL_DIMENSION_OPTIONS,
  RECALL_DIMENSION_COLOR,
} from '../constants'
import type { RecallSource } from '../types'

const { TextArea } = Input

// 召回源类型定义
const RECALL_SOURCE_TYPE_OPTIONS: Record<RecallDimension, Array<{label: string, value: string}>> = {
  [RecallDimension.MERCHANT]: [
    { label: '新店保護期召回', value: 'new_store' },
    { label: '商家評分召回', value: 'merchant_rating' },
    { label: '獨家商家召回', value: 'exclusive_merchant' },
    { label: '營業狀態召回', value: 'business_status' },
    { label: '商家距離召回', value: 'merchant_distance' },
    { label: '購買廣告商家召回', value: 'advertiser' },
  ],
  [RecallDimension.ITEM]: [
    { label: '商品類目匹配召回', value: 'item_category' },
    { label: '商品標籤相似召回', value: 'item_tag' },
    { label: '商品銷量召回', value: 'item_sales' },
  ],
  [RecallDimension.COMMERCIAL]: [
    { label: '廣告主召回', value: 'commercial_advertiser' },
    { label: '競價排名召回', value: 'commercial_bidding' },
    { label: '套餐推廣召回', value: 'commercial_package' },
  ],
  [RecallDimension.USER]: [
    { label: '用戶瀏覽歷史召回', value: 'user_browse' },
    { label: '用戶購買偏好召回', value: 'user_preference' },
    { label: '用戶地理位置召回', value: 'user_location' },
  ],
  [RecallDimension.PLATFORM]: [
    { label: '熱門商家召回', value: 'hot_merchant' },
    { label: '熱門商品召回', value: 'hot_item' },
    { label: '平台主推召回', value: 'platform_recommend' },
  ],
}

const DIMENSION_LABEL: Record<RecallDimension, string> = {
  [RecallDimension.MERCHANT]: '商家維度',
  [RecallDimension.ITEM]: '商品維度',
  [RecallDimension.COMMERCIAL]: '商業維度',
  [RecallDimension.USER]: '用戶維度',
  [RecallDimension.PLATFORM]: '平台維度',
}

const SOURCE_TYPE_LABEL: Record<string, string> = {
  new_store: '新店保護期召回',
  merchant_rating: '商家評分召回',
  exclusive_merchant: '獨家商家召回',
  business_status: '營業狀態召回',
  merchant_distance: '商家距離召回',
  advertiser: '購買廣告商家召回',
  item_category: '商品類目匹配召回',
  item_tag: '商品標籤相似召回',
  item_sales: '商品銷量召回',
  commercial_advertiser: '廣告主召回',
  commercial_bidding: '競價排名召回',
  commercial_package: '套餐推廣召回',
  user_browse: '用戶瀏覽歷史召回',
  user_preference: '用戶購買偏好召回',
  user_location: '用戶地理位置召回',
  hot_merchant: '熱門商家召回',
  hot_item: '熱門商品召回',
  platform_recommend: '平台主推召回',
}

// Mock数据 - 15个召回源
const mockData: RecallSource[] = [
  {
    id: 1,
    name: '新店保護期召回',
    type: 'new_store',
    dimension: RecallDimension.MERCHANT,
    config: {
      protectionDays: 7,
      minRating: 4.0,
      businessStatus: 'active',
      regions: ['澳門', '氹仔'],
    },
    strategyCount: 3,
    status: ServiceStatus.ENABLED,
  },
  {
    id: 2,
    name: '商家評分召回',
    type: 'merchant_rating',
    dimension: RecallDimension.MERCHANT,
    config: {
      minRating: 4.5,
      ratingWeight: 0.8,
      businessStatus: 'active',
    },
    strategyCount: 5,
    status: ServiceStatus.ENABLED,
  },
  {
    id: 3,
    name: '購買廣告商家召回',
    type: 'advertiser',
    dimension: RecallDimension.MERCHANT,
    config: {
      adTypes: ['CPC', 'CPM'],
      minBudget: 1000,
      priority: 'high',
    },
    strategyCount: 4,
    status: ServiceStatus.ENABLED,
  },
  {
    id: 4,
    name: '商品類目匹配召回',
    type: 'item_category',
    dimension: RecallDimension.ITEM,
    config: {
      matchMode: 'exact',
      maxCategories: 5,
      categoryWeight: 0.7,
    },
    strategyCount: 2,
    status: ServiceStatus.ENABLED,
  },
  {
    id: 5,
    name: '商品銷量召回',
    type: 'item_sales',
    dimension: RecallDimension.ITEM,
    config: {
      timeWindow: 30,
      minSales: 100,
      salesWeight: 0.6,
    },
    strategyCount: 3,
    status: ServiceStatus.ENABLED,
  },
  {
    id: 6,
    name: '廣告主召回',
    type: 'commercial_advertiser',
    dimension: RecallDimension.COMMERCIAL,
    config: {
      contractTypes: ['保底曝光', '按點擊付費'],
      minContractAmount: 5000,
      priority: 'highest',
    },
    strategyCount: 2,
    status: ServiceStatus.ENABLED,
  },
  {
    id: 7,
    name: '競價排名召回',
    type: 'commercial_bidding',
    dimension: RecallDimension.COMMERCIAL,
    config: {
      bidMode: 'CPC',
      minBid: 0.5,
      qualityScoreWeight: 0.4,
    },
    strategyCount: 3,
    status: ServiceStatus.ENABLED,
  },
  {
    id: 8,
    name: '套餐推廣召回',
    type: 'commercial_package',
    dimension: RecallDimension.COMMERCIAL,
    config: {
      packageTypes: ['早餐套餐', '午餐套餐', '晚餐套餐'],
      minPackageValue: 500,
    },
    strategyCount: 2,
    status: ServiceStatus.ENABLED,
  },
  {
    id: 9,
    name: '用戶瀏覽歷史召回',
    type: 'user_browse',
    dimension: RecallDimension.USER,
    config: {
      timeWindow: 30,
      minBrowseCount: 3,
      browseWeight: 0.5,
    },
    strategyCount: 4,
    status: ServiceStatus.ENABLED,
  },
  {
    id: 10,
    name: '用戶購買偏好召回',
    type: 'user_preference',
    dimension: RecallDimension.USER,
    config: {
      timeWindow: 90,
      minPurchaseCount: 5,
      preferenceWeight: 0.7,
    },
    strategyCount: 5,
    status: ServiceStatus.ENABLED,
  },
  {
    id: 11,
    name: '用戶地理位置召回',
    type: 'user_location',
    dimension: RecallDimension.USER,
    config: {
      maxDistance: 5,
      distanceUnit: 'km',
      locationWeight: 0.6,
    },
    strategyCount: 6,
    status: ServiceStatus.ENABLED,
  },
  {
    id: 12,
    name: '熱門商家召回',
    type: 'hot_merchant',
    dimension: RecallDimension.PLATFORM,
    config: {
      timeWindow: 7,
      minOrders: 500,
      hotWeight: 0.8,
    },
    strategyCount: 4,
    status: ServiceStatus.ENABLED,
  },
  {
    id: 13,
    name: '熱門商品召回',
    type: 'hot_item',
    dimension: RecallDimension.PLATFORM,
    config: {
      timeWindow: 7,
      minSales: 1000,
      hotWeight: 0.7,
    },
    strategyCount: 3,
    status: ServiceStatus.ENABLED,
  },
  {
    id: 14,
    name: '平台主推召回',
    type: 'platform_recommend',
    dimension: RecallDimension.PLATFORM,
    config: {
      recommendType: '運營推薦',
      priority: 'high',
      platformWeight: 0.9,
    },
    strategyCount: 2,
    status: ServiceStatus.ENABLED,
  },
  {
    id: 15,
    name: '獨家商家召回',
    type: 'exclusive_merchant',
    dimension: RecallDimension.MERCHANT,
    config: {
      exclusiveType: '平台獨家',
      minRating: 4.0,
      businessStatus: 'active',
    },
    strategyCount: 1,
    status: ServiceStatus.DISABLED,
  },
]

export default function RecallSource() {
  const [searchForm] = Form.useForm()
  const [filteredData, setFilteredData] = useState<RecallSource[]>(mockData)
  const [modalVisible, setModalVisible] = useState(false)
  const [detailVisible, setDetailVisible] = useState(false)
  const [editingRecord, setEditingRecord] = useState<RecallSource | null>(null)
  const [viewingRecord, setViewingRecord] = useState<RecallSource | null>(null)
  const [form] = Form.useForm()

  // 搜索处理
  const handleSearch = (values: any) => {
    let result = [...mockData]
    
    if (values.name) {
      result = result.filter(item => item.name.includes(values.name))
    }
    
    if (values.dimension !== undefined && values.dimension !== null) {
      result = result.filter(item => item.dimension === values.dimension)
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
  const handleDelete = (record: RecallSource) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除召回源「${record.name}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        message.success('刪除成功')
      },
    })
  }

  // 切换状态
  const handleToggleStatus = (record: RecallSource) => {
    const newStatus = record.status === ServiceStatus.ENABLED ? ServiceStatus.DISABLED : ServiceStatus.ENABLED
    message.success(`已${newStatus === ServiceStatus.ENABLED ? '啟用' : '停用'}召回源「${record.name}」`)
  }

  // 渲染配置详情
  const renderConfigDetail = (config: Record<string, any>) => {
    return Object.entries(config).map(([key, value]) => (
      <Descriptions.Item key={key} label={key}>
        {Array.isArray(value) ? value.join(', ') : String(value)}
      </Descriptions.Item>
    ))
  }

  const columns: ColumnsType<RecallSource> = [
    { 
      title: '召回源名稱', 
      dataIndex: 'name', 
      key: 'name', 
      width: 180,
      render: (text) => <strong>{text}</strong>,
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
      title: '召回源類型',
      dataIndex: 'type',
      key: 'type',
      width: 160,
      render: (v: string) => SOURCE_TYPE_LABEL[v] || v,
    },
    {
      title: '關聯策略數',
      dataIndex: 'strategyCount',
      key: 'strategyCount',
      width: 110,
      sorter: (a, b) => a.strategyCount - b.strategyCount,
      render: (v: number) => (
        <Badge count={v} style={{ backgroundColor: v > 0 ? '#52c41a' : '#d9d9d9' }} />
      ),
    },
    {
      title: '配置參數',
      dataIndex: 'config',
      key: 'config',
      width: 200,
      render: (config: Record<string, any>) => (
        <div style={{ fontSize: 12, color: '#666' }}>
          {Object.entries(config).slice(0, 2).map(([key, value]) => (
            <div key={key}>
              <Tag style={{ margin: '2px 4px 2px 0' }}>{key}: {Array.isArray(value) ? value.join(', ') : value}</Tag>
            </div>
          ))}
          {Object.keys(config).length > 2 && <div style={{ color: '#999' }}>+{Object.keys(config).length - 2} 更多</div>}
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
      width: 220,
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
                ...record,
                config: JSON.stringify(record.config, null, 2),
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
          <Form.Item label="召回源名稱" name="name">
            <Input placeholder="請輸入召回源名稱" allowClear style={{ width: 180 }} />
          </Form.Item>
          <Form.Item label="召回維度" name="dimension">
            <Select 
              placeholder="全部" 
              options={RECALL_DIMENSION_OPTIONS} 
              allowClear 
              style={{ width: 130 }}
            />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select placeholder="全部" options={[
              { label: '啟用', value: ServiceStatus.ENABLED },
              { label: '停用', value: ServiceStatus.DISABLED },
            ]} allowClear style={{ width: 100 }} />
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
            新增召回源
          </Button>
        </Space>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<RecallSource>
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
        title={editingRecord ? '編輯召回源' : '新增召回源'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setModalVisible(false)
          form.resetFields()
          setEditingRecord(null)
        }}
        width={700}
        okText="確定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item 
            label="召回源名稱" 
            name="name" 
            rules={[{ required: true, message: '請輸入召回源名稱' }]}
          >
            <Input placeholder="例如：新店保護期召回" />
          </Form.Item>

          <Form.Item 
            label="召回維度" 
            name="dimension" 
            rules={[{ required: true, message: '請選擇召回維度' }]}
          >
            <Select 
              placeholder="請選擇" 
              options={RECALL_DIMENSION_OPTIONS}
              onChange={(value) => {
                // 根据维度动态更新召回源类型选项
                form.setFieldsValue({ type: undefined })
              }}
            />
          </Form.Item>

          <Form.Item 
            label="召回源類型" 
            name="type" 
            rules={[{ required: true, message: '請選擇召回源類型' }]}
          >
            <Select 
              placeholder="請選擇" 
              options={form.getFieldValue('dimension') 
                ? RECALL_SOURCE_TYPE_OPTIONS[form.getFieldValue('dimension')] || []
                : []
              }
            />
          </Form.Item>

          <Form.Item 
            label="配置參數 (JSON格式)" 
            name="config"
            tooltip='請以JSON格式配置參數，例如：{"protectionDays": 7, "minRating": 4.0}'
          >
            <TextArea 
              rows={8} 
              placeholder={`示例：
{
  "protectionDays": 7,
  "minRating": 4.0,
  "businessStatus": "active",
  "regions": ["澳門", "氹仔"]
}`}
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
        title="召回源詳情"
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
          <Button 
            key="test" 
            type="primary"
            onClick={() => {
              message.success('召回測試已啟動，請查看結果')
            }}
          >
            測試召回效果
          </Button>,
        ]}
        width={800}
      >
        {viewingRecord && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="召回源名稱" span={2}>
                <strong>{viewingRecord.name}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="召回維度">
                <Tag color={RECALL_DIMENSION_COLOR[viewingRecord.dimension]}>
                  {DIMENSION_LABEL[viewingRecord.dimension]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="召回源類型">
                {SOURCE_TYPE_LABEL[viewingRecord.type] || viewingRecord.type}
              </Descriptions.Item>
              <Descriptions.Item label="關聯策略數">
                <Badge count={viewingRecord.strategyCount} style={{ backgroundColor: '#722ed1' }} />
              </Descriptions.Item>
              <Descriptions.Item label="狀態">
                <Badge
                  status={viewingRecord.status === ServiceStatus.ENABLED ? 'success' : 'default'}
                  text={viewingRecord.status === ServiceStatus.ENABLED ? '啟用' : '停用'}
                />
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">配置參數</Divider>
            <Descriptions bordered column={1} size="small">
              {renderConfigDetail(viewingRecord.config)}
            </Descriptions>
          </>
        )}
      </Modal>
    </div>
  )
}
