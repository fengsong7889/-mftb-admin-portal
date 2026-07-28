import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, TreeSelect, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import {
  createEmployee,
  deleteEmployee,
  fetchEmployees,
  resetEmployeePassword,
  updateEmployee,
  updateEmployeeStatus,
} from '../../../api/employee'
import type { EmployeeItem, EmployeePayload } from '../../../api/employee'
import { fetchRoles } from '../../../api/role'
import type { RoleItem } from '../../../api/role'
import { DEPT_STATUS, fetchDepartments } from '../../../api/department'
import type { DepartmentItem } from '../../../api/department'
import { fetchPositions } from '../../../api/position'
import type { PositionItem } from '../../../api/position'

/** 员工状态枚举 */
const EMPLOYEE_STATUS = {
  ENABLED: 1,
  DISABLED: 0,
} as const

/** 内置管理员账号（禁止停用/删除） */
const BUILTIN_ADMIN = 'admin'

const statusOptions = [
  { value: EMPLOYEE_STATUS.ENABLED, label: '啟用' },
  { value: EMPLOYEE_STATUS.DISABLED, label: '停用' },
]

/** 新增/编辑表单值 */
interface EmployeeFormValues {
  username: string
  password?: string
  name: string
  empId: string
  departmentId?: number
  positionId?: number
  functionRoleIds?: number[]
}

/** 平铺部门列表构建 TreeSelect 树数据（停用部门不可选） */
interface DeptTreeOption {
  value: number
  title: string
  disabled?: boolean
  children?: DeptTreeOption[]
}

