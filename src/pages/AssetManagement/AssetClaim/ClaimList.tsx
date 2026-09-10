/**
 * 领用归还列表
 *
 * 搜索条件（8 字段）：资产编号、资产名称、资产分类、品牌、领用人、领用部门、操作人、操作日期
 * 列表字段：搜索条件字段 + 状态（使用中/已归还）、备注、操作
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Form, Input, Select, Table, Tag, DatePicker, message } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import {
  SearchOutlined, ReloadOutlined, PlusOutlined, ExportOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchClaimList, fetchCategoryList, type ClaimRecord, type ClaimQuery, type AssetCategory } from '../../../api/eam'
import { EAM_DEPARTMENTS } from '../eamUtils'
import { exportToCSV } from '../../../utils/exportCSV'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

const { RangePicker } = DatePicker

interface Props {
  onAdd: () => void
  onViewAsset: (assetNo: string) => void
}

/** 状态元数据 */
const STATUS_META: Record<string, { label: string; color: string }> = {
  claimed:  { label: '使用中', color: 'success' },
  returned: { label: '已归还', color: 'default' },
}

export default function ClaimList({ onAdd, onViewAsset }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<ClaimRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<ClaimQuery>({})
  const [categories, setCategories] = useState<AssetCategory[]>([])

  /* ----- 加载分类选项 ----- */
  useEffect(() => {
    fetchCategoryList().then((list) => setCategories(list.filter((c) => c.status === 'enabled'))).catch(() => {})
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchClaimList({ ...filters, page, size })
      setDataSource(res.records || [])
      setTotal(res.total || 0)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [filters, page, size, t])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    const query: ClaimQuery = {
      assetNo: v.assetNo || undefined,
      assetName: v.assetName || undefined,
      assetType: v.assetType || undefined,
      brand: v.brand || undefined,
      claimant: v.claimant || undefined,
      department: v.department || undefined,
      operator: v.operator || undefined,
      status: v.status || undefined,
    }
    if (v.claimDateRange && v.claimDateRange.length === 2) {
      query.claimDateRange = [v.claimDateRange[0].format('YYYY-MM-DD'), v.claimDateRange[1].format('YYYY-MM-DD')]
    }
    if (v.returnDateRange && v.returnDateRange.length === 2) {
      query.returnDateRange = [v.returnDateRange[0].format('YYYY-MM-DD'), v.returnDateRange[1].format('YYYY-MM-DD')]
    }
    setFilters(query)
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
      { title: '资产编号', dataIndex: 'assetNo' },
      { title: '资产名称', dataIndex: 'assetName' },
      { title: '资产分类', dataIndex: 'assetType' },
      { title: '品牌', dataIndex: 'brand' },
      { title: '领用人', dataIndex: 'claimant' },
      { title: '领用部门', dataIndex: 'department' },
      { title: '领用日期', dataIndex: 'claimDate' },
      { title: '领用原因', dataIndex: 'claimReason' },
      { title: '归还日期', dataIndex: 'returnDate' },
      { title: '归还原因', dataIndex: 'returnReason' },
      { title: '操作人', dataIndex: 'operator' },
      { title: '状态', dataIndex: 'status', render: (v: string) => STATUS_META[v]?.label || v },
      { title: '备注', dataIndex: 'remark' },
    ]
    exportToCSV(`领用归还_${new Date().toISOString().slice(0, 10)}`, cols, dataSource)
    message.success('导出成功')
  }

  /* ----- 表格列定义 ----- */
  const allColumns: TableColumnsType<ClaimRecord> = [
    {
      title: '资产编号', dataIndex: 'assetNo', key: 'assetNo', width: 150, fixed: 'left',
      render: (v: string) => (
        <Button type="link" size="small" style={{ padding: 0, fontFamily: 'monospace' }}
          onClick={() => onViewAsset(v)}
        >{v}</Button>
      ),
    },
    { title: '资产名称', dataIndex: 'assetName', key: 'assetName', width: 200, ellipsis: true },
    { title: '资产分类', dataIndex: 'assetType', key: 'assetType', width: 120 },
    { title: '品牌', dataIndex: 'brand', key: 'brand', width: 100 },
    { title: '领用人', dataIndex: 'claimant', key: 'claimant', width: 130 },
    { title: '领用部门', dataIndex: 'department', key: 'department', width: 120 },
    { title: '领用日期', dataIndex: 'claimDate', key: 'claimDate', width: 120 },
    {
      title: '领用原因', dataIndex: 'claimReason', key: 'claimReason', width: 160, ellipsis: true,
      render: (v: string | undefined) => v || '—',
    },
    {
      title: '归还日期', dataIndex: 'returnDate', key: 'returnDate', width: 120,
      render: (v: string | undefined) => v || '—',
    },
    {
      title: '归还原因', dataIndex: 'returnReason', key: 'returnReason', width: 160, ellipsis: true,
      render: (v: string | undefined) => v || '—',
    },
    { title: '操作人', dataIndex: 'operator', key: 'operator', width: 120 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => {
        const meta = STATUS_META[v] || { label: v, color: 'default' }
        return <Tag color={meta.color}>{meta.label}</Tag>
      },
    },
    {
      title: '备注', dataIndex: 'remark', key: 'remark', width: 160, ellipsis: true,
      render: (v: string | undefined) => v || '—',
    },
    {
      title: '操作', key: 'action', width: 160, fixed: 'right',
      render: (_: unknown, record: ClaimRecord) => (
        <span style={{ display: 'flex', gap: 4 }}>
          <Button type="link" size="small" onClick={() => onViewAsset(record.assetNo)}>详情</Button>
          <Button type="link" size="small" onClick={() => handleChange(record)}>变更</Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>删除</Button>
        </span>
      ),
    },
  ]

  /* ----- 字段配置 ----- */
  const columnMeta = useMemo(() => [
    { key: 'assetNo', title: '资产编号' },
    { key: 'assetName', title: '资产名称' },
    { key: 'assetType', title: '资产分类' },
    { key: 'brand', title: '品牌' },
    { key: 'claimant', title: '领用人' },
    { key: 'department', title: '领用部门' },
    { key: 'claimDate', title: '领用日期' },
    { key: 'claimReason', title: '领用原因' },
    { key: 'returnDate', title: '归还日期' },
    { key: 'returnReason', title: '归还原因' },
    { key: 'operator', title: '操作人' },
    { key: 'status', title: '状态' },
    { key: 'remark', title: '备注' },
    { key: 'action', title: '操作' },
  ], [])

  const { applyConfig, configComponent } = useColumnConfig('asset-claim', columnMeta)

  /* ----- 变更操作（mock） ----- */
  const handleChange = (_record: ClaimRecord) => {
    message.info('变更功能开发中')
  }
  /* ----- 删除操作（mock） ----- */
  const handleDelete = (_record: ClaimRecord) => {
    message.info('删除功能开发中')
  }

  return (
    <>
      {/* ====== 搜索区 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label="资产编号" name="assetNo">
            <Input placeholder="请输入资产编号" allowClear />
          </Form.Item>
          <Form.Item label="资产名称" name="assetName">
            <Input placeholder="请输入资产名称" allowClear />
          </Form.Item>
          <Form.Item label="资产分类" name="assetType">
            <Select placeholder="全部" allowClear showSearch optionFilterProp="label"
              options={categories.map((c) => ({ label: c.name, value: c.name }))}
            />
          </Form.Item>
          <Form.Item label="品牌" name="brand">
            <Input placeholder="请输入品牌" allowClear />
          </Form.Item>
          <Form.Item label="领用人" name="claimant">
            <Input placeholder="请输入领用人" allowClear />
          </Form.Item>
          <Form.Item label="领用部门" name="department">
            <Select placeholder="全部" allowClear showSearch optionFilterProp="label"
              options={EAM_DEPARTMENTS.map((d) => ({ label: d, value: d }))}
            />
          </Form.Item>
          <Form.Item label="操作人" name="operator">
            <Input placeholder="请输入操作人" allowClear />
          </Form.Item>
          <Form.Item label="领用日期" name="claimDateRange">
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="归还日期" name="returnDateRange">
            <RangePicker style={{ width: '100%' }} />
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
      <Table<ClaimRecord>
        columns={applyConfig(allColumns)}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1900 }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true,
          showTotal: (tt) => `共 ${tt} 条`,
        }}
        onChange={handleTableChange}
      />
    </>
  )
}
