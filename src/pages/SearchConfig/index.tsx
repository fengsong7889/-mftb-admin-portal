import { useState } from 'react'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, message, Switch, InputNumber, Tabs } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExportOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  SortAscendingOutlined,
} from '@ant-design/icons'

const { TextArea } = Input

/** 所屬品牌 */
const brandOptions = [
  { label: '全部', value: 'all' },
  { label: 'mFood', value: 'mFood' },
  { label: '閃蜂', value: 'flashBee' },
]

/** 搜索頻道 */
const searchChannelOptions = [
  { label: '全部', value: 'all' },
  { label: '大首頁', value: 'home' },
  { label: '外賣頻道', value: 'takeaway' },
  { label: '團購頻道', value: 'groupBuy' },
  { label: '超市頻道', value: 'supermarket' },
]

/** 配置類型 */
const configTypeOptions = [
  { label: '全部', value: 'all' },
  { label: '算法參數', value: 'algorithm' },
  { label: '召回策略', value: 'recall' },
  { label: '排序規則', value: 'sort' },
]

/** 狀態選項 */
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '生效', value: 'active' },
  { label: '停用', value: 'inactive' },
]

/** 召回策略類型 */
const recallStrategyOptions = [
  { label: '精確匹配', value: 'exact' },
  { label: '模糊匹配', value: 'fuzzy' },
  { label: '分詞匹配', value: 'segment' },
  { label: '同義詞匹配', value: 'synonym' },
  { label: '拼音匹配', value: 'pinyin' },
]

/** 排序字段 */
const sortFieldOptions = [
  { label: '相關度', value: 'relevance' },
  { label: '銷量', value: 'sales' },
  { label: '評分', value: 'rating' },
  { label: '距離', value: 'distance' },
  { label: '價格', value: 'price' },
  { label: '廣告權重', value: 'adWeight' },
]

/** 排序方向 */
const sortDirectionOptions = [
  { label: '降序', value: 'desc' },
  { label: '升序', value: 'asc' },
]

interface SearchConfigRecord {
  key: string
  configId: string
  configName: string
  configType: string
  brand: string
  searchChannel: string[]
  description: string
  status: 'active' | 'inactive'
  updatedBy: string
  updateTime: string
  priority: number
}

interface AlgorithmParams {
  key: string
  paramName: string
  paramCode: string
  paramValue: string
  defaultValue: string
  minValue: string
  maxValue: string
  description: string
  brand: string
  searchChannel: string[]
  status: 'active' | 'inactive'
}

interface RecallStrategy {
  key: string
  strategyId: string
  strategyName: string
  strategyType: string
  matchThreshold: number
  maxResults: number
  enabled: boolean
  brand: string
  searchChannel: string[]
  priority: number
}

interface SortRule {
  key: string
  ruleId: string
  ruleName: string
  sortField: string
  sortDirection: string
  weight: number
  condition: string
  brand: string
  searchChannel: string[]
  enabled: boolean
  priority: number
}

const configTypeMap: Record<string, string> = {
  algorithm: '算法參數',
  recall: '召回策略',
  sort: '排序規則',
}

const brandMap: Record<string, string> = { mFood: 'mFood', flashBee: '閃蜂' }
const channelMap: Record<string, string> = {
  home: '大首頁',
  takeaway: '外賣頻道',
  groupBuy: '團購頻道',
  supermarket: '超市頻道',
}

