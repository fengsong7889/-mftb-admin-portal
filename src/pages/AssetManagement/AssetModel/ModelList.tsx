/**
 * 品牌型號庫列表
 *
 * - 支持型號名稱、供應商、創建時間、最後更新人、最後更新時間搜索
 * - 全選 + 字段設置（顯示/隱藏、拖拽排序）
 * - 型號承載「參數模板實例 + 參考單價」，供採購明細與批量入庫選用
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Form, Input, Select, Table, Tag, Modal, message, Space, Tooltip, DatePicker } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import type { Dayjs } from 'dayjs'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchModelList, fetchCategoryList, deleteModel,
  type AssetModel, type AssetCategory,
} from '../../../api/eam'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

interface Props {
  onAdd: () => void
  onEdit: (id: number) => void
  onDetail: (id: number) => void
}

interface SearchFormValues {
  name?: string
  supplier?: string
  createdAtRange?: [Dayjs, Dayjs]
  updatedBy?: string
  updatedAtRange?: [Dayjs, Dayjs]
  categoryCode?: string
  brand?: string
}

export default function ModelList({ onAdd, onEdit, onDetail }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<SearchFormValues>()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<AssetModel[]>([])
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [filters, setFilters] = useState<{
    name?: string
    supplier?: string
    updatedBy?: string
    createdAtStart?: string
    createdAtEnd?: string
    updatedAtStart?: string
    updatedAtEnd?: string
    categoryCode?: string
    brand?: string
  }>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchModelList({ ...filters, page, size })
      setDataSource(res.records || [])
      setTotal(res.total || 0)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [filters, page, size, t])

  useEffect(() => {
    fetchCategoryList().then(setCategories).catch(() => undefined)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleSearch = () => {
    const v = form.getFieldsValue()
    const next: typeof filters = {
      name: v.name || undefined,
      supplier: v.supplier || undefined,
      updatedBy: v.updatedBy || undefined,
      categoryCode: v.categoryCode || undefined,
      brand: v.brand || undefined,
    }
    if (v.createdAtRange) {
      next.createdAtStart = v.createdAtRange[0].format('YYYY-MM-DD 00:00:00')
      next.createdAtEnd = v.createdAtRange[1].format('YYYY-MM-DD 23:59:59')
    }
    if (v.updatedAtRange) {
      next.updatedAtStart = v.updatedAtRange[0].format('YYYY-MM-DD 00:00:00')
      next.updatedAtEnd = v.updatedAtRange[1].format('YYYY-MM-DD 23:59:59')
    }
    setFilters(next)
    setPage(1)
  }
  const handleReset = () => { form.resetFields(); setFilters({}); setPage(1) }

  const handleDelete = (record: AssetModel) => {
    Modal.confirm({
      title: t('asset.confirmDeleteTitle'),
      content: `${record.brand} ${record.modelNo}`,
      okText: t('common.confirm'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteModel(record.id)
          message.success(t('asset.deleteSuccess'))
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('asset.deleteFailed'))
        }
      },
    })
  }

  const handleTableChange = (pagination: TablePaginationConfig) => {
    setPage(pagination.current || 1)
    setSize(pagination.pageSize || 10)
  }

  const categoryName = (code: string) => categories.find((c) => c.code === code)?.name || code
  const brandOptions = Array.from(new Set(dataSource.map((m) => m.brand))).map((b) => ({ label: b, value: b }))

  /* ── 字段配置 ── */
  const columnMeta = useMemo(() => [
    { key: 'name', title: t('asset.colModelName') },
    { key: 'brand', title: t('asset.colBrand') },
    { key: 'modelNo', title: t('asset.colModelNo') },
    { key: 'categoryCode', title: t('asset.colCategoryCode') },
    { key: 'params', title: t('asset.colParams') },
    { key: 'refPrice', title: t('asset.colRefPrice') },
    { key: 'unit', title: t('asset.colUnit') },
    { key: 'supplier', title: t('asset.colSupplier') },
    { key: 'createdAt', title: t('asset.colCreatedAt') },
    { key: 'updatedBy', title: t('asset.searchUpdatedBy') },
    { key: 'updatedAt', title: t('asset.searchUpdatedAt') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('asset-model', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const allColumns: TableColumnsType<AssetModel> = [
    {
      title: t('asset.colModelName'), dataIndex: 'name', key: 'name', width: 200, ellipsis: true,
    },
    { title: t('asset.colBrand'), dataIndex: 'brand', key: 'brand', width: 110 },
    {
      title: t('asset.colModelNo'), dataIndex: 'modelNo', key: 'modelNo', width: 160,
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: t('asset.colCategoryCode'), dataIndex: 'categoryCode', key: 'categoryCode', width: 120,
      render: (v: string) => <Tag color="blue">{categoryName(v)}</Tag>,
    },
    {
      title: t('asset.colParams'), dataIndex: 'params', key: 'params', width: 300,
      render: (params: Record<string, string>) => {
        const entries = Object.entries(params || {})
        if (!entries.length) return <span style={{ color: '#8C8C8C' }}>-</span>
        const text = entries.map(([k, v]) => `${k}: ${v}`).join('、')
        return (
          <Tooltip title={text}>
            <Space size={4} wrap>
              {entries.slice(0, 3).map(([k, v]) => <Tag key={k}>{v}</Tag>)}
              {entries.length > 3 && <Tag>+{entries.length - 3}</Tag>}
            </Space>
          </Tooltip>
        )
      },
    },
    {
      title: t('asset.colRefPrice'), dataIndex: 'refPrice', key: 'refPrice', width: 120, align: 'right',
      render: (v: number) => (v ? `MOP ${v.toLocaleString()}` : '-'),
    },
    { title: t('asset.colUnit'), dataIndex: 'unit', key: 'unit', width: 70 },
    {
      title: t('asset.colSupplier'), dataIndex: 'supplier', key: 'supplier', width: 180, ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    { title: t('asset.colCreatedAt'), dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    {
      title: t('asset.searchUpdatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 120,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('asset.searchUpdatedAt'), dataIndex: 'updatedAt', key: 'updatedAt', width: 170,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('common.colAction'), key: 'action', width: 180, fixed: 'right',
      render: (_: unknown, record: AssetModel) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onDetail(record.id)}>
            詳情
          </Button>
          <Button type="link" size="small" onClick={() => onEdit(record.id)}>
            {t('common.edit')}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  const columns = applyConfig(allColumns)

  return (
    <>
      {/* ====== 搜索區 ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('asset.colModelName')} name="name">
            <Input placeholder={t('asset.searchNamePh')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.colSupplier')} name="supplier">
            <Input placeholder="請輸入供應商" allowClear />
          </Form.Item>
          <Form.Item label={t('asset.colCreatedAt')} name="createdAtRange">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.searchUpdatedBy')} name="updatedBy">
            <Input placeholder={t('asset.searchUpdatedByPh')} allowClear />
          </Form.Item>
          <Form.Item label={t('asset.searchUpdatedAt')} name="updatedAtRange">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.colCategoryCode')} name="categoryCode">
            <Select
              placeholder={t('common.all')}
              allowClear
              options={categories.map((c) => ({ label: c.name, value: c.code }))}
            />
          </Form.Item>
          <Form.Item label={t('asset.colBrand')} name="brand">
            <Select placeholder={t('common.all')} allowClear options={brandOptions} />
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
            {t('asset.btnAddModel')}
          </Button>
          {configComponent}
        </div>
      </div>

      {/* ====== 表格 ====== */}
      <Table<AssetModel>
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 1500 }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
          columnWidth: 40,
        }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true,
          showTotal: (tt) => `${t('common.total', { count: tt })}`,
        }}
        onChange={handleTableChange}
      />
    </>
  )
}
