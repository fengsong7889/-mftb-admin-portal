/**
 * 驗收入庫（雙 Tab 視圖）
 *
 * - 待驗收訂單（默認）：自動同步「採購完成且有待驗收明細」的訂單，點擊「驗收」進入表單
 *   搜索條件（5 字段）：採購單號、供應商、入庫狀態、採購經辦人、完成採購時間
 *   搜索條件優先走服務端過濾（/eam/purchase），status 參數待後端接入，前端兜底過濾
 * - 入庫批次：驗收動作的歷史記錄
 *   搜索條件（5 字段）：入庫批次號、訂單編號、創建時間、最後更新人、最後更新時間
 *   列表字段：入庫批次號、訂單編號、創建時間、最後更新人、最後更新時間、總數量、已驗收數量、未驗收數量、採購事由、操作
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Form, Input, Select, Table, Tag, Tooltip, DatePicker, Tabs, message } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import {
  SearchOutlined, ReloadOutlined, ExportOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchInboundList, fetchPurchaseOrderList, type InboundBatch, type PurchaseOrder, type PurchaseOrderSupplierGroup } from '../../../api/eam'
import { exportToCSV } from '../../../utils/exportCSV'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import BrandTag from '../../../components/BrandTag'

const { RangePicker } = DatePicker

/** 入庫狀態展示元數據（待驗收/部分入庫/已入庫） */
const INBOUND_STATUS_META: Record<PurchaseOrder['status'], { label: string; color: string }> = {
  pending: { label: '待驗收', color: 'processing' },
  partial: { label: '部分入庫', color: 'warning' },
  received: { label: '已入庫', color: 'success' },
}

/** 收貨方式展示文案 */
const DELIVERY_METHOD_LABEL: Record<string, string> = {
  self_pickup: '自取',
  supplier_delivery: '供應商送貨上門',
  express: '快遞發貨',
}

/** 待驗收列表行：採購訂單 × 供應商分組（多供應商訂單按分組拆分展示，對齊行業 ASN 收貨實踐） */
interface PendingRow {
  orderId: number
  poNo: string
  groupId: string
  supplier: string
  deliveryMethod?: PurchaseOrderSupplierGroup['deliveryMethod']
  trackingNo?: string
  groupTotalQty: number
  groupReceivedQty: number
  groupPendingQty: number
  order: PurchaseOrder
}

interface Props {
  onAdd: (poId: number) => void
  onDetail: (batchId: number) => void
}

