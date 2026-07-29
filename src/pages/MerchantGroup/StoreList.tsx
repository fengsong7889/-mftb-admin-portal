import { useState, useCallback, useEffect } from 'react'
import { Button, DatePicker, Form, Select, Table, message } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BrandTag from '../../components/BrandTag'
import RemoteSearchSelect from '../../components/RemoteSearchSelect'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { toDateRangeParams } from '../../utils/dateRange'
import type { DateRangeValue } from '../../utils/dateRange'
import type { StoreItem, StoreQueryParams } from '../../api/store'
import { fetchStores, fetchStoreOptions, fetchStoreUpdatedByOptions } from '../../api/store'
import { fetchMerchantGroupOptions } from '../../api/merchantGroup'
import StoreEditModal from './StoreEditModal'

const { RangePicker } = DatePicker

/** 品牌选项 */
const BRAND_OPTIONS = [
  { label: '闪蜂 (flashBee)', value: 'flashBee' },
  { label: 'mFood', value: 'mFood' },
]

/** 业务频道选项 */
const BIZ_CHANNEL_OPTIONS = [
  { label: '美食外賣', value: '美食外賣' },
  { label: '超市百貨', value: '超市百貨' },
  { label: '團購到店', value: '團購到店' },
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
  const navigate = useNavigate()
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

  const handleModalSuccess = () => {
    setModalOpen(false)
    setEditingRecord(null)
    loadData()
  }

  const handleTableChange = (pagination: TablePaginationConfig) => {
    setPage(pagination.current || 1)
    setSize(pagination.pageSize || 10)
  }

  const handleBack = () => {
    navigate('/merchant-group-list')
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
      render: (val: string) => val || '-',
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
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => handleEdit(record)}>
          編輯
        </Button>
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

      {/* 操作區：左側返回與當前集團，右側僅新增 + 設置 */}
      <div className="action-section">
        {(presetGroupId || presetGroupName) && (
          <div className="action-section-left">
            {presetGroupId && (
              <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
                返回集團列表
              </Button>
            )}
            {presetGroupName && (
              <span style={{ color: '#595959' }}>
                當前集團：<strong>{presetGroupName}</strong>
              </span>
            )}
          </div>
        )}
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
