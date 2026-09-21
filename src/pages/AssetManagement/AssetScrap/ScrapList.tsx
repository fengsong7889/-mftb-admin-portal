/**
 * 報廢記錄列表頁
 *
 * - 展示所有資產報廢記錄（資產編號/名稱/分類/品牌/報廢時間/申請人/處置方式/殘值/狀態/時間）
 * - 搜索條件（11 字段）：資產編號、資產名稱、資產分類、資產品牌、報廢時間、申請人、
 *                        處置方式、狀態、創建時間、最後更新人、最後更新時間
 * - 支持新增報廢（先選擇資產，再填寫表單）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Empty, Form, Input, Select, Table, Tag, message, Space, Modal, DatePicker, TreeSelect } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, ExportOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { exportToCSV } from '../../../utils/exportCSV'
import {
  fetchScrapList, deleteScrapRecord,
  type ScrapRecord, type ScrapQuery,
} from '../../../api/asset'
import { fetchCategoryList, fetchBrandList, type AssetCategory, type AssetBrand } from '../../../api/eam'
import { fetchEmployeeOptions } from '../../../api/employee'
import type { OptionItem } from '../../../api/types'

interface Props {
  /** 进入新建报废页（独立页面，Select 下拉选资产） */
  onCreate: () => void
  onViewDetail: (scrapId: number) => void
}

const DISPOSE_LABELS: Record<string, string> = {
  sale: '出售',
  donate: '捐贈',
  recycle: '回收',
  destroy: '銷毀',
}

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  pending: { color: 'warning', label: '待審批' },
  approved: { color: 'success', label: '已報廢' },
  rejected: { color: 'error', label: '已駁回' },
  cancelled: { color: 'default', label: '已取消' },
}

