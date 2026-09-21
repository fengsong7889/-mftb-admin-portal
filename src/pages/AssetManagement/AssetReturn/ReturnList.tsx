/**
 * 归还管理 — 列表页
 *
 * 接通真实后端 API，使用 ReturnRow 类型。
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Button, DatePicker, Empty, Form, Input, Select, Table, Tag, TreeSelect, message, type TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined, ExportOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Dayjs } from 'dayjs'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import AssetParameters from '../../../components/AssetParameters'
import BrandTag from '../../../components/BrandTag'
import { useCompanyBrand } from '../../../contexts/CompanyBrandContext'
import { useAssetParameterCatalog } from '../../../hooks/useAssetParameterCatalog'
import { exportToCSV } from '../../../utils/exportCSV'
import type { ReturnRow, ReturnQuery } from '../../../api/eamReturn'
import { fetchClaimEmployeeOptions } from '../../../api/eamClaim'
import type { ClaimEmployee, DepartmentNode } from '../AssetClaim/claimViewTypes'
import { buildDeptTree } from '../AssetClaim/claimViewTypes'
import { fetchDepartments } from '../../../api/department'
import { fetchAssetList, type AssetItem } from '../../../api/asset'

/* ----- 状态元数据 ----- */
const SOURCE_LABEL: Record<string, string> = { claim: '領用歸還', borrow: '借用歸還' }
const STATUS_LABEL: Record<string, string> = { completed: '正常完成', exception_pending: '異常處理中', exception_closed: '異常已結束' }
const STATUS_COLOR: Record<string, string> = { completed: 'success', exception_pending: 'processing', exception_closed: 'default' }
const CONDITION_LABEL: Record<string, string> = { normal: '正常', damaged: '損壞', lost: '遺失' }
const CONDITION_COLOR: Record<string, string> = { normal: 'success', damaged: 'error', lost: 'warning' }

interface Props {
  data?: { records: ReturnRow[]; total: number }
  loading?: boolean
  error?: string
  onQuery?: (query: ReturnQuery) => void
  canEdit?: boolean
}

interface Filters {
  returnNo?: string
  assetKeyword?: string
  source?: string
  empName?: string
  actualReturneeName?: string
  departmentId?: number
  condition?: string
  status?: string
  dates?: [Dayjs, Dayjs]
  companyBrand?: number
}

