import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  bindRoleUsers,
  createRole,
  deleteRole,
  fetchRoleBoundUsers,
  fetchRoles,
  updateRole,
  updateRoleStatus,
} from '../../../api/role'
import type { RoleItem } from '../../../api/role'
import { fetchEmployees } from '../../../api/employee'
import type { EmployeeItem } from '../../../api/employee'

const { TextArea } = Input

/** 角色状态枚举 */
const ROLE_STATUS = {
  ENABLED: 1,
  DISABLED: 0,
} as const

const statusOptions = [
  { value: ROLE_STATUS.ENABLED, label: '啟用' },
  { value: ROLE_STATUS.DISABLED, label: '停用' },
]

/** 新增/编辑表单值 */
interface RoleFormValues {
  name: string
  description?: string
}

export default function RoleManagement() {
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // 查询条件（点击查询后生效）
  const [keyword, setKeyword] = useState<string>()
  const [status, setStatus] = useState<number>()
  const [searchForm] = Form.useForm()

  // 新增/编辑弹窗
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editing, setEditing] = useState<RoleItem | null>(null)
  const [form] = Form.useForm<RoleFormValues>()

  // 绑定账号弹窗
  const [bindModalVisible, setBindModalVisible] = useState(false)
  const [bindTarget, setBindTarget] = useState<RoleItem | null>(null)
  const [employees, setEmployees] = useState<EmployeeItem[]>([])
  const [selectedUserKeys, setSelectedUserKeys] = useState<number[]>([])
  const [searchText, setSearchText] = useState('')

  // 员工信息查看弹窗（点击员工数量）
  const [viewModalVisible, setViewModalVisible] = useState(false)
  const [viewTarget, setViewTarget] = useState<RoleItem | null>(null)
  const [viewUsers, setViewUsers] = useState<EmployeeItem[]>([])
  const [viewLoading, setViewLoading] = useState(false)

  /** 加载角色列表 */
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchRoles()
      setRoles(list)
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  /** 表格数据：按搜索条件过滤 */
  const tableData = useMemo(() => {
    let list = roles
    if (keyword) {
      const kw = keyword.toLowerCase()
      list = list.filter(role =>
        role.name.toLowerCase().includes(kw) || (role.description ?? '').toLowerCase().includes(kw))
    }
    if (status !== undefined) {
      list = list.filter(role => role.status === status)
    }
    return list
  }, [roles, keyword, status])

  /** 查询 */
  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    setKeyword(values.keyword?.trim() || undefined)
    setStatus(values.status)
  }

  /** 重置 */
  const handleReset = () => {
    searchForm.resetFields()
    setKeyword(undefined)
    setStatus(undefined)
  }

  /** 新增角色 */
  const handleCreate = () => {
    setEditing(null)
    form.resetFields()
    setEditModalVisible(true)
  }

  /** 编辑角色 */
  const handleEdit = (record: RoleItem) => {
    setEditing(record)
    form.setFieldsValue({
      name: record.name,
      description: record.description,
    })
    setEditModalVisible(true)
  }

  /** 提交新增/编辑 */
  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload = {
      name: values.name.trim(),
      description: values.description?.trim() || '',
    }
    setSubmitting(true)
    try {
      if (editing) {
        await updateRole(editing.id, payload)
        message.success('角色信息已更新')
      } else {
        await createRole(payload)
        message.success('角色創建成功，可在「功能授權」中配置菜單權限')
      }
      setEditModalVisible(false)
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setSubmitting(false)
    }
  }

  /** 打开绑定账号弹窗 */
  const handleOpenBind = async (record: RoleItem) => {
    setBindTarget(record)
    setSearchText('')
    setBindModalVisible(true)
    try {
      const [empResult, boundIds] = await Promise.all([
        fetchEmployees({ page: 1, size: 1000 }),
        fetchRoleBoundUsers(record.id),
      ])
      setEmployees(empResult.records)
      setSelectedUserKeys(boundIds)
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  /** 保存绑定的账号 */
  const handleSaveBind = async () => {
    if (!bindTarget) return
    setSubmitting(true)
    try {
      await bindRoleUsers(bindTarget.id, selectedUserKeys)
      message.success(`已綁定 ${selectedUserKeys.length} 個賬號`)
      setBindModalVisible(false)
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setSubmitting(false)
    }
  }

  /** 点击员工数量：查看该角色绑定的员工信息 */
  const handleViewUsers = async (record: RoleItem) => {
    setViewTarget(record)
    setViewUsers([])
    setViewModalVisible(true)
    setViewLoading(true)
    try {
      const [empResult, boundIds] = await Promise.all([
        fetchEmployees({ page: 1, size: 1000 }),
        fetchRoleBoundUsers(record.id),
      ])
      setViewUsers(empResult.records.filter(user => boundIds.includes(user.id)))
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setViewLoading(false)
    }
  }

  /** 启用/停用 */
  const handleToggleStatus = async (record: RoleItem) => {
    const next = record.status === ROLE_STATUS.ENABLED ? ROLE_STATUS.DISABLED : ROLE_STATUS.ENABLED
    try {
      await updateRoleStatus(record.id, next)
      message.success(next === ROLE_STATUS.ENABLED ? '已啟用' : '已停用')
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  /** 删除 */
  const handleDelete = async (record: RoleItem) => {
    try {
      await deleteRole(record.id)
      message.success('角色已刪除')
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  const columns: TableColumnsType<RoleItem> = [
    { title: '角色名稱', dataIndex: 'name', key: 'name', width: 180 },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (value: number) => (
        value === ROLE_STATUS.ENABLED
          ? <Tag color="success">啟用</Tag>
          : <Tag color="warning">停用</Tag>
      ),
    },
    {
      title: '員工人數',
      dataIndex: 'userCount',
      key: 'userCount',
      width: 110,
      render: (count: number, record) => (
        <Button type="link" size="small" onClick={() => handleViewUsers(record)}>
          {count} 人
        </Button>
      ),
    },
    {
      title: '創建時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (date: string) => (date ? new Date(date).toLocaleString('zh-TW', { hour12: false }) : '-'),
    },
    {
      title: '最後更新人',
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '最後更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (date: string) => (date ? new Date(date).toLocaleString('zh-TW', { hour12: false }) : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 230,
      render: (_, record) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>
            編輯
          </Button>
          <Button type="link" size="small" onClick={() => handleOpenBind(record)}>
            綁定賬號
          </Button>
          <Button type="link" size="small" onClick={() => handleToggleStatus(record)}>
            {record.status === ROLE_STATUS.ENABLED ? '停用' : '啟用'}
          </Button>
          <Popconfirm
            title="確認刪除"
            description={`確定要刪除角色「${record.name}」嗎？刪除後已綁定賬號將失去該角色權限。`}
            onConfirm={() => handleDelete(record)}
            okText="確認"
            cancelText="取消"
          >
            <Button type="link" size="small" danger>
              刪除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const userColumns: TableColumnsType<EmployeeItem> = [
    { title: '工號', dataIndex: 'empId', key: 'empId', width: 100 },
    { title: '姓名', dataIndex: 'name', key: 'name', width: 120 },
    { title: '用戶名', dataIndex: 'username', key: 'username', width: 120 },
    { title: '部門', dataIndex: 'department', key: 'department', width: 120, render: (v: string) => v || '-' },
    {
      title: '狀態',
      key: 'status',
      width: 100,
      render: (_, record) => (
        selectedUserKeys.includes(record.id)
          ? <Tag color="green">已綁定</Tag>
          : <Tag color="default">未綁定</Tag>
      ),
    },
  ]

  /** 过滤员工账号 */
  const filteredUsers = employees.filter(user =>
    user.name.includes(searchText) ||
    user.empId.includes(searchText) ||
    user.username.includes(searchText)
  )

  /** 员工信息查看弹窗列 */
  const viewUserColumns: TableColumnsType<EmployeeItem> = [
    { title: '工號', dataIndex: 'empId', key: 'empId', width: 100 },
    { title: '姓名', dataIndex: 'name', key: 'name', width: 120 },
    { title: '登錄賬號', dataIndex: 'username', key: 'username', width: 120 },
    { title: '部門', dataIndex: 'department', key: 'department', width: 130, render: (v: string) => v || '-' },
    { title: '職位', dataIndex: 'position', key: 'position', width: 130, render: (v: string) => v || '-' },
  ]

  /** 列字段配置 */
  const columnMeta = columns.map(col => ({ key: col.key as string, title: col.title as string }))
  const { configComponent, applyConfig } = useColumnConfig('role-management', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  return (
    <div className="content-area">
      {/* 搜索区 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label="角色名稱" name="keyword">
            <Input placeholder="請輸入角色名稱/描述" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select placeholder="全部" allowClear options={statusOptions} />
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

      {/* 操作区：仅新增，放右侧 */}
      <div className="action-section">
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新增
          </Button>
          {configComponent}
        </div>
      </div>

      <Table
        columns={applyConfig(columns)}
        dataSource={tableData}
        rowKey="id"
        loading={loading}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 條數據`,
        }}
      />

      {/* 新增/编辑角色弹窗 */}
      <Modal
        title={editing ? '編輯角色' : '新增角色'}
        open={editModalVisible}
        onOk={handleSubmit}
        onCancel={() => setEditModalVisible(false)}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        width={500}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="角色名稱"
            rules={[{ required: true, message: '請輸入角色名稱' }]}
          >
            <Input placeholder="例如：部門負責人、BD、後端開發工程師" allowClear />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="請輸入角色描述" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 绑定账号弹窗 */}
      <Modal
        title={`綁定賬號 - ${bindTarget?.name ?? ''}`}
        open={bindModalVisible}
        onOk={handleSaveBind}
        onCancel={() => setBindModalVisible(false)}
        confirmLoading={submitting}
        okText={`保存 (${selectedUserKeys.length} 個)`}
        cancelText="取消"
        width={800}
        destroyOnClose
      >
        <Input.Search
          placeholder="搜索姓名、工號、用戶名"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ marginBottom: 16 }}
        />
        <Table
          columns={userColumns}
          dataSource={filteredUsers}
          rowKey="id"
          pagination={false}
          rowSelection={{
            selectedRowKeys: selectedUserKeys,
            onChange: (keys) => setSelectedUserKeys(keys as number[]),
          }}
          size="small"
          scroll={{ y: 400 }}
        />
      </Modal>

      {/* 员工信息查看弹窗（点击员工数量） */}
      <Modal
        title={`綁定員工 - ${viewTarget?.name ?? ''}`}
        open={viewModalVisible}
        onCancel={() => setViewModalVisible(false)}
        footer={null}
        width={720}
        destroyOnClose
      >
        <Table
          columns={viewUserColumns}
          dataSource={viewUsers}
          rowKey="id"
          loading={viewLoading}
          pagination={false}
          size="small"
          scroll={{ y: 400 }}
          locale={{ emptyText: '該角色暫未綁定員工' }}
        />
      </Modal>
    </div>
  )
}
