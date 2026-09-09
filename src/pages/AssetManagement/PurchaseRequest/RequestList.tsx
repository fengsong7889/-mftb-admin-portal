/**
 * 採購申請列表
 *
 * - Tab 統計：全部 / 待審批 / 已批准 / 已駁回（受其他搜索條件影響）
 * - 操作：詳情（含審批）/ 編輯（僅待審批）/ 刪除（未生成訂單）
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Form, Input, Select, Table, Tag, Modal, message, Space, Tabs } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchPurchaseRequestList, deletePurchaseRequest, type PurchaseRequest,
} from '../../../api/eam'
import { EAM_DEPARTMENTS } from '../eamUtils'

type ReqStatus = PurchaseRequest['status']

const STATUS_META: Record<ReqStatus, { key: string; color: string }> = {
  pending:  { key: 'asset.reqPending',  color: 'processing' },
  approved: { key: 'asset.reqApproved', color: 'success' },
  rejected: { key: 'asset.reqRejected', color: 'error' },
}

interface Props {
  onAdd: () => void
  onEdit: (id: number) => void
  onDetail: (id: number) => void
}

export default function RequestList({ onAdd, onEdit, onDetail }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<PurchaseRequest[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [activeTab, setActiveTab] = useState<ReqStatus | 'all'>('all')
  const [filters, setFilters] = useState<{ keyword?: string; department?: string; status?: string }>({})
  const [stats, setStats] = useState<Record<ReqStatus | 'all', number>>({
    all: 0, pending: 0, approved: 0, rejected: 0,
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const { status: _s, ...rest } = filters
      const statusFilter = filters.status || (activeTab === 'all' ? undefined : activeTab)

      // 1) 不帶狀態的全量查詢：計算各 Tab 統計
      const statsRes = await fetchPurchaseRequestList({ page: 1, size: 9999, ...rest })
      const next: Record<ReqStatus | 'all', number> = {
        all: statsRes.total || 0, pending: 0, approved: 0, rejected: 0,
      }
      ;(statsRes.records || []).forEach((r) => { next[r.status] += 1 })
      setStats(next)

      // 2) 分頁查詢
      const res = await fetchPurchaseRequestList({ page, size, ...rest, status: statusFilter })
      setDataSource(res.records || [])
      setTotal(res.total || 0)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [activeTab, filters, page, size, t])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setFilters({
      keyword: v.keyword || undefined,
      department: v.department || undefined,
      status: v.status || undefined,
    })
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }
  const handleTabChange = (key: string) => { setActiveTab(key as ReqStatus | 'all'); setPage(1) }
  const handleTableChange = (p: TablePaginationConfig) => {
    setPage(p.current || 1)
    setSize(p.pageSize || 10)
  }

  const handleDelete = (record: PurchaseRequest) => {
    Modal.confirm({
      title: t('asset.confirmDeleteTitle'),
      content: `${record.reqNo} ${record.title}`,
      okText: t('common.confirm'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deletePurchaseRequest(record.id)
          message.success(t('asset.deleteSuccess'))
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('asset.deleteFailed'))
        }
      },
    })
  }

  const columns: TableColumnsType<PurchaseRequest> = [
    {
      title: t('asset.colReqNo'), dataIndex: 'reqNo', key: 'reqNo', width: 140, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    { title: t('asset.colReqTitle'), dataIndex: 'title', key: 'title', width: 220, ellipsis: true },
    { title: t('asset.colDepartment'), dataIndex: 'department', key: 'department', width: 100 },
    { title: t('asset.colApplicant'), dataIndex: 'applicant', key: 'applicant', width: 120 },
    {
      title: t('asset.colBudget'), dataIndex: 'budget', key: 'budget', width: 120, align: 'right',
      render: (v: number) => (v ? `MOP ${v.toLocaleString()}` : '-'),
    },
    {
      title: t('asset.colItems'), dataIndex: 'items', key: 'items', width: 200,
      render: (items: PurchaseRequest['items']) => (
        <Space size={4} wrap>
          {(items || []).map((it) => <Tag key={it.modelId}>{`${it.modelName} x${it.qty}`}</Tag>)}
        </Space>
      ),
    },
    {
      title: t('asset.colTotalAmount'), key: 'totalAmount', width: 120, align: 'right',
      render: (_: unknown, r: PurchaseRequest) => {
        const sum = (r.items || []).reduce((s, it) => s + it.qty * it.estPrice, 0)
        return `MOP ${sum.toLocaleString()}`
      },
    },
    {
      title: t('asset.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (v: ReqStatus) => <Tag color={STATUS_META[v].color}>{t(STATUS_META[v].key)}</Tag>,
    },
    { title: t('asset.colCreatedAt'), dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    {
      title: t('common.colAction'), key: 'action', width: 180, fixed: 'right',
      render: (_: unknown, record: PurchaseRequest) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onDetail(record.id)}>
            {t('common.detail')}
          </Button>
          {record.status === 'pending' && (
            <Button type="link" size="small" onClick={() => onEdit(record.id)}>
              {t('common.edit')}
            </Button>
          )}
          {!record.orderId && (
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
            <Input placeholder={t('asset.colReqNo')} allowClear style={{ width: 220 }} />
          </Form.Item>
          <Form.Item label={t('asset.colDepartment')} name="department">
            <Select
              placeholder={t('common.all')} allowClear style={{ width: 160 }}
              options={EAM_DEPARTMENTS.map((d) => ({ label: d, value: d }))}
            />
          </Form.Item>
          <Form.Item label={t('asset.colStatus')} name="status">
            <Select
              placeholder={t('common.all')} allowClear style={{ width: 140 }}
              options={(Object.keys(STATUS_META) as ReqStatus[]).map((s) => ({
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

      {/* ====== 操作區 ====== */}
      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
            {t('common.add')}
          </Button>
        </div>
      </div>

      {/* ====== 狀態 Tab ====== */}
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          { key: 'all',      label: `${t('asset.tabAll')}(${stats.all})` },
          { key: 'pending',  label: `${t('asset.reqPending')}(${stats.pending})` },
          { key: 'approved', label: `${t('asset.reqApproved')}(${stats.approved})` },
          { key: 'rejected', label: `${t('asset.reqRejected')}(${stats.rejected})` },
        ]}
      />

      {/* ====== 表格 ====== */}
      <Table<PurchaseRequest>
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1600 }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true,
          showTotal: (tt) => `${t('common.total', { count: tt })}`,
        }}
        onChange={handleTableChange}
      />
    </>
  )
}
