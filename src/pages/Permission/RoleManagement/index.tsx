import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { useAuth } from '../../../contexts/AuthContext'
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

/** 新增/编辑表单值 */
interface RoleFormValues {
  name: string
  description?: string
}

export default function RoleManagement() {
  const { t } = useTranslation()

  /** 狀態選項（依賴 t，定義在組件內以便響應語言切換） */
  const STATUS_OPTIONS = [
    { value: ROLE_STATUS.ENABLED, label: t('roleManagement.statusEnabled') },
    { value: ROLE_STATUS.DISABLED, label: t('roleManagement.statusDisabled') },
  ]

  const [roles, setRoles] = useState<RoleItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // 查询条件（点击查询后生效）
  const [keyword, setKeyword] = useState<string>()
  const [status, setStatus] = useState<number>()
  const [searchForm] = Form.useForm()
  // 功能权限校验（菜单 key: role-management）
  const { hasPermission } = useAuth()

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
        message.success(t('roleManagement.updateSuccess'))
      } else {
        await createRole(payload)
        message.success(t('roleManagement.createSuccess'))
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
      message.success(t('roleManagement.bindSuccess', { count: selectedUserKeys.length }))
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
      message.success(next === ROLE_STATUS.ENABLED ? t('roleManagement.enabled') : t('roleManagement.disabled'))
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  /** 删除 */
  const handleDelete = async (record: RoleItem) => {
    try {
      await deleteRole(record.id)
      message.success(t('common.deleteSuccess'))
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  const columns: TableColumnsType<RoleItem> = [
    { title: t('roleManagement.colName'), dataIndex: 'name', key: 'name', width: 180 },
    { title: t('roleManagement.colDescription'), dataIndex: 'description', key: 'description', ellipsis: true, render: (v: string) => v || '-' },
    {
      title: t('common.colStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (value: number) => (
        value === ROLE_STATUS.ENABLED
          ? <Tag color="success">{t('roleManagement.statusEnabled')}</Tag>
          : <Tag color="default">{t('roleManagement.statusDisabled')}</Tag>
      ),
    },
    {
      title: t('roleManagement.colEmployeeCount'),
      dataIndex: 'userCount',
      key: 'userCount',
      width: 110,
      render: (count: number, record) => (
        <Button type="link" size="small" onClick={() => handleViewUsers(record)}>
          {t('roleManagement.personCount', { count })}
        </Button>
      ),
    },
    {
      title: t('roleManagement.colCreatedAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: string) => (date ? <span style={{ whiteSpace: 'nowrap' }}>{dayjs(date).format('YYYY-MM-DD HH:mm:ss')}</span> : '-'),
    },
    {
      title: t('roleManagement.colUpdatedBy'),
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: t('roleManagement.colUpdatedAt'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (date: string) => (date ? <span style={{ whiteSpace: 'nowrap' }}>{dayjs(date).format('YYYY-MM-DD HH:mm:ss')}</span> : '-'),
    },
    {
      title: t('common.colAction'),
      key: 'action',
      width: 230,
      render: (_, record) => (
        <Space size={4}>
          {hasPermission('role-management:edit') && (
            <Button type="link" size="small" onClick={() => handleEdit(record)}>
              {t('common.edit')}
            </Button>
          )}
          {hasPermission('role-management:edit') && (
            <Button type="link" size="small" onClick={() => handleOpenBind(record)}>
              {t('roleManagement.bindAccount')}
            </Button>
          )}
          {hasPermission('role-management:edit') && (
            <Button type="link" size="small" onClick={() => handleToggleStatus(record)}>
              {record.status === ROLE_STATUS.ENABLED ? t('common.disable') : t('common.enable')}
            </Button>
          )}
          {hasPermission('role-management:delete') && (
            <Popconfirm
              title={t('common.confirmDelete')}
              description={t('roleManagement.confirmDeleteContent', { name: record.name })}
              onConfirm={() => handleDelete(record)}
              okText={t('common.confirm')}
              cancelText={t('common.cancel')}
            >
              <Button type="link" size="small" danger>
                {t('common.delete')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  const userColumns: TableColumnsType<EmployeeItem> = [
    { title: t('roleManagement.colEmpId'), dataIndex: 'empId', key: 'empId', width: 100 },
    { title: t('roleManagement.colEmpName'), dataIndex: 'name', key: 'name', width: 120 },
    { title: t('roleManagement.colUsername'), dataIndex: 'username', key: 'username', width: 120 },
    { title: t('roleManagement.colDepartment'), dataIndex: 'department', key: 'department', width: 120, render: (v: string) => v || '-' },
    {
      title: t('common.colStatus'),
      key: 'status',
      width: 100,
      render: (_, record) => (
        selectedUserKeys.includes(record.id)
          ? <Tag color="green">{t('roleManagement.bound')}</Tag>
          : <Tag color="default">{t('roleManagement.unbound')}</Tag>
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
    { title: t('roleManagement.colEmpId'), dataIndex: 'empId', key: 'empId', width: 100 },
    { title: t('roleManagement.colEmpName'), dataIndex: 'name', key: 'name', width: 120 },
    { title: t('roleManagement.colLoginAccount'), dataIndex: 'username', key: 'username', width: 120 },
    { title: t('roleManagement.colDepartment'), dataIndex: 'department', key: 'department', width: 130, render: (v: string) => v || '-' },
    { title: t('roleManagement.colPosition'), dataIndex: 'position', key: 'position', width: 130, render: (v: string) => v || '-' },
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
          <Form.Item label={t('roleManagement.colName')} name="keyword">
            <Input placeholder={t('roleManagement.nameSearchPlaceholder')} allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label={t('common.colStatus')} name="status">
            <Select placeholder={t('common.all')} allowClear options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                {t('common.search')}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                {t('common.reset')}
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区：仅新增，放右侧 */}
      <div className="action-section">
        <div className="action-section-right">
          {hasPermission('role-management:create') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              {t('common.add')}
            </Button>
          )}
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
          showTotal: (total) => t('common.total', { count: total }),
        }}
      />

      {/* 新增/编辑角色弹窗 */}
      <Modal
        title={editing ? t('roleManagement.editTitle') : t('roleManagement.addTitle')}
        open={editModalVisible}
        onOk={handleSubmit}
        onCancel={() => setEditModalVisible(false)}
        confirmLoading={submitting}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={500}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('roleManagement.nameLabel')}
            rules={[{ required: true, message: t('roleManagement.nameRequired') }]}
          >
            <Input placeholder={t('roleManagement.namePlaceholder')} allowClear />
          </Form.Item>
          <Form.Item name="description" label={t('roleManagement.descLabel')}>
            <TextArea rows={3} placeholder={t('roleManagement.descPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 绑定账号弹窗 */}
      <Modal
        title={t('roleManagement.bindTitle', { name: bindTarget?.name ?? '' })}
        open={bindModalVisible}
        onOk={handleSaveBind}
        onCancel={() => setBindModalVisible(false)}
        confirmLoading={submitting}
        okText={t('roleManagement.bindSaveText', { count: selectedUserKeys.length })}
        cancelText={t('common.cancel')}
        width={800}
        destroyOnClose
      >
        <Input.Search
          placeholder={t('roleManagement.bindSearchPlaceholder')}
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
        title={t('roleManagement.viewTitle', { name: viewTarget?.name ?? '' })}
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
          locale={{ emptyText: t('roleManagement.viewEmptyText') }}
        />
      </Modal>
    </div>
  )
}
