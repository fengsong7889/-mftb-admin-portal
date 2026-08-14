import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Button, Input, Select, DatePicker, Table, Tag, Form } from 'antd'
import type { TableColumnsType } from 'antd'
import type { Dayjs } from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
  ImportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { useAuth } from '../../contexts/AuthContext'
import BrandTag from '../../components/BrandTag'
import { BRAND_OPTIONS_WITH_ALL as brandOptions, isShanfeng } from '../../constants/brand'
import type { DebtStoreRecord } from '../../utils/approvalStore'
import { fetchFinDebts } from '../../api/finance'
import type { FinDebtBrandStats, FinDebtPageResult, FinDebtQuery } from '../../api/finance'
import { getAllDebtBills } from './mockBills'

const { RangePicker } = DatePicker

/** 業務頻道選項（全局統一枚舉，值與數據庫存儲一致，保持中文） */
const channelOptions = [
  { label: '美食外賣', value: '美食外賣' },
  { label: '超市百貨', value: '超市百貨' },
  { label: '團購到店', value: '團購到店' },
]

/** 賬單狀態展示映射（label 為 i18n key，value 為英文枚舉碼） */
const statusMeta: Record<string, { labelKey: string; color: string }> = {
  unsettled: { labelKey: 'debtReconcile.statusUnsettled', color: 'error' },
  settled: { labelKey: 'debtReconcile.statusSettled', color: 'success' },
  transferred: { labelKey: 'debtReconcile.statusTransferred', color: 'processing' },
}

