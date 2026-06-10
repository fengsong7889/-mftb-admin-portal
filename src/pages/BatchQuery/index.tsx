import { useState , useMemo } from 'react'
import { Button, Space, Input, Select, Table, Tag, Form, DatePicker } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'

const { RangePicker } = DatePicker

/** 品牌选项 */
const brandOptions = [
  { label: '全部', value: 'all' },
  { label: '1mFood', value: '1mFood' },
  { label: '2閃蜂', value: 'flashBee' },
]

/** 批次类型选项 */
const batchTypeOptions = [
  { label: '全部', value: 'all' },
  { label: '充值', value: 'recharge' },
  { label: '轉賬', value: 'transfer' },
  { label: '合併', value: 'merge' },
]

/** 是否实收选项 */
const actualOptions = [
  { label: '全部', value: 'all' },
  { label: '是', value: 'yes' },
  { label: '否', value: 'no' },
]

/** 批次记录类型 */
interface BatchRecord {
  key: string
  index: number
  groupId: string
  groupName: string
  brand: string
  batchType: string
  batchNo: string
  flowNo: string
  rechargeTime: string
  isActual: string
  virtualAmount: number
  actualAmount: number
  discountAmount: number
  applicant: string
  bd: string
  remark: string
}

/** 品牌显示映射 */
const brandMap: Record<string, string> = {
  '1mFood': '1mFood',
  flashBee: '2閃蜂',
}

/** 批次类型显示映射 */
const batchTypeMap: Record<string, string> = {
  recharge: '充值',
  transfer: '轉賬',
  merge: '合併',
}

/** 模拟数据 */
const groupNames = ['廣州酒駕', '廣州酒駕', '廣州酒駕', '廣州酒駕', '廣州酒駕', '廣州酒駕', '廣州酒駕', '廣州酒駕', '廣州酒駕', '廣州酒駕', '廣州酒駕', '廣州酒駕']
const batchTypes = ['recharge', 'recharge', 'transfer', 'recharge', 'merge', 'recharge', 'transfer', 'recharge', 'merge', 'recharge', 'recharge', 'transfer']
const actualFlags = ['是', '是', '否', '是', '--', '--', '--', '--', '--', '是', '是', '--']
const remarks = ['新店首充，獎勵多', '新店首充，獎勵多', '不綁定BD', '新店首充，獎勵多', '--', '--', '新店首充，獎勵多', '--', '不綁定BD', '新店首充，獎勵多', '--', '--']
const virtualAmounts = [28000, 26000, 24000, 22000, 20000, 28000, 26000, 24000, 22000, 20000, 28000, 26000]
const actualAmounts = [20000, 22000, 16000, 18000, 14000, 20000, 22000, 16000, 18000, 14000, 20000, 22000]

const mockData: BatchRecord[] = Array.from({ length: 12 }, (_, i) => ({
  key: String(i + 1),
  index: i + 1,
  groupId: i % 2 === 0 ? '100001' : '100002',
  groupName: groupNames[i],
  brand: i % 3 === 0 ? 'flashBee' : '1mFood',
  batchType: batchTypes[i],
  batchNo: 'PC202612281',
  flowNo: '202601',
  rechargeTime: '2026-02-28 18:20:21',
  isActual: actualFlags[i],
  virtualAmount: virtualAmounts[i],
  actualAmount: actualAmounts[i],
  discountAmount: 8000,
  applicant: '藥殘(0001)',
  bd: i % 3 === 0 ? '--' : '關山月(001)',
  remark: remarks[i],
}))

/** 格式化金额（带正号） */
const formatAmount = (val: number, prefix = '+') => {
  return `${prefix}${val.toLocaleString()}`
}

