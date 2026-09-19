/**
 * 驗收入庫（兩 Tab 視圖）
 *
 * - 待驗收訂單（默認，操作導向）：訂單級聚合，展開顯示供應商分組摘要，點擊詳情查看驗收記錄時間線
 * - 入庫批次（審計導向）：僅展示 normal / partial 狀態的正常入庫記錄
 *
 * 批次狀態由前端派生（deriveBatchStatus），不改後端表結構。
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Form, Input, Select, Table, Tag, Tooltip, DatePicker, Tabs, message, Space, Alert, Drawer, Spin } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import {
  SearchOutlined, ReloadOutlined, ExportOutlined, InfoCircleOutlined, FileTextOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { fetchInboundList, fetchPurchaseOrderList, fetchInspectionRecords, type InboundBatch, type PurchaseOrder, type PurchaseOrderSupplierGroup, type InspectionRecord } from '../../../api/eam'
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

/** 待驗收列表行：供應商分組摘要（展開後顯示） */
interface SupplierGroupSummary {
  groupId: string
  supplier: string
  totalQty: number
  receivedQty: number
  pendingQty: number
  returnQty: number
  exchangeQty: number
  status: 'pending' | 'exchange_pending' | 'returned' | 'partial'
  recordCount: number
}

/** 待驗收訂單行：訂單級聚合 */
interface PendingOrderRow {
  orderId: number
  poNo: string
  brand?: number
  suppliers: string[]
  totalQty: number
  receivedQty: number
  pendingQty: number
  returnQty: number
  exchangeQty: number
  overdueDays: number
  groups: SupplierGroupSummary[]
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
  const [activeTab, setActiveTab] = useState<'pending' | 'batches'>('pending')
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  /* ----- 驗收記錄抽屜 ----- */
  const [recordsDrawer, setRecordsDrawer] = useState<{ open: boolean; poId: number; groupId?: string; title: string }>({ open: false, poId: 0, title: '' })
  const [inspectionRecords, setInspectionRecords] = useState<InspectionRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)

  const handleOpenRecords = useCallback(async (order: PendingOrderRow, groupId?: string) => {
    setRecordsDrawer({ open: true, poId: order.orderId, groupId, title: `${order.poNo}${groupId ? ' - ' + (order.groups.find((g) => g.groupId === groupId)?.supplier || '') : ''}` })
    setRecordsLoading(true)
    try {
      const records = await fetchInspectionRecords(order.orderId, groupId)
      setInspectionRecords(records)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setRecordsLoading(false)
    }
  }, [t])

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
    const data = batchesData
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
    const prefix = t('asset.exportPrefixBatch')
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
      render: (v: string) => <span style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{v}</span>,
    },
    {
      title: '供應商', key: 'supplier', width: 140, ellipsis: true,
      render: (_: unknown, r: InboundBatch) => {
        // 从 remark 中提取供应商名称：格式为"采购订单 XXX 验收入库（供应商：YYY）"
        const remark = r.remark || ''
        const match = remark.match(/供应商[：:]\s*([^）)]+)/)
        const supplier = match ? match[1].trim() : ''
        return supplier ? <span>{supplier}</span> : <span style={{ color: '#bfbfbf' }}>-</span>
      },
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
      title: t('asset.colRemark'), key: 'remark', width: 200, ellipsis: true,
      render: (_: unknown, r: InboundBatch) => {
        const text = r.purchaseReason || r.remark || ''
        return text ? <span style={{ color: '#595959' }}>{text}</span> : <span style={{ color: '#bfbfbf' }}>-</span>
      },
    },
    {
      title: t('asset.colAction'), key: 'action', width: 180, fixed: 'right',
      render: (_: unknown, record: InboundBatch) => {
        return (
          <span style={{ display: 'flex', gap: 4 }}>
            <Button type="link" size="small" onClick={() => onDetail(record.id)}>{t('common.detail')}</Button>
            <Button type="link" size="small" danger onClick={() => handleDelete(record)}>{t('common.delete')}</Button>
          </span>
        )
      },
    },
  ]

  /* ----- 字段配置（入庫批次 / 異常批次 共用） ----- */
  const columnMeta = useMemo(() => [
    { key: 'batchNo', title: t('asset.colBatchNo') },
    { key: 'poNo', title: t('asset.colPoNo') },
    { key: 'supplier', title: '供應商' },
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

  /* ----- 待驗收訂單聚合：訂單級 + 供應商分組摘要 ----- */
  const pendingRows = useMemo<PendingOrderRow[]>(() => {
    const kw = (poFilters.supplier || '').trim().toLowerCase()
    const rows: PendingOrderRow[] = []
    const today = dayjs()
    pendingOrders.forEach((o) => {
      const groups: PurchaseOrderSupplierGroup[] = (o.supplierGroups && o.supplierGroups.length > 0)
        ? o.supplierGroups
        : [{ id: 'default', supplier: o.supplier || '', items: o.items || [] }]
      const overdueDays = o.updatedAt ? Math.max(0, today.diff(dayjs(o.updatedAt), 'day')) : 0
      const orderGroups: SupplierGroupSummary[] = []
      let orderTotal = 0, orderReceived = 0, orderPending = 0, orderReturn = 0, orderExchange = 0
      const supplierSet = new Set<string>()
      groups.forEach((g) => {
        if (kw && !(g.supplier || '').toLowerCase().includes(kw)) return
        const items = g.items || []
        const gTotal = g.totalQty ?? items.reduce((s, it) => s + (it.qty || 0), 0)
        const gReceived = g.receivedQty ?? items.reduce((s, it) => s + (it.receivedQty || 0), 0)
        const gReturned = g.returnedQty ?? items.reduce((s, it) => s + (it.returnedQty || 0), 0)
        const gExchanged = items.length > 0
          ? items.reduce((s, it) => s + (it.exchangedQty || 0), 0)
          : (o.exchangeQty || 0)
        const gPending = Math.max(0, gTotal - gReceived - gReturned)
        if (gPending === 0 && gExchanged === 0) return
        let status: SupplierGroupSummary['status'] = 'pending'
        if (gReturned > 0 && gPending === 0 && gExchanged === 0) status = 'returned'
        else if (gExchanged > 0 && gPending === 0) status = 'exchange_pending'
        else if (gPending > 0 && (gReturned > 0 || gExchanged > 0)) status = 'partial'
        orderGroups.push({
          groupId: g.id,
          supplier: g.supplier || '',
          totalQty: gTotal,
          receivedQty: gReceived,
          pendingQty: gPending,
          returnQty: gReturned,
          exchangeQty: gExchanged,
          status,
          recordCount: 0,
        })
        orderTotal += gTotal
        orderReceived += gReceived
        orderPending += gPending
        orderReturn += gReturned
        orderExchange += gExchanged
        if (g.supplier) supplierSet.add(g.supplier)
      })
      if (orderGroups.length === 0) return
      rows.push({
        orderId: o.id,
        poNo: o.poNo,
        brand: o.brand,
        suppliers: Array.from(supplierSet),
        totalQty: orderTotal,
        receivedQty: orderReceived,
        pendingQty: orderPending,
        returnQty: orderReturn,
        exchangeQty: orderExchange,
        overdueDays,
        groups: orderGroups,
        order: o,
      })
    })
    return rows
  }, [pendingOrders, poFilters.supplier])

  /* ----- 待驗收訂單表格列（訂單級聚合） ----- */
  const pendingColumns: TableColumnsType<PendingOrderRow> = [
    {
      title: t('asset.colPoNo'), dataIndex: 'poNo', key: 'poNo', width: 200, fixed: 'left',
      render: (v: string, r: PendingOrderRow) => (
        <Space size={4} wrap>
          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>
          {r.exchangeQty > 0 && (
            <Tooltip title={t('asset.tipExchangePending')}>
              <Tag color="processing" style={{ margin: 0 }}>{t('asset.batchExchangePending')} {r.exchangeQty}</Tag>
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
      render: (_: unknown, r: PendingOrderRow) => r.brand
        ? <BrandTag value={r.brand} />
        : <span style={{ color: '#bfbfbf' }}>-</span>,
    },
    {
      title: t('asset.colSupplier'), key: 'suppliers', width: 180, ellipsis: true,
      render: (_: unknown, r: PendingOrderRow) => r.suppliers.length > 0 ? r.suppliers.join('、') : t('asset.supplierTbd'),
    },
    {
      title: t('asset.colPurchaser'), key: 'purchaser', width: 110,
      render: (_: unknown, r: PendingOrderRow) => r.order.purchaser || '-',
    },
    {
      title: t('asset.colGroupTotalQty'), key: 'totalQty', width: 80, align: 'right',
      render: (_: unknown, r: PendingOrderRow) => <span style={{ fontWeight: 600 }}>{r.totalQty}</span>,
    },
    {
      title: t('asset.colGroupReceivedQty'), key: 'receivedQty', width: 80, align: 'right',
      render: (_: unknown, r: PendingOrderRow) => <span style={{ color: r.receivedQty > 0 ? '#52C41A' : '#8C8C8C', fontWeight: 600 }}>{r.receivedQty}</span>,
    },
    {
      title: t('asset.colGroupPendingQty'), key: 'pendingQty', width: 80, align: 'right',
      sorter: (a, b) => a.pendingQty - b.pendingQty,
      defaultSortOrder: 'descend',
      render: (_: unknown, r: PendingOrderRow) => (
        <span style={{ color: r.pendingQty > 0 ? '#FF4D4F' : '#8C8C8C', fontWeight: 700, fontSize: 15 }}>{r.pendingQty}</span>
      ),
    },
    {
      title: t('asset.colExchangeQty'), key: 'exchangeQty', width: 70, align: 'right',
      render: (_: unknown, r: PendingOrderRow) => (
        <Tooltip title={t('asset.tipOrderExchange')}>
          <span style={{ color: r.exchangeQty > 0 ? '#FA8C16' : '#8C8C8C', fontWeight: r.exchangeQty > 0 ? 600 : 400 }}>{r.exchangeQty}</span>
        </Tooltip>
      ),
    },
    {
      title: t('asset.colReturnQty'), key: 'returnQty', width: 70, align: 'right',
      render: (_: unknown, r: PendingOrderRow) => (
        <Tooltip title={t('asset.tipOrderReturn')}>
          <span style={{ color: r.returnQty > 0 ? '#FF4D4F' : '#8C8C8C', fontWeight: r.returnQty > 0 ? 600 : 400 }}>{r.returnQty}</span>
        </Tooltip>
      ),
    },
    {
      title: t('asset.colInboundStatus'), key: 'status', width: 100,
      render: (_: unknown, r: PendingOrderRow) => {
        const meta = INBOUND_STATUS_META[r.order.status] || INBOUND_STATUS_META.pending
        return <Tag color={meta.color} style={{ margin: 0 }}>{t(`asset.${meta.labelKey}`)}</Tag>
      },
    },
    {
      title: t('asset.colAction'), key: 'action', width: 120, fixed: 'right',
      render: (_: unknown, r: PendingOrderRow) => {
        const hasPending = r.groups.some((g) => g.status === 'pending' || g.status === 'partial')
        return (
          <Space size={0} split={<span className="action-split">|</span>}>
            {hasPending && (
              <Button type="link" size="small" onClick={() => {
                const g = r.groups.find((x) => x.status === 'pending' || x.status === 'partial')
                if (g) onAdd(r.orderId, g.groupId)
              }}>{t('asset.acceptBtn')}</Button>
            )}
            <Button type="link" size="small" onClick={() => handleOpenRecords(r)}>{t('common.detail')}</Button>
          </Space>
        )
      },
    },
  ]

  /* ----- 分組摘要展開行 ----- */
  const pendingExpandable = {
    expandedRowRender: (record: PendingOrderRow) => (
      <Table<SupplierGroupSummary>
        columns={[
          { title: '供應商', dataIndex: 'supplier', key: 'supplier', width: 180 },
          { title: '總數', dataIndex: 'totalQty', key: 'totalQty', width: 80, align: 'right', render: (v: number) => <span style={{ fontWeight: 600 }}>{v}</span> },
          { title: '已驗收', dataIndex: 'receivedQty', key: 'receivedQty', width: 80, align: 'right', render: (v: number) => <span style={{ color: v > 0 ? '#52C41A' : '#8C8C8C' }}>{v}</span> },
          { title: '待驗收', dataIndex: 'pendingQty', key: 'pendingQty', width: 80, align: 'right', render: (v: number) => <span style={{ color: v > 0 ? '#FF4D4F' : '#8C8C8C', fontWeight: 600 }}>{v}</span> },
          { title: '換貨', dataIndex: 'exchangeQty', key: 'exchangeQty', width: 70, align: 'right', render: (v: number) => <span style={{ color: v > 0 ? '#FA8C16' : '#8C8C8C' }}>{v}</span> },
          { title: '退貨', dataIndex: 'returnQty', key: 'returnQty', width: 70, align: 'right', render: (v: number) => <span style={{ color: v > 0 ? '#FF4D4F' : '#8C8C8C' }}>{v}</span> },
          {
            title: '狀態', key: 'status', width: 100,
            render: (_: unknown, g: SupplierGroupSummary) => {
              const meta: Record<string, { label: string; color: string }> = {
                pending: { label: '待驗收', color: 'processing' },
                exchange_pending: { label: '換貨在途', color: 'warning' },
                returned: { label: '退貨終結', color: 'default' },
                partial: { label: '部分驗收', color: 'warning' },
              }
              const m = meta[g.status] || meta.pending
              return <Tag color={m.color} style={{ margin: 0 }}>{m.label}</Tag>
            },
          },
          {
            title: '操作', key: 'action', width: 120,
            render: (_: unknown, g: SupplierGroupSummary) => (
              <Space size={0} split={<span className="action-split">|</span>}>
                {(g.status === 'pending' || g.status === 'partial') && (
                  <Button type="link" size="small" onClick={() => onAdd(record.orderId, g.groupId)}>{t('asset.acceptBtn')}</Button>
                )}
                <Button type="link" size="small" onClick={() => handleOpenRecords(record, g.groupId)}>{t('common.detail')}</Button>
              </Space>
            ),
          },
        ]}
        dataSource={record.groups}
        rowKey="groupId"
        pagination={false}
        size="small"
      />
    ),
    rowExpandable: (record: PendingOrderRow) => record.groups.length > 1,
  }

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
    <>
    <Tabs
      activeKey={activeTab}
      onChange={(k) => setActiveTab(k as 'pending' | 'batches')}
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
              <Table<PendingOrderRow>
                columns={pendingColumns}
                dataSource={pendingRows}
                rowKey="orderId"
                rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
                loading={poLoading}
                size="middle"
                scroll={{ x: 1560 }}
                expandable={pendingExpandable}
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
      ]}
    />

    {/* ====== 驗收記錄抽屜 ====== */}
    <Drawer
      open={recordsDrawer.open}
      onClose={() => setRecordsDrawer({ ...recordsDrawer, open: false })}
      title={<span style={{ fontSize: 15, fontWeight: 600 }}><FileTextOutlined style={{ marginRight: 8, color: '#E8720C' }} />{recordsDrawer.title} - 驗收記錄</span>}
      width={720}
      destroyOnClose
    >
      {recordsLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : inspectionRecords.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#8C8C8C' }}>暫無驗收記錄</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {inspectionRecords.map((record) => (
            <div key={record.batchId} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, background: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 14 }}>{record.batchNo}</span>
                  <span style={{ marginLeft: 12, color: '#8C8C8C', fontSize: 13 }}>{record.inboundDate} · {record.operator}</span>
                </div>
                <Button type="link" size="small" onClick={() => onDetail(record.batchId)}>{t('common.detail')}</Button>
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13 }}>
                <span>總數：<b>{record.totalQty}</b></span>
                {record.acceptedQty > 0 && <span style={{ color: '#52C41A' }}>通過：<b>{record.acceptedQty}</b></span>}
                {record.returnQty > 0 && <span style={{ color: '#FF4D4F' }}>退貨：<b>{record.returnQty}</b></span>}
                {record.exchangeQty > 0 && <span style={{ color: '#FA8C16' }}>換貨：<b>{record.exchangeQty}</b></span>}
                {record.concessionQty > 0 && <span style={{ color: '#1890FF' }}>讓步：<b>{record.concessionQty}</b></span>}
              </div>
              {record.items.length > 0 && (
                <div style={{ fontSize: 13, color: '#595959' }}>
                  {record.items.map((item, idx) => (
                    <div key={idx} style={{ padding: '4px 0', borderBottom: idx < record.items.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                      <span style={{ fontWeight: 500 }}>{item.modelName}</span> × {item.qty}
                      {item.disposition && item.disposition !== 'pass' && (
                        <Tag color={item.disposition === 'return' ? 'error' : item.disposition === 'exchange' ? 'warning' : 'processing'} style={{ marginLeft: 8, fontSize: 11 }}>
                          {item.disposition === 'return' ? '退貨' : item.disposition === 'exchange' ? '換貨' : '讓步'}
                        </Tag>
                      )}
                      {item.rejectReason && <span style={{ marginLeft: 8, color: '#8C8C8C' }}>原因：{item.rejectReason}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Drawer>
    </>
  )
}
