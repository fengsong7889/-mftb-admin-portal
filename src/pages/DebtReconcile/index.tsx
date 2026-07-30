import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Button, Input, Select, DatePicker, Table, Tag, Form } from 'antd'
import type { TableColumnsType } from 'antd'
import type { Dayjs } from 'dayjs'
import { useNavigate } from 'react-router-dom'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
  ImportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import BrandTag from '../../components/BrandTag'
import { BRAND_OPTIONS_WITH_ALL as brandOptions, isShanfeng } from '../../constants/brand'
import type { DebtStoreRecord } from '../../utils/approvalStore'
import { fetchFinDebts, withFinanceFallback } from '../../api/finance'
import type { FinDebtBrandStats, FinDebtPageResult, FinDebtQuery } from '../../api/finance'
import { getAllDebtBills } from './mockBills'

const { RangePicker } = DatePicker

/** 賬單狀態選項 */
const statusOptions = [
  { label: '未結清', value: 'unsettled' },
  { label: '已結清', value: 'settled' },
  { label: '已轉結', value: 'transferred' },
]

/** 賬單來源選項 */
const sourceOptions = [
  { label: '充值營業額扣款', value: 'recharge' },
  { label: '合併欠款轉入', value: 'merge' },
]

/** 業務頻道選項（全局統一枚舉） */
const channelOptions = [
  { label: '美食外賣', value: '美食外賣' },
  { label: '超市百貨', value: '超市百貨' },
  { label: '團購到店', value: '團購到店' },
]

/** 賬單狀態展示映射 */
const statusMeta: Record<string, { label: string; color: string }> = {
  unsettled: { label: '未結清', color: 'error' },
  settled: { label: '已結清', color: 'success' },
  transferred: { label: '已轉結', color: 'processing' },
}

/** 賬單來源展示映射 */
const sourceLabelMap: Record<string, string> = {
  recharge: '充值營業額扣款',
  merge: '合併欠款轉入',
}

/** 保留兩位小數 */
const r2 = (n: number) => Math.round(n * 100) / 100

/** 格式化金額（千分位 + 兩位小數） */
const fmtAmt = (val: number) => val.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

/** 品牌待還統計卡（hover 上浮 + 計數動畫） */
function BrandDebtCard({ icon, label, value, count, color, bgColor }: {
  icon: string; label: string; value: number; count: number; color: string; bgColor: string
}) {
  return (
    <div
      className="debt-brand-card"
      style={{ background: bgColor, border: `1px solid ${color}22`, transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-4px)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)'
      }}
    >
      <span className="debt-brand-card-icon">{icon}</span>
      <div className="debt-brand-card-info">
        <span className="debt-brand-card-label">{label}</span>
        <span className="debt-brand-card-sub">未結清 {count} 筆</span>
      </div>
      <span className="debt-brand-card-value" style={{ color }}><AnimatedAmount value={value} /></span>
    </div>
  )
}

/** 搜索篩選條件 */
interface DebtFilters {
  groupId?: string
  groupName?: string
  storeName?: string
  brand?: string
  billNo?: string
  batchNo?: string
  flowNo?: string
  status?: string
  source?: string
  channel?: string
  loanDateRange?: [Dayjs, Dayjs]
}

/** 「全部」等價於不篩選 */
function pickValue(v?: string) {
  return !v || v === 'all' ? undefined : v
}

/** 空品牌統計（加載中 / 無數據） */
const emptyBrandStats: FinDebtBrandStats = {
  shanfeng: { amount: 0, count: 0 },
  mfood: { amount: 0, count: 0 },
}

/**
 * 後端不可用時的降級查詢：本地欠款單（審批寫入 + 演示數據）篩選分頁
 * 品牌待還統計口徑與後端一致：僅累計未結清賬單的剩餘待還
 */
function mockFetchDebts(query: FinDebtQuery): FinDebtPageResult {
  const filtered = getAllDebtBills().filter(b => {
    if (query.groupId && !b.groupId.includes(query.groupId)) return false
    if (query.groupName && !b.groupName.includes(query.groupName)) return false
    if (query.storeName && !b.storeName.includes(query.storeName)) return false
    if (query.brand && b.brand !== query.brand) return false
    if (query.billNo && !b.billNo.includes(query.billNo)) return false
    if (query.batchNo && !b.batchNo.includes(query.batchNo)) return false
    if (query.flowNo && !b.flowNo.includes(query.flowNo)) return false
    if (query.status && b.status !== query.status) return false
    if (query.source && b.source !== query.source) return false
    if (query.channel && b.channel !== query.channel) return false
    if (query.loanFrom && b.loanDate < query.loanFrom) return false
    if (query.loanTo && b.loanDate > query.loanTo) return false
    return true
  })
  const brandStats: FinDebtBrandStats = {
    shanfeng: { amount: 0, count: 0 },
    mfood: { amount: 0, count: 0 },
  }
  filtered.forEach(b => {
    if (b.status !== 'unsettled') return
    const target = isShanfeng(b.brand) ? brandStats.shanfeng : brandStats.mfood
    target.amount = r2(target.amount + b.remainAmount)
    target.count += 1
  })
  const page = query.page || 1
  const size = query.size || 10
  return { records: filtered.slice((page - 1) * size, page * size), total: filtered.length, brandStats }
}

