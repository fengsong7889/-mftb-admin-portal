/**
 * 驗收入庫（三 Tab 視圖）
 *
 * - 待驗收訂單（默認，操作導向）：自動同步「採購完成且有待驗收明細」的訂單；
 *   重展示決策字段：本次可驗、驗收進度、異常預警（換貨在途 / 滯後未驗 徽標）
 * - 入庫批次（審計導向）：僅展示 normal / partial 狀態的正常入庫記錄；
 *   重展示結果字段：入庫資產數、處置匯總（通過 / 讓步 / 退貨 / 換貨 合併一列）
 * - 異常批次（審計導向）：僅展示 exception（退貨終結）/ exchange_pending（換貨在途）的批次
 *
 * 批次狀態由前端派生（deriveBatchStatus），不改後端表結構。
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Form, Input, Select, Table, Tag, Tooltip, DatePicker, Tabs, message, Space, Alert } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import {
  SearchOutlined, ReloadOutlined, ExportOutlined, InfoCircleOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { fetchInboundList, fetchPurchaseOrderList, type InboundBatch, type PurchaseOrder, type PurchaseOrderSupplierGroup } from '../../../api/eam'
import { exportToCSV } from '../../../utils/exportCSV'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import BrandTag from '../../../components/BrandTag'

const { RangePicker } = DatePicker

/** 入庫狀態展示元數據（待驗收/部分入庫/已入庫）；labelKey 渲染時經 t() 轉換 */
const INBOUND_STATUS_META: Record<PurchaseOrder['status'], { labelKey: string; color: string }> = {
  pending: { labelKey: 'poPending', color: 'processing' },
  partial: { labelKey: 'poPartial', color: 'warning' },
  received: { labelKey: 'poReceived', color: 'success' },
}

/** 收貨方式展示文案（值為 asset 段 key，渲染時經 t() 轉換） */
const DELIVERY_METHOD_LABEL: Record<string, string> = {
  self_pickup: 'deliverySelfPickup',
  supplier_delivery: 'deliverySupplier',
  express: 'deliveryExpress',
}

/**
 * 批次派生狀態：由 totalQty / acceptedQty / returnQty / exchangeQty / concessionQty 計算
 * - normal：全部通過或讓步接收（無退貨、無換貨）
 * - partial：既有通過又有退貨/換貨（部分入庫 + 異常尾巴）
 * - exchange_pending：全部為換貨，等待供應商二次發貨
 * - exception：全部為退貨，終態
 */
type BatchStatus = 'normal' | 'partial' | 'exception' | 'exchange_pending'

const BATCH_STATUS_META: Record<BatchStatus, { labelKey: string; color: string }> = {
  normal: { labelKey: 'batchNormal', color: 'success' },
  partial: { labelKey: 'batchPartial', color: 'warning' },
  exchange_pending: { labelKey: 'batchExchangePending', color: 'processing' },
  exception: { labelKey: 'batchException', color: 'default' },
}

function deriveBatchStatus(b: InboundBatch): BatchStatus {
  const passed = (b.acceptedQty || 0) + (b.concessionQty || 0)
  const returned = b.returnQty || 0
  const exchanged = b.exchangeQty || 0
  if (passed > 0 && returned === 0 && exchanged === 0) return 'normal'
  if (passed > 0 && (returned > 0 || exchanged > 0)) return 'partial'
  if (exchanged > 0 && passed === 0) return 'exchange_pending'
  if (returned > 0 && passed === 0 && exchanged === 0) return 'exception'
  return 'normal'
}

/**
 * 實際生成資產數：優先用後端 generatedAssetCount，回退 acceptedQty
 * （現階段後端 batchToMap 用 acceptedQty 冒充，數值一致；PR-2 反規範化後自然切換）
 */
function resolveAssetCount(b: InboundBatch): number {
  return b.generatedAssetCount ?? b.acceptedQty ?? 0
}

