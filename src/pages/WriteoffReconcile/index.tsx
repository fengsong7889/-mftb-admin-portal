import { useState , useMemo } from 'react'
import { Button, Space, Input, Select, DatePicker, Table, Tag, Form } from 'antd'
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

/** 商家明细记录类型 */
interface ReconcileRecord {
  key: string
  index: number
  date: string
  merchantId: string
  merchantName: string
  brand: string
  initVirtualBalance: number
  initActualBalance: number
  virtualRecharge: number
  actualRecharge: number
  bankReceipt: number
  revenuePayment: number
  virtualActualConsumption: number
  virtualConsumption: number
  virtualRefund: number
  actualActualConsumption: number
  actualConsumption: number
  actualRefund: number
  virtualTransferIn: number
  actualTransferIn: number
  virtualTransferOut: number
  actualTransferOut: number
  virtualNetAmount: number
  actualNetAmount: number
}

/** 模拟数据 */
const merchantNames = ['廣州酒家', '2閃蜂', '廣州酒家', '2閃蜂', '廣州酒家', '2閃蜂', '廣州酒家', '2閃蜂', '廣州酒家', '2閃蜂', '廣州酒家', '2閃蜂']
const brands = ['1mFood', '1mFood', '1mFood', '2閃蜂', '1mFood', '1mFood', '1mFood', '2閃蜂', '1mFood', '1mFood', '1mFood', '1mFood']
const virtualNetAmounts = [800.21, -600.21, 750.21, 750.21, -600.21, 750.21, 800.21, -600.21, 750.21, 800.21, 750.21, 750.21]

const mockData: ReconcileRecord[] = Array.from({ length: 12 }, (_, i) => ({
  key: String(i + 1),
  index: i + 1,
  date: '2026/05/06',
  merchantId: '123456',
  merchantName: merchantNames[i],
  brand: brands[i],
  initVirtualBalance: 355645.01,
  initActualBalance: 155645.01,
  virtualRecharge: 1000.21,
  actualRecharge: 900.21,
  bankReceipt: 800,
  revenuePayment: 100.21,
  virtualActualConsumption: 300,
  virtualConsumption: 600,
  virtualRefund: 300,
  actualActualConsumption: 200,
  actualConsumption: 400,
  actualRefund: 200,
  virtualTransferIn: 600,
  actualTransferIn: 100,
  virtualTransferOut: 500,
  actualTransferOut: 50,
  virtualNetAmount: virtualNetAmounts[i],
  actualNetAmount: 750.21,
}))

/** 格式化金额 */
const fmtAmt = (val: number) => val.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 变动金额单元格 */
const NetAmountCell = ({ val }: { val: number }) => {
  const color = val >= 0 ? '#2E7D32' : '#E53935'
  return <span style={{ color, fontWeight: 600 }}>{val >= 0 ? '' : ''}{fmtAmt(val)}</span>
}

/** 概览卡片组件 */
function SummaryCard({ title, icon, children, bgColor }: { title: string; icon: string; children: React.ReactNode; bgColor: string }) {
  return (
    <div className="reconcile-summary-card" style={{ background: bgColor }}>
      <div className="reconcile-card-title">
        <span className="reconcile-card-icon">{icon}</span>
        {title}
      </div>
      <div className="reconcile-card-body">{children}</div>
    </div>
  )
}

/** 指标卡片 */
function MetricItem({ label, value, color, subLabel, subValue, subColor }: {
  label: string; value: string; color: string; subLabel?: string; subValue?: string; subColor?: string
}) {
  return (
    <div className="reconcile-metric">
      <div className="reconcile-metric-label">{label}</div>
      <div className="reconcile-metric-value" style={{ color }}>{value}</div>
      {subLabel && (
        <div className="reconcile-metric-sub">
          <span className="reconcile-metric-sub-label">{subLabel}</span>
          <span className="reconcile-metric-sub-value" style={{ color: subColor || color }}>{subValue}</span>
        </div>
      )}
    </div>
  )
}

