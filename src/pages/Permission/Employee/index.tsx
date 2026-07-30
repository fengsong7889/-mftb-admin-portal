import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, TreeSelect, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
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
import { fetchPositions, POSITION_RANK_OPTIONS, POSITION_SEQUENCE, POSITION_SEQUENCE_OPTIONS, POSITION_SEQUENCE_TAG_COLOR } from '../../../api/position'
import type { PositionItem } from '../../../api/position'


/** 员工状态枚举 */
const EMPLOYEE_STATUS = {
  ENABLED: 1,
  DISABLED: 0,
} as const

/** 内置管理员登录账号（工号，禁止停用/删除） */
const BUILTIN_ADMIN = 'MF00001'

const statusOptions = [
  { value: EMPLOYEE_STATUS.ENABLED, label: '啟用' },
  { value: EMPLOYEE_STATUS.DISABLED, label: '停用' },
]

/** 新增/编辑表单值（工号由后端自动生成，仅编辑时回显） */
interface EmployeeFormValues {
  password?: string
  name: string
  empId?: string
  departmentId?: number
  /** 职级序列（用于过滤职位，不随表单提交） */
  sequence?: string
  positionId?: number
  /** 职等 R1~R5 */
  rank?: string
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
  // 监听所选职级序列，用于过滤职位选项
  const watchSequence = Form.useWatch('sequence', form)

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
      // 接口异常时角色列表置空
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
      // 接口异常时部门列表置空
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
      // 接口异常时职位列表置空
    }
  }, [])

  useEffect(() => {
    fetchPositionList()
  }, [fetchPositionList])

  const deptTreeData = useMemo(() => buildDeptTreeData(departments), [departments])

  /** 当前所选职位（带出职级与英文名称） */
  const selectedPosition = useMemo(
    () => positions.find(p => p.id === watchPositionId),
    [positions, watchPositionId],
  )

  /** 按所选职级序列过滤职位选项（未选序列时展示全部） */
  const filteredPositions = useMemo(
    () => (watchSequence ? positions.filter(p => p.sequence === watchSequence) : positions),
    [positions, watchSequence],
  )

  /** 职等选项：仅展示职位管理中已配置的职等，未配置的不显示 */
  const availableRankOptions = useMemo(() => {
    const configuredRanks = new Set(positions.map(p => p.rank).filter(Boolean))
    return POSITION_RANK_OPTIONS.filter(opt => configuredRanks.has(opt.value))
  }, [positions])

  /** 切换职级序列时清空已选职位和职等（新序列下原职位失效） */
  const handleSequenceChange = () => {
    form.setFieldValue('positionId', undefined)
    form.setFieldValue('rank', undefined)
  }

  /** 切换职位时自动带出该职位配置的职等 */
  const handlePositionChange = (positionId: number | undefined) => {
    if (positionId != null) {
      const pos = positions.find(p => p.id === positionId)
      form.setFieldValue('rank', pos?.rank ?? undefined)
    } else {
      form.setFieldValue('rank', undefined)
    }
  }

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
      name: record.name,
      empId: record.empId,
      departmentId: record.departmentId ?? undefined,
      // 序列优先取快照，快照缺失时从职位列表反查
      sequence: record.sequence ?? positions.find(p => p.id === record.positionId)?.sequence,
      positionId: record.positionId ?? undefined,
      rank: record.rank ?? undefined,
      functionRoleIds: record.functionRoleIds,
    })
    setEditModalVisible(true)
  }

  /** 提交新增/编辑（工号由后端自动生成，不随表单提交） */
  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload: EmployeePayload = {
      name: values.name.trim(),
      departmentId: values.departmentId ?? null,
      positionId: values.positionId ?? null,
      rank: values.rank ?? null,
      functionRoleIds: values.functionRoleIds ?? [],
    }
    setSubmitting(true)
    try {
      if (editing) {
        await updateEmployee(editing.id, payload)
        message.success('員工信息已更新')
      } else {
        // 工号即登录账号，由后端按 MF 前缀自增生成
        const created = await createEmployee({
          ...payload,
          password: values.password,
        })
        message.success(`員工創建成功，工號/登錄賬號：${created.empId}`)
      }
      setEditModalVisible(false)
      fetchList()
      fetchRoleList()
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
    } finally {
      setSubmitting(false)
    }
  }

  /** 启用/停用 */
  const handleToggleStatus = async (record: EmployeeItem) => {
    const next = record.status === EMPLOYEE_STATUS.ENABLED ? EMPLOYEE_STATUS.DISABLED : EMPLOYEE_STATUS.ENABLED
    await updateEmployeeStatus(record.id, next)
    message.success(next === EMPLOYEE_STATUS.ENABLED ? '已啟用' : '已停用')
    fetchList()
  }

  /** 删除 */
  const handleDelete = async (record: EmployeeItem) => {
    await deleteEmployee(record.id)
    message.success('員工已刪除')
    fetchList()
    fetchRoleList()
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
    { title: '部門', dataIndex: 'department', key: 'department', width: 120, render: (v: string) => v || '-' },
    { title: '職位名稱(中文)', dataIndex: 'position', key: 'position', width: 130, render: (v: string) => v || '-' },
    { title: '職位名稱(英文)', dataIndex: 'positionEn', key: 'positionEn', width: 150, render: (v: string) => v || '-' },
    {
      title: '職級序列',
      dataIndex: 'sequence',
      key: 'sequence',
      width: 110,
      render: (v: string) => (
        v ? <Tag color={POSITION_SEQUENCE_TAG_COLOR[v] || 'default'}>{POSITION_SEQUENCE[v] || v}</Tag> : '-'
      ),
    },
    { title: '職級', dataIndex: 'jobLevel', key: 'jobLevel', width: 90, render: (v: string) => v || '-' },
    { title: '職等', dataIndex: 'rank', key: 'rank', width: 80, render: (v: string) => v || '-' },
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
      title: '最後更新人',
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 110,
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

  /** 列字段配置 */
  const columnMeta = columns.map(col => ({ key: col.key as string, title: col.title as string }))
  const { configComponent, applyConfig } = useColumnConfig('employee-management', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  return (
    <div className="content-area">
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
          {configComponent}
        </div>
      </div>

      <Table
        columns={applyConfig(columns)}
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
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '請輸入姓名' }]}>
            <Input placeholder="請輸入員工姓名" allowClear />
          </Form.Item>
          <Form.Item
            name="empId"
            label="工號"
            extra={editing ? '工號同時作為登錄賬號，不可修改' : '工號由系統自動生成（MF 開頭自增），同時作為登錄賬號'}
          >
            <Input placeholder="保存後由系統自動生成" disabled />
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
            name="sequence"
            label="職級序列"
            extra="選擇序列後自動過濾對應職級的職位"
          >
            <Select
              placeholder="請選擇職級序列"
              allowClear
              options={POSITION_SEQUENCE_OPTIONS}
              onChange={handleSequenceChange}
            />
          </Form.Item>
          <Form.Item
            name="positionId"
            label="職位"
            extra={selectedPosition
              ? `對應職級：${selectedPosition.jobLevel}${selectedPosition.rank ? `，職等：${selectedPosition.rank}` : ''}${selectedPosition.nameEn ? `，英文名稱：${selectedPosition.nameEn}` : ''}`
              : '職位在「職位管理」中維護，選擇後自動帶出對應職級、職等與英文名稱'}
          >
            <Select
              placeholder={watchSequence ? '請選擇職位' : '請先選擇職級序列，或直接選擇職位'}
              allowClear
              showSearch
              optionFilterProp="label"
              options={filteredPositions.map(p => ({ value: p.id, label: `${p.name}（${p.jobLevel}）` }))}
              onChange={handlePositionChange}
            />
          </Form.Item>
          <Form.Item name="rank" label="職等" extra={watchPositionId ? '職等由所選職位自動帶出，不可手動修改' : '僅展示職位管理中已配置的職等'}>
            <Select placeholder={watchPositionId ? '由職位自動帶出' : '請先選擇職位'} disabled={!watchPositionId} allowClear={!watchPositionId} options={availableRankOptions} />
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
