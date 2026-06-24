import { useState, useMemo } from 'react'
import { Button, Space, Table, Tag, Badge, Input, Select, Form, Modal, message, InputNumber, Switch, Descriptions, Divider, Card, Checkbox, Alert } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, EyeOutlined, LayoutOutlined } from '@ant-design/icons'
import { 
  AppType, 
  RecommendChannel, 
  AlgorithmType,
  ServiceStatus, 
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
  [RecommendChannel.HOME]: '大首頁瀑布流',
  [RecommendChannel.DELIVERY]: '外賣頻道瀑布流',
  [RecommendChannel.GROUP_BUY]: '團購頻道瀑布流',
  [RecommendChannel.SUPERMARKET]: '超市頻道瀑布流',
}

const ALGORITHM_TYPE_LABEL: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: '無敵星星',
  [AlgorithmType.NEW_STORE_AD]: '新店廣告',
  [AlgorithmType.HOT_REVIVE_AD]: '盤活廣告',
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
    RecommendChannel.HOME,
    RecommendChannel.DELIVERY,
    RecommendChannel.GROUP_BUY,
    RecommendChannel.SUPERMARKET,
  ]
  const apps = [AppType.SHANFENG, AppType.MFOOD]
  const algorithms = [
    { id: 1, name: '無敵星星-首頁版', type: AlgorithmType.INVINCIBLE_STAR },
    { id: 2, name: '新店廣告-外賣版', type: AlgorithmType.NEW_STORE_AD },
    { id: 3, name: '盤活廣告-團購版', type: AlgorithmType.HOT_REVIVE_AD },
    { id: 4, name: '獨家商家-超市版', type: AlgorithmType.EXCLUSIVE_MERCHANT },
    { id: 5, name: '流量廣告-全渠道', type: AlgorithmType.TRAFFIC_AD },
    { id: 6, name: '猜你喜歡-主力版', type: AlgorithmType.GUESS_YOU_LIKE },
    { id: 7, name: '自然流量-默認', type: AlgorithmType.ORGANIC_TRAFFIC },
    { id: 8, name: '搜索算法-綜合版', type: AlgorithmType.SEARCH_ALGORITHM },
  ]
  const users = ['admin', 'operator', 'user001', 'user002']

  let id = 1
  
  // 使用固定种子生成可预期的数据（避免每次刷新数据不同）
  const pseudoRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000
    return x - Math.floor(x)
  }
  
  // 生成15天的数据
  for (let day = 0; day < 15; day++) {
    const date = new Date()
    date.setDate(date.getDate() - day)
    const dateStr = date.toISOString().split('T')[0]
    
    // 每天生成3-5条记录（使用固定算法）
    const recordsPerDay = 3 + Math.floor(pseudoRandom(day * 100) * 3)
    
    for (let i = 0; i < recordsPerDay; i++) {
      const seed = day * 1000 + i * 100
      const app = apps[Math.floor(pseudoRandom(seed + 1) * apps.length)]
      const channel = channels[Math.floor(pseudoRandom(seed + 2) * channels.length)]
      const slotPosition = 1 + Math.floor(pseudoRandom(seed + 3) * 10) // 1-10号位
      const algorithm = algorithms[Math.floor(pseudoRandom(seed + 4) * algorithms.length)]
      const status = day < 3 ? ServiceStatus.ENABLED : (pseudoRandom(seed + 5) > 0.3 ? ServiceStatus.ENABLED : ServiceStatus.DISABLED)
      const user = users[Math.floor(pseudoRandom(seed + 6) * users.length)]
      
      const hour = 8 + Math.floor(pseudoRandom(seed + 7) * 12)
      const minute = Math.floor(pseudoRandom(seed + 8) * 60)
      
      data.push({
        id: id++,
        app,
        channel,
        slotPosition,
        algorithmId: algorithm.id,
        algorithmName: algorithm.name,
        algorithmType: algorithm.type,
        purchaseLimit: pseudoRandom(seed + 9) > 0.5 ? { days: 7 + day * 2, quantity: 3 + Math.floor(pseudoRandom(seed + 10) * 5) } : undefined,
        purchaseInterval: pseudoRandom(seed + 11) > 0.5 ? 1 + Math.floor(pseudoRandom(seed + 12) * 5) : undefined,
        merchantLimit: pseudoRandom(seed + 13) > 0.5 ? 'limited' : 'unlimited',
        merchantIds: pseudoRandom(seed + 14) > 0.5 ? [100 + Math.floor(pseudoRandom(seed + 15) * 50), 100 + Math.floor(pseudoRandom(seed + 16) * 50)] : undefined,
        regionLimit: pseudoRandom(seed + 17) > 0.5 ? 'limited' : 'unlimited',
        regionIds: pseudoRandom(seed + 18) > 0.5 ? [1, 2, 3].slice(0, 1 + Math.floor(pseudoRandom(seed + 19) * 3)) : undefined,
        status,
        updatedBy: user,
        updatedAt: `${dateStr} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
        createdAt: `${dateStr} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
      })
    }
  }

  // 按更新时间倒序排列（最新的在前面）
  return data.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

const mockData: WaterfallSlotConfig[] = generateMockData()

export default function Waterfall() {
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

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'channel', title: '業務頻道' },
    { key: 'app', title: '所屬品牌' },
    { key: 'slotPosition', title: '展示位置' },
    { key: 'algorithmId', title: '算法ID' },
    { key: 'algorithmName', title: '關聯算法' },
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
      title: '算法ID',
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
      title: '關聯算法',
      dataIndex: 'algorithmName',
      key: 'algorithmName',
      width: 200,
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: '最後更新人',
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 100,
    },
    {
      title: '最後更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 160,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
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
              style={{ width: 160 }}
            />
          </Form.Item>
          <Form.Item label="所屬品牌" name="app">
            <Select placeholder="全部" options={APP_OPTIONS} allowClear style={{ width: 120 }} />
          </Form.Item>
          <Form.Item label="展示位置" name="slotPosition">
            <InputNumber placeholder="坑位序號" min={1} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item label="關聯算法" name="algorithm">
            <Input placeholder="算法名稱/ID" allowClear style={{ width: 160 }} />
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
              setAlgorithmType(undefined)
              setAlgorithmOptions([])
              setContinuousPurchase('notSupport')
              setMerchantLimit('unlimited')
              setSelectedMerchants([])
              setRegionLimit('unlimited')
              setModalVisible(true)
            }}
          >
            新增坑位配置
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

            {/* 区域限制 */}
            <Form.Item 
              label="區域限制" 
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
                <Descriptions.Item label="區域限制">
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
