import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import {
  fetchHrDict, updateHrDictStatus, deleteHrDict,
  HR_DICT_TYPE, type HrDictItem, type HrDictType,
} from '../../../api/hrDict'

/** 顶部 Tab 定义 */
const DICT_TABS = [
  { key: HR_DICT_TYPE.EMPLOYER_COMPANY, label: '僱主法人' },
  { key: HR_DICT_TYPE.WORK_LOCATION, label: '工作地点' },
  { key: HR_DICT_TYPE.EMPLOYEE_CATEGORY, label: '人員類別' },
  { key: HR_DICT_TYPE.CONTRACT_TYPE, label: '合同类型' },
  { key: HR_DICT_TYPE.WORK_SYSTEM, label: '工时制' },
]

const STATUS_OPTIONS = [
  { value: 1, label: '啟用' },
  { value: 0, label: '停用' },
]

export default function HrDictManagement() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('rule-config:edit')

  const [activeType, setActiveType] = useState<HrDictType>(HR_DICT_TYPE.EMPLOYER_COMPANY)
  const [all, setAll] = useState<HrDictItem[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState<string>()
  const [statusFilter, setStatusFilter] = useState<number>()
  const [searchForm] = Form.useForm()

  /** 加载当前类型全量字典（含停用），关键字/状态在前端过滤（数据量小） */
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchHrDict(activeType)
      setAll(list)
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }, [activeType])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  /** 国家 code → 名称，用于工作地点“上级”列展示 */
  const countryNameByCode = useMemo(() => {
    const map: Record<string, string> = {}
    all.filter(d => !d.parentCode).forEach(d => { map[d.code] = d.name })
    return map
  }, [all])

  const tableData = useMemo(() => {
    let list = all
    if (keyword) {
      const kw = keyword.toLowerCase()
      list = list.filter(d =>
        d.code.toLowerCase().includes(kw)
        || d.name.toLowerCase().includes(kw)
        || (d.nameEn ?? '').toLowerCase().includes(kw))
    }
    if (statusFilter != null) list = list.filter(d => d.status === statusFilter)
    return list
  }, [all, keyword, statusFilter])

  const handleSearch = () => {
    const v = searchForm.getFieldsValue()
    setKeyword(v.keyword?.trim() || undefined)
    setStatusFilter(v.status)
  }

  const handleReset = () => {
    searchForm.resetFields()
    setKeyword(undefined)
    setStatusFilter(undefined)
  }

  const handleCreate = () => {
    navigate(`/hr-dict-edit?type=${activeType}`)
  }

  const handleEdit = (record: HrDictItem) => {
    navigate(`/hr-dict-edit?type=${activeType}&id=${record.id}`)
  }

  const handleToggleStatus = async (record: HrDictItem, checked: boolean) => {
    try {
      await updateHrDictStatus(record.id, checked ? 1 : 0)
      message.success(checked ? '已啟用' : '已停用')
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  const handleDelete = async (record: HrDictItem) => {
    try {
      await deleteHrDict(record.id)
      message.success('刪除成功')
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  const columns: TableColumnsType<HrDictItem> = [
    { title: '編碼', dataIndex: 'code', key: 'code', width: 180 },
    { title: '名稱', dataIndex: 'name', key: 'name', width: 200 },
    { title: '英文名稱', dataIndex: 'nameEn', key: 'nameEn', width: 220, render: (v: string) => v || '-' },
    ...(activeType === HR_DICT_TYPE.WORK_LOCATION
      ? [{
          title: '所屬國家/地區', dataIndex: 'parentCode', key: 'parentCode', width: 140,
          render: (v: string) => (v ? (countryNameByCode[v] || v) : '—（國家/頂級）'),
        } as TableColumnsType<HrDictItem>[number]]
      : []),
    { title: '排序', dataIndex: 'sortOrder', key: 'sortOrder', width: 80 },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 100,
      render: (v: number, record) => (
        canEdit
          ? <Switch checked={v === 1} checkedChildren="啟用" unCheckedChildren="停用"
              onChange={(checked) => handleToggleStatus(record, checked)} />
          : <Tag color={v === 1 ? 'success' : 'default'}>{v === 1 ? '啟用' : '停用'}</Tag>
      ),
    },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 130, render: (v: string) => v || '-' },
    {
      title: '操作', key: 'action', width: 120,
      render: (_, record) => (
        canEdit ? (
          <Space size={0} split={<span className="action-split">|</span>}>
            <Button type="link" size="small" onClick={() => handleEdit(record)}>編輯</Button>
            <Popconfirm title="確認刪除該字典項？" onConfirm={() => handleDelete(record)} okText="確認" cancelText="取消">
              <Button type="link" size="small" danger>刪除</Button>
            </Popconfirm>
          </Space>
        ) : <span style={{ color: '#8C8C8C' }}>僅查看</span>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 搜索区 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label="關鍵詞" name="keyword">
            <Input placeholder="編碼 / 名稱 / 英文名" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select placeholder="全部" allowClear style={{ width: 120 }} options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              新增{DICT_TABS.find(t => t.key === activeType)?.label}
            </Button>
          )}
        </div>
      </div>

      <Tabs
        activeKey={activeType}
        onChange={(key) => { setActiveType(key as HrDictType); handleReset() }}
        items={DICT_TABS.map(t => ({ key: t.key, label: t.label }))}
        style={{ marginBottom: 12 }}
      />

      <Table
        className="nowrap-table"
        columns={columns}
        dataSource={tableData}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={{ showSizeChanger: true, showQuickJumper: true, showTotal: (total) => `共 ${total} 條` }}
      />
    </div>
  )
}
