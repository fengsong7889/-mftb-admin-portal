/**
 * 领用管理 — 员工维度汇总列表
 *
 * 搜索条件：员工姓名/工号、部门
 * 列表字段：员工工号、员工姓名、所在部门、在用资产(件)、已归还(件)、最近领用日期、操作
 * 点击「管理」→ 进入员工资产详情页
 */
import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Empty, Form, Input, TreeSelect, Table, message } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import {
  SearchOutlined, ReloadOutlined, PlusOutlined, ExportOutlined,
} from '@ant-design/icons'
import type { DepartmentItem } from '../../../api/department'
import { buildDeptTree, type ClaimEmployeeSummary, type ClaimQuery, type ClaimSummaryData } from './claimViewTypes'
import ClaimStats from './ClaimStats'
import { exportToCSV } from '../../../utils/exportCSV'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

interface Props {
  onAdd: () => void
  onManage: (employeeId: number) => void
  canAdd?: boolean
  data?: ClaimSummaryData
  loading?: boolean
  error?: string
  departments?: DepartmentItem[]
  onQuery?: (query: ClaimQuery) => void
}

export default function ClaimList({ onAdd, onManage, canAdd = false, data, loading = false, error, departments = [], onQuery }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<{ keyword?: string; departmentId?: number }>()
  const dataSource = data?.records ?? []
  const total = data?.total ?? 0
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [filters, setFilters] = useState<Pick<ClaimQuery, 'keyword' | 'departmentId'>>({})
  const deptTree = useMemo(() => buildDeptTree(departments), [departments])

  useEffect(() => { onQuery?.({ ...filters, page, size }) }, [filters, page, size, onQuery])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setFilters({
      keyword: v.keyword?.trim() || undefined,
      departmentId: v.departmentId,
    })
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }
  const handleTableChange = (p: TablePaginationConfig) => {
    const nextSize = p.pageSize || 10
    setPage(nextSize === size ? p.current || 1 : 1)
    setSize(nextSize)
  }

  /* ----- 导出 ----- */
  const handleExport = () => {
    const cols = [
      { title: t('asset.colEmpNo'), dataIndex: 'empNo' },
      { title: t('asset.colEmpName'), dataIndex: 'empName' },
      { title: t('asset.colDepartment'), dataIndex: 'department' },
      { title: t('asset.colClaimedCount'), dataIndex: 'claimedCount' },
      { title: t('asset.colReturnedCount'), dataIndex: 'returnedCount' },
      { title: '待签领用', dataIndex: 'pendingCount' },
      { title: '代办未签', dataIndex: 'proxyPendingCount' },
      { title: t('asset.colLastClaimDate'), dataIndex: 'lastClaimDate' },
    ]
    exportToCSV(`${t('asset.claimFileName')}_${new Date().toISOString().slice(0, 10)}`, cols, dataSource)
    message.success(t('asset.claimExportSuccess'))
  }

  /* ----- 表格列定义 ----- */
  const allColumns: TableColumnsType<ClaimEmployeeSummary> = [
    {
      title: t('asset.colEmpNo'), dataIndex: 'empNo', key: 'empNo', width: 120,
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    { title: t('asset.colEmpName'), dataIndex: 'empName', key: 'empName', width: 130 },
    { title: t('asset.colDepartment'), dataIndex: 'department', key: 'department', width: 120 },
    {
      title: t('asset.colClaimedCount'), dataIndex: 'claimedCount', key: 'claimedCount', width: 110, align: 'center',
      render: (v: number) => (
        <span style={{ fontWeight: 600, color: v > 0 ? '#1890FF' : '#bfbfbf' }}>{v} {t('asset.unitItem')}</span>
      ),
    },
    {
      title: t('asset.colReturnedCount'), dataIndex: 'returnedCount', key: 'returnedCount', width: 100, align: 'center',
      render: (v: number) => (
        <span style={{ color: v > 0 ? '#8c8c8c' : '#bfbfbf' }}>{v} {t('asset.unitItem')}</span>
      ),
    },
    { title: '待签领用', dataIndex: 'pendingCount', key: 'pendingCount', width: 110, align: 'center' },
    { title: '代办未签', dataIndex: 'proxyPendingCount', key: 'proxyPendingCount', width: 110, align: 'center', render: (v: number) => <span style={{ color: v ? '#E8720C' : '#8C8C8C' }}>{v}</span> },
    { title: t('asset.colLastClaimDate'), dataIndex: 'lastClaimDate', key: 'lastClaimDate', width: 140, render: (v?: string) => v || '—' },
    {
      title: t('asset.colAction'), key: 'action', width: 100, fixed: 'right',
      render: (_: unknown, record: ClaimEmployeeSummary) => (
        <Button type="link" size="small"
          onClick={() => onManage(record.employeeId)}
        >{t('asset.claimManage')}</Button>
      ),
    },
  ]

  /* ----- 字段配置 ----- */
  const columnMeta = useMemo(() => [
    { key: 'empNo', title: t('asset.colEmpNo') },
    { key: 'empName', title: t('asset.colEmpName') },
    { key: 'department', title: t('asset.colDepartment') },
    { key: 'claimedCount', title: t('asset.colClaimedCount') },
    { key: 'returnedCount', title: t('asset.colReturnedCount') },
    { key: 'pendingCount', title: '待签领用' },
    { key: 'proxyPendingCount', title: '代办未签' },
    { key: 'lastClaimDate', title: t('asset.colLastClaimDate') },
    { key: 'action', title: t('asset.colAction') },
  ], [t])

  const { applyConfig, configComponent } = useColumnConfig('asset-claim', columnMeta)

  return (
    <>
      <ClaimStats data={error ? undefined : data?.stats} scopeKey={JSON.stringify(filters)} />
      {error && <Alert type="error" showIcon message={error} className="claim-notice" />}
      {/* ====== 搜索区 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline" onFinish={handleSearch}>
          <Form.Item label={t('asset.empLabel')} name="keyword">
            <Input placeholder={t('asset.empSearchPh')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.colDepartment')} name="departmentId">
            <TreeSelect placeholder={t('common.all')} allowClear showSearch treeNodeFilterProp="title"
              treeData={deptTree} treeDefaultExpandAll
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} htmlType="submit" disabled={!onQuery}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* ====== 操作区 ====== */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} disabled={loading || !!error || !dataSource.length} onClick={handleExport}>{t('common.export')}</Button>
        </div>
        <div className="action-section-right">
          {canAdd && <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>{t('asset.claimAdd')}</Button>}
          {configComponent}
        </div>
      </div>

      {/* ====== 表格 ====== */}
      <Table<ClaimEmployeeSummary>
        columns={applyConfig(allColumns)}
        dataSource={error ? [] : dataSource}
        locale={{ emptyText: <Empty description={t('common.noData')} /> }}
        rowKey="employeeId"
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        loading={loading}
        size="middle"
        scroll={{ x: 1050 }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true, showQuickJumper: true,
          showTotal: (count) => t('asset.totalItems', { total: count }),
        }}
        onChange={handleTableChange}
      />
    </>
  )
}