const mockConfigData: SearchConfigRecord[] = [
  {
    key: '1',
    configId: 'SC001',
    configName: '外賣搜索基礎算法配置',
    configType: 'algorithm',
    brand: 'mFood',
    searchChannel: ['takeaway'],
    description: '配置外賣搜索的相關度計算、分詞權重等基礎算法參數',
    status: 'active',
    updatedBy: '張曉明(E10023)',
    updateTime: '2026-06-08 14:30:00',
    priority: 1,
  },
  {
    key: '2',
    configId: 'SC002',
    configName: '團購召回策略組合',
    configType: 'recall',
    brand: 'mFood',
    searchChannel: ['groupBuy'],
    description: '團購搜索的多路召回策略配置，包含精確、模糊、同義詞匹配',
    status: 'active',
    updatedBy: '李婉婷(E10045)',
    updateTime: '2026-06-07 16:20:00',
    priority: 2,
  },
  {
    key: '3',
    configId: 'SC003',
    configName: '大首頁綜合排序規則',
    configType: 'sort',
    brand: 'mFood',
    searchChannel: ['home'],
    description: '大首頁搜索結果排序，綜合相關度、銷量、廣告權重等多維度',
    status: 'active',
    updatedBy: '陳浩然(E10067)',
    updateTime: '2026-06-06 10:15:00',
    priority: 1,
  },
  {
    key: '4',
    configId: 'SC004',
    configName: '閃蜂超市拼音召回配置',
    configType: 'recall',
    brand: 'flashBee',
    searchChannel: ['supermarket'],
    description: '支持用戶使用拼音搜索超市商品，提升搜索體驗',
    status: 'active',
    updatedBy: '王美玲(E10089)',
    updateTime: '2026-06-05 09:45:00',
    priority: 3,
  },
  {
    key: '5',
    configId: 'SC005',
    configName: '外賣評分排序權重',
    configType: 'sort',
    brand: 'flashBee',
    searchChannel: ['takeaway'],
    description: '外賣搜索中商家評分在排序中的權重配置',
    status: 'inactive',
    updatedBy: '張曉明(E10023)',
    updateTime: '2026-06-04 11:30:00',
    priority: 4,
  },
]

const mockAlgorithmData: AlgorithmParams[] = [
  {
    key: '1',
    paramName: '標題匹配權重',
    paramCode: 'title_match_weight',
    paramValue: '0.4',
    defaultValue: '0.3',
    minValue: '0',
    maxValue: '1',
    description: '搜索詞與商品標題匹配度的權重系數',
    brand: 'mFood',
    searchChannel: ['takeaway'],
    status: 'active',
  },
  {
    key: '2',
    paramName: '銷量影響系數',
    paramCode: 'sales_impact_factor',
    paramValue: '0.25',
    defaultValue: '0.2',
    minValue: '0',
    maxValue: '1',
    description: '商品歷史銷量對搜索排名的影響程度',
    brand: 'mFood',
    searchChannel: ['takeaway', 'groupBuy'],
    status: 'active',
  },
  {
    key: '3',
    paramName: '距離衰減參數',
    paramCode: 'distance_decay',
    paramValue: '0.15',
    defaultValue: '0.15',
    minValue: '0',
    maxValue: '1',
    description: '配送距離對搜索結果排序的影響衰減率',
    brand: 'mFood',
    searchChannel: ['takeaway'],
    status: 'active',
  },
]

const mockRecallData: RecallStrategy[] = [
  {
    key: '1',
    strategyId: 'RS001',
    strategyName: '精確匹配召回',
    strategyType: 'exact',
    matchThreshold: 1.0,
    maxResults: 50,
    enabled: true,
    brand: 'mFood',
    searchChannel: ['takeaway', 'groupBuy'],
    priority: 1,
  },
  {
    key: '2',
    strategyId: 'RS002',
    strategyName: '同義詞擴展召回',
    strategyType: 'synonym',
    matchThreshold: 0.8,
    maxResults: 100,
    enabled: true,
    brand: 'mFood',
    searchChannel: ['takeaway'],
    priority: 2,
  },
  {
    key: '3',
    strategyId: 'RS003',
    strategyName: '拼音模糊召回',
    strategyType: 'pinyin',
    matchThreshold: 0.7,
    maxResults: 80,
    enabled: false,
    brand: 'flashBee',
    searchChannel: ['supermarket'],
    priority: 3,
  },
]

const mockSortData: SortRule[] = [
  {
    key: '1',
    ruleId: 'SR001',
    ruleName: '相關度優先排序',
    sortField: 'relevance',
    sortDirection: 'desc',
    weight: 0.5,
    condition: '無',
    brand: 'mFood',
    searchChannel: ['home', 'takeaway'],
    enabled: true,
    priority: 1,
  },
  {
    key: '2',
    ruleId: 'SR002',
    ruleName: '銷量加成排序',
    sortField: 'sales',
    sortDirection: 'desc',
    weight: 0.3,
    condition: '月銷量>100',
    brand: 'mFood',
    searchChannel: ['takeaway'],
    enabled: true,
    priority: 2,
  },
  {
    key: '3',
    ruleId: 'SR003',
    ruleName: '廣告權重提權',
    sortField: 'adWeight',
    sortDirection: 'desc',
    weight: 0.2,
    condition: '已購買推廣',
    brand: 'mFood',
    searchChannel: ['home', 'takeaway', 'groupBuy'],
    enabled: true,
    priority: 3,
  },
]

