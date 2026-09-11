/**
 * 领用管理 — 员工维度汇总列表
 *
 * 搜索条件：员工姓名/工号、部门
 * 列表字段：员工工号、员工姓名、所在部门、在用资产(件)、已归还(件)、最近领用日期、操作
 * 点击「管理」→ 进入员工资产详情页
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Form, Input, Select, Table, message } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import {
  SearchOutlined, ReloadOutlined, PlusOutlined, ExportOutlined,
} from '@ant-design/icons'
import {
  fetchEmployeeClaimSummary,
  type EmployeeClaimSummary, type EmployeeClaimQuery,
} from '../../../api/eam'
import { EAM_DEPARTMENTS } from '../eamUtils'
import { exportToCSV } from '../../../utils/exportCSV'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

interface Props {
  onAdd: () => void
  onManage: (claimant: string) => void
}

export default function ClaimList({ onAdd, onManage }: Props) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<EmployeeClaimSummary[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<EmployeeClaimQuery>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchEmployeeClaimSummary({ ...filters, page, size })
      setDataSource(res.records || [])
      setTotal(res.total || 0)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '查询失败')
    } finally {
      setLoading(false)
    }
  }, [filters, page, size])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setFilters({
      empName: v.empName || undefined,
      department: v.department || undefined,
    })
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }
  const handleTableChange = (p: TablePaginationConfig) => {
    setPage(p.current || 1)
    setSize(p.pageSize || 10)
  }

  /* ----- 导出 ----- */
  const handleExport = () => {
    const cols = [
      { title: '员工工号', dataIndex: 'empNo' },
      { title: '员工姓名', dataIndex: 'empName' },
      { title: '所在部门', dataIndex: 'department' },
      { title: '在用资产(件)', dataIndex: 'claimedCount' },
      { title: '已归还(件)', dataIndex: 'returnedCount' },
      { title: '最近领用日期', dataIndex: 'lastClaimDate' },
    ]
    exportToCSV(`领用管理_${new Date().toISOString().slice(0, 10)}`, cols, dataSource)
    message.success('导出成功')
  }

  /* ----- 表格列定义 ----- */
  const allColumns: TableColumnsType<EmployeeClaimSummary> = [
    {
      title: '员工工号', dataIndex: 'empNo', key: 'empNo', width: 120,
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    { title: '员工姓名', dataIndex: 'empName', key: 'empName', width: 130 },
    { title: '所在部门', dataIndex: 'department', key: 'department', width: 120 },
    {
      title: '在用资产', dataIndex: 'claimedCount', key: 'claimedCount', width: 110, align: 'center',
      render: (v: number) => (
        <span style={{ fontWeight: 600, color: v > 0 ? '#1890FF' : '#bfbfbf' }}>{v} 件</span>
      ),
    },
    {
      title: '已归还', dataIndex: 'returnedCount', key: 'returnedCount', width: 100, align: 'center',
      render: (v: number) => (
        <span style={{ color: v > 0 ? '#8c8c8c' : '#bfbfbf' }}>{v} 件</span>
      ),
    },
    { title: '最近领用日期', dataIndex: 'lastClaimDate', key: 'lastClaimDate', width: 140 },
    {
      title: '操作', key: 'action', width: 100, fixed: 'right',
      render: (_: unknown, record: EmployeeClaimSummary) => (
        <Button type="link" size="small"
          onClick={() => onManage(`${record.empName}(${record.empNo})`)}
        >管理</Button>
      ),
    },
  ]

  /* ----- 字段配置 ----- */
  const columnMeta = useMemo(() => [
    { key: 'empNo', title: '员工工号' },
    { key: 'empName', title: '员工姓名' },
    { key: 'department', title: '所在部门' },
    { key: 'claimedCount', title: '在用资产' },
    { key: 'returnedCount', title: '已归还' },
    { key: 'lastClaimDate', title: '最近领用日期' },
    { key: 'action', title: '操作' },
  ], [])

  const { applyConfig, configComponent } = useColumnConfig('asset-claim', columnMeta)

  return (
    <>
      {/* ====== 搜索区 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label="员工" name="empName">
            <Input placeholder="姓名 / 工号" allowClear />
          </Form.Item>
          <Form.Item label="部门" name="department">
            <Select placeholder="全部" allowClear showSearch optionFilterProp="label"
              options={EAM_DEPARTMENTS.map((d) => ({ label: d, value: d }))}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查询</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* ====== 操作区 ====== */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>导出</Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>新增</Button>
          {configComponent}
        </div>
      </div>

      {/* ====== 表格 ====== */}
      <Table<EmployeeClaimSummary>
        columns={applyConfig(allColumns)}
        dataSource={dataSource}
        rowKey="empNo"
        loading={loading}
        size="middle"
        scroll={{ x: 820 }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true,
          showTotal: (tt) => `共 ${tt} 条`,
        }}
        onChange={handleTableChange}
      />
    </>
  )
}