export default function BatchQuery() {
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'index', title: '序號' },
    { key: 'groupId', title: '集團ID' },
    { key: 'groupName', title: '集團名稱' },
    { key: 'brand', title: '所屬品牌' },
    { key: 'batchType', title: '批次類型' },
    { key: 'batchNo', title: '批次號' },
    { key: 'flowNo', title: '流程編號' },
    { key: 'rechargeTime', title: '充值時間' },
    { key: 'isActual', title: '實收標記' },
    { key: 'virtualAmount', title: '虛擬金額' },
    { key: 'actualAmount', title: '實收金額' },
    { key: 'discountAmount', title: '優惠金額' },
    { key: 'applicant', title: '申請人' },
    { key: 'bd', title: '所屬BD' },
    { key: 'remark', title: '備註' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('batch-query', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const }
  ])

  

  const columns: TableColumnsType<BatchRecord> = [
    {
      title: '序號',
      dataIndex: 'index',
      key: 'index',
      width: 60,
      align: 'center',
    },
    {
      title: '集團ID',
      dataIndex: 'groupId',
      key: 'groupId',
      width: 100,
    },
    {
      title: '集團名稱',
      dataIndex: 'groupName',
      key: 'groupName',
      width: 120,
    },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 100,
      render: (val: string) => brandMap[val] || val,
    },
    {
      title: '批次類型',
      dataIndex: 'batchType',
      key: 'batchType',
      width: 90,
      render: (val: string) => {
        const text = batchTypeMap[val] || val
        const colorMap: Record<string, string> = { recharge: 'blue', transfer: 'green', merge: 'orange' }
        return <Tag color={colorMap[val] || 'default'}>{text}</Tag>
      },
    },
    {
      title: '批次編號',
      dataIndex: 'batchNo',
      key: 'batchNo',
      width: 140,
    },
    {
      title: '流程編號',
      dataIndex: 'flowNo',
      key: 'flowNo',
      width: 100,
    },
    {
      title: '充值時間',
      dataIndex: 'rechargeTime',
      key: 'rechargeTime',
      width: 180,
    },
    {
      title: '是否實收',
      dataIndex: 'isActual',
      key: 'isActual',
      width: 90,
      align: 'center',
      render: (val: string) => {
        if (val === '是') return <Tag color="green">是</Tag>
        if (val === '否') return <Tag color="red">否</Tag>
        return <span style={{ color: '#999' }}>--</span>
      },
    },
    {
      title: '虛擬賬戶充值金額',
      dataIndex: 'virtualAmount',
      key: 'virtualAmount',
      width: 160,
      align: 'right',
      render: (val: number) => (
        <span style={{ color: '#E8720C', fontWeight: 500 }}>{formatAmount(val)}</span>
      ),
    },
    {
      title: '實收賬戶充值金額',
      dataIndex: 'actualAmount',
      key: 'actualAmount',
      width: 160,
      align: 'right',
      render: (val: number) => (
        <span style={{ color: '#1976D2', fontWeight: 500 }}>{formatAmount(val)}</span>
      ),
    },
    {
      title: '優惠金額',
      dataIndex: 'discountAmount',
      key: 'discountAmount',
      width: 100,
      align: 'right',
      render: (val: number) => <span style={{ fontWeight: 500 }}>{val.toLocaleString()}</span>,
    },
    {
      title: '申請人',
      dataIndex: 'applicant',
      key: 'applicant',
      width: 120,
    },
    {
      title: '歸屬BD',
      dataIndex: 'bd',
      key: 'bd',
      width: 120,
      render: (val: string) =>
        val === '--' ? <span style={{ color: '#999' }}>--</span> : val,
    },
    {
      title: '備註信息',
      dataIndex: 'remark',
      key: 'remark',
      width: 180,
      render: (val: string) =>
        val === '--' ? <span style={{ color: '#999' }}>--</span> : val,
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right',
      render: () => <a>明細</a>,
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
          <Form.Item label="批次編號">
            <Input placeholder="請輸入批次編號" allowClear />
          </Form.Item>
          <Form.Item label="流程編號">
            <Input placeholder="請輸入流程編號" allowClear />
          </Form.Item>
          <Form.Item label="充值時間">
            <RangePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              placeholder={['開始時間', '結束時間']}
            />
          </Form.Item>
          <Form.Item label="是否實收">
            <Select placeholder="請選擇" options={actualOptions} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item label="批次類型">
            <Select placeholder="請選擇" options={batchTypeOptions} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}>查詢</Button>
              <Button icon={<ReloadOutlined />}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <Space>
          <Button icon={<ExportOutlined />} style={{ color: '#52C41A', borderColor: '#52C41A' }}>
            數據導出
          </Button>
        </Space>
              {configComponent}
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<BatchRecord>
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
          scroll={{ x: 2200 }}
        />
      </div>
    </div>
  )
}
