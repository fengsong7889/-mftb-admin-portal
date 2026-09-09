/**
 * 借用單列表（臨時借用）
 *
 * - Tab 統計：全部 / 借用中 / 已歸還 / 已逾期（借用中含已逾期，逾期 Tab 單列）
 * - 每次查詢前 api 層會自動把「借用中且已過歸還期限」的記錄標記為逾期
 * - 操作：詳情 / 續借（未歸還）/ 歸還（跳轉歸還管理並帶入借用單）
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Form, Input, Select, Table, Tag, message, Space, Tabs } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchBorrowList, type BorrowRecord } from '../../../api/eam'
import { EAM_DEPARTMENTS, daysBetween, todayStr } from '../eamUtils'

type BorrowStatus = BorrowRecord['status']

const STATUS_META: Record<BorrowStatus, { key: string; color: string }> = {
  borrowing: { key: 'asset.borrowBorrowing', color: 'processing' },
  returned:  { key: 'asset.borrowReturned',  color: 'success' },
  overdue:   { key: 'asset.borrowOverdue',   color: 'error' },
}

interface Props {
  onAdd: () => void
  onDetail: (id: number) => void
  onRenew: (id: number) => void
  onReturn: (id: number) => void
  onViewAsset: (assetNo: string) => void
}

export default function BorrowList({ onAdd, onDetail, onRenew, onReturn, onViewAsset }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<BorrowRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [activeTab, setActiveTab] = useState<BorrowStatus | 'all'>('all')
  const [filters, setFilters] = useState<{ keyword?: string; borrower?: string; department?: string; status?: string }>({})
  const [stats, setStats] = useState<Record<BorrowStatus | 'all', number>>({
    all: 0, borrowing: 0, returned: 0, overdue: 0,
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const { status: _s, ...rest } = filters
      const statusFilter = filters.status || (activeTab === 'all' ? undefined : activeTab)

      // 1) 不帶狀態的全量查詢：計算各 Tab 統計（借用中 Tab 含已逾期）
      const statsRes = await fetchBorrowList({ page: 1, size: 9999, ...rest })
      const next: Record<BorrowStatus | 'all', number> = {
        all: statsRes.total || 0, borrowing: 0, returned: 0, overdue: 0,
      }
      ;(statsRes.records || []).forEach((b) => {
        next[b.status] += 1
        if (b.status === 'overdue') next.borrowing += 1
      })
      setStats(next)

      // 2) 分頁查詢
      const res = await fetchBorrowList({ page, size, ...rest, status: statusFilter })
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
      borrower: v.borrower || undefined,
      department: v.department || undefined,
      status: v.status || undefined,
    })
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }
  const handleTabChange = (key: string) => { setActiveTab(key as BorrowStatus | 'all'); setPage(1) }
  const handleTableChange = (p: TablePaginationConfig) => {
    setPage(p.current || 1)
    setSize(p.pageSize || 10)
  }

  const statusOptions = [
    { label: t('common.all'), value: '' },
    { label: t('asset.borrowBorrowing'), value: 'borrowing' },
    { label: t('asset.borrowReturned'), value: 'returned' },
    { label: t('asset.borrowOverdue'), value: 'overdue' },
  ]

  const columns: TableColumnsType<BorrowRecord> = [
    {
      title: t('asset.colBorrowNo'), dataIndex: 'borrowNo', key: 'borrowNo', width: 140, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    {
      title: t('asset.colAssetNo'), dataIndex: 'assetNo', key: 'assetNo', width: 140,
      render: (v: string) => (
        <Button type="link" size="small" style={{ padding: 0, fontFamily: 'monospace' }}
          onClick={() => onViewAsset(v)}
        >
          {v}
        </Button>
      ),
    },
    { title: t('asset.colAssetName'), dataIndex: 'assetName', key: 'assetName', width: 190, ellipsis: true },
    { title: t('asset.colBorrower'), dataIndex: 'borrower', key: 'borrower', width: 110 },
    { title: t('asset.colDepartment'), dataIndex: 'department', key: 'department', width: 110 },
    { title: t('asset.colBorrowDate'), dataIndex: 'borrowDate', key: 'borrowDate', width: 115 },
    {
      title: t('asset.colDueDate'), dataIndex: 'dueDate', key: 'dueDate', width: 115,
      render: (v: string, r) => (
        <span style={{ color: r.status === 'overdue' ? '#FF4D4F' : undefined, fontWeight: r.status === 'overdue' ? 600 : 400 }}>
          {v}
        </span>
      ),
    },
    {
      title: t('asset.colOverdueDays'), key: 'overdueDays', width: 100, align: 'right',
      render: (_: unknown, r) => (r.status === 'overdue'
        ? <Tag color="error">{daysBetween(r.dueDate, todayStr())}</Tag>
        : '-'),
    },
    {
      title: t('asset.colRenewCount'), dataIndex: 'renewCount', key: 'renewCount', width: 95, align: 'right',
      render: (v: number) => (v > 0 ? <Tag color="magenta">{v}</Tag> : '-'),
    },
    { title: t('asset.colPurpose'), dataIndex: 'purpose', key: 'purpose', width: 180, ellipsis: true },
    {
      title: t('asset.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (v: BorrowStatus) => <Tag color={STATUS_META[v].color}>{t(STATUS_META[v].key)}</Tag>,
    },
    {
      title: t('common.colAction'), key: 'action', width: 200, fixed: 'right',
      render: (_: unknown, record) => {
        const canOperate = record.status !== 'returned'
        return (
          <Space size={0} split={<span className="action-split">|</span>}>
            <Button type="link" size="small" onClick={() => onDetail(record.id)}>
              {t('common.detail')}
            </Button>
            {canOperate && (
              <Button type="link" size="small" onClick={() => onRenew(record.id)}>
                {t('asset.btnRenew')}
              </Button>
            )}
            {canOperate && (
              <Button type="link" size="small" onClick={() => onReturn(record.id)}>
                {t('asset.btnBorrowReturn')}
              </Button>
            )}
          </Space>
        )
      },
    },
  ]

  return (
    <>
      {/* ====== 搜索區 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('asset.searchKeyword')} name="keyword">
            <Input placeholder={t('asset.searchKeywordPh')} allowClear style={{ width: 220 }} />
          </Form.Item>
          <Form.Item label={t('asset.colBorrower')} name="borrower">
            <Input placeholder={t('asset.userNamePh')} allowClear style={{ width: 160 }} />
          </Form.Item>
          <Form.Item label={t('asset.colDepartment')} name="department">
            <Select
              placeholder={t('common.all')} allowClear style={{ width: 160 }}
              options={EAM_DEPARTMENTS.map((d) => ({ label: d, value: d }))}
            />
          </Form.Item>
          <Form.Item label={t('asset.colStatus')} name="status">
            <Select placeholder={t('common.all')} allowClear style={{ width: 140 }} options={statusOptions} />
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
            {t('asset.btnNewBorrow')}
          </Button>
        </div>
      </div>

      {/* ====== 狀態 Tab ====== */}
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          { key: 'all',       label: `${t('asset.tabAll')}(${stats.all})` },
          { key: 'borrowing', label: `${t('asset.tabBorrowing')}(${stats.borrowing})` },
          { key: 'returned',  label: `${t('asset.tabBorrowReturned')}(${stats.returned})` },
          { key: 'overdue',   label: `${t('asset.tabOverdue')}(${stats.overdue})` },
        ]}
      />

      {/* ====== 表格 ====== */}
      <Table<BorrowRecord>
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