export default function DebtReconcile() {
  const navigate = useNavigate()
  const [form] = Form.useForm<DebtFilters>()
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [filters, setFilters] = useState<DebtFilters>({})
  const [data, setData] = useState<DebtStoreRecord[]>([])
  const [total, setTotal] = useState(0)
  const [brandStats, setBrandStats] = useState<FinDebtBrandStats>(emptyBrandStats)
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ page: 1, size: 10 })

  /** 組裝查詢參數 */
  const buildQuery = useCallback((): FinDebtQuery => ({
    page: pagination.page,
    size: pagination.size,
    groupId: filters.groupId?.trim() || undefined,
    groupName: filters.groupName?.trim() || undefined,
    storeName: filters.storeName?.trim() || undefined,
    brand: pickValue(filters.brand),
    billNo: filters.billNo?.trim() || undefined,
    batchNo: filters.batchNo?.trim() || undefined,
    flowNo: filters.flowNo?.trim() || undefined,
    status: pickValue(filters.status),
    source: pickValue(filters.source),
    channel: pickValue(filters.channel),
    loanFrom: filters.loanDateRange?.[0]?.format('YYYY-MM-DD'),
    loanTo: filters.loanDateRange?.[1]?.format('YYYY-MM-DD'),
  }), [filters, pagination])

  /** 加載欠款單列表（後端優先，不可用時降級本地） */
  const loadDebts = useCallback(async () => {
    const query = buildQuery()
    setLoading(true)
    try {
      const res = await withFinanceFallback<FinDebtPageResult>(
        () => fetchFinDebts(query),
        () => mockFetchDebts(query),
      )
      setData((res.records ?? []).map(r => ({
        ...r,
        key: r.billNo,
        repayments: (r.repayments ?? []).map((p, i) => ({ ...p, key: String(p.id ?? i) })),
      })))
      setTotal(res.total ?? 0)
      setBrandStats(res.brandStats ?? emptyBrandStats)
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  useEffect(() => {
    void loadDebts()
  }, [loadDebts])

  /** 查詢 */
  const handleSearch = () => {
    setFilters(form.getFieldsValue())
    setPagination(p => ({ ...p, page: 1 }))
  }

  /** 重置 */
  const handleReset = () => {
    form.resetFields()
    setFilters({})
    setPagination({ page: 1, size: 10 })
  }

  /** 列配置元數據 */
  const columnMeta = useMemo(() => [
    { key: 'index', title: '序號' },
    { key: 'groupId', title: '集團ID' },
    { key: 'groupName', title: '集團名稱' },
    { key: 'storeId', title: '門店ID' },
    { key: 'storeName', title: '門店名稱' },
    { key: 'brand', title: '所屬品牌' },
    { key: 'channel', title: '業務頻道' },
    { key: 'bd', title: '所屬BD' },
    { key: 'source', title: '賬單來源' },
    { key: 'loanDate', title: '借款日期' },
    { key: 'billNo', title: '賬單編號' },
    { key: 'batchNo', title: '關聯批次號' },
    { key: 'flowNo', title: '流程編號' },
    { key: 'debtTotal', title: '欠款總額' },
    { key: 'paidAmount', title: '已還金額' },
    { key: 'remainAmount', title: '剩餘待還' },
    { key: 'status', title: '賬單狀態' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('debt-reconcile', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: TableColumnsType<DebtStoreRecord> = [
    {
      title: '序號', key: 'index', width: 60, align: 'center', fixed: 'left',
      render: (_, __, i) => (pagination.page - 1) * pagination.size + i + 1,
    },
    { title: '集團ID', dataIndex: 'groupId', key: 'groupId', width: 100, fixed: 'left' },
    { title: '集團名稱', dataIndex: 'groupName', key: 'groupName', width: 120, fixed: 'left' },
    { title: '門店ID', dataIndex: 'storeId', key: 'storeId', width: 110 },
    { title: '門店名稱', dataIndex: 'storeName', key: 'storeName', width: 150 },
    {
      title: '所屬品牌', dataIndex: 'brand', key: 'brand', width: 100,
      render: (v: string) => <BrandTag value={v} />,
    },
    {
      title: '業務頻道', dataIndex: 'channel', key: 'channel', width: 100,
      render: (v: string) => v === '--' ? <span style={{ color: '#999' }}>--</span> : v,
    },
    { title: '所屬BD', dataIndex: 'bd', key: 'bd', width: 110 },
    {
      title: '賬單來源', dataIndex: 'source', key: 'source', width: 130,
      render: (v: string) => (
        <Tag color={v === 'merge' ? 'purple' : 'blue'}>{sourceLabelMap[v] || v}</Tag>
      ),
    },
    { title: '借款日期', dataIndex: 'loanDate', key: 'loanDate', width: 110 },
    { title: '賬單編號', dataIndex: 'billNo', key: 'billNo', width: 160 },
    { title: '關聯批次號', dataIndex: 'batchNo', key: 'batchNo', width: 160 },
    { title: '流程編號', dataIndex: 'flowNo', key: 'flowNo', width: 160 },
    {
      title: '欠款總額', dataIndex: 'debtTotal', key: 'debtTotal', width: 120, align: 'right',
      render: (v: number) => <span style={{ color: '#E8720C', fontWeight: 600 }}>{fmtAmt(v)}</span>,
    },
    {
      title: '已還金額', dataIndex: 'paidAmount', key: 'paidAmount', width: 120, align: 'right',
      render: (v: number) => <span style={{ color: '#52C41A', fontWeight: 500 }}>{fmtAmt(v)}</span>,
    },
    {
      title: '剩餘待還', dataIndex: 'remainAmount', key: 'remainAmount', width: 120, align: 'right',
      render: (v: number) => (
        <span style={{ color: v > 0 ? '#FF4D4F' : '#52C41A', fontWeight: 600 }}>{fmtAmt(v)}</span>
      ),
    },
    {
      title: '賬單狀態', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => {
        const meta = statusMeta[v] || { label: v, color: 'default' }
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: '操作', key: 'action', width: 80, fixed: 'right',
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => navigate(`/debt-detail?billNo=${record.billNo}`)}>詳情</Button>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline" form={form}>
          <Form.Item label="集團ID" name="groupId">
            <Input placeholder="請輸入集團ID" allowClear />
          </Form.Item>
          <Form.Item label="集團名稱" name="groupName">
            <Input placeholder="請輸入集團名稱" allowClear />
          </Form.Item>
          <Form.Item label="門店名稱" name="storeName">
            <Input placeholder="請輸入門店名稱" allowClear />
          </Form.Item>
          <Form.Item label="所屬品牌" name="brand">
            <Select placeholder="全部" options={brandOptions} allowClear />
          </Form.Item>
          <Form.Item label="賬單編號" name="billNo">
            <Input placeholder="請輸入賬單編號" allowClear />
          </Form.Item>
          <Form.Item label="關聯批次號" name="batchNo">
            <Input placeholder="請輸入批次號" allowClear />
          </Form.Item>
          <Form.Item label="流程編號" name="flowNo">
            <Input placeholder="請輸入流程編號" allowClear />
          </Form.Item>
          <Form.Item label="賬單狀態" name="status">
            <Select placeholder="全部" options={statusOptions} allowClear />
          </Form.Item>
          <Form.Item label="賬單來源" name="source">
            <Select placeholder="全部" options={sourceOptions} allowClear />
          </Form.Item>
          <Form.Item label="業務頻道" name="channel">
            <Select placeholder="全部" options={channelOptions} allowClear />
          </Form.Item>
          <Form.Item label="借款日期" name="loanDateRange">
            <RangePicker format="YYYY-MM-DD" placeholder={['開始日期', '結束日期']} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 品牌待還統計卡（閃蜂 / mFood） */}
      <div className="debt-brand-cards">
        <BrandDebtCard
          icon="🐝"
          label="閃蜂總待還金額"
          value={brandStats.shanfeng.amount}
          count={brandStats.shanfeng.count}
          color="#FB8C00"
          bgColor="linear-gradient(135deg, #FFF8E1 0%, #FFECB3 100%)"
        />
        <BrandDebtCard
          icon="🍔"
          label="mFood總待還金額"
          value={brandStats.mfood.amount}
          count={brandStats.mfood.count}
          color="#F5680C"
          bgColor="linear-gradient(135deg, #FBE9E7 0%, #FFCCBC 100%)"
        />
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />}>導出</Button>
          <Button className="btn-import" icon={<ImportOutlined />}>還款導入</Button>
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<DebtStoreRecord>
          rowKey="key"
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          columns={applyConfig(columns)}
          dataSource={data}
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
          size="middle"
          bordered={false}
          scroll={{ x: 2200 }}
        />
      </div>
    </div>
  )
}
