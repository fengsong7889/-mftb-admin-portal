import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Button, Input, Select, DatePicker, Table, Form } from 'antd'
import type { TableColumnsType } from 'antd'
import type { Dayjs } from 'dayjs'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { useAuth } from '../../contexts/AuthContext'
import BrandTag from '../../components/BrandTag'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'
import { fetchFinWriteoffReconcile, withFinanceFallback } from '../../api/finance'
import type { FinReconcileQuery, FinReconcileResult, FinReconcileSummary } from '../../api/finance'

const { RangePicker } = DatePicker

/**
 * 充消對賬日報行（每個集團每日一行）
 * 口徑與明細查詢交易類型對齊：充值 / 扣款 / 消費 / 轉入 / 轉出
 * 勾稽關係：期末餘額 = 期初餘額 + 交易淨額
 */
interface ReconcileRecord {
  key: string
  index: number
  date: string
  groupId: string
  groupName: string
  brand: string
  initVirtual: number
  initActual: number
  virtualRecharge: number
  actualRecharge: number
  bankReceipt: number
  revenuePayment: number
  consumeTotal: number
  deductVirtual: number
  deductActual: number
  virtualTransferIn: number
  actualTransferIn: number
  virtualTransferOut: number
  actualTransferOut: number
  virtualNet: number
  actualNet: number
  endVirtual: number
  endActual: number
}

/** 保留兩位小數 */
const r2 = (n: number) => Math.round(n * 100) / 100

/** 格式化金額（千分位 + 兩位小數） */
const fmtAmt = (val: number) => val.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Mock 集團（期初餘額為週期首日期初） */
const mockGroups = [
  { groupId: '100001', groupName: '廣州酒家', brand: 'mFood', initVirtual: 355645.01, initActual: 155645.01 },
  { groupId: '100002', groupName: '海底撈', brand: 'flashBee', initVirtual: 208000.00, initActual: 96000.00 },
  { groupId: '100003', groupName: '星巴克', brand: 'mFood', initVirtual: 132500.50, initActual: 60200.50 },
]

const mockDates = ['2026-02-25', '2026-02-26', '2026-02-27', '2026-02-28']

/**
 * 生成勾稽自洽的 Mock 日報數據：
 * - 同一集團相鄰日期首尾相接（今日期初 = 昨日期末）
 * - 實收充值總額 = 銀行收款 + 營業額支付
 * - 交易淨額 = 充值 - 消費 - 扣款 + 轉入 - 轉出
 */
const mockData: ReconcileRecord[] = (() => {
  const rows: ReconcileRecord[] = []
  mockGroups.forEach((g, gi) => {
    let startVirtual = g.initVirtual
    let startActual = g.initActual
    mockDates.forEach((date, di) => {
      const bankReceipt = r2((gi + 1) * 2000 + di * 500)
      const revenuePayment = r2((gi + 1) * 800 + di * 100 + 0.21)
      const actualRecharge = r2(bankReceipt + revenuePayment)
      const virtualRecharge = r2(actualRecharge * 1.2)
      const consumeTotal = r2((gi + 1) * 1500 + di * 300)
      const deductVirtual = r2((gi + 1) * 600 + di * 200)
      // 營業額支付部分當日經門店營業額扣回（影響實收賬戶）
      const deductActual = revenuePayment
      const virtualTransferIn = gi === 1 && di === 2 ? 24000 : 0
      const virtualTransferOut = gi === 0 && di === 2 ? 24000 : 0
      const actualTransferIn = 0
      const actualTransferOut = 0
      const virtualNet = r2(virtualRecharge - consumeTotal - deductVirtual + virtualTransferIn - virtualTransferOut)
      const actualNet = r2(actualRecharge - deductActual + actualTransferIn - actualTransferOut)
      const endVirtual = r2(startVirtual + virtualNet)
      const endActual = r2(startActual + actualNet)
      rows.push({
        key: `${g.groupId}_${date}`,
        index: 0,
        date,
        groupId: g.groupId,
        groupName: g.groupName,
        brand: g.brand,
        initVirtual: startVirtual,
        initActual: startActual,
        virtualRecharge,
        actualRecharge,
        bankReceipt,
        revenuePayment,
        consumeTotal,
        deductVirtual,
        deductActual,
        virtualTransferIn,
        actualTransferIn,
        virtualTransferOut,
        actualTransferOut,
        virtualNet,
        actualNet,
        endVirtual,
        endActual,
      })
      startVirtual = endVirtual
      startActual = endActual
    })
  })
  // 按日期倒序、集團正序展示
  return rows
    .sort((a, b) => b.date.localeCompare(a.date) || a.groupId.localeCompare(b.groupId))
    .map((r, i) => ({ ...r, index: i + 1 }))
})()

