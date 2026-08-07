import { useState, useCallback, useEffect } from 'react'
import { Button, Space, Form, DatePicker, Table, message, Modal } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { exportToCSV } from '../../utils/exportCSV'
import { useNavigate } from 'react-router-dom'
import RemoteSearchSelect from '../../components/RemoteSearchSelect'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { toDateRangeParams } from '../../utils/dateRange'
import type { DateRangeValue } from '../../utils/dateRange'
import type { MerchantGroupItem, MerchantGroupQueryParams } from '../../api/merchantGroup'
import {
  fetchMerchantGroups,
  fetchMerchantGroupOptions,
  fetchMerchantGroupUpdatedByOptions,
  deleteMerchantGroup,
} from '../../api/merchantGroup'
import GroupEditModal from './GroupEditModal'

const { RangePicker } = DatePicker

/** 搜索表单值 */
interface GroupSearchValues {
  keyword?: string
  updatedBy?: string
  updatedRange?: DateRangeValue
  createdRange?: DateRangeValue
}

/** 列表查询条件（不含分页） */
type GroupFilters = Omit<MerchantGroupQueryParams, 'page' | 'size'>

export default function GroupList() {
  const { t } = useTranslation('merchantGroup')
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<MerchantGroupItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  // 查询条件（点击查询后生效）
  const [filters, setFilters] = useState<GroupFilters>({})
  const [searchForm] = Form.useForm<GroupSearchValues>()

  // 勾选
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [_selectedRows, setSelectedRows] = useState<MerchantGroupItem[]>([])

  // 编辑弹窗
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<MerchantGroupItem | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchMerchantGroups({ page, size, ...filters })
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
      keyword: values.keyword || undefined,
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

  const handleEdit = (record: MerchantGroupItem) => {
    setEditingRecord(record)
    setModalOpen(true)
  }

  const handleViewStores = (record: MerchantGroupItem) => {
    const params = new URLSearchParams({
      groupId: String(record.id),
      groupCode: record.groupCode,
      groupName: record.groupName,
    })
    navigate(`/store-list?${params.toString()}`)
  }

  const handleDelete = (record: MerchantGroupItem) => {
    if (record.storeCount > 0) {
      message.warning(t('deleteStoreWarning', { count: record.storeCount }))
      return
    }
    Modal.confirm({
      title: t('common:confirmDelete'),
      content: t('confirmDeleteGroup', { name: record.groupName }),
      okText: t('common:confirm'),
      cancelText: t('common:cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteMerchantGroup(record.id)
          message.success(t('groupDeleted'))
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
      { title: t('colStoreCount'), dataIndex: 'storeCount', render: (v: number) => `${v} ${t('storeUnit')}` },
      { title: t('colLoginAccount'), dataIndex: 'loginAccount' },
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

  const handleSelectChange = (keys: React.Key[], rows: MerchantGroupItem[]) => {
    setSelectedRowKeys(keys)
    setSelectedRows(rows)
  }

  const columns: TableColumnsType<MerchantGroupItem> = [
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
      width: 180,
    },
    {
      title: t('colStoreCount'),
      dataIndex: 'storeCount',
      key: 'storeCount',
      width: 100,
      render: (count: number) => (
        <span style={{ color: count > 0 ? '#1890ff' : '#8c8c8c' }}>
          {count} {t('storeUnit')}
        </span>
      ),
    },
    {
      title: t('colLoginAccount'),
      dataIndex: 'loginAccount',
      key: 'loginAccount',
      width: 150,
      render: (val: string) => val || '-',
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
      render: (val: string) => val || '-',
    },
    {
      title: t('colCreatedAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (val: string) => val || '-',
    },
    {
      title: t('common:action'),
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => handleViewStores(record)}>
            {t('viewStores')}
          </Button>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>
            {t('common:edit')}
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
  const { configComponent, applyConfig } = useColumnConfig('merchant-group-list', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  return (
    <div className="content-area">
      {/* 搜索區域 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label={t('searchGroupIdName')} name="keyword">
            <RemoteSearchSelect
              placeholder={t('searchGroupPlaceholder')}
              fetchOptions={fetchMerchantGroupOptions}
            />
          </Form.Item>
          <Form.Item label={t('searchUpdatedBy')} name="updatedBy">
            <RemoteSearchSelect
              placeholder={t('searchUpdatedByPlaceholder')}
              fetchOptions={fetchMerchantGroupUpdatedByOptions}
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
        scroll={{ x: 1200 }}
      />

      {/* 新增/編輯彈窗 */}
      <GroupEditModal
        open={modalOpen}
        editingRecord={editingRecord}
        onClose={() => { setModalOpen(false); setEditingRecord(null) }}
        onSuccess={handleModalSuccess}
      />
    </div>
  )
}
