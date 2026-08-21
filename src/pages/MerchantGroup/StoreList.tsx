import { useState, useCallback, useEffect } from 'react'
import { Button, DatePicker, Form, Select, Space, Table, message, Modal } from 'antd'
import dayjs from 'dayjs'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BrandTag from '../../components/BrandTag'
import RemoteSearchSelect from '../../components/RemoteSearchSelect'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { toDateRangeParams } from '../../utils/dateRange'
import type { DateRangeValue } from '../../utils/dateRange'
import type { StoreBdItem, StoreItem, StoreQueryParams } from '../../api/store'
import { fetchStores, fetchStoreOptions, fetchStoreUpdatedByOptions, deleteStore } from '../../api/store'
import { fetchMerchantGroupOptions } from '../../api/merchantGroup'
import { BIZ_CHANNEL_OPTIONS, formatBizChannel } from '../../constants/bizChannel'
import { REGION_LABEL_KEY } from '../Recommend/constants'
import { exportToCSV } from '../../utils/exportCSV'
import StoreEditModal from './StoreEditModal'
import StoreBindBdModal from './StoreBindBdModal'

const { RangePicker } = DatePicker

/** 品牌选项（内部使用，品牌名不翻译，由 BrandTag 组件处理） */
const BRAND_OPTIONS = [
  { label: '闪蜂', value: 'flashBee' },
  { label: 'mFood', value: 'mFood' },
]

/** 搜索表单值 */
interface StoreSearchValues {
  groupKeyword?: string
  keyword?: string
  brand?: string
  bizChannel?: string
  updatedBy?: string
  updatedRange?: DateRangeValue
  createdRange?: DateRangeValue
}

/** 列表查询条件（不含分页） */
type StoreFilters = Omit<StoreQueryParams, 'page' | 'size'>