/* ---- 數字加載動畫（遵循數據指標統計卡標準，支持兩位小數） ---- */
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>(0)
  useEffect(() => {
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setValue(r2(target * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])
  return value
}

function AnimatedAmount({ value }: { value: number }) {
  const animated = useCountUp(value)
  return <>{fmtAmt(animated)}</>
}

/** 交易淨額單元格（+藍 / -紅，與明細查詢金額口徑一致） */
const NetAmountCell = ({ val }: { val: number }) => (
  <span style={{ color: val >= 0 ? '#1976D2' : '#FF4D4F', fontWeight: 600 }}>
    {val >= 0 ? '+' : '-'}{fmtAmt(Math.abs(val))}
  </span>
)

/** 概覽卡片組件（含 hover 上浮動效） */
function SummaryCard({ title, icon, children, bgColor }: { title: string; icon: string; children: React.ReactNode; bgColor: string }) {
  return (
    <div
      className="reconcile-summary-card"
      style={{ background: bgColor, transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-4px)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)'
      }}
    >
      <div className="reconcile-card-title">
        <span className="reconcile-card-icon">{icon}</span>
        {title}
      </div>
      <div className="reconcile-card-body">{children}</div>
    </div>
  )
}

/** 指標項 */
function MetricItem({ label, value, color, subLabel, subValue, subColor }: {
  label: string; value: number; color: string; subLabel?: string; subValue?: number; subColor?: string
}) {
  return (
    <div className="reconcile-metric">
      <div className="reconcile-metric-label">{label}</div>
      <div className="reconcile-metric-value" style={{ color }}><AnimatedAmount value={value} /></div>
      {subLabel && subValue !== undefined && (
        <div className="reconcile-metric-sub">
          <span className="reconcile-metric-sub-label">{subLabel}</span>
          <span className="reconcile-metric-sub-value" style={{ color: subColor || color }}><AnimatedAmount value={subValue} /></span>
        </div>
      )}
    </div>
  )
}

/** 搜索區篩選條件 */
interface ReconcileFilters {
  groupId?: string
  groupName?: string
  brand?: string
  period?: [Dayjs, Dayjs]
}

/** 「全部」等價於不篩選 */
function pickValue(v?: string) {
  return !v || v === 'all' ? undefined : v
}

/** 彙總指標字段（除期初/期末外均為區間合計） */
const SUMMARY_SUM_KEYS = [
  'virtualRecharge', 'actualRecharge', 'bankReceipt', 'revenuePayment',
  'consumeTotal', 'deductVirtual', 'deductActual',
  'virtualTransferIn', 'actualTransferIn', 'virtualTransferOut', 'actualTransferOut',
  'virtualNet', 'actualNet',
] as const

/** 空彙總（加載中 / 無數據） */
const emptySummary: FinReconcileSummary = {
  initVirtual: 0, initActual: 0, endVirtual: 0, endActual: 0,
  virtualRecharge: 0, actualRecharge: 0, bankReceipt: 0, revenuePayment: 0,
  consumeTotal: 0, deductVirtual: 0, deductActual: 0,
  virtualTransferIn: 0, actualTransferIn: 0, virtualTransferOut: 0, actualTransferOut: 0,
  virtualNet: 0, actualNet: 0,
}

/**
 * 後端不可用時的降級查詢：演示日報本地篩選分頁 + 彙總
 * 期初取各集團區間首日期初、期末取各集團區間末日期末，保證勾稽成立
 */
function mockFetchReconcile(query: FinReconcileQuery): FinReconcileResult {
  const filtered = mockData.filter(r => {
    if (query.groupId && !r.groupId.includes(query.groupId)) return false
    if (query.groupName && !r.groupName.includes(query.groupName)) return false
    if (query.brand && r.brand !== query.brand) return false
    if (query.startDate && r.date < query.startDate) return false
    if (query.endDate && r.date > query.endDate) return false
    return true
  })
  const summary = { ...emptySummary }
  SUMMARY_SUM_KEYS.forEach(k => {
    summary[k] = r2(filtered.reduce((acc, r) => acc + r[k], 0))
  })
  const groupIds = [...new Set(filtered.map(r => r.groupId))]
  groupIds.forEach(id => {
    const rows = filtered.filter(r => r.groupId === id).sort((a, b) => a.date.localeCompare(b.date))
    summary.initVirtual = r2(summary.initVirtual + rows[0].initVirtual)
    summary.initActual = r2(summary.initActual + rows[0].initActual)
    summary.endVirtual = r2(summary.endVirtual + rows[rows.length - 1].endVirtual)
    summary.endActual = r2(summary.endActual + rows[rows.length - 1].endActual)
  })
  const page = query.page || 1
  const size = query.size || 10
  return { records: filtered.slice((page - 1) * size, page * size), total: filtered.length, summary }
}