export default function ScrapList({ onCreate, onViewDetail }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<ScrapRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [filters, setFilters] = useState<Omit<ScrapQuery, 'page' | 'size'>>({})
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  /* ----- 分类树 & 品牌列表（搜索区用） ----- */
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [brands, setBrands] = useState<AssetBrand[]>([])

  /* ----- 員工搜索下拉（最後更新人） ----- */
  const [employeeOptions, setEmployeeOptions] = useState<OptionItem[]>([])
  const [employeeSearchLoading, setEmployeeSearchLoading] = useState(false)

  useEffect(() => {
    fetchCategoryList({ bizType: 'ASSET' }).then(setCategories).catch(() => setCategories([]))
    fetchBrandList({ bizType: 'ASSET' }).then(setBrands).catch(() => setBrands([]))
  }, [])

  /** 構建分類樹（parentId=0 為根，與資產台賬搜索區一致） */
  const categoryTreeData = useMemo(() => {
    function buildTree(parentId: number): { title: string; key: string; value: string; children?: ReturnType<typeof buildTree> }[] {
      return categories
        .filter(c => c.parentId === parentId && c.status === 'enabled')
        .sort((a, b) => a.sort - b.sort)
        .map(c => {
          const children = buildTree(c.id)
          return { title: `${c.code} - ${c.name}`, key: c.code, value: c.code, children: children.length ? children : undefined }
        })
    }
    return buildTree(0)
  }, [categories])

  /** 品牌選項（同名品牌按 brandZh 去重，避免 Select 重複 key） */
  const brandOptions = useMemo(
    () => [...new Map(brands.map(b => [b.brandZh, { label: b.brandZh, value: b.brandZh }])).values()],
    [brands],
  )

  /** 員工搜索 */
  const handleEmployeeSearch = useCallback(async (keyword: string) => {
    setEmployeeSearchLoading(true)
    try {
      const options = await fetchEmployeeOptions(keyword)
      setEmployeeOptions(options)
    } finally {
      setEmployeeSearchLoading(false)
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchScrapList({
        page,
        size: pageSize,
        ...filters,
      })
      setDataSource(res.records)
      setTotal(res.total)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters, t])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    const fmtRange = (range?: [{ format(f: string): string } | null, { format(f: string): string } | null]) => {
      const start = range?.[0]?.format('YYYY-MM-DD') ?? null
      const end = range?.[1]?.format('YYYY-MM-DD') ?? null
      return start || end ? [start, end] as [string, string] : undefined
    }
    setPage(1)
    setFilters({
      assetNo: v.assetNo || undefined,
      assetName: v.assetName || undefined,
      assetType: v.assetType || undefined,
      brand: v.brand || undefined,
      scrapDate: fmtRange(v.scrapDate),
      applyBy: v.applyBy || undefined,
      disposeType: v.disposeType || undefined,
      status: v.status || undefined,
      createdAt: fmtRange(v.createdAt),
      updatedBy: v.updatedBy || undefined,
      updatedAt: fmtRange(v.updatedAt),
    })
  }

  const handleReset = () => {
    form.resetFields()
    setPage(1)
    setFilters({})
  }

  const handleExport = () => {
    const cols = [
      { title: t('asset.colAssetNo'), dataIndex: 'assetNo' },
      { title: t('asset.colAssetName'), dataIndex: 'assetName' },
      { title: t('asset.colAssetType'), dataIndex: 'assetType' },
      { title: t('asset.colBrand'), dataIndex: 'brand' },
      { title: t('asset.colScrapDate'), dataIndex: 'scrapDate' },
      { title: t('asset.colApplyBy'), dataIndex: 'applyBy' },
      { title: t('asset.colScrapReason'), dataIndex: 'reason' },
      { title: t('asset.colResidualValue'), dataIndex: 'residualValue' },
      { title: t('asset.colDisposeType'), dataIndex: 'disposeType' },
      { title: t('asset.colStatus'), dataIndex: 'status' },
      { title: t('asset.colCreatedAt'), dataIndex: 'createdAt' },
      { title: t('asset.colUpdatedBy'), dataIndex: 'updatedBy' },
      { title: t('asset.colUpdatedAt'), dataIndex: 'updatedAt' },
    ]
    exportToCSV(`scrap_records_${new Date().toISOString().slice(0, 10)}`, cols, dataSource)
    message.success(t('common.exportSuccess'))
  }

  const handleDelete = (record: ScrapRecord) => {
    Modal.confirm({
      title: '確認刪除此報廢記錄？',
      content: `${record.assetNo} - ${record.assetName}`,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteScrapRecord(record.id)
          message.success('報廢記錄已刪除')
          loadData()
        } catch (e: unknown) {
          if (e instanceof Error) message.error(e.message)
        }
      },
    })
  }

  const statusOptions = [
    { label: t('common.all'), value: '' },
    { label: '待審批', value: 'pending' },
    { label: '已報廢', value: 'approved' },
    { label: '已駁回', value: 'rejected' },
    { label: '已取消', value: 'cancelled' },
  ]

  const disposeOptions = [
    { label: t('common.all'), value: '' },
    { label: '出售', value: 'sale' },
    { label: '捐贈', value: 'donate' },
    { label: '回收', value: 'recycle' },
    { label: '銷毀', value: 'destroy' },
  ]

  const allColumns: TableColumnsType<ScrapRecord> = [
    {
      key: 'assetNo', title: t('asset.colAssetNo'), dataIndex: 'assetNo', width: 150, fixed: 'left',
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    { key: 'assetName', title: t('asset.colAssetName'), dataIndex: 'assetName', width: 180, ellipsis: true },
    { key: 'assetType', title: t('asset.colAssetType'), dataIndex: 'assetType', width: 100 },
    { key: 'brand', title: t('asset.colBrand'), dataIndex: 'brand', width: 100, ellipsis: true },
    { key: 'scrapDate', title: t('asset.colScrapDate'), dataIndex: 'scrapDate', width: 120 },
    { key: 'applyBy', title: t('asset.colApplyBy'), dataIndex: 'applyBy', width: 110 },
    { key: 'reason', title: t('asset.colScrapReason'), dataIndex: 'reason', width: 200, ellipsis: true },
    {
      key: 'residualValue', title: t('asset.colResidualValue'), dataIndex: 'residualValue', width: 130, align: 'right',
      render: (v: number) => v ? `MOP ${v.toLocaleString()}` : '-',
    },
    {
      key: 'disposeType', title: t('asset.colDisposeType'), dataIndex: 'disposeType', width: 100,
      render: (v: string | null) => v ? <Tag>{DISPOSE_LABELS[v] || v}</Tag> : '-',
    },
    {
      key: 'status', title: t('asset.colStatus'), dataIndex: 'status', width: 100,
      render: (s: string) => {
        const cfg = STATUS_MAP[s] || { color: 'default', label: s }
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      key: 'createdAt', title: t('asset.colCreatedAt'), dataIndex: 'createdAt', width: 160,
      render: (v: string) => v || '-',
    },
    {
      key: 'updatedBy', title: t('asset.colUpdatedBy'), dataIndex: 'updatedBy', width: 110, ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      key: 'updatedAt', title: t('asset.colUpdatedAt'), dataIndex: 'updatedAt', width: 160,
      render: (v: string) => v || '-',
    },
    {
      key: 'action', title: t('common.colAction'), width: 140, fixed: 'right',
      render: (_: unknown, r: ScrapRecord) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); onViewDetail(r.id) }}>{t('common.detail')}</Button>
          {r.status === 'pending' && (
            <Button type="link" size="small" danger onClick={(e) => { e.stopPropagation(); handleDelete(r) }}>{t('common.delete')}</Button>
          )}
        </Space>
      ),
    },
  ]

  /* ----- 字段配置 ----- */
  const columnMeta = useMemo(() => [
    { key: 'assetNo', title: t('asset.colAssetNo') },
    { key: 'assetName', title: t('asset.colAssetName') },
    { key: 'assetType', title: t('asset.colAssetType') },
    { key: 'brand', title: t('asset.colBrand') },
    { key: 'scrapDate', title: t('asset.colScrapDate') },
    { key: 'applyBy', title: t('asset.colApplyBy') },
    { key: 'reason', title: t('asset.colScrapReason') },
    { key: 'residualValue', title: t('asset.colResidualValue') },
    { key: 'disposeType', title: t('asset.colDisposeType') },
    { key: 'status', title: t('asset.colStatus') },
    { key: 'createdAt', title: t('asset.colCreatedAt') },
    { key: 'updatedBy', title: t('asset.colUpdatedBy') },
    { key: 'updatedAt', title: t('asset.colUpdatedAt') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('asset-scrap', columnMeta, [
    { key: 'assetNo', locked: 'head' }, { key: 'action', locked: 'tail' },
  ])

  /* ----- 行选择 ----- */
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  }

  return (
    <>
      {/* ====== 搜索區（11 字段） ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('asset.searchAssetNo')} name="assetNo">
            <Input placeholder={t('asset.searchAssetNoPh')} allowClear style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.colAssetName')} name="assetName">
            <Input placeholder={t('asset.searchNamePh')} allowClear style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.colAssetType')} name="assetType">
            <TreeSelect
              placeholder={t('common.all')}
              allowClear
              showSearch
              treeDefaultExpandAll
              treeNodeFilterProp="title"
              treeData={categoryTreeData}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label={t('asset.colBrand')} name="brand">
            <Select
              placeholder={t('common.all')}
              allowClear
              showSearch
              optionFilterProp="label"
              options={brandOptions}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label={t('asset.colScrapDate')} name="scrapDate">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.searchApplyBy')} name="applyBy">
            <Input placeholder={t('asset.searchApplyByPh')} allowClear style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.colDisposeType')} name="disposeType">
            <Select placeholder={t('common.all')} allowClear style={{ width: '100%' }} options={disposeOptions} />
          </Form.Item>
          <Form.Item label={t('asset.colStatus')} name="status">
            <Select placeholder={t('common.all')} allowClear style={{ width: '100%' }} options={statusOptions} />
          </Form.Item>
          <Form.Item label={t('asset.searchCreatedAt')} name="createdAt">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.searchUpdatedBy')} name="updatedBy">
            <Select
              placeholder={t('asset.searchUpdatedByPh')}
              allowClear
              showSearch
              filterOption={false}
              onSearch={handleEmployeeSearch}
              notFoundContent={employeeSearchLoading ? '搜索中...' : '暫無數據'}
              options={employeeOptions}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label={t('asset.searchUpdatedAt')} name="updatedAt">
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

      {/* ====== 操作區 ====== */}
      <div className="action-section">
        <div className="action-section-left">
          <Space>
            <Button className="btn-export" icon={<ExportOutlined />} disabled={selectedRowKeys.length === 0} onClick={handleExport}>
              {t('common.export')}
            </Button>
          </Space>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            新增報廢
          </Button>
          {configComponent}
        </div>
      </div>

      {/* ====== 表格 ====== */}
      <Table<ScrapRecord>
        columns={applyConfig(allColumns) as TableColumnsType<ScrapRecord>}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 2150 }}
        rowSelection={rowSelection}
        locale={{ emptyText: <Empty description={t('common.noData')} /> }}
        onRow={(record) => ({
          onClick: () => onViewDetail(record.id),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (tt) => `共 ${tt} 條`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps) },
        }}
      />
    </>
  )
}
