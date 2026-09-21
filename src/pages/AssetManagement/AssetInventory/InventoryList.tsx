/**
 * 盘点任务列表页
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Empty, Form, Input, Select, Table, Tag, Space, DatePicker, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, ExportOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { useAuth } from '../../../contexts/AuthContext'
import {
  fetchInventoryTasks, downloadInventoryCsv,
  type InventoryTaskRecord, type InventoryTaskQuery,
} from '../../../api/eamInventory'
import { TASK_STATUS_LABEL_KEY, TASK_STATUS_COLOR } from './inventoryMeta'

interface Props {
  onCreate: () => void
  onOpen: (taskId: number) => void
}

export default function InventoryList({ onCreate, onOpen }: Props) {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('asset-inventory:create')
  const canExport = hasPermission('asset-inventory:export')
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<InventoryTaskRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [filters, setFilters] = useState<Omit<InventoryTaskQuery, 'page' | 'size'>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchInventoryTasks({ page, size: pageSize, ...filters })
      setData(res.records || [])
      setTotal(res.total || 0)
    } catch {
      /* 拦截器已提示 */
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    const range = v.date as [dayjs.Dayjs, dayjs.Dayjs] | undefined
    setPage(1)
    setFilters({
      keyword: v.keyword || undefined,
      ownerKeyword: v.ownerKeyword || undefined,
      status: v.status || undefined,
      dateFrom: range?.[0] ? range[0].format('YYYY-MM-DD') : undefined,
      dateTo: range?.[1] ? range[1].format('YYYY-MM-DD') : undefined,
    })
  }

  const handleReset = () => { form.resetFields(); setPage(1); setFilters({}) }

  const handleExport = async () => {
    const params = new URLSearchParams()
    if (filters.keyword) params.set('keyword', filters.keyword)
    if (filters.status) params.set('status', filters.status)
    const qs = params.toString()
    try {
      await downloadInventoryCsv(`/eam/inventory/v2/tasks/export${qs ? `?${qs}` : ''}`, `asset_inventory_tasks_${dayjs().format('YYYYMMDD')}.csv`)
      message.success(t('common.exportSuccess', { defaultValue: '導出成功' }))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('common.exportFailed', { defaultValue: '導出失敗' }))
    }
  }

  const ownerText = (r: InventoryTaskRecord) => {
    const name = r.ownerName || r.operator || '-'
    return r.ownerEmpNo ? `${name}（${r.ownerEmpNo}）` : name
  }

  const scopeText = (r: InventoryTaskRecord) => {
    const s = r.scopeSummary
    if (!s || s.scopeMode === 'ALL') return t('asset.invScopeAll', { defaultValue: '全部適用資產' })
    const parts: string[] = []
    if (s.locationNames?.length) parts.push(s.locationNames.join('/'))
    if (s.categoryNames?.length) parts.push(s.categoryNames.join('/'))
    if (s.departmentNames?.length) parts.push(s.departmentNames.join('/'))
    return parts.length ? parts.join('、') : t('asset.invScopeCondition', { defaultValue: '按條件盤點' })
  }

  const allColumns: TableColumnsType<InventoryTaskRecord> = [
    { key: 'taskNo', title: t('asset.colTaskNo'), dataIndex: 'taskNo', width: 160, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span> },
    { key: 'taskName', title: t('asset.colTaskName'), dataIndex: 'taskName', width: 200, ellipsis: true },
    { key: 'scope', title: t('asset.invRangeSummary'), width: 200, ellipsis: true, render: (_, r) => scopeText(r) },
    { key: 'owner', title: t('asset.colOwner'), width: 150, render: (_, r) => <span style={{ whiteSpace: 'nowrap' }}>{ownerText(r)}</span> },
    { key: 'expectedCount', title: t('asset.colExpectedCount'), dataIndex: 'expectedCount', width: 100, align: 'right' },
    { key: 'checkedCount', title: t('asset.colCheckedCount'), width: 100, align: 'right', render: (_, r) => r.stats?.checkedCount ?? 0 },
    { key: 'anomalyCount', title: t('asset.colAnomalyCount'), width: 100, align: 'right',
      render: (_, r) => { const n = r.stats?.anomalyCount ?? 0; return <span style={{ color: n > 0 ? '#FF4D4F' : '#52C41A' }}>{n}</span> } },
    { key: 'notCheckedCount', title: t('asset.colNotCheckedCount'), width: 100, align: 'right', render: (_, r) => r.stats?.notCheckedCount ?? 0 },
    { key: 'status', title: t('asset.colStatus'), width: 110,
      render: (_, r) => <Tag color={TASK_STATUS_COLOR[r.status]}>{t(TASK_STATUS_LABEL_KEY[r.status] || r.status)}</Tag> },
    { key: 'inventoryDate', title: t('asset.colInventoryDate'), dataIndex: 'inventoryDate', width: 120 },
    { key: 'closedAt', title: t('asset.colOperateTime', { defaultValue: '結束時間' }), width: 160, render: (_, r) => r.closedAt || r.cancelledAt || '-' },
    { key: 'action', title: t('common.colAction'), width: 140, fixed: 'right',
      render: (_, r) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); onOpen(r.id) }}>
            {r.status === 'in_progress' ? t('asset.invBtnStartCheck', { defaultValue: '盤點核對' }) : t('asset.invBtnViewReport', { defaultValue: '差異報告' })}
          </Button>
        </Space>
      ) },
  ]

  const columnMeta = useMemo(() => [
    { key: 'taskNo', title: t('asset.colTaskNo') },
    { key: 'taskName', title: t('asset.colTaskName') },
    { key: 'scope', title: t('asset.invRangeSummary') },
    { key: 'owner', title: t('asset.colOwner') },
    { key: 'expectedCount', title: t('asset.colExpectedCount') },
    { key: 'checkedCount', title: t('asset.colCheckedCount') },
    { key: 'anomalyCount', title: t('asset.colAnomalyCount') },
    { key: 'notCheckedCount', title: t('asset.colNotCheckedCount') },
    { key: 'status', title: t('asset.colStatus') },
    { key: 'inventoryDate', title: t('asset.colInventoryDate') },
    { key: 'closedAt', title: t('asset.colOperateTime', { defaultValue: '結束時間' }) },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('asset-inventory', columnMeta, [
    { key: 'taskNo', locked: 'head' }, { key: 'action', locked: 'tail' },
  ])

  return (
    <>
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('asset.colTaskName')} name="keyword">
            <Input placeholder={t('asset.taskNamePh', { defaultValue: '請輸入任務名稱' })} allowClear style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.colOwner')} name="ownerKeyword">
            <Input placeholder={t('asset.invOwnerPh', { defaultValue: '請輸入姓名或工號搜尋' })} allowClear style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.colStatus')} name="status">
            <Select allowClear style={{ width: '100%' }} placeholder={t('common.all', { defaultValue: '全部' })}
              options={[
                { value: 'in_progress', label: t('asset.statusInProgress') },
                { value: 'completed', label: t('asset.statusCompleted') },
                { value: 'partially_completed', label: t('asset.statusPartiallyCompleted') },
                { value: 'cancelled', label: t('asset.statusCancelled') },
              ]} />
          </Form.Item>
          <Form.Item label={t('asset.colInventoryDate')} name="date">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} disabled={!canExport} onClick={handleExport}>{t('common.export')}</Button>
        </div>
        <div className="action-section-right">
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>{t('asset.btnNewInventory')}</Button>
          )}
          {configComponent}
        </div>
      </div>

      <Table<InventoryTaskRecord>
        columns={applyConfig(allColumns) as TableColumnsType<InventoryTaskRecord>}
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1700 }}
        locale={{ emptyText: <Empty description={t('common.noData')} /> }}
        onRow={(record) => ({ onClick: () => onOpen(record.id), style: { cursor: 'pointer' } })}
        pagination={{
          current: page, pageSize, total,
          showSizeChanger: true, showQuickJumper: true,
          showTotal: (tt) => `共 ${tt} 條`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps) },
        }}
      />
    </>
  )
}
