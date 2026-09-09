/**
 * 採購訂單列表
 *
 * - Tab 統計：全部 / 待收貨 / 部分入庫 / 已入庫
 * - 操作：詳情（含明細與已驗收進度）/ 驗收入庫（跳轉批量入庫頁）
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Form, Input, Select, Table, Tag, Modal, message, Space, Tabs, Progress } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchPurchaseOrderList, fetchPurchaseRequestDetail, deletePurchaseOrder,
  type PurchaseOrder, type PurchaseRequest,
} from '../../../api/eam'

type OrderStatus = PurchaseOrder['status']

const STATUS_META: Record<OrderStatus, { key: string; color: string }> = {
  pending:  { key: 'asset.poPending',  color: 'processing' },
  partial:  { key: 'asset.poPartial',  color: 'warning' },
  received: { key: 'asset.poReceived', color: 'success' },
}

interface Props {
  onDetail: (id: number) => void
  onInbound: (poId: number) => void
}

export default function OrderList({ onDetail, onInbound }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<PurchaseOrder[]>([])
  const [reqMap, setReqMap] = useState<Record<number, PurchaseRequest>>({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [activeTab, setActiveTab] = useState<OrderStatus | 'all'>('all')
  const [filters, setFilters] = useState<{ keyword?: string; status?: string }>({})
  const [stats, setStats] = useState<Record<OrderStatus | 'all', number>>({
    all: 0, pending: 0, partial: 0, received: 0,
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const { status: _s, ...rest } = filters
      const statusFilter = filters.status || (activeTab === 'all' ? undefined : activeTab)

      const statsRes = await fetchPurchaseOrderList({ page: 1, size: 9999, ...rest })
      const next: Record<OrderStatus | 'all', number> = {
        all: statsRes.total || 0, pending: 0, partial: 0, received: 0,
      }
      ;(statsRes.records || []).forEach((o) => { next[o.status] += 1 })
      setStats(next)

      const res = await fetchPurchaseOrderList({ page, size, ...rest, status: statusFilter })
      setDataSource(res.records || [])
      setTotal(res.total || 0)

      // 補全關聯採購申請單號（mock 環境下按需查詢）
      const reqIds = Array.from(new Set((res.records || []).map((o) => o.reqId).filter(Boolean)))
      const entries = await Promise.all(reqIds.map(async (rid) => {
        try {
          return [rid, await fetchPurchaseRequestDetail(rid)] as const
        } catch {
          return null
        }
      }))
      setReqMap(Object.fromEntries(entries.filter(Boolean).map((e) => [e![0], e![1]])))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [activeTab, filters, page, size, t])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setFilters({ keyword: v.keyword || undefined, status: v.status || undefined })
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }
  const handleTabChange = (key: string) => { setActiveTab(key as OrderStatus | 'all'); setPage(1) }
  const handleTableChange = (p: TablePaginationConfig) => {
    setPage(p.current || 1)
    setSize(p.pageSize || 10)
  }

  const handleDelete = (record: PurchaseOrder) => {
    Modal.confirm({
      title: t('asset.confirmDeleteTitle'),
      content: record.poNo,
      okText: t('common.confirm'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deletePurchaseOrder(record.id)
          message.success(t('asset.deleteSuccess'))
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('asset.deleteFailed'))
        }
      },
    })
  }

  const columns: TableColumnsType<PurchaseOrder> = [
    {
      title: t('asset.colPoNo'), dataIndex: 'poNo', key: 'poNo', width: 140, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    {
      title: t('asset.colReqNo'), dataIndex: 'reqId', key: 'reqId', width: 140,
      render: (v: number) => (v && reqMap[v] ? reqMap[v].reqNo : '-'),
    },
    { title: t('asset.colSupplier'), dataIndex: 'supplier', key: 'supplier', width: 180, ellipsis: true },
    {
      title: t('asset.colTotalAmount'), dataIndex: 'amount', key: 'amount', width: 130, align: 'right',
      render: (v: number) => `MOP ${(v || 0).toLocaleString()}`,
    },
    { title: t('asset.colDeliveryDate'), dataIndex: 'deliveryDate', key: 'deliveryDate', width: 120 },
    {
      title: t('asset.colItems'), dataIndex: 'items', key: 'items', width: 260,
      render: (items: PurchaseOrder['items']) => (
        <Space size={4} wrap>
          {(items || []).map((it) => <Tag key={it.modelId}>{`${it.modelName} x${it.qty}`}</Tag>)}
        </Space>
      ),
    },
    {
      title: t('asset.colReceivedQty'), key: 'receivedQty', width: 160,
      render: (_: unknown, r: PurchaseOrder) => {
        const totalQty = r.items.reduce((s, it) => s + it.qty, 0)
        const received = r.items.reduce((s, it) => s + it.receivedQty, 0)
        const percent = totalQty ? Math.round((received / totalQty) * 100) : 0
        return (
          <Space direction="vertical" size={0} style={{ width: '100%' }}>
            <span style={{ fontSize: 12 }}>{`${received} / ${totalQty}`}</span>
            <Progress percent={percent} size="small" showInfo={false} />
          </Space>
        )
      },
    },
    {
      title: t('asset.colStatus'), dataIndex: 'status', key: 'status', width: 110,
      render: (v: OrderStatus) => <Tag color={STATUS_META[v].color}>{t(STATUS_META[v].key)}</Tag>,
    },
    { title: t('asset.colCreatedAt'), dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    {
      title: t('common.colAction'), key: 'action', width: 180, fixed: 'right',
      render: (_: unknown, record: PurchaseOrder) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onDetail(record.id)}>
            {t('common.detail')}
          </Button>
          {record.status !== 'received' && (
            <Button type="link" size="small" onClick={() => onInbound(record.id)}>
              {t('asset.btnReceive')}
            </Button>
          )}
          {record.status === 'pending' && (
            <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
              {t('common.delete')}
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <>
      {/* ====== 搜索區 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('asset.searchKeyword')} name="keyword">
            <Input placeholder={t('asset.colPoNo')} allowClear style={{ width: 220 }} />
          </Form.Item>
          <Form.Item label={t('asset.colStatus')} name="status">
            <Select
              placeholder={t('common.all')} allowClear style={{ width: 150 }}
              options={(Object.keys(STATUS_META) as OrderStatus[]).map((s) => ({
                label: t(STATUS_META[s].key), value: s,
              }))}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* ====== 狀態 Tab ====== */}
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          { key: 'all',      label: `${t('asset.tabAll')}(${stats.all})` },
          { key: 'pending',  label: `${t('asset.poPending')}(${stats.pending})` },
          { key: 'partial',  label: `${t('asset.poPartial')}(${stats.partial})` },
          { key: 'received', label: `${t('asset.poReceived')}(${stats.received})` },
        ]}
      />

      {/* ====== 表格 ====== */}
      <Table<PurchaseOrder>
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1700 }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true,
          showTotal: (tt) => `${t('common.total', { count: tt })}`,
        }}
        onChange={handleTableChange}
      />
    </>
  )
}
