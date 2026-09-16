/**
 * 借用管理 — 列表页（接通真实 API）
 */
import { useState, useEffect, useMemo } from 'react'
import { Button, Empty, Form, Input, Select, Space, Table, TreeSelect, Tag } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { fetchDepartments } from '../../../api/department'
import type { DepartmentItem } from '../../../api/department'
import type { BorrowRow, BorrowQuery } from '../../../api/eamBorrow'

const STATUS_LABEL: Record<string, string> = { active: '借用中', overdue: '已逾期', returned: '已归还', cancelled: '已取消' }
const STATUS_COLOR: Record<string, string> = { active: 'processing', overdue: 'error', returned: 'success', cancelled: 'default' }

interface Props {
  data?: { records: BorrowRow[]; total: number }
  loading?: boolean
  error?: string
  onQuery?: (query: BorrowQuery) => void
  canEdit?: boolean
  canReturn?: boolean
}

interface Filters { keyword?: string; status?: string; department?: string }

export default function BorrowList({ data, loading = false, error, onQuery, canEdit = false, canReturn = false }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form] = Form.useForm<Filters>()
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<Filters>({})
  const [departments, setDepartments] = useState<DepartmentItem[]>([])

  const dataSource = data?.records ?? []
  const total = data?.total ?? 0

  useEffect(() => { fetchDepartments().then(setDepartments).catch(() => {}) }, [])

  const deptTree = useMemo(() => {
    return departments.map(d => ({ title: d.name, value: d.id }))
  }, [departments])

  /* ----- 查询触发（与 ClaimList 对齐：filters 变化驱动请求） ----- */
  useEffect(() => {
    onQuery?.({ ...filters, page, size })
  }, [filters, page, size, onQuery])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setFilters({
      keyword: v.keyword?.trim() || undefined,
      status: v.status || undefined,
      department: v.department || undefined,
    })
    setPage(1)
  }

  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }

  const handleTableChange = (p: { current?: number; pageSize?: number }) => {
    const nextSize = p.pageSize || 10
    setPage(nextSize === size ? p.current || 1 : 1)
    setSize(nextSize)
  }

  const allColumns = [
    { key: 'borrowNo', title: t('asset.colBorrowNo'), dataIndex: 'borrowNo', width: 175, fixed: 'left' as const },
    { key: 'asset', title: '资产', width: 200, render: (_: unknown, b: BorrowRow) => <>{b.assetName}<div className="claim-muted">{b.assetNo}</div></> },
    { key: 'holderName', title: '借用人', dataIndex: 'holderName', width: 130 },
    { key: 'department', title: '借用部门', dataIndex: 'department', width: 120 },
    { key: 'startDate', title: '借出日期', dataIndex: 'startDate', width: 120 },
    { key: 'dueDate', title: '到期日期', dataIndex: 'dueDate', width: 120 },
    { key: 'renewCount', title: '续借次数', dataIndex: 'renewCount', width: 100, align: 'center' as const },
    { key: 'purpose', title: '借用用途', dataIndex: 'purpose', width: 180, ellipsis: true },
    { key: 'status', title: '状态', dataIndex: 'status', width: 100, render: (v: string) => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v] || v}</Tag> },
    {
      key: 'action', title: t('common.colAction'), width: 220, fixed: 'right' as const,
      render: (_: unknown, b: BorrowRow) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" onClick={() => navigate(`/asset-borrow/detail?id=${b.id}`)}>详情</Button>
          {b.status !== 'returned' && canEdit && <Button type="link" onClick={() => navigate(`/asset-borrow/renew?id=${b.id}`)}>续借</Button>}
          {b.status !== 'returned' && canReturn && <Button type="link" onClick={() => navigate(`/asset-return/add?borrowId=${b.id}`)}>归还</Button>}
        </Space>
      ),
    },
  ]

  const columnMeta = useMemo(() => [
    { key: 'borrowNo', title: t('asset.colBorrowNo') },
    { key: 'asset', title: '资产' },
    { key: 'holderName', title: '借用人' },
    { key: 'department', title: '借用部门' },
    { key: 'startDate', title: '借出日期' },
    { key: 'dueDate', title: '到期日期' },
    { key: 'renewCount', title: '续借次数' },
    { key: 'purpose', title: '借用用途' },
    { key: 'status', title: '状态' },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('asset-borrow', columnMeta, [
    { key: 'borrowNo', locked: 'head' }, { key: 'action', locked: 'tail' },
  ])

  return <>
    {/* ====== 搜索区 ====== */}
    <div className="search-section">
      <Form form={form} layout="inline" onFinish={handleSearch}>
        <Form.Item label="关键词" name="keyword">
          <Input placeholder="借用单号 / 资产" allowClear />
        </Form.Item>
        <Form.Item label="状态" name="status">
          <Select allowClear placeholder="全部状态" options={Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
        </Form.Item>
        <Form.Item label="部门" name="department">
          <TreeSelect allowClear treeDefaultExpandAll showSearch treeNodeFilterProp="title" treeData={deptTree} placeholder={t('common.all')} />
        </Form.Item>
        <Form.Item>
          <div className="search-actions">
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.search')}</Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
          </div>
        </Form.Item>
      </Form>
    </div>

    {/* ====== 操作区 ====== */}
    <div className="action-section">
      <div className="action-section-left">借用记录 {total > 0 ? `共 ${total} 条` : ''}</div>
      <div className="action-section-right">
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/asset-borrow/add')}>借用登记</Button>}
        {configComponent}
      </div>
    </div>

    {/* ====== 表格 ====== */}
    <Table<BorrowRow>
      rowKey="id"
      columns={applyConfig(allColumns) as typeof allColumns}
      dataSource={error ? [] : dataSource}
      locale={{ emptyText: <Empty description={t('common.noData')} /> }}
      loading={loading}
      size="middle"
      scroll={{ x: 1485 }}
      onChange={handleTableChange}
      pagination={{
        current: page, pageSize: size, total,
        showSizeChanger: true, showQuickJumper: true,
        showTotal: (count) => t('common.total', { count }),
      }}
    />
  </>
}
