/**
 * 驗收入庫（雙 Tab 視圖）
 *
 * - 待驗收訂單（默認）：自動同步「採購完成且有待驗收明細」的訂單，點擊「驗收」進入表單
 * - 入庫批次：驗收動作的歷史記錄
 *   搜索條件（5 字段）：入庫批次號、訂單編號、創建時間、最後更新人、最後更新時間
 *   列表字段：入庫批次號、訂單編號、創建時間、最後更新人、最後更新時間、總數量、已驗收數量、未驗收數量、採購事由、操作
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Form, Input, Table, DatePicker, Tabs, message } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import {
  SearchOutlined, ReloadOutlined, ExportOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchInboundList, fetchPurchaseOrderList, type InboundBatch, type PurchaseOrder } from '../../../api/eam'
import { exportToCSV } from '../../../utils/exportCSV'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

const { RangePicker } = DatePicker

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

  /* ----- 待驗收訂單（自動同步採購完成的訂單） ----- */
  const [poLoading, setPoLoading] = useState(false)
  const [pendingOrders, setPendingOrders] = useState<PurchaseOrder[]>([])

  const loadPendingOrders = useCallback(async () => {
    setPoLoading(true)
    try {
      const res = await fetchPurchaseOrderList({ size: 200 })
      // 與採購訂單頁驗收入庫入口規則一致：僅採購完成且有待驗收明細的訂單
      //（待處理/採購中的訂單貨未到，不可驗收；已全部入庫的訂單無明細可驗收）
      const available = (res.records || []).filter((o) =>
        o.execStatus === 'completed' && o.items.some((it) => it.receivedQty < it.qty)
      )
      setPendingOrders(available)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setPoLoading(false)
    }
  }, [t])

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
  const handleTableChange = (p: TablePaginationConfig) => {
    setPage(p.current || 1)
    setSize(p.pageSize || 10)
  }

  /* ----- 導出 ----- */
  const handleExport = () => {
    const cols = [
      { title: '入庫批次號', dataIndex: 'batchNo' },
      { title: '訂單編號', dataIndex: 'poNo' },
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

  /* ----- 待驗收訂單表格列 ----- */
  const pendingQtyOf = (o: PurchaseOrder) =>
    o.items.reduce((s, it) => s + Math.max(0, it.qty - it.receivedQty), 0)

  const pendingColumns: TableColumnsType<PurchaseOrder> = [
    {
      title: '訂單編號', dataIndex: 'poNo', key: 'poNo', width: 160,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    {
      title: '供應商', dataIndex: 'supplier', key: 'supplier', width: 180, ellipsis: true,
      render: (v: string | undefined) => v || '待定',
    },
    {
      title: '採購經辦人', dataIndex: 'purchaser', key: 'purchaser', width: 120,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '訂單總計', dataIndex: 'confirmedAmount', key: 'confirmedAmount', width: 130, align: 'right',
      render: (v: number | undefined, r: PurchaseOrder) => (
        <span style={{ fontWeight: 600 }}>MOP {(v ?? r.amount).toLocaleString()}</span>
      ),
    },
    {
      title: '待驗收件數', key: 'pendingQty', width: 110, align: 'right',
      render: (_: unknown, r: PurchaseOrder) => (
        <span style={{ color: '#FF4D4F', fontWeight: 600 }}>{pendingQtyOf(r)}</span>
      ),
    },
    {
      title: '完成採購時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 170,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: '操作', key: 'action', width: 90, fixed: 'right',
      render: (_: unknown, r: PurchaseOrder) => (
        <Button type="link" size="small" onClick={() => onAdd(r.id)}>驗收</Button>
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
          label: `待驗收訂單 (${pendingOrders.length})`,
          children: (
            <>
              <div style={{ marginBottom: 12, fontSize: 13, color: '#8C8C8C' }}>
                採購完成的訂單自動同步至此，請核對到貨物資後點擊「驗收」；支持分批多次驗收
              </div>
              <Table<PurchaseOrder>
                columns={pendingColumns}
                dataSource={pendingOrders}
                rowKey="id"
                loading={poLoading}
                size="middle"
                pagination={{ showSizeChanger: false, showTotal: (tt) => `共 ${tt} 條` }}
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
                scroll={{ x: 1850 }}
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
                  current: page, pageSize: size, total, showSizeChanger: true,
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