export default function WriteoffReconcile() {
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
    { key: 'reconcileDate', title: '對賬日期' },
    { key: 'billNo', title: '賬單編號' },
    { key: 'batchNo', title: '批次號' },
    { key: 'virtualActualConsumption', title: '虛擬賬戶實際消費' },
    { key: 'virtualConsumption', title: '虛擬賬戶消費' },
    { key: 'virtualRefund', title: '虛擬賬戶退款' },
    { key: 'actualActualConsumption', title: '實收賬戶實際消費' },
    { key: 'actualConsumption', title: '實收賬戶消費' },
    { key: 'actualRefund', title: '實收賬戶退款' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('writeoff-reconcile', columnMeta)

  

  const columns: TableColumnsType<ReconcileRecord> = [
    { title: '序號', dataIndex: 'index', key: 'index', width: 60, align: 'center', fixed: 'left' },
    { title: '統計日期', dataIndex: 'date', key: 'date', width: 120, fixed: 'left' },
    { title: '商戶ID', dataIndex: 'merchantId', key: 'merchantId', width: 100, fixed: 'left' },
    { title: '商戶名稱', dataIndex: 'merchantName', key: 'merchantName', width: 120 },
    { title: '所屬品牌', dataIndex: 'brand', key: 'brand', width: 100, render: (v: string) => <Tag>{v}</Tag> },
    {
      title: '期初虛擬賬戶餘額', dataIndex: 'initVirtualBalance', key: 'initVirtualBalance', width: 160, align: 'right',
      render: (v: number) => <span style={{ color: '#1976D2', fontWeight: 500 }}>{fmtAmt(v)}</span>,
    },
    {
      title: '期初實收賬戶餘額', dataIndex: 'initActualBalance', key: 'initActualBalance', width: 160, align: 'right',
      render: (v: number) => <span style={{ color: '#E8720C', fontWeight: 500 }}>{fmtAmt(v)}</span>,
    },
    {
      title: '虛擬賬戶充值餘額', dataIndex: 'virtualRecharge', key: 'virtualRecharge', width: 160, align: 'right',
      render: (v: number) => <span style={{ color: '#1976D2' }}>{fmtAmt(v)}</span>,
    },
    {
      title: '實收賬戶充值餘額', dataIndex: 'actualRecharge', key: 'actualRecharge', width: 160, align: 'right',
      render: (v: number) => <span style={{ color: '#E8720C' }}>{fmtAmt(v)}</span>,
    },
    { title: '銀行收款', dataIndex: 'bankReceipt', key: 'bankReceipt', width: 100, align: 'right', render: (v: number) => fmtAmt(v) },
    { title: '營業額支付', dataIndex: 'revenuePayment', key: 'revenuePayment', width: 110, align: 'right', render: (v: number) => fmtAmt(v) },
    { title: '虛擬賬戶實際消費', dataIndex: 'virtualActualConsumption', key: 'virtualActualConsumption', width: 150, align: 'right', render: (v: number) => fmtAmt(v) },
    { title: '虛擬賬戶消費', dataIndex: 'virtualConsumption', key: 'virtualConsumption', width: 130, align: 'right', render: (v: number) => fmtAmt(v) },
    { title: '虛擬賬戶退款', dataIndex: 'virtualRefund', key: 'virtualRefund', width: 130, align: 'right', render: (v: number) => fmtAmt(v) },
    { title: '實收賬戶實際消費', dataIndex: 'actualActualConsumption', key: 'actualActualConsumption', width: 150, align: 'right', render: (v: number) => fmtAmt(v) },
    { title: '實收賬戶消費', dataIndex: 'actualConsumption', key: 'actualConsumption', width: 130, align: 'right', render: (v: number) => fmtAmt(v) },
    { title: '實收賬戶退款', dataIndex: 'actualRefund', key: 'actualRefund', width: 130, align: 'right', render: (v: number) => fmtAmt(v) },
    {
      title: '虛擬賬戶轉入金額', dataIndex: 'virtualTransferIn', key: 'virtualTransferIn', width: 150, align: 'right',
      render: (v: number) => <span style={{ color: '#1976D2' }}>{fmtAmt(v)}</span>,
    },
    {
      title: '實收賬戶轉入金額', dataIndex: 'actualTransferIn', key: 'actualTransferIn', width: 150, align: 'right',
      render: (v: number) => <span style={{ color: '#E8720C' }}>{fmtAmt(v)}</span>,
    },
    {
      title: '虛擬賬戶轉出金額', dataIndex: 'virtualTransferOut', key: 'virtualTransferOut', width: 150, align: 'right',
      render: (v: number) => <span style={{ color: '#1976D2' }}>{fmtAmt(v)}</span>,
    },
    {
      title: '實收賬戶轉出金額', dataIndex: 'actualTransferOut', key: 'actualTransferOut', width: 150, align: 'right',
      render: (v: number) => <span style={{ color: '#E8720C' }}>{fmtAmt(v)}</span>,
    },
    {
      title: '虛擬賬戶交易淨額', dataIndex: 'virtualNetAmount', key: 'virtualNetAmount', width: 150, align: 'right',
      render: (v: number) => <NetAmountCell val={v} />,
    },
    {
      title: '實收賬戶交易淨額', dataIndex: 'actualNetAmount', key: 'actualNetAmount', width: 150, align: 'right',
      render: (v: number) => <NetAmountCell val={v} />,
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
          <Form.Item label="統計週期">
            <RangePicker
              format="YYYY-MM-DD"
              placeholder={['開始日期', '結束日期']}
            />
          </Form.Item>
          <Form.Item label="所屬品牌">
            <Select placeholder="請選擇" options={brandOptions} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}>查詢</Button>
              <Button icon={<ReloadOutlined />}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 概览统计区域 */}
      <div className="reconcile-overview">
        {/* 期初 / 期末 结余 */}
        <div className="reconcile-balance-row">
          <SummaryCard title="期初結餘統計" icon="📄" bgColor="linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)">
            <div className="reconcile-balance-grid">
              <div className="reconcile-balance-item">
                <div className="reconcile-balance-label">期初虛擬賬戶餘額</div>
                <div className="reconcile-balance-value" style={{ color: '#1565C0' }}>19,000,000.21</div>
              </div>
              <div className="reconcile-balance-item">
                <div className="reconcile-balance-label">期初實收賬戶餘額</div>
                <div className="reconcile-balance-value" style={{ color: '#E8720C' }}>19,000,000.21</div>
              </div>
              <div className="reconcile-balance-ratio">
                <Tag color="pink">比例 1:1</Tag>
              </div>
            </div>
          </SummaryCard>

          <SummaryCard title="期末結餘統計" icon="📄" bgColor="linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)">
            <div className="reconcile-balance-grid">
              <div className="reconcile-balance-item">
                <div className="reconcile-balance-label">期末虛擬賬戶餘額</div>
                <div className="reconcile-balance-value" style={{ color: '#1565C0' }}>19,000,000.21</div>
              </div>
              <div className="reconcile-balance-item">
                <div className="reconcile-balance-label">期末實收賬戶餘額</div>
                <div className="reconcile-balance-value" style={{ color: '#E8720C' }}>19,000,000.21</div>
              </div>
              <div className="reconcile-balance-ratio">
                <Tag color="pink">比例 1:1</Tag>
              </div>
            </div>
          </SummaryCard>
        </div>

        {/* 统计明细卡片 */}
        <div className="reconcile-stats-row">
          <SummaryCard title="充值統計" icon="📄" bgColor="#F8FAFF">
            <MetricItem label="虛擬賬戶充值總額" value="19,000,000.21" color="#1565C0"
              subLabel="實收賬戶充值總額" subValue="19,000,000.21" subColor="#E8720C" />
            <MetricItem label="銀行收款" value="800.00" color="#1565C0"
              subLabel="營業額支付" subValue="100.21" subColor="#E8720C" />
          </SummaryCard>

          <SummaryCard title="消費統計" icon="📄" bgColor="#FFF8F0">
            <MetricItem label="虛擬賬戶實際消費" value="19,000,000.21" color="#E8720C"
              subLabel="虛擬賬戶消費" subValue="19,000,000.21" subColor="#E53935" />
            <MetricItem label="實收賬戶實際消費" value="19,000,000.21" color="#E8720C"
              subLabel="實收賬戶消費" subValue="19,000,000.21" subColor="#E53935" />
          </SummaryCard>

          <SummaryCard title="轉入轉出" icon="📄" bgColor="#F3F0FF">
            <MetricItem label="虛擬賬戶轉入金額" value="19,000,000.21" color="#7B1FA2"
              subLabel="虛擬賬戶轉出金額" subValue="19,000,000.21" subColor="#7B1FA2" />
            <MetricItem label="實收賬戶轉入金額" value="19,000,000.21" color="#7B1FA2"
              subLabel="實收賬戶轉出金額" subValue="19,000,000.21" subColor="#7B1FA2" />
          </SummaryCard>

          <SummaryCard title="交易淨額" icon="📄" bgColor="#F0FFF4">
            <MetricItem label="虛擬賬戶交易淨額" value="19,000,000.21" color="#2E7D32"
              subLabel="實收賬戶交易淨額" subValue="19,000,000.21" subColor="#2E7D32" />
          </SummaryCard>
        </div>
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

      {/* 商家明细列表 */}
      <div className="table-section">
        <Table<ReconcileRecord>
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
          scroll={{ x: 3400 }}
        />
      </div>
    </div>
  )
}
