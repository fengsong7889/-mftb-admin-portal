import { useState , useMemo } from 'react'
import { Button, Space, Input, Select, DatePicker, Table, Tag, Form } from 'antd'
import type { TableColumnsType } from 'antd'
import { useNavigate } from 'react-router-dom'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
  ImportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'

const { RangePicker } = DatePicker

/** 品牌选项 */
const brandOptions = [
  { label: '全部', value: 'all' },
  { label: '1mFood', value: '1mFood' },
  { label: '2閃蜂', value: 'flashBee' },
]

/** 账单状态选项 */
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '未結清', value: 'unsettled' },
  { label: '已結清', value: 'settled' },
]

/** 业务频道选项 */
const channelOptions = [
  { label: '全部', value: 'all' },
  { label: 'Supermarket', value: 'supermarket' },
  { label: 'Foreign Trade', value: 'foreignTrade' },
  { label: 'Group Purchase', value: 'groupPurchase' },
]

/** 欠款记录类型 */
interface DebtRecord {
  key: string
  index: number
  groupId: string
  groupName: string
  storeId: string
  storeName: string
  brand: string
  channel: string
  bd: string
  loanDate: string
  billNo: string
  batchNo: string
  approvalFlow: string
  debtTotal: number
  paidAmount: number
  remainAmount: number
  status: string
}

/** 品牌映射 */
const brandMap: Record<string, string> = { '1mFood': '1mFood', flashBee: '2閃蜂' }

/** BD列表 */
const bdList = ['古月', '浩遠', '佳明']

/** 业务频道映射 */
const channelNames = ['Supermarket', 'Foreign Trade', 'Group Purchase']

/** 模拟数据 */
const mockData: DebtRecord[] = Array.from({ length: 12 }, (_, i) => {
  const isSettled = i % 3 === 1
  const debtTotal = 26000
  const paidAmount = isSettled ? 26000 : 6000
  return {
    key: String(i + 1),
    index: i + 1,
    groupId: i % 2 === 0 ? '100001' : '100002',
    groupName: '廣州酒家',
    storeId: `S${String(i + 1).padStart(3, '0')}`,
    storeName: '廣州酒家',
    brand: i % 3 === 0 ? 'flashBee' : '1mFood',
    channel: channelNames[i % 3],
    bd: bdList[i % 3],
    loanDate: '2026-12-11',
    billNo: `QK2026120${10 + i}`,
    batchNo: '123456',
    approvalFlow: '678910',
    debtTotal,
    paidAmount,
    remainAmount: debtTotal - paidAmount,
    status: isSettled ? 'settled' : 'unsettled',
  }
})

/** 格式化金额 */
const fmtAmt = (val: number) => val.toLocaleString()

