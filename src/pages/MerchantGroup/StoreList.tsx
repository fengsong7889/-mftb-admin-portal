import { useState, useCallback, useEffect } from 'react'
import { Button, DatePicker, Form, Select, Space, Table, message, Modal } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ExportOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import BrandTag from '../../components/BrandTag'
import RemoteSearchSelect from '../../components/RemoteSearchSelect'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { toDateRangeParams } from '../../utils/dateRange'
import type { DateRangeValue } from '../../utils/dateRange'
import type { StoreItem, StoreQueryParams } from '../../api/store'
import { fetchStores, fetchStoreOptions, fetchStoreUpdatedByOptions, deleteStore } from '../../api/store'
import { fetchMerchantGroupOptions } from '../../api/merchantGroup'
import { BIZ_CHANNEL_OPTIONS, formatBizChannel } from '../../constants/bizChannel'
import { exportToCSV } from '../../utils/exportCSV'
import StoreEditModal from './StoreEditModal'

const { RangePicker } = DatePicker

/** 品牌选项 */
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
  const [selectedRows, setSelectedRows] = useState<StoreItem[]>([])

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

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchStores({ page, size, ...filters })
      setDataSource(res.records || [])
      setTotal(res.total || 0)
    } catch {
      message.error('查詢失敗')
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

  const handleDelete = (record: StoreItem) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除門店「${record.storeName}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteStore(record.id)
          message.success('門店已刪除')
          setSelectedRowKeys([])
          setSelectedRows([])
          loadData()
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : '刪除失敗'
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
      message.warning('暫無數據可導出')
      return
    }
    const exportColumns = [
      { title: '所屬集團ID', dataIndex: 'groupCode' },
      { title: '所屬集團名稱', dataIndex: 'groupName' },
      { title: '門店ID', dataIndex: 'storeCode' },
      { title: '門店名稱', dataIndex: 'storeName' },
      { title: '所屬品牌', dataIndex: 'brand' },
      { title: '業務頻道', dataIndex: 'bizChannel', render: (v: string) => formatBizChannel(v) },
      { title: '登錄主賬號', dataIndex: 'loginAccount' },
      { title: '最後更新人', dataIndex: 'updatedBy' },
      { title: '最後更新時間', dataIndex: 'updatedAt' },
      { title: '創建時間', dataIndex: 'createdAt' },
    ]
    exportToCSV(`門店管理_${new Date().toISOString().slice(0, 10)}`, exportColumns, dataSource)
    message.success('導出成功')
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
      title: '所屬集團ID',
      dataIndex: 'groupCode',
      key: 'groupCode',
      width: 120,
    },
    {
      title: '所屬集團名稱',
      dataIndex: 'groupName',
      key: 'groupName',
      width: 160,
    },
    {
      title: '門店ID',
      dataIndex: 'storeCode',
      key: 'storeCode',
      width: 100,
    },
    {
      title: '門店名稱',
      dataIndex: 'storeName',
      key: 'storeName',
      width: 160,
    },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 120,
      render: (val: string) => val ? <BrandTag value={val} /> : '-',
    },
    {
      title: '業務頻道',
      dataIndex: 'bizChannel',
      key: 'bizChannel',
      width: 140,
      render: (val: string) => formatBizChannel(val),
    },
    {
      title: '登錄主賬號',
      dataIndex: 'loginAccount',
      key: 'loginAccount',
      width: 140,
      render: (val: string) => val || '-',
    },
    {
      title: '最後更新人',
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 120,
      render: (val: string) => val || '-',
    },
    {
      title: '最後更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (val: string) => val || '-',
    },
    {
      title: '創建時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (val: string) => val || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>
            編輯
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>
            刪除
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
          <Form.Item label="集團ID/名稱" name="groupKeyword">
            <RemoteSearchSelect
              placeholder="搜索集團ID/名稱"
              fetchOptions={fetchMerchantGroupOptions}
              initialOptions={presetGroupOptions}
            />
          </Form.Item>
          <Form.Item label="門店ID/名稱" name="keyword">
            <RemoteSearchSelect
              placeholder="搜索門店ID/名稱"
              fetchOptions={fetchStoreOptions}
            />
          </Form.Item>
          <Form.Item label="所屬品牌" name="brand">
            <Select placeholder="全部" allowClear options={BRAND_OPTIONS} />
          </Form.Item>
          <Form.Item label="業務頻道" name="bizChannel">
            <Select placeholder="全部" allowClear options={BIZ_CHANNEL_OPTIONS} />
          </Form.Item>
          <Form.Item label="最後更新人" name="updatedBy">
            <RemoteSearchSelect
              placeholder="搜索最後更新人"
              fetchOptions={fetchStoreUpdatedByOptions}
            />
          </Form.Item>
          <Form.Item label="最後更新時間" name="updatedRange">
            <RangePicker format="YYYY-MM-DD" placeholder={['開始日期', '結束日期']} allowClear />
          </Form.Item>
          <Form.Item label="創建時間" name="createdRange">
            <RangePicker format="YYYY-MM-DD" placeholder={['開始日期', '結束日期']} allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                查詢
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                重置
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作區 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>
            導出
          </Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增
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
          showTotal: (t) => `共 ${t} 條`,
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
    </div>
  )
}