export default function WriteoffReconcile() {
  // 菜单权限：writeoff-reconcile
  const { hasPermission } = useAuth()
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [searchForm] = Form.useForm<ReconcileFilters>()
  const [data, setData] = useState<ReconcileRecord[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<FinReconcileSummary>(emptySummary)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<ReconcileFilters>({})
  const [pagination, setPagination] = useState({ page: 1, size: 10 })

  /** 組裝查詢參數 */
  const buildQuery = useCallback((): FinReconcileQuery => ({
    page: pagination.page,
    size: pagination.size,
    groupId: filters.groupId?.trim() || undefined,
    groupName: filters.groupName?.trim() || undefined,
    brand: pickValue(filters.brand),
    startDate: filters.period?.[0]?.format('YYYY-MM-DD'),
    endDate: filters.period?.[1]?.format('YYYY-MM-DD'),
  }), [filters, pagination])

  /** 加載對賬日報（後端不可用時降級到演示數據） */
  const loadReconcile = useCallback(async () => {
    const query = buildQuery()
    setLoading(true)
    try {
      const res = await withFinanceFallback<FinReconcileResult>(
        () => fetchFinWriteoffReconcile(query),
        () => mockFetchReconcile(query),
      )
      const start = (query.page! - 1) * query.size!
      setData((res.records ?? []).map((r, i) => ({
        ...r,
        key: `${r.groupId}_${r.date}`,
        index: start + i + 1,
      })))
      setTotal(res.total ?? 0)
      setSummary(res.summary ?? emptySummary)
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  useEffect(() => {
    void loadReconcile()
  }, [loadReconcile])

  const handleSearch = () => {
    setFilters(searchForm.getFieldsValue())
    setPagination(p => ({ ...p, page: 1 }))
  }

  const handleReset = () => {
    searchForm.resetFields()
    setFilters({})
    setPagination({ page: 1, size: 10 })
  }

  /** 列配置元數據 */
  const columnMeta = useMemo(() => [
    { key: 'date', title: '統計日期' },
    { key: 'groupId', title: '集團ID' },
    { key: 'groupName', title: '集團名稱' },
    { key: 'brand', title: '所屬品牌' },
    { key: 'initVirtual', title: '期初虛擬賬戶餘額' },
    { key: 'initActual', title: '期初實收賬戶餘額' },
    { key: 'virtualRecharge', title: '虛擬賬戶充值總額' },
    { key: 'actualRecharge', title: '實收賬戶充值總額' },
    { key: 'bankReceipt', title: '銀行收款' },
    { key: 'revenuePayment', title: '營業額支付' },
    { key: 'consumeTotal', title: '消費總額' },
    { key: 'deductVirtual', title: '扣款總額' },
    { key: 'deductActual', title: '扣款實收變動' },
    { key: 'virtualTransferIn', title: '虛擬賬戶轉入總額' },
    { key: 'actualTransferIn', title: '實收賬戶轉入總額' },
    { key: 'virtualTransferOut', title: '虛擬賬戶轉出總額' },
    { key: 'actualTransferOut', title: '實收賬戶轉出總額' },
    { key: 'virtualNet', title: '虛擬賬戶交易淨額' },
    { key: 'actualNet', title: '實收賬戶交易淨額' },
    { key: 'endVirtual', title: '期末虛擬賬戶餘額' },
    { key: 'endActual', title: '期末實收賬戶餘額' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('writeoff-reconcile', columnMeta)

  const columns: TableColumnsType<ReconcileRecord> = [
    { title: '統計日期', dataIndex: 'date', key: 'date', width: 110, fixed: 'left' },
    { title: '集團ID', dataIndex: 'groupId', key: 'groupId', width: 90, fixed: 'left' },
    { title: '集團名稱', dataIndex: 'groupName', key: 'groupName', width: 110, fixed: 'left' },
    {
      title: '所屬品牌', dataIndex: 'brand', key: 'brand', width: 100,
      render: (v: string) => <BrandTag value={v} />,
    },
    {
      title: '期初虛擬賬戶餘額', dataIndex: 'initVirtual', key: 'initVirtual', width: 160, align: 'right',
      render: (v: number) => <span style={{ color: '#1976D2', fontWeight: 500 }}>{fmtAmt(v)}</span>,
    },
    {
      title: '期初實收賬戶餘額', dataIndex: 'initActual', key: 'initActual', width: 160, align: 'right',
      render: (v: number) => <span style={{ color: '#E8720C', fontWeight: 500 }}>{fmtAmt(v)}</span>,
    },
    {
      title: '虛擬賬戶充值總額', dataIndex: 'virtualRecharge', key: 'virtualRecharge', width: 160, align: 'right',
      render: (v: number) => <span style={{ color: '#1976D2' }}>{fmtAmt(v)}</span>,
    },
    {
      title: '實收賬戶充值總額', dataIndex: 'actualRecharge', key: 'actualRecharge', width: 160, align: 'right',
      render: (v: number) => <span style={{ color: '#E8720C' }}>{fmtAmt(v)}</span>,
    },
    { title: '銀行收款', dataIndex: 'bankReceipt', key: 'bankReceipt', width: 110, align: 'right', render: (v: number) => fmtAmt(v) },
    { title: '營業額支付', dataIndex: 'revenuePayment', key: 'revenuePayment', width: 110, align: 'right', render: (v: number) => fmtAmt(v) },
    {
      title: '消費總額', dataIndex: 'consumeTotal', key: 'consumeTotal', width: 120, align: 'right',
      render: (v: number) => <span style={{ color: '#FF4D4F' }}>{fmtAmt(v)}</span>,
    },
    {
      title: '扣款總額', dataIndex: 'deductVirtual', key: 'deductVirtual', width: 120, align: 'right',
      render: (v: number) => <span style={{ color: '#FF4D4F' }}>{fmtAmt(v)}</span>,
    },
    {
      title: '扣款實收變動', dataIndex: 'deductActual', key: 'deductActual', width: 130, align: 'right',
      render: (v: number) => <span style={{ color: '#FF4D4F' }}>{fmtAmt(v)}</span>,
    },
    {
      title: '虛擬賬戶轉入總額', dataIndex: 'virtualTransferIn', key: 'virtualTransferIn', width: 160, align: 'right',
      render: (v: number) => <span style={{ color: '#1976D2' }}>{fmtAmt(v)}</span>,
    },
    {
      title: '實收賬戶轉入總額', dataIndex: 'actualTransferIn', key: 'actualTransferIn', width: 160, align: 'right',
      render: (v: number) => <span style={{ color: '#E8720C' }}>{fmtAmt(v)}</span>,
    },
    {
      title: '虛擬賬戶轉出總額', dataIndex: 'virtualTransferOut', key: 'virtualTransferOut', width: 160, align: 'right',
      render: (v: number) => <span style={{ color: '#1976D2' }}>{fmtAmt(v)}</span>,
    },
    {
      title: '實收賬戶轉出總額', dataIndex: 'actualTransferOut', key: 'actualTransferOut', width: 160, align: 'right',
      render: (v: number) => <span style={{ color: '#E8720C' }}>{fmtAmt(v)}</span>,
    },
    {
      title: '虛擬賬戶交易淨額', dataIndex: 'virtualNet', key: 'virtualNet', width: 160, align: 'right',
      render: (v: number) => <NetAmountCell val={v} />,
    },
    {
      title: '實收賬戶交易淨額', dataIndex: 'actualNet', key: 'actualNet', width: 160, align: 'right',
      render: (v: number) => <NetAmountCell val={v} />,
    },
    {
      title: '期末虛擬賬戶餘額', dataIndex: 'endVirtual', key: 'endVirtual', width: 160, align: 'right',
      render: (v: number) => <span style={{ color: '#1976D2', fontWeight: 600 }}>{fmtAmt(v)}</span>,
    },
    {
      title: '期末實收賬戶餘額', dataIndex: 'endActual', key: 'endActual', width: 160, align: 'right',
      render: (v: number) => <span style={{ color: '#E8720C', fontWeight: 600 }}>{fmtAmt(v)}</span>,
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label="集團ID" name="groupId">
            <Input placeholder="請輸入集團ID" allowClear />
          </Form.Item>
          <Form.Item label="集團名稱" name="groupName">
            <Input placeholder="請輸入集團名稱" allowClear />
          </Form.Item>
          <Form.Item label="所屬品牌" name="brand">
            <Select placeholder="全部" options={brandOptions} allowClear />
          </Form.Item>
          <Form.Item label="統計週期" name="period">
            <RangePicker
              format="YYYY-MM-DD"
              placeholder={['開始日期', '結束日期']}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 週期總賬概覽 */}
      <div className="reconcile-overview">
        {/* 期初 / 期末 结余 */}
        <div className="reconcile-balance-row">
          <SummaryCard title="期初結餘統計" icon="📄" bgColor="linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)">
            <div className="reconcile-balance-grid">
              <div className="reconcile-balance-item">
                <div className="reconcile-balance-label">期初虛擬賬戶餘額</div>
                <div className="reconcile-balance-value" style={{ color: '#1565C0' }}><AnimatedAmount value={summary.initVirtual} /></div>
              </div>
              <div className="reconcile-balance-item">
                <div className="reconcile-balance-label">期初實收賬戶餘額</div>
                <div className="reconcile-balance-value" style={{ color: '#E8720C' }}><AnimatedAmount value={summary.initActual} /></div>
              </div>
            </div>
          </SummaryCard>

          <SummaryCard title="期末結餘統計" icon="📄" bgColor="linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)">
            <div className="reconcile-balance-grid">
              <div className="reconcile-balance-item">
                <div className="reconcile-balance-label">期末虛擬賬戶餘額</div>
                <div className="reconcile-balance-value" style={{ color: '#1565C0' }}><AnimatedAmount value={summary.endVirtual} /></div>
              </div>
              <div className="reconcile-balance-item">
                <div className="reconcile-balance-label">期末實收賬戶餘額</div>
                <div className="reconcile-balance-value" style={{ color: '#E8720C' }}><AnimatedAmount value={summary.endActual} /></div>
              </div>
            </div>
          </SummaryCard>
        </div>

        {/* 统计明细卡片 */}
        <div className="reconcile-stats-row">
          <SummaryCard title="充值統計" icon="💰" bgColor="#F8FAFF">
            <MetricItem label="虛擬賬戶充值總額" value={summary.virtualRecharge} color="#1565C0"
              subLabel="實收賬戶充值總額" subValue={summary.actualRecharge} subColor="#E8720C" />
            <MetricItem label="銀行收款" value={summary.bankReceipt} color="#1565C0"
              subLabel="營業額支付" subValue={summary.revenuePayment} subColor="#E8720C" />
          </SummaryCard>

          <SummaryCard title="消費扣款統計" icon="📉" bgColor="#FFF8F0">
            <MetricItem label="消費總額" value={summary.consumeTotal} color="#E53935"
              subLabel="扣款總額" subValue={summary.deductVirtual} subColor="#E53935" />
            <MetricItem label="扣款實收變動" value={summary.deductActual} color="#E8720C" />
          </SummaryCard>

          <SummaryCard title="轉入轉出" icon="🔁" bgColor="#F3F0FF">
            <MetricItem label="虛擬賬戶轉入總額" value={summary.virtualTransferIn} color="#7B1FA2"
              subLabel="虛擬賬戶轉出總額" subValue={summary.virtualTransferOut} subColor="#7B1FA2" />
            <MetricItem label="實收賬戶轉入總額" value={summary.actualTransferIn} color="#7B1FA2"
              subLabel="實收賬戶轉出總額" subValue={summary.actualTransferOut} subColor="#7B1FA2" />
          </SummaryCard>

          <SummaryCard title="交易淨額" icon="🧮" bgColor="#F0FFF4">
            <MetricItem label="虛擬賬戶交易淨額" value={summary.virtualNet} color="#2E7D32" />
            <MetricItem label="實收賬戶交易淨額" value={summary.actualNet} color="#2E7D32" />
          </SummaryCard>
        </div>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <div className="action-section-left">
          {hasPermission('writeoff-reconcile:export') && (
            <Button className="btn-export" icon={<ExportOutlined />}>
              導出
            </Button>
          )}
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      {/* 每日账户变动列表 */}
      <div className="table-section">
        <Table<ReconcileRecord>
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          columns={applyConfig(columns)}
          dataSource={data}
          rowKey="key"
          loading={loading}
          pagination={{
            current: pagination.page,
            pageSize: pagination.size,
            total,
            showTotal: (t) => `共 ${t} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showQuickJumper: true,
            onChange: (page, size) => setPagination({ page, size: size || 10 }),
          }}
          size="small"
          bordered={false}
          scroll={{ x: 3000 }}
          className="writeoff-reconcile-table"
        />
      </div>
    </div>
  )
}
