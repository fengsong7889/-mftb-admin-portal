import { useState, useCallback, useEffect } from 'react'
import { Button, Space, Form, DatePicker, Table, message } from 'antd'
import type { TableColumnsType, TablePaginationConfig } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
} from '@ant-design/icons'
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
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [dataSource, setDataSource] = useState<MerchantGroupItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  // 查询条件（点击查询后生效）
  const [filters, setFilters] = useState<GroupFilters>({})
  const [searchForm] = Form.useForm<GroupSearchValues>()

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

  const handleModalSuccess = () => {
    setModalOpen(false)
    setEditingRecord(null)
    loadData()
  }

  const handleTableChange = (pagination: TablePaginationConfig) => {
    setPage(pagination.current || 1)
    setSize(pagination.pageSize || 10)
  }

  const columns: TableColumnsType<MerchantGroupItem> = [
    {
      title: '集團ID',
      dataIndex: 'groupCode',
      key: 'groupCode',
      width: 120,
    },
    {
      title: '集團名稱',
      dataIndex: 'groupName',
      key: 'groupName',
      width: 180,
    },
    {
      title: '門店數量',
      dataIndex: 'storeCount',
      key: 'storeCount',
      width: 100,
      render: (count: number) => (
        <span style={{ color: count > 0 ? '#1890ff' : '#8c8c8c' }}>
          {count} 家
        </span>
      ),
    },
    {
      title: '登錄主賬號',
      dataIndex: 'loginAccount',
      key: 'loginAccount',
      width: 150,
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
      width: 160,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => handleViewStores(record)}>
            查看門店
          </Button>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>
            編輯
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
          <Form.Item label="集團ID/名稱" name="keyword">
            <RemoteSearchSelect
              placeholder="搜索集團ID/名稱"
              fetchOptions={fetchMerchantGroupOptions}
            />
          </Form.Item>
          <Form.Item label="最後更新人" name="updatedBy">
            <RemoteSearchSelect
              placeholder="搜索最後更新人"
              fetchOptions={fetchMerchantGroupUpdatedByOptions}
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

      {/* 操作區：僅新增 + 設置，放右側 */}
      <div className="action-section">
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