export default function ReturnList({ data, loading = false, error, onQuery, canEdit = false }: Props) {
  const { t } = useTranslation()
  const paramCatalog = useAssetParameterCatalog()
  const { numericOptions } = useCompanyBrand()
  const navigate = useNavigate()
  const [form] = Form.useForm<Filters>()
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<Pick<ReturnQuery, 'returnNo' | 'assetKeyword' | 'empName' | 'actualReturneeName' | 'departmentId' | 'sourceType' | 'returnStatus' | 'assetCondition' | 'startDate' | 'endDate' | 'companyBrand'>>({})
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  /* ----- 部门树数据 ----- */
  const [deptTree, setDeptTree] = useState<DepartmentNode[]>([])
  useEffect(() => {
    fetchDepartments().then(list => setDeptTree(buildDeptTree(list))).catch(() => {})
  }, [])

  /* ----- 员工下拉搜索 ----- */
  const [empOptions, setEmpOptions] = useState<ClaimEmployee[]>([])
  const [returneeOptions, setReturneeOptions] = useState<ClaimEmployee[]>([])
  const handleSearchEmp = useCallback(async (kw: string) => {
    if (!kw || kw.trim().length < 1) { setEmpOptions([]); return }
    try { const res = await fetchClaimEmployeeOptions(kw.trim()); setEmpOptions(res.records || []) } catch { setEmpOptions([]) }
  }, [])
  const handleSearchReturnee = useCallback(async (kw: string) => {
    if (!kw || kw.trim().length < 1) { setReturneeOptions([]); return }
    try { const res = await fetchClaimEmployeeOptions(kw.trim()); setReturneeOptions(res.records || []) } catch { setReturneeOptions([]) }
  }, [])

  /* ----- 资产编号/名称下拉搜索（远程，300ms 防抖） ----- */
  const [assetOptions, setAssetOptions] = useState<AssetItem[]>([])
  const [assetSearchLoading, setAssetSearchLoading] = useState(false)
  const assetSearchTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const handleAssetSearch = useCallback((keyword: string) => {
    if (assetSearchTimerRef.current) clearTimeout(assetSearchTimerRef.current)
    if (!keyword) { setAssetOptions([]); return }
    assetSearchTimerRef.current = setTimeout(async () => {
      setAssetSearchLoading(true)
      try {
        const res = await fetchAssetList({ keyword, status: 'all', page: 1, size: 50 })
        setAssetOptions(res.records.filter((a) => a.status !== 'scrapped'))
      } catch {
        setAssetOptions([])
      } finally {
        setAssetSearchLoading(false)
      }
    }, 300)
  }, [])

  const dataSource = data?.records ?? []
  const total = data?.total ?? 0

  /* ----- 查询触发（与 ClaimList 对齐：filters 变化驱动请求） ----- */
  useEffect(() => {
    onQuery?.({ ...filters, page, size })
  }, [filters, page, size, onQuery])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setFilters({
      returnNo: v.returnNo?.trim() || undefined,
      assetKeyword: v.assetKeyword?.trim() || undefined,
      empName: v.empName || undefined,
      actualReturneeName: v.actualReturneeName || undefined,
      departmentId: v.departmentId || undefined,
      sourceType: v.source || undefined,
      returnStatus: v.status || undefined,
      assetCondition: v.condition || undefined,
      startDate: v.dates?.[0]?.format('YYYY-MM-DD'),
      endDate: v.dates?.[1]?.format('YYYY-MM-DD'),
      companyBrand: v.companyBrand || undefined,
    })
    setPage(1)
  }

  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }

  /* ----- 导出 ----- */
  const handleExport = () => {
    const cols = [
      { title: t('asset.colReturnNo'), dataIndex: 'returnNo' },
      { title: '歸還來源', dataIndex: 'sourceType', render: (v: string) => SOURCE_LABEL[v] || v },
      { title: '資產編號', dataIndex: 'assetNo' },
      { title: '資產名稱', dataIndex: 'assetName' },
      { title: '所屬品牌', dataIndex: 'companyBrand', render: (v: number | null) => v === 1 ? '闪蜂' : v === 2 ? 'mFood' : '' },
      { title: '領用人', dataIndex: 'empName' },
      { title: '領用時部門', dataIndex: 'department' },
      { title: '實際歸還人', dataIndex: 'actualReturneeName' },
      { title: t('asset.colReturnDate'), dataIndex: 'returnDate' },
      { title: '驗收狀況', dataIndex: 'assetCondition', render: (v: string) => CONDITION_LABEL[v] || v },
      { title: '處理狀態', dataIndex: 'returnStatus', render: (v: string) => STATUS_LABEL[v] || v },
    ]
    exportToCSV(`return_${new Date().toISOString().slice(0, 10)}`, cols, dataSource)
    message.success(t('common.exportSuccess'))
  }

  const handleTableChange = (p: { current?: number; pageSize?: number }) => {
    const nextSize = p.pageSize || 10
    setPage(nextSize === size ? p.current || 1 : 1)
    setSize(nextSize)
  }

  /* ----- 表格列定义 ----- */
  const allColumns: TableColumnsType<ReturnRow> = [
    {
      key: 'returnNo', title: t('asset.colReturnNo'), dataIndex: 'returnNo', width: 175, fixed: 'left',
      render: (v: string, r) => <Button type="link" onClick={() => navigate(`/asset-return/detail?id=${r.id}`)}>{v}</Button>,
    },
    {
      key: 'source', title: '歸還來源', dataIndex: 'sourceType', width: 120,
      render: (v: string) => SOURCE_LABEL[v] || v,
    },
    { key: 'assetNo', title: '資產編號', dataIndex: 'assetNo', width: 160 },
    { key: 'assetName', title: '資產名稱', dataIndex: 'assetName', width: 160, ellipsis: true },
    {
      key: 'companyBrand', title: '所屬品牌', dataIndex: 'companyBrand', width: 100,
      render: (v: number | null) => v ? <BrandTag value={v} /> : '-',
    },
    { key: 'empName', title: '領用人', dataIndex: 'empName', width: 140, ellipsis: true, render: (v: string, r) => {
      const name = v || '—'
      return r.empNo ? `${name}（${r.empNo}）` : name
    }},
    { key: 'department', title: '領用時部門', dataIndex: 'department', width: 160, ellipsis: true, render: (v: string) => v || '—' },
    { key: 'actualReturnee', title: '實際歸還人', dataIndex: 'actualReturneeName', width: 160, ellipsis: true, render: (v: string, r) => {
      const name = v || r.empName || '—'
      // actualReturneeName 可能已含工号（如 "冯松（MF00002）"），避免重复拼接
      if (v) return name
      const no = r.actualReturneeNo
      return no ? `${name}（${no}）` : name
    }},
    { key: 'date', title: t('asset.colReturnDate'), dataIndex: 'returnDate', width: 120 },
    {
      key: 'condition', title: '驗收狀況', dataIndex: 'assetCondition', width: 100,
      render: (v: string) => <Tag color={CONDITION_COLOR[v] || 'default'}>{CONDITION_LABEL[v] || v}</Tag>,
    },
    {
      key: 'status', title: '處理狀態', dataIndex: 'returnStatus', width: 120,
      render: (v: string) => <Tag color={STATUS_COLOR[v] || 'default'}>{STATUS_LABEL[v] || v}</Tag>,
    },
    {
      key: 'action', title: t('common.colAction'), width: 130, fixed: 'right',
      render: (_, r) => (
        <>
          <Button type="link" onClick={() => navigate(`/asset-return/detail?id=${r.id}`)}>詳情</Button>
          {r.returnStatus === 'exception_pending' && (
            <>
              <span className="action-split" />
              <Button type="link" onClick={() => navigate(`/asset-return/detail?id=${r.id}&editMode=1`)}>處理</Button>
            </>
          )}
        </>
      ),
    },
  ]

  /* ----- 字段配置 ----- */
  const columnMeta = useMemo(() => [
    { key: 'returnNo', title: t('asset.colReturnNo') },
    { key: 'source', title: '歸還來源' },
    { key: 'assetNo', title: '資產編號' },
    { key: 'assetName', title: '資產名稱' },
    { key: 'companyBrand', title: '所屬品牌' },
    { key: 'empName', title: '領用人' },
    { key: 'department', title: '領用時部門' },
    { key: 'actualReturnee', title: '實際歸還人' },
    { key: 'date', title: t('asset.colReturnDate') },
    { key: 'condition', title: '驗收狀況' },
    { key: 'status', title: '處理狀態' },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { applyConfig, configComponent } = useColumnConfig('asset-return', columnMeta, [
    { key: 'returnNo', locked: 'head' }, { key: 'action', locked: 'tail' },
  ])

  return (
    <>
      {/* ====== 搜索区 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline" onFinish={handleSearch}>
          <Form.Item label="歸還單號" name="returnNo">
            <Input allowClear placeholder="輸入歸還單號" />
          </Form.Item>
          <Form.Item label={t('asset.searchAssetLabel')} name="assetKeyword">
            <Select
              placeholder={t('asset.searchAssetPh')}
              allowClear
              showSearch
              filterOption={false}
              onSearch={handleAssetSearch}
              loading={assetSearchLoading}
              notFoundContent={assetSearchLoading ? t('common.searching', '搜索中...') : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.noData')} />}
              options={assetOptions.map((a) => ({
                label: `${a.assetNo} - ${a.assetName}`,
                value: a.assetNo,
              }))}
            />
          </Form.Item>
          <Form.Item label="歸還來源" name="source">
            <Select allowClear placeholder="全部來源" options={Object.entries(SOURCE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
          <Form.Item label="領用人" name="empName">
            <Select
              allowClear showSearch placeholder="搜索領用人姓名或工號"
              optionFilterProp="label" optionLabelProp="label"
              filterOption={false} onSearch={handleSearchEmp}
              notFoundContent="請輸入關鍵字搜索"
              options={empOptions.map(e => ({ value: e.empName, label: `${e.empName}${e.empNo ? `（${e.empNo}）` : ''}` }))}
            />
          </Form.Item>
          <Form.Item label="實際歸還人" name="actualReturneeName">
            <Select
              allowClear showSearch placeholder="搜索實際歸還人姓名或工號"
              optionFilterProp="label" optionLabelProp="label"
              filterOption={false} onSearch={handleSearchReturnee}
              notFoundContent="請輸入關鍵字搜索"
              options={returneeOptions.map(e => ({ value: e.empName, label: `${e.empName}${e.empNo ? `（${e.empNo}）` : ''}` }))}
            />
          </Form.Item>
          <Form.Item label="領用時部門" name="departmentId">
            <TreeSelect
              allowClear treeData={deptTree}
              placeholder="選擇部門"
              treeDefaultExpandAll
              showSearch treeNodeFilterProp="title"
            />
          </Form.Item>
          <Form.Item label="驗收狀況" name="condition">
            <Select allowClear placeholder="全部狀況" options={Object.entries(CONDITION_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
          <Form.Item label="處理狀態" name="status">
            <Select allowClear placeholder="全部狀態" options={Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
          <Form.Item label="所屬品牌" name="companyBrand">
            <Select allowClear placeholder={t('common.all')} options={numericOptions} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="歸還日期" name="dates">
            <DatePicker.RangePicker />
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
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} disabled={loading || !!error || !dataSource.length} onClick={handleExport}>{t('common.export')}</Button>
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      {/* ====== 表格 ====== */}
      <Table<ReturnRow>
        className="nowrap-table"
        rowKey="id"
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        size="middle"
        scroll={{ x: 1605 }}
        columns={applyConfig(allColumns) as TableColumnsType<ReturnRow>}
        dataSource={error ? [] : dataSource}
        locale={{ emptyText: <Empty description={t('common.noData')} /> }}
        loading={loading}
        onChange={handleTableChange}
        pagination={{
          current: page, pageSize: size, total,
          showSizeChanger: true, showQuickJumper: true,
          showTotal: (count) => t('common.total', { count }),
        }}
      />
    </>
  )
}
