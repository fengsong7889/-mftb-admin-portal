/**
 * 归还管理 — 列表页
 *
 * 接通真实后端 API，使用 ReturnRow 类型。
 */
import { useState, useEffect, useMemo } from 'react'
import { Button, DatePicker, Empty, Form, Input, Select, Table, Tag, message, type TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined, ExportOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Dayjs } from 'dayjs'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { exportToCSV } from '../../../utils/exportCSV'
import type { ReturnRow, ReturnQuery } from '../../../api/eamReturn'

/* ----- 状态元数据 ----- */
const SOURCE_LABEL: Record<string, string> = { claim: '領用歸還', borrow: '借用歸還', historical: '歷史資產歸還' }
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

interface Filters { keyword?: string; source?: string; status?: string; condition?: string; dates?: [Dayjs, Dayjs] }

export default function ReturnList({ data, loading = false, error, onQuery, canEdit = false }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form] = Form.useForm<Filters>()
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [filters, setFilters] = useState<Pick<ReturnQuery, 'keyword' | 'sourceType' | 'returnStatus' | 'assetCondition' | 'startDate' | 'endDate'>>({})
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  const dataSource = data?.records ?? []
  const total = data?.total ?? 0

  /* ----- 查询触发（与 ClaimList 对齐：filters 变化驱动请求） ----- */
  useEffect(() => {
    onQuery?.({ ...filters, page, size })
  }, [filters, page, size, onQuery])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setFilters({
      keyword: v.keyword?.trim() || undefined,
      sourceType: v.source || undefined,
      returnStatus: v.status || undefined,
      assetCondition: v.condition || undefined,
      startDate: v.dates?.[0]?.format('YYYY-MM-DD'),
      endDate: v.dates?.[1]?.format('YYYY-MM-DD'),
    })
    setPage(1)
  }

  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }

  /* ----- 导出 ----- */
  const handleExport = () => {
    const cols = [
      { title: t('asset.colReturnNo'), dataIndex: 'returnNo' },
      { title: '归还来源', dataIndex: 'sourceType', render: (v: string) => SOURCE_LABEL[v] || v },
      { title: '资产编号', dataIndex: 'assetNo' },
      { title: '资产名称', dataIndex: 'assetName' },
      { title: '原持有人', dataIndex: 'empName' },
      { title: '实际归还人', dataIndex: 'actualReturneeName' },
      { title: t('asset.colReturnDate'), dataIndex: 'returnDate' },
      { title: '验收状况', dataIndex: 'assetCondition', render: (v: string) => CONDITION_LABEL[v] || v },
      { title: '处理状态', dataIndex: 'returnStatus', render: (v: string) => STATUS_LABEL[v] || v },
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
      key: 'source', title: '歸還來源', dataIndex: 'sourceType', width: 140,
      render: (v: string) => SOURCE_LABEL[v] || v,
    },
    { key: 'asset', title: '資產', width: 200, render: (_, r) => <>{r.assetName}<div className="claim-muted">{r.assetNo}</div></> },
    { key: 'holder', title: '原持有人', dataIndex: 'empName', width: 130 },
    { key: 'actualReturnee', title: '實際歸還人', dataIndex: 'actualReturneeName', width: 150, render: (v: string, r) => v || r.empName },
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
      key: 'action', title: t('common.colAction'), width: 150, fixed: 'right',
      render: (_, r) => (
        <>
          <Button type="link" onClick={() => navigate(`/asset-return/detail?id=${r.id}`)}>詳情</Button>
          {r.compensationId && <><span className="action-split">|</span><Button type="link" onClick={() => navigate(`/asset-compensation/detail?id=${r.compensationId}`)}>賠付</Button></>}
        </>
      ),
    },
  ]

  /* ----- 字段配置 ----- */
  const columnMeta = useMemo(() => [
    { key: 'returnNo', title: t('asset.colReturnNo') },
    { key: 'source', title: '歸還來源' },
    { key: 'asset', title: '資產' },
    { key: 'holder', title: '原持有人' },
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
          <Form.Item label={t('asset.searchKeyword')} name="keyword">
            <Input allowClear placeholder="單號 / 資產 / 原持有人 / 歸還人" />
          </Form.Item>
          <Form.Item label="歸還來源" name="source">
            <Select allowClear placeholder="全部來源" options={Object.entries(SOURCE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
          <Form.Item label="處理狀態" name="status">
            <Select allowClear placeholder="全部狀態" options={Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
          <Form.Item label="驗收狀況" name="condition">
            <Select allowClear placeholder="全部狀況" options={Object.entries(CONDITION_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
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
          {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/asset-return/add')}>{t('asset.btnNewReturn')}</Button>}
          {configComponent}
        </div>
      </div>

      {/* ====== 表格 ====== */}
      <Table<ReturnRow>
        rowKey="id"
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        size="middle"
        scroll={{ x: 1380 }}
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