function buildDeptTreeData(list: DepartmentItem[]): DeptTreeOption[] {
  const nodeMap = new Map<number, DeptTreeOption>()
  list.forEach(dept => {
    nodeMap.set(dept.id, {
      value: dept.id,
      title: dept.name,
      disabled: dept.status !== DEPT_STATUS.ENABLED,
      children: [],
    })
  })
  const roots: DeptTreeOption[] = []
  list.forEach(dept => {
    const node = nodeMap.get(dept.id)!
    const parent = dept.parentId ? nodeMap.get(dept.parentId) : undefined
    if (parent) {
      parent.children!.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

export default function EmployeeManagement() {
  const [dataSource, setDataSource] = useState<EmployeeItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  // 查询条件（点击查询后生效）
  const [keyword, setKeyword] = useState<string>()
  const [status, setStatus] = useState<number>()
  const [searchForm] = Form.useForm()

  // 功能角色列表（新增/编辑时下拉选择）
  const [roles, setRoles] = useState<RoleItem[]>([])
  // 部门列表（新增/编辑时选择所属部门）
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  // 职位列表（新增/编辑时选择职位，带出职级）
  const [positions, setPositions] = useState<PositionItem[]>([])

  // 新增/编辑弹窗
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editing, setEditing] = useState<EmployeeItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<EmployeeFormValues>()
  // 监听所选职位，带出对应职级展示
  const watchPositionId = Form.useWatch('positionId', form)

  // 重置密码弹窗
  const [pwdModalVisible, setPwdModalVisible] = useState(false)
  const [pwdTarget, setPwdTarget] = useState<EmployeeItem | null>(null)
  const [pwdForm] = Form.useForm<{ password: string }>()

  /** 加载员工列表 */
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchEmployees({ page, size: pageSize, keyword, status })
      setDataSource(result.records)
      setTotal(result.total)
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, status])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  /** 加载功能角色（用于绑定下拉与列表展示） */
  const fetchRoleList = useCallback(async () => {
    try {
      const list = await fetchRoles()
      setRoles(list)
    } catch {
      // 错误提示由请求层统一处理
    }
  }, [])

  useEffect(() => {
    fetchRoleList()
  }, [fetchRoleList])

  /** 加载部门列表（用于所属部门下拉） */
  const fetchDeptList = useCallback(async () => {
    try {
      const list = await fetchDepartments()
      setDepartments(list)
    } catch {
      // 错误提示由请求层统一处理
    }
  }, [])

  useEffect(() => {
    fetchDeptList()
  }, [fetchDeptList])

  /** 加载职位列表（用于职位下拉，选择后带出职级） */
  const fetchPositionList = useCallback(async () => {
    try {
      const list = await fetchPositions()
      setPositions(list)
    } catch {
      // 错误提示由请求层统一处理
    }
  }, [])

  useEffect(() => {
    fetchPositionList()
  }, [fetchPositionList])

  const deptTreeData = useMemo(() => buildDeptTreeData(departments), [departments])

  /** 当前所选职位带出的职级 */
  const selectedJobLevel = useMemo(
    () => positions.find(p => p.id === watchPositionId)?.jobLevel,
    [positions, watchPositionId],
  )

  /** 查询 */
  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    setKeyword(values.keyword?.trim() || undefined)
    setStatus(values.status)
    setPage(1)
  }

  /** 重置 */
  const handleReset = () => {
    searchForm.resetFields()
    setKeyword(undefined)
    setStatus(undefined)
    setPage(1)
  }

  /** 新增员工 */
  const handleCreate = () => {
    setEditing(null)
    form.resetFields()
    setEditModalVisible(true)
  }

  /** 编辑员工 */
  const handleEdit = (record: EmployeeItem) => {
    setEditing(record)
    form.setFieldsValue({
      username: record.username,
      name: record.name,
      empId: record.empId,
      departmentId: record.departmentId ?? undefined,
      positionId: record.positionId ?? undefined,
      functionRoleIds: record.functionRoleIds,
    })
    setEditModalVisible(true)
  }

  /** 提交新增/编辑 */
  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload: EmployeePayload = {
      name: values.name.trim(),
      empId: values.empId.trim(),
      departmentId: values.departmentId ?? null,
      positionId: values.positionId ?? null,
      functionRoleIds: values.functionRoleIds ?? [],
    }
    setSubmitting(true)
    try {
      if (editing) {
        await updateEmployee(editing.id, payload)
        message.success('員工信息已更新')
      } else {
        await createEmployee({
          ...payload,
          username: values.username.trim(),
          password: values.password,
        })
        message.success('員工創建成功，可使用該賬號登錄')
      }
      setEditModalVisible(false)
      fetchList()
      fetchRoleList()
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setSubmitting(false)
    }
  }

  /** 打开重置密码弹窗 */
  const handleOpenResetPwd = (record: EmployeeItem) => {
    setPwdTarget(record)
    pwdForm.resetFields()
    setPwdModalVisible(true)
  }

  /** 提交重置密码 */
  const handleResetPwd = async () => {
    if (!pwdTarget) return
    const values = await pwdForm.validateFields()
    setSubmitting(true)
    try {
      await resetEmployeePassword(pwdTarget.id, values.password)
      message.success('密碼已重置')
      setPwdModalVisible(false)
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setSubmitting(false)
    }
  }

  /** 启用/停用 */
  const handleToggleStatus = async (record: EmployeeItem) => {
    const next = record.status === EMPLOYEE_STATUS.ENABLED ? EMPLOYEE_STATUS.DISABLED : EMPLOYEE_STATUS.ENABLED
    try {
      await updateEmployeeStatus(record.id, next)
      message.success(next === EMPLOYEE_STATUS.ENABLED ? '已啟用' : '已停用')
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  /** 删除 */
  const handleDelete = async (record: EmployeeItem) => {
    try {
      await deleteEmployee(record.id)
      message.success('員工已刪除')
      fetchList()
      fetchRoleList()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  /** 根据角色ID渲染角色名称标签 */
  const renderRoleTags = (roleIds: number[]) => {
    if (!roleIds || roleIds.length === 0) {
      return <span style={{ color: '#8C8C8C' }}>未綁定</span>
    }
    return (
      <Space size={4} wrap>
        {roleIds.map(id => {
          const role = roles.find(r => r.id === id)
          return <Tag key={id} color="blue">{role ? role.name : `角色#${id}`}</Tag>
        })}
      </Space>
    )
  }

  const columns: TableColumnsType<EmployeeItem> = [
    { title: '工號', dataIndex: 'empId', key: 'empId', width: 110 },
    { title: '姓名', dataIndex: 'name', key: 'name', width: 120 },
    { title: '登錄賬號', dataIndex: 'username', key: 'username', width: 130 },
    { title: '部門', dataIndex: 'department', key: 'department', width: 120, render: (v: string) => v || '-' },
    { title: '職位', dataIndex: 'position', key: 'position', width: 130, render: (v: string) => v || '-' },
    { title: '職級', dataIndex: 'jobLevel', key: 'jobLevel', width: 90, render: (v: string) => v || '-' },
    {
      title: '功能角色',
      dataIndex: 'functionRoleIds',
      key: 'functionRoleIds',
      render: (roleIds: number[]) => renderRoleTags(roleIds),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (value: number) => (
        value === EMPLOYEE_STATUS.ENABLED
          ? <Tag color="success">啟用</Tag>
          : <Tag color="warning">停用</Tag>
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
      title: '操作',
      key: 'action',
      width: 240,
      render: (_, record) => {
        const isBuiltinAdmin = record.username === BUILTIN_ADMIN
        return (
          <Space size={4}>
            <Button type="link" size="small" onClick={() => handleEdit(record)}>
              編輯
            </Button>
            <Button type="link" size="small" onClick={() => handleOpenResetPwd(record)}>
              重置密碼
            </Button>
            {!isBuiltinAdmin && (
              <Button type="link" size="small" onClick={() => handleToggleStatus(record)}>
                {record.status === EMPLOYEE_STATUS.ENABLED ? '停用' : '啟用'}
              </Button>
            )}
            {!isBuiltinAdmin && (
              <Popconfirm
                title="確認刪除"
                description={`確定要刪除員工「${record.name}」嗎？`}
                onConfirm={() => handleDelete(record)}
                okText="確認"
                cancelText="取消"
              >
                <Button type="link" size="small" danger>
                  刪除
                </Button>
              </Popconfirm>
            )}
          </Space>
        )
      },
    },
  ]

  return (
    <div>
      {/* 搜索区 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label="關鍵詞" name="keyword">
            <Input placeholder="請輸入賬號/姓名/工號" allowClear onPressEnter={handleSearch} />
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
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 條數據`,
          onChange: (p, s) => {
            setPage(s !== pageSize ? 1 : p)
            setPageSize(s)
          },
        }}
      />

      {/* 新增/编辑员工弹窗 */}
      <Modal
        title={editing ? '編輯員工' : '新增員工'}
        open={editModalVisible}
        onOk={handleSubmit}
        onCancel={() => setEditModalVisible(false)}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="username"
            label="登錄賬號"
            rules={[
              { required: true, message: '請輸入登錄賬號' },
              { pattern: /^[a-zA-Z0-9_]{3,20}$/, message: '3-20位字母/數字/下劃線' },
            ]}
          >
            <Input placeholder="員工登錄系統使用的賬號" disabled={!!editing} allowClear />
          </Form.Item>
          {!editing && (
            <Form.Item
              name="password"
              label="登錄密碼"
              rules={[
                { required: true, message: '請輸入登錄密碼' },
                { min: 6, max: 32, message: '密碼長度為6-32位' },
              ]}
            >
              <Input.Password placeholder="請輸入初始登錄密碼" />
            </Form.Item>
          )}
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '請輸入姓名' }]}>
            <Input placeholder="請輸入員工姓名" allowClear />
          </Form.Item>
          <Form.Item name="empId" label="工號" rules={[{ required: true, message: '請輸入工號' }]}>
            <Input placeholder="例如：EMP1001" allowClear />
          </Form.Item>
          <Form.Item name="departmentId" label="所屬部門" extra="部門在「組織管理」中維護，加入部門後自動獲得部門授權的菜單權限">
            <TreeSelect
              treeData={deptTreeData}
              placeholder="請選擇所屬部門"
              allowClear
              treeDefaultExpandAll
              showSearch
              treeNodeFilterProp="title"
            />
          </Form.Item>
          <Form.Item
            name="positionId"
            label="職位"
            extra={selectedJobLevel ? `對應職級：${selectedJobLevel}` : '職位在「職位管理」中維護，選擇後自動帶出對應職級'}
          >
            <Select
              placeholder="請選擇職位"
              allowClear
              showSearch
              optionFilterProp="label"
              options={positions.map(p => ({ value: p.id, label: `${p.name}（${p.jobLevel}）` }))}
            />
          </Form.Item>
          <Form.Item
            name="functionRoleIds"
            label="功能角色"
            extra="綁定後員工按角色的菜單權限訪問系統，可稍後在「功能授權」中配置"
          >
            <Select
              mode="multiple"
              placeholder="請選擇功能角色（可多選）"
              allowClear
              optionFilterProp="label"
              options={roles.map(r => ({ value: r.id, label: r.name, disabled: r.status !== 1 }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 重置密码弹窗 */}
      <Modal
        title={`重置密碼 - ${pwdTarget?.name ?? ''}`}
        open={pwdModalVisible}
        onOk={handleResetPwd}
        onCancel={() => setPwdModalVisible(false)}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        width={420}
        destroyOnClose
      >
        <Form form={pwdForm} layout="vertical">
          <Form.Item
            name="password"
            label="新密碼"
            rules={[
              { required: true, message: '請輸入新密碼' },
              { min: 6, max: 32, message: '密碼長度為6-32位' },
            ]}
          >
            <Input.Password placeholder="請輸入新密碼" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