export default function SearchConfig() {
  const [activeTab, setActiveTab] = useState('config')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<SearchConfigRecord | null>(null)
  const [form] = Form.useForm()

  const handleAdd = () => {
    setEditingRecord(null)
    form.resetFields()
    form.setFieldsValue({ status: 'active', searchChannel: ['takeaway'] })
    setIsModalOpen(true)
  }

  const handleEdit = (record: SearchConfigRecord) => {
    setEditingRecord(record)
    form.setFieldsValue(record)
    setIsModalOpen(true)
  }

  const handleDelete = (record: SearchConfigRecord) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除配置「${record.configName}」嗎？此操作不可恢復。`,
      okText: '確定',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => message.success('刪除成功'),
    })
  }

  const handleToggleStatus = (record: SearchConfigRecord) => {
    const newStatus = record.status === 'active' ? '停用' : '生效'
    Modal.confirm({
      title: '確認操作',
      content: `確定要將配置「${record.configName}」設為「${newStatus}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => message.success(`已${newStatus}`),
    })
  }

  const handleSave = () => {
    form.validateFields().then(() => {
      message.success(editingRecord ? '編輯成功' : '新增成功')
      setIsModalOpen(false)
    })
  }

  const configColumns: TableColumnsType<SearchConfigRecord> = [
    {
      title: '配置ID',
      dataIndex: 'configId',
      key: 'configId',
      width: 100,
    },
    {
      title: '配置名稱',
      dataIndex: 'configName',
      key: 'configName',
      width: 200,
      ellipsis: true,
    },
    {
      title: '配置類型',
      dataIndex: 'configType',
      key: 'configType',
      width: 100,
      render: (v: string) => <Tag color="blue">{configTypeMap[v]}</Tag>,
    },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 90,
      render: (v: string) => (
        <Tag style={{ 
          margin: 0,
          padding: '2px 10px',
          border: v === '閃蜂' || v === 'flashBee' ? '1px solid #fadb14' : '1px solid #fa8c16',
          color: v === '閃蜂' || v === 'flashBee' ? '#d4b106' : '#d46b08',
          background: v === '閃蜂' || v === 'flashBee' ? '#fffbe6' : '#fff7e6',
          borderRadius: 4,
          fontWeight: 500
        }}>
          {brandMap[v] || v}
        </Tag>
      ),
    },
    {
      title: '搜索頻道',
      dataIndex: 'searchChannel',
      key: 'searchChannel',
      width: 160,
      render: (v: string[]) => v.map(c => channelMap[c] || c).join('、'),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 240,
      ellipsis: true,
    },
    {
      title: '優先級',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: string) =>
        v === 'active' ? <Tag color="green">生效</Tag> : <Tag color="red">停用</Tag>,
    },
    {
      title: '最後更新人',
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 140,
    },
    {
      title: '更新時間',
      dataIndex: 'updateTime',
      key: 'updateTime',
      width: 160,
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            編輯
          </Button>
          <Button
            type="link"
            size="small"
            danger={record.status === 'active'}
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === 'active' ? '停用' : '啟用'}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            刪除
          </Button>
        </Space>
      ),
    },
  ]

  const algorithmColumns: TableColumnsType<AlgorithmParams> = [
    {
      title: '參數名稱',
      dataIndex: 'paramName',
      key: 'paramName',
      width: 150,
    },
    {
      title: '參數代碼',
      dataIndex: 'paramCode',
      key: 'paramCode',
      width: 180,
    },
    {
      title: '當前值',
      dataIndex: 'paramValue',
      key: 'paramValue',
      width: 100,
    },
    {
      title: '默認值',
      dataIndex: 'defaultValue',
      key: 'defaultValue',
      width: 100,
    },
    {
      title: '取值範圍',
      key: 'range',
      width: 120,
      render: (_, r) => `${r.minValue} ~ ${r.maxValue}`,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 240,
      ellipsis: true,
    },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 90,
      render: (v: string) => (
        <Tag style={{ 
          margin: 0,
          padding: '2px 10px',
          border: v === '閃蜂' || v === 'flashBee' ? '1px solid #fadb14' : '1px solid #fa8c16',
          color: v === '閃蜂' || v === 'flashBee' ? '#d4b106' : '#d46b08',
          background: v === '閃蜂' || v === 'flashBee' ? '#fffbe6' : '#fff7e6',
          borderRadius: 4,
          fontWeight: 500
        }}>
          {brandMap[v] || v}
        </Tag>
      ),
    },
    {
      title: '搜索頻道',
      dataIndex: 'searchChannel',
      key: 'searchChannel',
      width: 160,
      render: (v: string[]) => v.map(c => channelMap[c] || c).join('、'),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: string) =>
        v === 'active' ? <Tag color="green">生效</Tag> : <Tag color="red">停用</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: () => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small">編輯</Button>
        </Space>
      ),
    },
  ]

  const recallColumns: TableColumnsType<RecallStrategy> = [
    {
      title: '策略ID',
      dataIndex: 'strategyId',
      key: 'strategyId',
      width: 100,
    },
    {
      title: '策略名稱',
      dataIndex: 'strategyName',
      key: 'strategyName',
      width: 180,
    },
    {
      title: '策略類型',
      dataIndex: 'strategyType',
      key: 'strategyType',
      width: 120,
      render: (v: string) => {
        const map: Record<string, string> = {
          exact: '精確匹配',
          fuzzy: '模糊匹配',
          segment: '分詞匹配',
          synonym: '同義詞匹配',
          pinyin: '拼音匹配',
        }
        return <Tag color="purple">{map[v]}</Tag>
      },
    },
    {
      title: '匹配閾值',
      dataIndex: 'matchThreshold',
      key: 'matchThreshold',
      width: 100,
      render: (v: number) => v.toFixed(2),
    },
    {
      title: '最大召回數',
      dataIndex: 'maxResults',
      key: 'maxResults',
      width: 110,
    },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 90,
      render: (v: string) => (
        <Tag style={{ 
          margin: 0,
          padding: '2px 10px',
          border: v === '閃蜂' || v === 'flashBee' ? '1px solid #fadb14' : '1px solid #fa8c16',
          color: v === '閃蜂' || v === 'flashBee' ? '#d4b106' : '#d46b08',
          background: v === '閃蜂' || v === 'flashBee' ? '#fffbe6' : '#fff7e6',
          borderRadius: 4,
          fontWeight: 500
        }}>
          {brandMap[v] || v}
        </Tag>
      ),
    },
    {
      title: '搜索頻道',
      dataIndex: 'searchChannel',
      key: 'searchChannel',
      width: 160,
      render: (v: string[]) => v.map(c => channelMap[c] || c).join('、'),
    },
    {
      title: '優先級',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
    },
    {
      title: '啟用狀態',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (v: boolean) => <Switch checked={v} size="small" />,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: () => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small">編輯</Button>
        </Space>
      ),
    },
  ]

  const sortColumns: TableColumnsType<SortRule> = [
    {
      title: '規則ID',
      dataIndex: 'ruleId',
      key: 'ruleId',
      width: 100,
    },
    {
      title: '規則名稱',
      dataIndex: 'ruleName',
      key: 'ruleName',
      width: 180,
    },
    {
      title: '排序字段',
      dataIndex: 'sortField',
      key: 'sortField',
      width: 100,
      render: (v: string) => {
        const map: Record<string, string> = {
          relevance: '相關度',
          sales: '銷量',
          rating: '評分',
          distance: '距離',
          price: '價格',
          adWeight: '廣告權重',
        }
        return map[v] || v
      },
    },
    {
      title: '排序方向',
      dataIndex: 'sortDirection',
      key: 'sortDirection',
      width: 90,
      render: (v: string) => (v === 'desc' ? '↓ 降序' : '↑ 升序'),
    },
    {
      title: '權重系數',
      dataIndex: 'weight',
      key: 'weight',
      width: 100,
      render: (v: number) => v.toFixed(2),
    },
    {
      title: '觸發條件',
      dataIndex: 'condition',
      key: 'condition',
      width: 140,
      ellipsis: true,
    },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 90,
      render: (v: string) => (
        <Tag style={{ 
          margin: 0,
          padding: '2px 10px',
          border: v === '閃蜂' || v === 'flashBee' ? '1px solid #fadb14' : '1px solid #fa8c16',
          color: v === '閃蜂' || v === 'flashBee' ? '#d4b106' : '#d46b08',
          background: v === '閃蜂' || v === 'flashBee' ? '#fffbe6' : '#fff7e6',
          borderRadius: 4,
          fontWeight: 500
        }}>
          {brandMap[v] || v}
        </Tag>
      ),
    },
    {
      title: '搜索頻道',
      dataIndex: 'searchChannel',
      key: 'searchChannel',
      width: 160,
      render: (v: string[]) => v.map(c => channelMap[c] || c).join('、'),
    },
    {
      title: '優先級',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
    },
    {
      title: '啟用狀態',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (v: boolean) => <Switch checked={v} size="small" />,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: () => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small">編輯</Button>
        </Space>
      ),
    },
  ]

  const tabItems = [
    {
      key: 'config',
      label: (
        <span>
          <SettingOutlined />
          基礎配置
        </span>
      ),
      children: (
        <>
          <div className="search-section">
            <Form layout="inline">
              <Form.Item label="配置名稱">
                <Input placeholder="請輸入配置名稱" allowClear style={{ height: 30 }} />
              </Form.Item>
              <Form.Item label="配置類型">
                <Select placeholder="全部" options={configTypeOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item label="所屬品牌">
                <Select placeholder="全部" options={brandOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item label="搜索頻道">
                <Select placeholder="全部" options={searchChannelOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item label="狀態">
                <Select placeholder="全部" options={statusOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item>
                <div className="search-actions">
                  <Button type="primary" icon={<SearchOutlined />} style={{ height: 30 }}>
                    搜尋
                  </Button>
                  <Button icon={<ReloadOutlined />} style={{ height: 30 }}>
                    重置
                  </Button>
                </div>
              </Form.Item>
            </Form>
          </div>

          <div className="action-section">
            <Space>
              <Button icon={<ExportOutlined />}>數據導出</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                新增配置
              </Button>
            </Space>
          </div>

          <div className="table-section">
            <Table<SearchConfigRecord>
              columns={configColumns}
              dataSource={mockConfigData}
              pagination={{
                total: mockConfigData.length,
                pageSize: 10,
                showTotal: (total) => `共 ${total} 條`,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                defaultPageSize: 10,
                showQuickJumper: true,
              }}
              size="middle"
              bordered={false}
              scroll={{ x: 1400 }}
            />
          </div>
        </>
      ),
    },
    {
      key: 'algorithm',
      label: (
        <span>
          <ThunderboltOutlined />
          算法參數
        </span>
      ),
      children: (
        <>
          <div className="search-section">
            <Form layout="inline">
              <Form.Item label="參數名稱">
                <Input placeholder="請輸入參數名稱" allowClear style={{ height: 30 }} />
              </Form.Item>
              <Form.Item label="所屬品牌">
                <Select placeholder="全部" options={brandOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item label="搜索頻道">
                <Select placeholder="全部" options={searchChannelOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item label="狀態">
                <Select placeholder="全部" options={statusOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item>
                <div className="search-actions">
                  <Button type="primary" icon={<SearchOutlined />} style={{ height: 30 }}>
                    搜尋
                  </Button>
                  <Button icon={<ReloadOutlined />} style={{ height: 30 }}>
                    重置
                  </Button>
                </div>
              </Form.Item>
            </Form>
          </div>

          <div className="action-section">
            <Space>
              <Button icon={<ExportOutlined />}>數據導出</Button>
              <Button type="primary" icon={<PlusOutlined />}>
                新增參數
              </Button>
            </Space>
          </div>

          <div className="table-section">
            <Table<AlgorithmParams>
              columns={algorithmColumns}
              dataSource={mockAlgorithmData}
              pagination={{
                total: mockAlgorithmData.length,
                pageSize: 10,
                showTotal: (total) => `共 ${total} 條`,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                defaultPageSize: 10,
                showQuickJumper: true,
              }}
              size="middle"
              bordered={false}
              scroll={{ x: 1300 }}
            />
          </div>
        </>
      ),
    },
    {
      key: 'recall',
      label: (
        <span>
          <SearchOutlined />
          召回策略
        </span>
      ),
      children: (
        <>
          <div className="search-section">
            <Form layout="inline">
              <Form.Item label="策略名稱">
                <Input placeholder="請輸入策略名稱" allowClear style={{ height: 30 }} />
              </Form.Item>
              <Form.Item label="策略類型">
                <Select placeholder="全部" options={recallStrategyOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item label="所屬品牌">
                <Select placeholder="全部" options={brandOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item label="搜索頻道">
                <Select placeholder="全部" options={searchChannelOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item>
                <div className="search-actions">
                  <Button type="primary" icon={<SearchOutlined />} style={{ height: 30 }}>
                    搜尋
                  </Button>
                  <Button icon={<ReloadOutlined />} style={{ height: 30 }}>
                    重置
                  </Button>
                </div>
              </Form.Item>
            </Form>
          </div>

          <div className="action-section">
            <Space>
              <Button icon={<ExportOutlined />}>數據導出</Button>
              <Button type="primary" icon={<PlusOutlined />}>
                新增策略
              </Button>
            </Space>
          </div>

          <div className="table-section">
            <Table<RecallStrategy>
              columns={recallColumns}
              dataSource={mockRecallData}
              pagination={{
                total: mockRecallData.length,
                pageSize: 10,
                showTotal: (total) => `共 ${total} 條`,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                defaultPageSize: 10,
                showQuickJumper: true,
              }}
              size="middle"
              bordered={false}
              scroll={{ x: 1200 }}
            />
          </div>
        </>
      ),
    },
    {
      key: 'sort',
      label: (
        <span>
          <SortAscendingOutlined />
          排序規則
        </span>
      ),
      children: (
        <>
          <div className="search-section">
            <Form layout="inline">
              <Form.Item label="規則名稱">
                <Input placeholder="請輸入規則名稱" allowClear style={{ height: 30 }} />
              </Form.Item>
              <Form.Item label="排序字段">
                <Select placeholder="全部" options={sortFieldOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item label="所屬品牌">
                <Select placeholder="全部" options={brandOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item label="搜索頻道">
                <Select placeholder="全部" options={searchChannelOptions} style={{ height: 30, width: 200 }} />
              </Form.Item>
              <Form.Item>
                <div className="search-actions">
                  <Button type="primary" icon={<SearchOutlined />} style={{ height: 30 }}>
                    搜尋
                  </Button>
                  <Button icon={<ReloadOutlined />} style={{ height: 30 }}>
                    重置
                  </Button>
                </div>
              </Form.Item>
            </Form>
          </div>

          <div className="action-section">
            <Space>
              <Button icon={<ExportOutlined />}>數據導出</Button>
              <Button type="primary" icon={<PlusOutlined />}>
                新增規則
              </Button>
            </Space>
          </div>

          <div className="table-section">
            <Table<SortRule>
              columns={sortColumns}
              dataSource={mockSortData}
              pagination={{
                total: mockSortData.length,
                pageSize: 10,
                showTotal: (total) => `共 ${total} 條`,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                defaultPageSize: 10,
                showQuickJumper: true,
              }}
              size="middle"
              bordered={false}
              scroll={{ x: 1300 }}
            />
          </div>
        </>
      ),
    },
  ]

  return (
    <div className="content-area">
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} size="large" />

      <Modal
        title={editingRecord ? '編輯搜索配置' : '新增搜索配置'}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText="確定"
        cancelText="取消"
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="配置名稱"
            name="configName"
            rules={[{ required: true, message: '請輸入配置名稱' }]}
          >
            <Input placeholder="請輸入配置名稱，如：外賣搜索基礎算法配置" />
          </Form.Item>

          <Form.Item
            label="配置類型"
            name="configType"
            rules={[{ required: true, message: '請選擇配置類型' }]}
          >
            <Select
              options={configTypeOptions.filter((o) => o.value !== 'all')}
              placeholder="請選擇配置類型"
            />
          </Form.Item>

          <Form.Item
            label="所屬品牌"
            name="brand"
            rules={[{ required: true, message: '請選擇所屬品牌' }]}
          >
            <Select
              options={brandOptions.filter((o) => o.value !== 'all')}
              placeholder="請選擇品牌"
            />
          </Form.Item>

          <Form.Item
            label="搜索頻道"
            name="searchChannel"
            rules={[{ required: true, message: '請選擇搜索頻道' }]}
          >
            <Select
              mode="multiple"
              options={searchChannelOptions}
              placeholder="請選擇搜索頻道"
            />
          </Form.Item>

          <Form.Item
            label="優先級"
            name="priority"
            rules={[{ required: true, message: '請輸入優先級' }]}
            extra="數字越小優先級越高"
          >
            <InputNumber min={1} max={100} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            label="描述"
            name="description"
            rules={[{ required: true, message: '請填寫配置描述' }]}
          >
            <TextArea
              rows={3}
              placeholder="請填寫配置描述，說明該配置的用途和影響範圍"
              maxLength={500}
              showCount
            />
          </Form.Item>

          <Form.Item label="狀態" name="status">
            <Select options={statusOptions.filter((o) => o.value !== 'all')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