/** 賬單來源展示映射（i18n key，value 為英文枚舉碼） */
const sourceLabelMapKeys: Record<string, string> = {
  recharge: 'debtReconcile.sourceRecharge',
  merge: 'debtReconcile.sourceMerge',
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
  const { t } = useTranslation()
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
        <span className="debt-brand-card-sub">{t('debtReconcile.unsettledCount', { count })}</span>
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
  // 菜单权限：debt-reconcile
  const { t } = useTranslation()
  const { hasPermission } = useAuth()

  /** 賬單狀態選項（label 為 i18n key） */
  const statusOptions = [
    { label: t('debtReconcile.statusUnsettled'), value: 'unsettled' },
    { label: t('debtReconcile.statusSettled'), value: 'settled' },
    { label: t('debtReconcile.statusTransferred'), value: 'transferred' },
  ]

  /** 賬單來源選項 */
  const sourceOptions = [
    { label: t('debtReconcile.sourceRecharge'), value: 'recharge' },
    { label: t('debtReconcile.sourceMerge'), value: 'merge' },
  ]
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
      const res = await fetchFinDebts(query)
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
    { key: 'index', title: t('common.colIndex') },
    { key: 'groupId', title: t('common.colGroupId') },
    { key: 'groupName', title: t('common.colGroupName') },
    { key: 'storeId', title: t('common.colStoreId') },
    { key: 'storeName', title: t('common.colStoreName') },
    { key: 'brand', title: t('common.colBrand') },
    { key: 'channel', title: t('common.colChannel') },
    { key: 'bd', title: t('common.colBd') },
    { key: 'source', title: t('debtReconcile.colSource') },
    { key: 'loanDate', title: t('debtReconcile.colLoanDate') },
    { key: 'billNo', title: t('debtReconcile.colBillNo') },
    { key: 'batchNo', title: t('common.colBatchNo') },
    { key: 'flowNo', title: t('common.colFlowNo') },
    { key: 'debtTotal', title: t('debtReconcile.colDebtTotal') },
    { key: 'paidAmount', title: t('debtReconcile.colPaidAmount') },
    { key: 'remainAmount', title: t('debtReconcile.colRemainAmount') },
    { key: 'status', title: t('debtReconcile.colStatus') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('debt-reconcile', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: TableColumnsType<DebtStoreRecord> = [
    {
      title: t('common.colIndex'), key: 'index', width: 60, align: 'center', fixed: 'left',
      render: (_, __, i) => (pagination.page - 1) * pagination.size + i + 1,
    },
    { title: t('common.colGroupId'), dataIndex: 'groupId', key: 'groupId', width: 100, fixed: 'left' },
    { title: t('common.colGroupName'), dataIndex: 'groupName', key: 'groupName', width: 120, fixed: 'left' },
    { title: t('common.colStoreId'), dataIndex: 'storeId', key: 'storeId', width: 110 },
    { title: t('common.colStoreName'), dataIndex: 'storeName', key: 'storeName', width: 150 },
    {
      title: t('common.colBrand'), dataIndex: 'brand', key: 'brand', width: 100,
      render: (v: string) => <BrandTag value={v} />,
    },
    {
      title: t('common.colChannel'), dataIndex: 'channel', key: 'channel', width: 100,
      render: (v: string) => v === '--' ? <span style={{ color: '#999' }}>--</span> : v,
    },
    { title: t('common.colBd'), dataIndex: 'bd', key: 'bd', width: 110 },
    {
      title: t('debtReconcile.colSource'), dataIndex: 'source', key: 'source', width: 130,
      render: (v: string) => (
        <Tag color={v === 'merge' ? 'purple' : 'blue'}>{sourceLabelMapKeys[v] ? t(sourceLabelMapKeys[v]) : v}</Tag>
      ),
    },
    { title: t('debtReconcile.colLoanDate'), dataIndex: 'loanDate', key: 'loanDate', width: 110 },
    { title: t('debtReconcile.colBillNo'), dataIndex: 'billNo', key: 'billNo', width: 160 },
    { title: t('common.colBatchNo'), dataIndex: 'batchNo', key: 'batchNo', width: 160 },
    { title: t('common.colFlowNo'), dataIndex: 'flowNo', key: 'flowNo', width: 160, render: (val: string) => val === 'DIRECT-EXEC' ? <Tag color="default">未經審批</Tag> : val },
    {
      title: t('debtReconcile.colDebtTotal'), dataIndex: 'debtTotal', key: 'debtTotal', width: 120, align: 'right',
      render: (v: number) => <span style={{ color: '#E8720C', fontWeight: 600 }}>{fmtAmt(v)}</span>,
    },
    {
      title: t('debtReconcile.colPaidAmount'), dataIndex: 'paidAmount', key: 'paidAmount', width: 120, align: 'right',
      render: (v: number) => <span style={{ color: '#52C41A', fontWeight: 500 }}>{fmtAmt(v)}</span>,
    },
    {
      title: t('debtReconcile.colRemainAmount'), dataIndex: 'remainAmount', key: 'remainAmount', width: 120, align: 'right',
      render: (v: number) => (
        <span style={{ color: v > 0 ? '#FF4D4F' : '#52C41A', fontWeight: 600 }}>{fmtAmt(v)}</span>
      ),
    },
    {
      title: t('debtReconcile.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => {
        const meta = statusMeta[v] || { labelKey: '', color: 'default' }
        return <Tag color={meta.color}>{meta.labelKey ? t(meta.labelKey) : v}</Tag>
      },
    },
    {
      title: t('common.colAction'), key: 'action', width: 80, fixed: 'right',
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => navigate(`/debt-detail?billNo=${record.billNo}`)}>{t('common.detail')}</Button>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline" form={form}>
          <Form.Item label={t('common.colGroupId')} name="groupId">
            <Input placeholder={t('common.groupIdPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colGroupName')} name="groupName">
            <Input placeholder={t('common.groupNamePlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colStoreName')} name="storeName">
            <Input placeholder={t('debtReconcile.storeNamePlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colBrand')} name="brand">
            <Select placeholder={t('common.all')} options={brandOptions} allowClear />
          </Form.Item>
          <Form.Item label={t('debtReconcile.colBillNo')} name="billNo">
            <Input placeholder={t('debtReconcile.billNoPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colBatchNo')} name="batchNo">
            <Input placeholder={t('common.batchNoPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colFlowNo')} name="flowNo">
            <Input placeholder={t('common.flowNoPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('debtReconcile.colStatus')} name="status">
            <Select placeholder={t('common.all')} options={statusOptions} allowClear />
          </Form.Item>
          <Form.Item label={t('debtReconcile.colSource')} name="source">
            <Select placeholder={t('common.all')} options={sourceOptions} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colChannel')} name="channel">
            <Select placeholder={t('common.all')} options={channelOptions} allowClear />
          </Form.Item>
          <Form.Item label={t('debtReconcile.colLoanDate')} name="loanDateRange">
            <RangePicker format="YYYY-MM-DD" placeholder={[t('writeoffReconcile.startDate'), t('writeoffReconcile.endDate')]} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 品牌待還統計卡（閃蜂 / mFood） */}
      <div className="debt-brand-cards">
        <BrandDebtCard
          icon="🐝"
          label={t('debtReconcile.cardShanfeng')}
          value={brandStats.shanfeng.amount}
          count={brandStats.shanfeng.count}
          color="#FB8C00"
          bgColor="linear-gradient(135deg, #FFF8E1 0%, #FFECB3 100%)"
        />
        <BrandDebtCard
          icon="🍔"
          label={t('debtReconcile.cardMfood')}
          value={brandStats.mfood.amount}
          count={brandStats.mfood.count}
          color="#F5680C"
          bgColor="linear-gradient(135deg, #FBE9E7 0%, #FFCCBC 100%)"
        />
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <div className="action-section-left">
          {hasPermission('debt-reconcile:export') && (
            <Button className="btn-export" icon={<ExportOutlined />}>{t('common.export')}</Button>
          )}
          {hasPermission('debt-reconcile:import') && (
            <Button className="btn-import" icon={<ImportOutlined />}>{t('debtReconcile.repayImport')}</Button>
          )}
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
            showTotal: (total) => t('common.total', { count: total }),
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