export default function StoreList() {
  const { t } = useTranslation('store')
  const [searchParams] = useSearchParams()

  // 从集团管理跳转过来时带集团信息（groupId 用于新增时预选集团）
  const presetGroupId = searchParams.get('groupId') ? Number(searchParams.get('groupId')) : undefined
  const presetGroupCode = searchParams.get('groupCode') || ''
  const presetGroupName = searchParams.get('groupName') || ''

  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<StoreItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)

  // 查询条件（点击查询后生效；从集团列表跳转时默认按该集团过滤）
  const [filters, setFilters] = useState<StoreFilters>(
    presetGroupCode ? { groupKeyword: presetGroupCode } : {},
  )
  const [searchForm] = Form.useForm<StoreSearchValues>()

  // 勾选
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [_selectedRows, setSelectedRows] = useState<StoreItem[]>([])

  // 从集团列表跳转带入的集团，用于搜索下拉框回显
  const presetGroupOptions = presetGroupCode
    ? [{
        value: presetGroupCode,
        label: presetGroupName ? `${presetGroupCode} - ${presetGroupName}` : presetGroupCode,
      }]
    : undefined

  // 编辑弹窗
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<StoreItem | null>(null)

  // 绑定BD弹窗
  const [bindBdOpen, setBindBdOpen] = useState(false)
  const [bindBdRecord, setBindBdRecord] = useState<StoreItem | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchStores({ page, size, ...filters })
      setDataSource(res.records || [])
      setTotal(res.total || 0)
    } catch {
      message.error(t('common:queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [page, size, filters])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    const updated = toDateRangeParams(values.updatedRange)
    const created = toDateRangeParams(values.createdRange)
    setFilters({
      groupKeyword: values.groupKeyword || undefined,
      keyword: values.keyword || undefined,
      brand: values.brand || undefined,
      bizChannel: values.bizChannel || undefined,
      updatedBy: values.updatedBy || undefined,
      updatedFrom: updated.from,
      updatedTo: updated.to,
      createdFrom: created.from,
      createdTo: created.to,
    })
    setPage(1)
  }

  const handleReset = () => {
    searchForm.resetFields()
    setFilters({})
    setPage(1)
  }

  const handleAdd = () => {
    setEditingRecord(null)
    setModalOpen(true)
  }

  const handleEdit = (record: StoreItem) => {
    setEditingRecord(record)
    setModalOpen(true)
  }

  const handleBindBd = (record: StoreItem) => {
    setBindBdRecord(record)
    setBindBdOpen(true)
  }

  const handleBindBdSuccess = () => {
    setBindBdOpen(false)
    setBindBdRecord(null)
    loadData()
  }

  const handleDelete = (record: StoreItem) => {
    Modal.confirm({
      title: t('common:confirmDelete'),
      content: t('confirmDeleteStore', { name: record.storeName }),
      okText: t('common:confirm'),
      cancelText: t('common:cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteStore(record.id)
          message.success(t('storeDeleted'))
          setSelectedRowKeys([])
          setSelectedRows([])
          loadData()
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : t('common:deleteFailed')
          message.error(msg)
        }
      },
    })
  }

  const handleModalSuccess = () => {
    setModalOpen(false)
    setEditingRecord(null)
    loadData()
  }

  const handleExport = () => {
    if (!dataSource.length) {
      message.warning(t('common:noDataToExport'))
      return
    }
    const exportColumns = [
      { title: t('colGroupId'), dataIndex: 'groupCode' },
      { title: t('colGroupName'), dataIndex: 'groupName' },
      { title: t('colStoreId'), dataIndex: 'storeCode' },
      { title: t('colStoreName'), dataIndex: 'storeName' },
      { title: t('common:brand'), dataIndex: 'brand' },
      { title: t('colBizChannel'), dataIndex: 'bizChannel', render: (v: string) => formatBizChannel(v) },
      { title: t('colLoginAccount'), dataIndex: 'loginAccount' },
      { title: t('colRegion'), dataIndex: 'region' },
      { title: t('colBindBd'), dataIndex: 'bdList', render: (v: unknown) => (Array.isArray(v) ? (v as StoreBdItem[]).map(b => `${b.bdName || b.bdEmpId}(${b.bdEmpId})`).join('、') : '') },
      { title: t('colUpdatedBy'), dataIndex: 'updatedBy' },
      { title: t('colUpdatedAt'), dataIndex: 'updatedAt' },
      { title: t('colCreatedAt'), dataIndex: 'createdAt' },
    ]
    exportToCSV(`${t('exportFileName')}_${new Date().toISOString().slice(0, 10)}`, exportColumns, dataSource)
    message.success(t('common:exportSuccess'))
  }

  const handleTableChange = (pagination: TablePaginationConfig) => {
    setPage(pagination.current || 1)
    setSize(pagination.pageSize || 10)
  }

  const handleSelectChange = (keys: React.Key[], rows: StoreItem[]) => {
    setSelectedRowKeys(keys)
    setSelectedRows(rows)
  }

  const columns: TableColumnsType<StoreItem> = [
    {
      title: t('colGroupId'),
      dataIndex: 'groupCode',
      key: 'groupCode',
      width: 120,
    },
    {
      title: t('colGroupName'),
      dataIndex: 'groupName',
      key: 'groupName',
      width: 160,
    },
    {
      title: t('colStoreId'),
      dataIndex: 'storeCode',
      key: 'storeCode',
      width: 130,
    },
    {
      title: t('colStoreName'),
      dataIndex: 'storeName',
      key: 'storeName',
      width: 160,
    },
    {
      title: t('common:brand'),
      dataIndex: 'brand',
      key: 'brand',
      width: 160,
      render: (val: string) => {
        if (!val) return '-'
        const brands = val.split(',').map(s => s.trim()).filter(Boolean)
        if (brands.length <= 1) return val ? <BrandTag value={val} /> : '-'
        return <Space size={4} wrap>{brands.map(b => <BrandTag key={b} value={b} />)}</Space>
      },
    },
    {
      title: t('colBizChannel'),
      dataIndex: 'bizChannel',
      key: 'bizChannel',
      width: 140,
      render: (val: string) => formatBizChannel(val),
    },
    {
      title: t('colLoginAccount'),
      dataIndex: 'loginAccount',
      key: 'loginAccount',
      width: 140,
      render: (val: string) => val || '-',
    },
    {
      title: t('colRegion'),
      dataIndex: 'region',
      key: 'region',
      width: 120,
      render: (val: number | null | undefined) =>
        val ? (REGION_LABEL_KEY[val] ? t(`translation:${REGION_LABEL_KEY[val]}`) : String(val)) : '-',
    },
    {
      title: t('colBindBd'),
      dataIndex: 'bdList',
      key: 'bdList',
      width: 160,
      render: (val: StoreBdItem[] | undefined) =>
        val && val.length > 0
          ? val.map(b => <div key={b.id}>{`${b.bdName || b.bdEmpId}(${b.bdEmpId})`}</div>)
          : '-',
    },
    {
      title: t('colUpdatedBy'),
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 120,
      render: (val: string) => val || '-',
    },
    {
      title: t('colUpdatedAt'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (val: number) => val ? dayjs(val).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: t('colCreatedAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (val: number) => val ? dayjs(val).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: t('common:action'),
      key: 'action',
      width: 190,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>
            {t('common:edit')}
          </Button>
          <Button type="link" size="small" onClick={() => handleBindBd(record)}>
            {t('bindBd')}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            {t('common:delete')}
          </Button>
        </Space>
      ),
    },
  ]

  /** 列字段配置 */
  const columnMeta = columns.map(col => ({ key: col.key as string, title: col.title as string }))
  const { configComponent, applyConfig } = useColumnConfig('merchant-store-list', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  return (
    <div className="content-area">
      {/* 搜索區域 */}
      <div className="search-section">
        <Form
          form={searchForm}
          layout="inline"
          initialValues={{ groupKeyword: presetGroupCode || undefined }}
        >
          <Form.Item label={t('searchGroupIdName')} name="groupKeyword">
            <RemoteSearchSelect
              placeholder={t('searchGroupPlaceholder')}
              fetchOptions={fetchMerchantGroupOptions}
              initialOptions={presetGroupOptions}
            />
          </Form.Item>
          <Form.Item label={t('searchStoreIdName')} name="keyword">
            <RemoteSearchSelect
              placeholder={t('searchStorePlaceholder')}
              fetchOptions={fetchStoreOptions}
            />
          </Form.Item>
          <Form.Item label={t('common:brand')} name="brand">
            <Select placeholder={t('common:all')} allowClear options={BRAND_OPTIONS} />
          </Form.Item>
          <Form.Item label={t('colBizChannel')} name="bizChannel">
            <Select placeholder={t('common:all')} allowClear options={BIZ_CHANNEL_OPTIONS} />
          </Form.Item>
          <Form.Item label={t('searchUpdatedBy')} name="updatedBy">
            <RemoteSearchSelect
              placeholder={t('searchUpdatedByPlaceholder')}
              fetchOptions={fetchStoreUpdatedByOptions}
            />
          </Form.Item>
          <Form.Item label={t('searchUpdatedTime')} name="updatedRange">
            <RangePicker format="YYYY-MM-DD" placeholder={[t('common:startDate'), t('common:endDate')]} allowClear />
          </Form.Item>
          <Form.Item label={t('searchCreatedTime')} name="createdRange">
            <RangePicker format="YYYY-MM-DD" placeholder={[t('common:startDate'), t('common:endDate')]} allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                {t('common:search')}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                {t('common:reset')}
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作區 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>
            {t('common:export')}
          </Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            {t('common:add')}
          </Button>
          {configComponent}
        </div>
      </div>

      {/* 表格 */}
      <Table
        columns={applyConfig(columns)}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        onChange={handleTableChange}
        rowSelection={{
          selectedRowKeys,
          onChange: handleSelectChange,
          columnWidth: 40,
          fixed: true,
        }}
        pagination={{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => t('common:total', { count: total }),
        }}
        scroll={{ x: 1600 }}
      />

      {/* 新增/編輯彈窗 */}
      <StoreEditModal
        open={modalOpen}
        editingRecord={editingRecord}
        presetGroupId={presetGroupId}
        onClose={() => { setModalOpen(false); setEditingRecord(null) }}
        onSuccess={handleModalSuccess}
      />

      {/* 綁定BD彈窗 */}
      <StoreBindBdModal
        open={bindBdOpen}
        record={bindBdRecord}
        onClose={() => { setBindBdOpen(false); setBindBdRecord(null) }}
        onSuccess={handleBindBdSuccess}
      />
    </div>
  )
}