export default function DebtReconcile() {
  const navigate = useNavigate()
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'index', title: '序號' },
    { key: 'groupId', title: '集團ID' },
    { key: 'groupName', title: '集團名稱' },
    { key: 'storeId', title: '門店ID' },
    { key: 'storeName', title: '門店名稱' },
    { key: 'brand', title: '所屬品牌' },
    { key: 'channel', title: '業務頻道' },
    { key: 'bd', title: '所屬BD' },
    { key: 'loanDate', title: '借款日期' },
    { key: 'billNo', title: '賬單編號' },
    { key: 'batchNo', title: '批次號' },
    { key: 'approvalFlow', title: '審批流程' },
    { key: 'debtTotal', title: '欠款總額' },
    { key: 'paidAmount', title: '已還金額' },
    { key: 'remainAmount', title: '剩餘待還' },
    { key: 'status', title: '賬單狀態' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('debt-reconcile', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const }
  ])

  

  const columns: TableColumnsType<DebtRecord> = [
    { title: '序號', dataIndex: 'index', key: 'index', width: 60, align: 'center', fixed: 'left' },
    { title: '集團ID', dataIndex: 'groupId', key: 'groupId', width: 100, fixed: 'left' },
    { title: '集團名稱', dataIndex: 'groupName', key: 'groupName', width: 120 },
    { title: '門店ID', dataIndex: 'storeId', key: 'storeId', width: 90 },
    { title: '門店名稱', dataIndex: 'storeName', key: 'storeName', width: 120 },
    { title: '所屬品牌', dataIndex: 'brand', key: 'brand', width: 100, render: (v: string) => brandMap[v] || v },
    { title: '業務頻道', dataIndex: 'channel', key: 'channel', width: 130 },
    { title: '所屬BD', dataIndex: 'bd', key: 'bd', width: 90 },
    { title: '借款日期', dataIndex: 'loanDate', key: 'loanDate', width: 120 },
    { title: '賬單編號', dataIndex: 'billNo', key: 'billNo', width: 140 },
    { title: '批次號', dataIndex: 'batchNo', key: 'batchNo', width: 100 },
    { title: '審批流程', dataIndex: 'approvalFlow', key: 'approvalFlow', width: 100 },
    {
      title: '欠款總額', dataIndex: 'debtTotal', key: 'debtTotal', width: 110, align: 'right',
      render: (v: number) => <span style={{ color: '#E8720C', fontWeight: 600 }}>{fmtAmt(v)}</span>,
    },
    {
      title: '已還金額', dataIndex: 'paidAmount', key: 'paidAmount', width: 110, align: 'right',
      render: (v: number) => <span style={{ color: '#2E7D32', fontWeight: 500 }}>{fmtAmt(v)}</span>,
    },
    {
      title: '剩餘待還', dataIndex: 'remainAmount', key: 'remainAmount', width: 110, align: 'right',
      render: (v: number) => (
        <span style={{ color: v > 0 ? '#E53935' : '#2E7D32', fontWeight: 600 }}>{fmtAmt(v)}</span>
      ),
    },
    {
      title: '賬單狀態', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => (
        v === 'settled'
          ? <Tag color="green">已結清</Tag>
          : <Tag color="red">未結清</Tag>
      ),
    },
    {
      title: '操作', key: 'action', width: 80, fixed: 'right',
      render: () => <a onClick={() => navigate('/debt-detail')}>詳情</a>,
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="集團ID">
            <Input placeholder="請輸入集團ID" allowClear />
          </Form.Item>
          <Form.Item label="集團名稱">
            <Input placeholder="請輸入集團名稱" allowClear />
          </Form.Item>
          <Form.Item label="所屬品牌">
            <Select placeholder="請選擇" options={brandOptions} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="批次號">
            <Input placeholder="請輸入批次號" allowClear />
          </Form.Item>
          <Form.Item label="審批流程">
            <Input placeholder="請輸入審批流程" allowClear />
          </Form.Item>
          <Form.Item label="賬單編號">
            <Input placeholder="請輸入賬單編號" allowClear />
          </Form.Item>
          <Form.Item label="借款日期">
            <RangePicker format="YYYY-MM-DD" placeholder={['開始日期', '結束日期']} />
          </Form.Item>
          <Form.Item label="賬單狀態">
            <Select placeholder="請選擇" options={statusOptions} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item label="業務頻道">
            <Select placeholder="請選擇" options={channelOptions} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}>查詢</Button>
              <Button icon={<ReloadOutlined />}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 - 三个特色卡片按钮 */}
      <div className="debt-action-bar">
        <div className="debt-stat-card debt-stat-card--red">
          <span className="debt-stat-icon">💰</span>
          <span className="debt-stat-label">總待還金額</span>
          <span className="debt-stat-value">219,821</span>
        </div>
        <div className="debt-stat-card debt-stat-card--green">
          <ExportOutlined className="debt-stat-icon-btn" />
          <span className="debt-stat-label">數據導出</span>
        </div>
        <div className="debt-stat-card debt-stat-card--purple">
          <ImportOutlined className="debt-stat-icon-btn" />
          <span className="debt-stat-label">還款導入</span>
        </div>
      </div>

      {/* 列表区域 */}
      <div className="action-section">
        {configComponent}
      </div>

      <div className="table-section">
        <Table<DebtRecord>
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          columns={applyConfig(columns)}
          dataSource={mockData}
          pagination={{
            total: 200,
            pageSize: 20,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            showQuickJumper: true,
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 2100 }}
        />
      </div>
    </div>
  )
}