/** 待驗收列表行：採購訂單 × 供應商分組（各供應商到貨時間不同，按分組獨立一行展示與驗收） */
interface PendingRow {
  orderId: number
  poNo: string
  groupId: string
  supplier: string
  deliveryMethod?: PurchaseOrderSupplierGroup['deliveryMethod']
  trackingNo?: string
  /** 分組總件數（分組內明細 qty 求和） */
  groupTotalQty: number
  /** 分組已驗收件數（分組內明細 receivedQty 求和） */
  groupReceivedQty: number
  /** 分組待驗收件數 = 總件數 - 已驗收件數（單分組訂單再扣除訂單級退貨） */
  groupPendingQty: number
  /** 訂單級換貨在途匯總（與「換貨在途」徽標同口徑） */
  orderExchangeQty: number
  /** 訂單級退貨匯總（終態，不計入待驗收） */
  orderReturnQty: number
  /** 該訂單下的換貨在途件數（PR-2 後端補分組級字段後可精確化） */
  exchangePendingQty: number
  /** 距 order.updatedAt 的天數（>7 天顯示滯後預警） */
  overdueDays: number
  order: PurchaseOrder
}

interface Props {
  onAdd: (poId: number, groupId: string) => void
  onDetail: (batchId: number) => void
}

export default function InboundList({ onAdd, onDetail }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  /** 全量批次（搜索過濾後）；batchesData / exceptionsData 在此基礎上按 batchStatus 派生 */
  const [allBatches, setAllBatches] = useState<InboundBatch[]>([])
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<{
    batchNo?: string
    poNo?: string
    createdDateRange?: [string, string]
    updatedBy?: string
    updatedDateRange?: [string, string]
  }>({})
  const [activeTab, setActiveTab] = useState<'pending' | 'batches' | 'exceptions'>('pending')
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  /* ----- 待驗收訂單搜索（獨立 form 實例，避免與入庫批次搜索區字段互擾） ----- */
  const [poForm] = Form.useForm()
  const [poFilters, setPoFilters] = useState<{
    poNo?: string
    supplier?: string
    status?: string
    purchaser?: string
    updatedAtRange?: [string, string]
  }>({})
  const [poPage, setPoPage] = useState(1)
  const [poSize, setPoSize] = useState(10)

  /* ----- 待驗收訂單（自動同步採購完成的訂單） ----- */
  const [poLoading, setPoLoading] = useState(false)
  const [pendingOrders, setPendingOrders] = useState<PurchaseOrder[]>([])

  const loadPendingOrders = useCallback(async () => {
    setPoLoading(true)
    try {
      const [updatedAtStart, updatedAtEnd] = poFilters.updatedAtRange || []
      // 搜索條件優先走服務端過濾（execStatus 固定 completed；status 為後端待接入參數）
      const res = await fetchPurchaseOrderList({
        size: 200,
        execStatus: 'completed',
        poNo: poFilters.poNo,
        supplier: poFilters.supplier,
        purchaser: poFilters.purchaser,
        status: poFilters.status,
        updatedAtStart,
        updatedAtEnd,
      })
      // 與採購訂單頁驗收入庫入口規則一致：僅採購完成且未全部入庫的訂單
      //（待處理/採購中的訂單貨未到，不可驗收；已全部入庫的訂單無明細可驗收）
      const available = (res.records || []).filter((o) => {
        if (o.execStatus !== 'completed' || o.status === 'received') return false
        // 後端未支持 status 過濾時前端兜底
        if (poFilters.status && o.status !== poFilters.status) return false
        // 有明細數據（mock 兜底）時按明細判斷；後端列表無明細時按訂單級狀態判斷
        return (o.items || []).length === 0 || o.items.some((it) => (it.receivedQty || 0) < it.qty)
      })
      setPendingOrders(available)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setPoLoading(false)
    }
  }, [t, poFilters])

  useEffect(() => { loadPendingOrders() }, [loadPendingOrders])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      /* 前端本地過濾 */
      let list = [...(await fetchInboundList({ page, size })).records || []]
      if (filters.batchNo) {
        list = list.filter((b) => b.batchNo.toLowerCase().includes(filters.batchNo!.toLowerCase()))
      }
      if (filters.poNo) {
        list = list.filter((b) => b.poNo.toLowerCase().includes(filters.poNo!.toLowerCase()))
      }
      if (filters.updatedBy) {
        list = list.filter((b) => (b.updatedBy || '').toLowerCase().includes(filters.updatedBy!.toLowerCase()))
      }
      if (filters.createdDateRange) {
        const [s, e] = filters.createdDateRange
        list = list.filter((b) => b.createdAt >= s && b.createdAt <= e + ' 23:59:59')
      }
      if (filters.updatedDateRange) {
        const [s, e] = filters.updatedDateRange
        list = list.filter((b) => (b.updatedAt || '') >= s && (b.updatedAt || '') <= e + ' 23:59:59')
      }
      setAllBatches(list)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [filters, page, size, t])

  useEffect(() => { loadData() }, [loadData])

  /** 入庫批次 Tab 數據源（僅 normal / partial） */
  const batchesData = useMemo(
    () => allBatches.filter((b) => {
      const s = deriveBatchStatus(b)
      return s === 'normal' || s === 'partial'
    }),
    [allBatches]
  )
  /** 異常批次 Tab 數據源（僅 exception / exchange_pending） */
  const exceptionsData = useMemo(
    () => allBatches.filter((b) => {
      const s = deriveBatchStatus(b)
      return s === 'exception' || s === 'exchange_pending'
    }),
    [allBatches]
  )

  const handleSearch = () => {
    const v = form.getFieldsValue()
    const next: typeof filters = {}
    if (v.batchNo) next.batchNo = v.batchNo
    if (v.poNo) next.poNo = v.poNo
    if (v.updatedBy) next.updatedBy = v.updatedBy
    if (v.createdDateRange && v.createdDateRange.length === 2) {
      next.createdDateRange = [v.createdDateRange[0].format('YYYY-MM-DD'), v.createdDateRange[1].format('YYYY-MM-DD')]
    }
    if (v.updatedDateRange && v.updatedDateRange.length === 2) {
      next.updatedDateRange = [v.updatedDateRange[0].format('YYYY-MM-DD'), v.updatedDateRange[1].format('YYYY-MM-DD')]
    }
    setFilters(next)
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }

  /* ----- 待驗收訂單搜索 ----- */
  const handlePoSearch = () => {
    const v = poForm.getFieldsValue()
    const next: typeof poFilters = {}
    if (v.poNo) next.poNo = v.poNo
    if (v.supplier) next.supplier = v.supplier
    if (v.purchaser) next.purchaser = v.purchaser
    if (v.status) next.status = v.status
    if (v.updatedAtRange && v.updatedAtRange.length === 2) {
      next.updatedAtRange = [v.updatedAtRange[0].format('YYYY-MM-DD'), v.updatedAtRange[1].format('YYYY-MM-DD')]
    }
    setPoFilters(next)
    setPoPage(1)
  }
  const handlePoReset = () => { poForm.resetFields(); setPoFilters({}); setPoPage(1) }
  const handlePoTableChange = (p: TablePaginationConfig) => {
    setPoPage(p.current || 1)
    setPoSize(p.pageSize || 10)
  }
  const handleTableChange = (p: TablePaginationConfig) => {
    setPage(p.current || 1)
    setSize(p.pageSize || 10)
  }

  /* ----- 導出（Tab 感知） ----- */
  const handleExport = () => {
    const isExceptionTab = activeTab === 'exceptions'
    const data = isExceptionTab ? exceptionsData : batchesData
    const cols = [
      { title: t('asset.colBatchNo'), dataIndex: 'batchNo' },
      { title: t('asset.colPoNo'), dataIndex: 'poNo' },
      { title: t('asset.orderBrand'), dataIndex: 'brand', render: (v: number | undefined) => (v === 1 ? '閃蜂' : v === 2 ? 'mFood' : '') },
      { title: t('asset.colBatchStatus'), dataIndex: 'id', render: (_: unknown, r: InboundBatch) => t(`asset.${BATCH_STATUS_META[deriveBatchStatus(r)].labelKey}`) },
      { title: t('asset.colGeneratedCount'), dataIndex: 'id', render: (_: unknown, r: InboundBatch) => String(resolveAssetCount(r)) },
      { title: t('asset.colTotalQty'), dataIndex: 'totalQty' },
      { title: t('asset.exportPassed'), dataIndex: 'acceptedQty' },
      { title: t('asset.exportConcession'), dataIndex: 'concessionQty' },
      { title: t('asset.colReturnQty'), dataIndex: 'returnQty' },
      { title: t('asset.colExchangeQty'), dataIndex: 'exchangeQty' },
      { title: t('asset.colInboundDate'), dataIndex: 'inboundDate' },
      { title: t('asset.colOperator'), dataIndex: 'operator' },
      { title: t('asset.colCreatedAt'), dataIndex: 'createdAt' },
      { title: t('asset.colUpdatedBy'), dataIndex: 'updatedBy' },
      { title: t('asset.colUpdatedAt'), dataIndex: 'updatedAt' },
    ]
    const prefix = t(isExceptionTab ? 'asset.exportPrefixException' : 'asset.exportPrefixBatch')
    exportToCSV(`${t('asset.inboundTitle')}_${prefix}_${new Date().toISOString().slice(0, 10)}`, cols, data)
    message.success(t('common.exportSuccess'))
  }

  /* ----- 表格列定義（入庫批次 / 異常批次 共用，審計導向） ----- */
  const allColumns: TableColumnsType<InboundBatch> = [
    {
      title: t('asset.colBatchNo'), dataIndex: 'batchNo', key: 'batchNo', width: 150, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    {
      title: t('asset.colPoNo'), dataIndex: 'poNo', key: 'poNo', width: 140,
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: t('asset.orderBrand'), dataIndex: 'brand', key: 'brand', width: 100,
      render: (v: number | undefined) => v ? <BrandTag value={v} /> : <span style={{ color: '#bfbfbf' }}>-</span>,
    },
    {
      title: t('asset.colBatchStatus'), key: 'batchStatus', width: 110,
      filters: (Object.keys(BATCH_STATUS_META) as BatchStatus[]).map((k) => ({ text: t(`asset.${BATCH_STATUS_META[k].labelKey}`), value: k })),
      onFilter: (val, r) => deriveBatchStatus(r) === val,
      render: (_: unknown, r: InboundBatch) => {
        const meta = BATCH_STATUS_META[deriveBatchStatus(r)]
        return <Tag color={meta.color} style={{ margin: 0 }}>{t(`asset.${meta.labelKey}`)}</Tag>
      },
    },
    {
      title: t('asset.colGeneratedCount'), key: 'generatedAssetCount', width: 110, align: 'right',
      sorter: (a, b) => resolveAssetCount(a) - resolveAssetCount(b),
      render: (_: unknown, r: InboundBatch) => {
        const n = resolveAssetCount(r)
        return <span style={{ color: n > 0 ? '#52C41A' : '#8C8C8C', fontWeight: 700 }}>{n}</span>
      },
    },
    {
      title: t('asset.colTotalQty'), dataIndex: 'totalQty', key: 'totalQty', width: 100, align: 'right',
      render: (v: number) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    {
      title: t('asset.colDisposition'), key: 'disposition', width: 260,
      render: (_: unknown, r: InboundBatch) => (
        <Space size={4} wrap>
          <Tag color="success" style={{ margin: 0 }}>{t('asset.exportPassed')} {r.acceptedQty || 0}</Tag>
          {(r.concessionQty || 0) > 0 && <Tag color="blue" style={{ margin: 0 }}>{t('asset.exportConcession')} {r.concessionQty}</Tag>}
          {(r.returnQty || 0) > 0 && <Tag color="error" style={{ margin: 0 }}>{t('asset.colReturnQty')} {r.returnQty}</Tag>}
          {(r.exchangeQty || 0) > 0 && <Tag color="warning" style={{ margin: 0 }}>{t('asset.colExchangeQty')} {r.exchangeQty}</Tag>}
        </Space>
      ),
    },
    { title: t('asset.colInboundDate'), dataIndex: 'inboundDate', key: 'inboundDate', width: 110 },
    { title: t('asset.colOperator'), dataIndex: 'operator', key: 'operator', width: 110 },
    {
      title: t('asset.colCreatedAt'), dataIndex: 'createdAt', key: 'createdAt', width: 170,
      sorter: (a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''),
      defaultSortOrder: 'descend',
    },
    { title: t('asset.colUpdatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 130 },
    {
      title: t('asset.colRemark'), key: 'remark', width: 60, align: 'center',
      render: (_: unknown, r: InboundBatch) => (r.purchaseReason || r.remark)
        ? (
          <Tooltip title={(
            <div style={{ maxWidth: 280 }}>
              {r.purchaseReason && <div style={{ marginBottom: 4 }}>{t('asset.purchaseReasonLabel')}{r.purchaseReason}</div>}
              {r.remark && <div>{t('asset.remarkLabel')}{r.remark}</div>}
            </div>
          )}>
            <InfoCircleOutlined style={{ color: '#8C8C8C', cursor: 'pointer' }} />
          </Tooltip>
        )
        : <span style={{ color: '#bfbfbf' }}>-</span>,
    },
    {
      title: t('asset.colAction'), key: 'action', width: 180, fixed: 'right',
      render: (_: unknown, record: InboundBatch) => (
        <span style={{ display: 'flex', gap: 4 }}>
          {activeTab === 'exceptions' && deriveBatchStatus(record) === 'exchange_pending' && (
            <Button type="link" size="small" style={{ color: '#1890FF' }} onClick={() => setActiveTab('pending')}>{t('asset.goAccept')}</Button>
          )}
          <Button type="link" size="small" onClick={() => onDetail(record.id)}>{t('common.detail')}</Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>{t('common.delete')}</Button>
        </span>
      ),
    },
  ]

  /* ----- 字段配置（入庫批次 / 異常批次 共用） ----- */
  const columnMeta = useMemo(() => [
    { key: 'batchNo', title: t('asset.colBatchNo') },
    { key: 'poNo', title: t('asset.colPoNo') },
    { key: 'brand', title: t('asset.orderBrand') },
    { key: 'batchStatus', title: t('asset.colBatchStatus') },
    { key: 'generatedAssetCount', title: t('asset.colGeneratedCount') },
    { key: 'totalQty', title: t('asset.colTotalQty') },
    { key: 'disposition', title: t('asset.colDisposition') },
    { key: 'inboundDate', title: t('asset.colInboundDate') },
    { key: 'operator', title: t('asset.colOperator') },
    { key: 'createdAt', title: t('asset.colCreatedAt') },
    { key: 'updatedBy', title: t('asset.colUpdatedBy') },
    { key: 'remark', title: t('asset.colRemark') },
    { key: 'action', title: t('asset.colAction') },
  ], [t])

  const { applyConfig, configComponent } = useColumnConfig('asset-inbound', columnMeta)

  /* ----- 刪除操作（mock） ----- */
  const handleDelete = (_record: InboundBatch) => {
    message.info(t('asset.deleteWip'))
  }

  /* ----- 待驗收行展開：訂單 × 供應商分組（分組級統計優先用後端摘要，mock 走明細計算） ----- */
  const pendingRows = useMemo<PendingRow[]>(() => {
    const kw = (poFilters.supplier || '').trim().toLowerCase()
    const rows: PendingRow[] = []
    const today = dayjs()
    pendingOrders.forEach((o) => {
      // 兼容舊數據：無分組時以訂單級供應商構造默認分組
      const groups: PurchaseOrderSupplierGroup[] = (o.supplierGroups && o.supplierGroups.length > 0)
        ? o.supplierGroups
        : [{ id: 'default', supplier: o.supplier || '', items: o.items || [] }]
      // 換貨在途 / 退貨改由分組級計算（PR-2 後端提供明細 returnedQty/exchangedQty）
      const overdueDays = o.updatedAt ? Math.max(0, today.diff(dayjs(o.updatedAt), 'day')) : 0
      groups.forEach((g) => {
        // 供應商過濾兜底：分組內供應商在此二次匹配
        if (kw && !(g.supplier || '').toLowerCase().includes(kw)) return
        const items = g.items || []
        const gTotal = g.totalQty ?? items.reduce((s, it) => s + (it.qty || 0), 0)
        const gReceived = g.receivedQty ?? items.reduce((s, it) => s + (it.receivedQty || 0), 0)
        // 分組級退貨（終態）：優先取後端分組摘要，回退明細求和
        const gReturned = g.returnedQty ?? items.reduce((s, it) => s + (it.returnedQty || 0), 0)
        // 分組級換貨在途：明細求和；摘要無明細時回退訂單級
        const gExchanged = items.length > 0
          ? items.reduce((s, it) => s + (it.exchangedQty || 0), 0)
          : (o.exchangeQty || 0)
        // 退貨為終態：從待驗收扣除；換貨在途不扣（到貨後重新驗收）
        const netPending = Math.max(0, gTotal - gReceived - gReturned)
        rows.push({
          orderId: o.id,
          poNo: o.poNo,
          groupId: g.id,
          supplier: g.supplier || '',
          deliveryMethod: g.deliveryMethod,
          trackingNo: g.trackingNo,
          groupTotalQty: gTotal,
          groupReceivedQty: gReceived,
          groupPendingQty: netPending,
          orderExchangeQty: gExchanged,
          orderReturnQty: gReturned,
          exchangePendingQty: gExchanged,
          overdueDays,
          order: o,
        })
      })
    })
    return rows
  }, [pendingOrders, poFilters.supplier])

  /* ----- 待驗收訂單表格列（操作導向：強調本次可驗 + 異常預警） ----- */
  const pendingColumns: TableColumnsType<PendingRow> = [
    {
      title: t('asset.colPoNo'), dataIndex: 'poNo', key: 'poNo', width: 240, fixed: 'left',
      render: (v: string, r: PendingRow) => (
        <Space size={4} wrap>
          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>
          {r.exchangePendingQty > 0 && (
            <Tooltip title={t('asset.tipExchangePending')}>
              <Tag color="processing" style={{ margin: 0 }}>{t('asset.batchExchangePending')} {r.exchangePendingQty}</Tag>
            </Tooltip>
          )}
          {r.overdueDays > 7 && (
            <Tooltip title={t('asset.tipOverdue')}>
              <Tag color="error" style={{ margin: 0 }}>{t('asset.tagOverdue', { count: r.overdueDays })}</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: t('asset.orderBrand'), key: 'brand', width: 100,
      render: (_: unknown, r: PendingRow) => r.order.brand
        ? <BrandTag value={r.order.brand} />
        : <span style={{ color: '#bfbfbf' }}>-</span>,
    },
    {
      title: t('asset.colSupplier'), dataIndex: 'supplier', key: 'supplier', width: 180, ellipsis: true,
      render: (v: string) => v || t('asset.supplierTbd'),
    },
    {
      title: t('asset.colPurchaser'), key: 'purchaser', width: 110,
      render: (_: unknown, r: PendingRow) => r.order.purchaser || '-',
    },
    {
      title: t('asset.colGroupTotalQty'), dataIndex: 'groupTotalQty', key: 'groupTotalQty', width: 80, align: 'right',
      render: (v: number) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    {
      title: t('asset.colGroupReceivedQty'), dataIndex: 'groupReceivedQty', key: 'groupReceivedQty', width: 80, align: 'right',
      render: (v: number) => <span style={{ color: v > 0 ? '#52C41A' : '#8C8C8C', fontWeight: 600 }}>{v}</span>,
    },
    {
      title: t('asset.colGroupPendingQty'), dataIndex: 'groupPendingQty', key: 'groupPendingQty', width: 80, align: 'right',
      sorter: (a, b) => a.groupPendingQty - b.groupPendingQty,
      defaultSortOrder: 'descend',
      render: (v: number) => (
        <span style={{ color: v > 0 ? '#FF4D4F' : '#8C8C8C', fontWeight: 700, fontSize: 15 }}>{v}</span>
      ),
    },
    {
      title: t('asset.colExchangeQty'), dataIndex: 'orderExchangeQty', key: 'orderExchangeQty', width: 70, align: 'right',
      render: (v: number) => (
        <Tooltip title={t('asset.tipOrderExchange')}>
          <span style={{ color: v > 0 ? '#FA8C16' : '#8C8C8C', fontWeight: v > 0 ? 600 : 400 }}>{v}</span>
        </Tooltip>
      ),
    },
    {
      title: t('asset.colReturnQty'), dataIndex: 'orderReturnQty', key: 'orderReturnQty', width: 70, align: 'right',
      render: (v: number) => (
        <Tooltip title={t('asset.tipOrderReturn')}>
          <span style={{ color: v > 0 ? '#FF4D4F' : '#8C8C8C', fontWeight: v > 0 ? 600 : 400 }}>{v}</span>
        </Tooltip>
      ),
    },
    {
      title: t('asset.colLogistics'), key: 'logistics', width: 160,
      render: (_: unknown, r: PendingRow) => {
        const methodKey = r.deliveryMethod ? DELIVERY_METHOD_LABEL[r.deliveryMethod] : ''
        // 快遞方式：直接顯示快遞單號（未對接物流平台，不判斷發貨狀態）
        if (r.deliveryMethod === 'express') {
          return r.trackingNo
            ? (
              <Tooltip title={`${t('asset.deliveryExpress')} · ${r.trackingNo}`}>
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.trackingNo}</span>
              </Tooltip>
            )
            : <span style={{ color: '#bfbfbf' }}>{t('asset.expressNoTracking')}</span>
        }
        // 自取 / 供應商送貨上門 / 未知
        return <span style={{ color: methodKey ? '#595959' : '#bfbfbf' }}>{(methodKey && t(`asset.${methodKey}`)) || '-'}</span>
      },
    },
    {
      title: t('asset.colInboundStatus'), key: 'status', width: 100,
      render: (_: unknown, r: PendingRow) => {
        const meta = INBOUND_STATUS_META[r.order.status] || INBOUND_STATUS_META.pending
        return <Tag color={meta.color} style={{ margin: 0 }}>{t(`asset.${meta.labelKey}`)}</Tag>
      },
    },
    {
      title: t('asset.colCompletedAt'), key: 'updatedAt', width: 110,
      sorter: (a, b) => (a.order.updatedAt || '').localeCompare(b.order.updatedAt || ''),
      render: (_: unknown, r: PendingRow) => {
        if (!r.order.updatedAt) return '-'
        const diff = r.overdueDays
        return (
          <Tooltip title={r.order.updatedAt}>
            <span style={{ color: diff > 7 ? '#FF4D4F' : '#8C8C8C' }}>
              {diff === 0 ? t('asset.today') : t('asset.daysAgo', { count: diff })}
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: t('asset.colAction'), key: 'action', width: 90, fixed: 'right',
      render: (_: unknown, r: PendingRow) => (
        <Button type="link" size="small" onClick={() => onAdd(r.orderId, r.groupId)}>{t('asset.acceptBtn')}</Button>
      ),
    },
  ]

  /* ----- 入庫批次 / 異常批次 共用搜索區 ----- */
  const batchSearchSection = (
    <div className="search-section">
      <Form form={form} layout="inline">
        <Form.Item label={t('asset.colBatchNo')} name="batchNo">
          <Input placeholder={t('asset.phBatchNo')} allowClear />
        </Form.Item>
        <Form.Item label={t('asset.colPoNo')} name="poNo">
          <Input placeholder={t('asset.phPoNo')} allowClear />
        </Form.Item>
        <Form.Item label={t('asset.colCreatedAt')} name="createdDateRange">
          <RangePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label={t('asset.colUpdatedBy')} name="updatedBy">
          <Input placeholder={t('asset.phUpdatedBy')} allowClear />
        </Form.Item>
        <Form.Item label={t('asset.colUpdatedAt')} name="updatedDateRange">
          <RangePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item>
          <div className="search-actions">
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
          </div>
        </Form.Item>
      </Form>
    </div>
  )

  /* ----- 入庫批次 / 異常批次 共用操作區 ----- */
  const batchActionSection = (
    <div className="action-section">
      <div className="action-section-left">
        <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>{t('common.export')}</Button>
      </div>
      <div className="action-section-right">
        {configComponent}
      </div>
    </div>
  )

  /* ----- 入庫批次 / 異常批次 共用展開行（顯示生成的資產編號） ----- */
  const batchExpandable = {
    expandedRowRender: (record: InboundBatch) => {
      const assetNos = (record.items || []).flatMap((it) => it.assetNos || [])
      return (
        <div style={{ padding: '4px 0' }}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>{t('asset.colGeneratedNos')}</div>
          {assetNos.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {assetNos.map((no) => (
                <span
                  key={no}
                  style={{
                    padding: '2px 8px', borderRadius: 4,
                    background: '#f0f5ff', border: '1px solid #adc6ff',
                    fontFamily: 'monospace', fontSize: 12,
                  }}
                >
                  {no}
                </span>
              ))}
            </div>
          ) : (
            <span style={{ color: '#8C8C8C', fontSize: 12 }}>{t('asset.noGeneratedAssets')}</span>
          )}
        </div>
      )
    },
  }

  return (
    <Tabs
      activeKey={activeTab}
      onChange={(k) => setActiveTab(k as 'pending' | 'batches' | 'exceptions')}
      items={[
        {
          key: 'pending',
          label: t('asset.tabPending', { count: pendingRows.length }),
          destroyOnHidden: true,
          children: (
            <>
              {/* ====== 搜索區 ====== */}
              <div className="search-section">
                <Form form={poForm} layout="inline">
                  <Form.Item label={t('asset.labelPoNo')} name="poNo">
                    <Input placeholder={t('asset.phPurchaseOrderNo')} allowClear onPressEnter={handlePoSearch} />
                  </Form.Item>
                  <Form.Item label={t('asset.colSupplier')} name="supplier">
                    <Input placeholder={t('asset.phSupplier')} allowClear onPressEnter={handlePoSearch} />
                  </Form.Item>
                  <Form.Item label={t('asset.colInboundStatus')} name="status">
                    <Select
                      placeholder={t('common.all')}
                      allowClear
                      style={{ width: 140 }}
                      options={[
                        { value: 'pending', label: t('asset.poPending') },
                        { value: 'partial', label: t('asset.poPartial') },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item label={t('asset.colPurchaser')} name="purchaser">
                    <Input placeholder={t('asset.phPurchaser')} allowClear onPressEnter={handlePoSearch} />
                  </Form.Item>
                  <Form.Item label={t('asset.labelCompletedTime')} name="updatedAtRange">
                    <RangePicker style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item>
                    <div className="search-actions">
                      <Button type="primary" icon={<SearchOutlined />} onClick={handlePoSearch}>{t('common.search')}</Button>
                      <Button icon={<ReloadOutlined />} onClick={handlePoReset}>{t('common.reset')}</Button>
                    </div>
                  </Form.Item>
                </Form>
              </div>

              <div style={{ marginBottom: 12, fontSize: 13, color: '#8C8C8C' }}>
                {t('asset.pendingHint')}
              </div>
              <Table<PendingRow>
                columns={pendingColumns}
                dataSource={pendingRows}
                rowKey={(r) => `${r.orderId}_${r.groupId}`}
                rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
                loading={poLoading}
                size="middle"
                scroll={{ x: 1560 }}
                pagination={{
                  current: poPage, pageSize: poSize, total: pendingRows.length,
                  showSizeChanger: true, showQuickJumper: true,
                  showTotal: (tt) => t('common.total', { count: tt }),
                }}
                onChange={handlePoTableChange}
              />
            </>
          ),
        },
        {
          key: 'batches',
          label: t('asset.tabBatches', { count: batchesData.length }),
          destroyOnHidden: true,
          children: (
            <>
              {batchSearchSection}
              {batchActionSection}
              <Table<InboundBatch>
                columns={applyConfig(allColumns)}
                dataSource={batchesData}
                rowKey="id"
                rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
                loading={loading}
                size="middle"
                scroll={{ x: 1800 }}
                expandable={batchExpandable}
                pagination={{
                  current: page, pageSize: size, total: batchesData.length,
                  showSizeChanger: true, showQuickJumper: true,
                  showTotal: (tt) => t('common.total', { count: tt }),
                }}
                onChange={handleTableChange}
              />
            </>
          ),
        },
        {
          key: 'exceptions',
          label: (
            <span>
              {t('asset.tabExceptions')}
              {exceptionsData.length > 0 && (
                <span style={{
                  marginLeft: 6, padding: '0 6px', borderRadius: 10,
                  background: '#FFF7E6', color: '#FA8C16', fontSize: 12, fontWeight: 600,
                }}>
                  {exceptionsData.length}
                </span>
              )}
            </span>
          ),
          destroyOnHidden: true,
          children: (
            <>
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                message={t('asset.alertMsg')}
                description={t('asset.alertDesc')}
              />
              {batchSearchSection}
              {batchActionSection}
              <Table<InboundBatch>
                columns={applyConfig(allColumns)}
                dataSource={exceptionsData}
                rowKey="id"
                rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
                loading={loading}
                size="middle"
                scroll={{ x: 1800 }}
                expandable={batchExpandable}
                pagination={{
                  current: page, pageSize: size, total: exceptionsData.length,
                  showSizeChanger: true, showQuickJumper: true,
                  showTotal: (tt) => t('common.total', { count: tt }),
                }}
                onChange={handleTableChange}
              />
            </>
          ),
        },
      ]}
    />
  )
}