export default function InboundList({ onAdd, onDetail }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<InboundBatch[]>([])
  const [total, setTotal] = useState(0)
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
      setDataSource(list)
      setTotal(list.length)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [filters, page, size, t])

  useEffect(() => { loadData() }, [loadData])

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

  /* ----- 導出 ----- */
  const handleExport = () => {
    const cols = [
      { title: '入庫批次號', dataIndex: 'batchNo' },
      { title: '訂單編號', dataIndex: 'poNo' },
      { title: '所屬品牌', dataIndex: 'brand', render: (v: number | undefined) => (v === 1 ? '閃蜂' : v === 2 ? 'mFood' : '') },
      { title: '創建時間', dataIndex: 'createdAt' },
      { title: '最後更新人', dataIndex: 'updatedBy' },
      { title: '最後更新時間', dataIndex: 'updatedAt' },
      { title: '總數量', dataIndex: 'totalQty' },
      { title: '已驗收數量', dataIndex: 'acceptedQty' },
      { title: '未驗收數量', dataIndex: 'pendingQty' },
      { title: '退貨', dataIndex: 'returnQty' },
      { title: '換貨', dataIndex: 'exchangeQty' },
      { title: '讓步接收', dataIndex: 'concessionQty' },
      { title: '採購事由', dataIndex: 'purchaseReason' },
    ]
    exportToCSV(`驗收入庫_${new Date().toISOString().slice(0, 10)}`, cols, dataSource)
    message.success('導出成功')
  }

  /* ----- 表格列定義 ----- */
  const allColumns: TableColumnsType<InboundBatch> = [
    {
      title: '入庫批次號', dataIndex: 'batchNo', key: 'batchNo', width: 150, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    {
      title: '訂單編號', dataIndex: 'poNo', key: 'poNo', width: 140,
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: '所屬品牌', dataIndex: 'brand', key: 'brand', width: 100,
      render: (v: number | undefined) => v ? <BrandTag value={v} /> : <span style={{ color: '#bfbfbf' }}>-</span>,
    },
    { title: '創建時間', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 130 },
    { title: '最後更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 170 },
    {
      title: '總數量', dataIndex: 'totalQty', key: 'totalQty', width: 90, align: 'right',
      render: (v: number) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    {
      title: '已驗收數量', dataIndex: 'acceptedQty', key: 'acceptedQty', width: 110, align: 'right',
      render: (v: number) => <span style={{ color: '#52C41A', fontWeight: 600 }}>{v}</span>,
    },
    {
      title: '未驗收數量', dataIndex: 'pendingQty', key: 'pendingQty', width: 110, align: 'right',
      render: (v: number) => (
        <span style={{ color: v > 0 ? '#FF4D4F' : '#8C8C8C', fontWeight: 600 }}>{v}</span>
      ),
    },
    {
      title: '退貨', dataIndex: 'returnQty', key: 'returnQty', width: 80, align: 'right',
      render: (v: number) => (
        <span style={{ color: v > 0 ? '#FF4D4F' : '#8C8C8C', fontWeight: v > 0 ? 600 : 400 }}>{v}</span>
      ),
    },
    {
      title: '換貨', dataIndex: 'exchangeQty', key: 'exchangeQty', width: 80, align: 'right',
      render: (v: number) => (
        <span style={{ color: v > 0 ? '#FAAD14' : '#8C8C8C', fontWeight: v > 0 ? 600 : 400 }}>{v}</span>
      ),
    },
    {
      title: '讓步接收', dataIndex: 'concessionQty', key: 'concessionQty', width: 90, align: 'right',
      render: (v: number) => (
        <span style={{ color: v > 0 ? '#1890FF' : '#8C8C8C', fontWeight: v > 0 ? 600 : 400 }}>{v}</span>
      ),
    },
    {
      title: '採購事由', dataIndex: 'purchaseReason', key: 'purchaseReason', width: 180, ellipsis: true,
      render: (v: string | undefined) => v || '—',
    },
    {
      title: '操作', key: 'action', width: 160, fixed: 'right',
      render: (_: unknown, record: InboundBatch) => (
        <span style={{ display: 'flex', gap: 4 }}>
          <Button type="link" size="small" onClick={() => onDetail(record.id)}>詳情</Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>刪除</Button>
        </span>
      ),
    },
  ]

  /* ----- 字段配置 ----- */
  const columnMeta = useMemo(() => [
    { key: 'batchNo', title: '入庫批次號' },
    { key: 'poNo', title: '訂單編號' },
    { key: 'brand', title: '所屬品牌' },
    { key: 'createdAt', title: '創建時間' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'totalQty', title: '總數量' },
    { key: 'acceptedQty', title: '已驗收數量' },
    { key: 'pendingQty', title: '未驗收數量' },
    { key: 'returnQty', title: '退貨' },
    { key: 'exchangeQty', title: '換貨' },
    { key: 'concessionQty', title: '讓步接收' },
    { key: 'purchaseReason', title: '採購事由' },
    { key: 'action', title: '操作' },
  ], [])

  const { applyConfig, configComponent } = useColumnConfig('asset-inbound', columnMeta)

  /* ----- 刪除操作（mock） ----- */
  const handleDelete = (_record: InboundBatch) => {
    message.info('刪除功能開發中')
  }

  /* ----- 待驗收行展開：訂單 × 供應商分組（分組級統計優先用後端摘要，mock 走明細計算） ----- */
  const pendingRows = useMemo<PendingRow[]>(() => {
    const kw = (poFilters.supplier || '').trim().toLowerCase()
    const rows: PendingRow[] = []
    pendingOrders.forEach((o) => {
      // 兼容舊數據：無分組時以訂單級供應商構造默認分組
      const groups: PurchaseOrderSupplierGroup[] = (o.supplierGroups && o.supplierGroups.length > 0)
        ? o.supplierGroups
        : [{ id: 'default', supplier: o.supplier || '', items: o.items || [] }]
      groups.forEach((g) => {
        // 供應商過濾兜底：分組內供應商在此二次匹配
        if (kw && !(g.supplier || '').toLowerCase().includes(kw)) return
        const items = g.items || []
        const gTotal = g.totalQty ?? items.reduce((s, it) => s + (it.qty || 0), 0)
        const gReceived = g.receivedQty ?? items.reduce((s, it) => s + (it.receivedQty || 0), 0)
        rows.push({
          orderId: o.id,
          poNo: o.poNo,
          groupId: g.id,
          supplier: g.supplier || '',
          deliveryMethod: g.deliveryMethod,
          trackingNo: g.trackingNo,
          groupTotalQty: gTotal,
          groupReceivedQty: gReceived,
          groupPendingQty: Math.max(0, gTotal - gReceived),
          order: o,
        })
      })
    })
    return rows
  }, [pendingOrders, poFilters.supplier])

  const pendingColumns: TableColumnsType<PendingRow> = [
    {
      title: '訂單編號', dataIndex: 'poNo', key: 'poNo', width: 160, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    {
      title: '所屬品牌', key: 'brand', width: 100,
      render: (_: unknown, r: PendingRow) => r.order.brand
        ? <BrandTag value={r.order.brand} />
        : <span style={{ color: '#bfbfbf' }}>-</span>,
    },
    {
      title: '供應商', dataIndex: 'supplier', key: 'supplier', width: 180, ellipsis: true,
      render: (v: string) => v || '待定',
    },
    {
      title: '採購經辦人', key: 'purchaser', width: 120,
      render: (_: unknown, r: PendingRow) => r.order.purchaser || '-',
    },
    {
      title: '收貨方式', dataIndex: 'deliveryMethod', key: 'deliveryMethod', width: 130,
      render: (v: string | undefined) => (v && DELIVERY_METHOD_LABEL[v]) || '-',
    },
    {
      title: '快遞單號', dataIndex: 'trackingNo', key: 'trackingNo', width: 140,
      render: (v: string | undefined) => v
        ? <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>
        : <span style={{ color: '#bfbfbf' }}>-</span>,
    },
    {
      title: '訂單總計', key: 'confirmedAmount', width: 130, align: 'right',
      render: (_: unknown, r: PendingRow) => (
        <span style={{ fontWeight: 600 }}>MOP {(r.order.confirmedAmount ?? r.order.amount).toLocaleString()}</span>
      ),
    },
    {
      title: '待驗收件數', key: 'groupPendingQty', width: 110, align: 'right',
      render: (_: unknown, r: PendingRow) => (
        <Tooltip title={`已驗收 ${r.groupReceivedQty} / 共 ${r.groupTotalQty} 件`}>
          <span style={{ color: r.groupPendingQty > 0 ? '#FF4D4F' : '#8C8C8C', fontWeight: 600 }}>{r.groupPendingQty}</span>
        </Tooltip>
      ),
    },
    {
      title: '入庫狀態', key: 'status', width: 110,
      render: (_: unknown, r: PendingRow) => {
        const meta = INBOUND_STATUS_META[r.order.status] || INBOUND_STATUS_META.pending
        const progress = r.order.totalQty != null && r.order.totalQty > 0
          ? `整單已驗收 ${r.order.acceptedQty || 0} / 共 ${r.order.totalQty} 件`
          : undefined
        return (
          <Tooltip title={progress}>
            <Tag color={meta.color} style={{ margin: 0 }}>{meta.label}</Tag>
          </Tooltip>
        )
      },
    },
    {
      title: '完成採購時間', key: 'updatedAt', width: 170,
      sorter: (a, b) => (a.order.updatedAt || '').localeCompare(b.order.updatedAt || ''),
      defaultSortOrder: 'ascend',
      render: (_: unknown, r: PendingRow) => r.order.updatedAt || '-',
    },
    {
      title: '操作', key: 'action', width: 90, fixed: 'right',
      render: (_: unknown, r: PendingRow) => (
        <Button type="link" size="small" onClick={() => onAdd(r.orderId)}>驗收</Button>
      ),
    },
  ]

  return (
    <Tabs
      activeKey={activeTab}
      onChange={(k) => setActiveTab(k as 'pending' | 'batches')}
      items={[
        {
          key: 'pending',
          label: `待驗收訂單 (${pendingRows.length})`,
          children: (
            <>
              {/* ====== 搜索區 ====== */}
              <div className="search-section">
                <Form form={poForm} layout="inline">
                  <Form.Item label="採購單號" name="poNo">
                    <Input placeholder="請輸入採購單號" allowClear onPressEnter={handlePoSearch} />
                  </Form.Item>
                  <Form.Item label="供應商" name="supplier">
                    <Input placeholder="請輸入供應商名稱" allowClear onPressEnter={handlePoSearch} />
                  </Form.Item>
                  <Form.Item label="入庫狀態" name="status">
                    <Select
                      placeholder="全部"
                      allowClear
                      style={{ width: 140 }}
                      options={[
                        { value: 'pending', label: '待驗收' },
                        { value: 'partial', label: '部分入庫' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item label="採購經辦人" name="purchaser">
                    <Input placeholder="請輸入採購經辦人" allowClear onPressEnter={handlePoSearch} />
                  </Form.Item>
                  <Form.Item label="完成採購時間" name="updatedAtRange">
                    <RangePicker style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item>
                    <div className="search-actions">
                      <Button type="primary" icon={<SearchOutlined />} onClick={handlePoSearch}>查詢</Button>
                      <Button icon={<ReloadOutlined />} onClick={handlePoReset}>重置</Button>
                    </div>
                  </Form.Item>
                </Form>
              </div>

              <div style={{ marginBottom: 12, fontSize: 13, color: '#8C8C8C' }}>
                採購完成的訂單自動同步至此，請核對到貨物資後點擊「驗收」；支持分批多次驗收
              </div>
              <Table<PendingRow>
                columns={pendingColumns}
                dataSource={pendingRows}
                rowKey={(r) => `${r.orderId}_${r.groupId}`}
                loading={poLoading}
                size="middle"
                scroll={{ x: 1440 }}
                pagination={{
                  current: poPage, pageSize: poSize, total: pendingRows.length,
                  showSizeChanger: true, showQuickJumper: true,
                  showTotal: (tt) => `共 ${tt} 條`,
                }}
                onChange={handlePoTableChange}
              />
            </>
          ),
        },
        {
          key: 'batches',
          label: '入庫批次',
          children: (
            <>
              {/* ====== 搜索區 ====== */}
              <div className="search-section">
                <Form form={form} layout="inline">
                  <Form.Item label="入庫批次號" name="batchNo">
                    <Input placeholder="請輸入入庫批次號" allowClear />
                  </Form.Item>
                  <Form.Item label="訂單編號" name="poNo">
                    <Input placeholder="請輸入訂單編號" allowClear />
                  </Form.Item>
                  <Form.Item label="創建時間" name="createdDateRange">
                    <RangePicker style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item label="最後更新人" name="updatedBy">
                    <Input placeholder="請輸入最後更新人" allowClear />
                  </Form.Item>
                  <Form.Item label="最後更新時間" name="updatedDateRange">
                    <RangePicker style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item>
                    <div className="search-actions">
                      <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
                      <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
                    </div>
                  </Form.Item>
                </Form>
              </div>

              {/* ====== 操作區 ====== */}
              <div className="action-section">
                <div className="action-section-left">
                  <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>導出</Button>
                </div>
                <div className="action-section-right">
                  {configComponent}
                </div>
              </div>

              {/* ====== 表格（展開行顯示生成的資產編號） ====== */}
              <Table<InboundBatch>
                columns={applyConfig(allColumns)}
                dataSource={dataSource}
                rowKey="id"
                loading={loading}
                size="middle"
                scroll={{ x: 1950 }}
                expandable={{
                  expandedRowRender: (record) => (
                    <div style={{ padding: '4px 0' }}>
                      <div style={{ marginBottom: 8, fontWeight: 600 }}>{t('asset.colGeneratedNos')}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {record.items.flatMap((it) => it.assetNos).map((no) => (
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
                    </div>
                  ),
                }}
                pagination={{
                  current: page, pageSize: size, total,
                  showSizeChanger: true, showQuickJumper: true,
                  showTotal: (tt) => `共 ${tt} 條`,
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
