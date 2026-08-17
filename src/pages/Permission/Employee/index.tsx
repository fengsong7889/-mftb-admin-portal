import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, TreeSelect, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ExportOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { useAuth } from '../../../contexts/AuthContext'
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
import { fetchPositions, POSITION_RANK_OPTIONS, POSITION_SEQUENCE_TAG_COLOR } from '../../../api/position'
import type { PositionItem } from '../../../api/position'
import { exportToCSV } from '../../../utils/exportCSV'


/** 员工状态枚举 */
const EMPLOYEE_STATUS = {
  ENABLED: 1,
  DISABLED: 0,
} as const

/** 内置管理员登录账号（工号，禁止停用/删除） */
const BUILTIN_ADMIN = 'MF00001'

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

function buildDeptTreeData(list: DepartmentItem[], getDeptName?: (dept: DepartmentItem) => string): DeptTreeOption[] {
  const nameFn = getDeptName ?? ((d: DepartmentItem) => d.name)
  const nodeMap = new Map<number, DeptTreeOption>()
  list.forEach(dept => {
    nodeMap.set(dept.id, {
      value: dept.id,
      title: nameFn(dept),
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
  const { t, i18n } = useTranslation()

  /** 當前是否非繁中語言 */
  const isNonZh = !i18n.language?.startsWith('zh')

  /** 獲取部門顯示名稱 */
  const getDeptDisplayName = (dept: DepartmentItem) =>
    isNonZh ? (dept.nameEn || dept.name) : dept.name

  /** 獲取職位顯示名稱 */
  const getPositionDisplayName = (pos: PositionItem) =>
    isNonZh ? (pos.nameEn || pos.name) : pos.name

  /** 狀態/序列選項（依賴 t，定義在組件內以便響應語言切換） */
  const STATUS_OPTIONS = [
    { value: EMPLOYEE_STATUS.ENABLED, label: t('employee.statusEnabled') },
    { value: EMPLOYEE_STATUS.DISABLED, label: t('employee.statusDisabled') },
  ]
  const SEQ_LABEL: Record<string, string> = {
    M: 'M(\u7BA1\u7406)',
    T: 'T(\u6280\u8853)',
    P: 'P(\u5C08\u696D)',
  }
  const SEQ_OPTIONS = Object.entries(SEQ_LABEL).map(([value, label]) => ({ value, label }))

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
  // 功能权限校验（菜单 key: employee-management）
  const { hasPermission } = useAuth()
  // 部门列表（新增/编辑时选择所属部门）
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  // 职位列表（新增/编辑时选择职位，带出职级）
  const [positions, setPositions] = useState<PositionItem[]>([])

  // 新增/编辑弹窗
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editing, setEditing] = useState<EmployeeItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<EmployeeFormValues>()
  // 每次打開新增弹窗时递增，强制 Modal 重建以彻底清除表单残留
  const [createFormKey, setCreateFormKey] = useState(0)
  // 监听所选职位，带出对应职级展示
  const watchPositionId = Form.useWatch('positionId', form)
  // 监听所选职级序列，用于过滤职位选项
  const watchSequence = Form.useWatch('sequence', form)

  // 全选
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

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

  const deptTreeData = useMemo(() => buildDeptTreeData(departments, getDeptDisplayName), [departments, isNonZh]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setCreateFormKey(prev => prev + 1)
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
        message.success(t('employee.updateSuccess'))
      } else {
        // 工号即登录账号，由后端按 MF 前缀自增生成
        const created = await createEmployee({
          ...payload,
          password: values.password,
        })
        message.success(t('employee.createSuccess', { empId: created.empId }))
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
      message.success(t('employee.resetPwdSuccess'))
      setPwdModalVisible(false)
    } finally {
      setSubmitting(false)
    }
  }

  /** 启用/停用（带确认弹窗） */
  const handleToggleStatus = (record: EmployeeItem) => {
    const isDisabling = record.status === EMPLOYEE_STATUS.ENABLED
    const action = isDisabling ? t('common.disable') : t('common.enable')
    Modal.confirm({
      title: t('employee.confirmToggle', { action }),
      content: isDisabling
        ? t('employee.disableContent', { name: record.name })
        : t('employee.enableContent', { name: record.name }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: isDisabling },
      onOk: async () => {
        const next = isDisabling ? EMPLOYEE_STATUS.DISABLED : EMPLOYEE_STATUS.ENABLED
        await updateEmployeeStatus(record.id, next)
        message.success(isDisabling ? t('employee.disabled') : t('employee.enabled'))
        fetchList()
      },
    })
  }

  /** 删除 */
  const handleDelete = async (record: EmployeeItem) => {
    await deleteEmployee(record.id)
    message.success(t('employee.deleteSuccess'))
    fetchList()
    fetchRoleList()
  }

  /** 导出当前搜索结果 */
  const handleExport = () => {
    if (dataSource.length === 0) {
      message.warning(t('employee.noDataToExport'))
      return
    }
    const exportColumns = [
      { title: t('employee.colEmpId'), dataIndex: 'empId' },
      { title: t('employee.colName'), dataIndex: 'name' },
      { title: t('employee.colDepartment'), dataIndex: 'department' },
      { title: t('employee.colPositionZh'), dataIndex: 'position' },
      { title: t('employee.colPositionEn'), dataIndex: 'positionEn' },
      { title: t('employee.colSequence'), dataIndex: 'sequence' },
      { title: t('employee.colJobLevel'), dataIndex: 'jobLevel' },
      { title: t('employee.colRank'), dataIndex: 'rank' },
      { title: t('common.colStatus'), dataIndex: 'status', render: (v: number) => v === EMPLOYEE_STATUS.ENABLED ? t('employee.statusEnabled') : t('employee.statusDisabled') },
      { title: t('employee.colUpdatedBy'), dataIndex: 'updatedBy' },
      { title: t('employee.colUpdatedAt'), dataIndex: 'updatedAt' },
    ]
    exportToCSV(t('employee.pageTitle'), exportColumns, dataSource)
  }

  /** 根据角色ID渲染角色名称标签 */
  const renderRoleTags = (roleIds: number[]) => {
    if (!roleIds || roleIds.length === 0) {
      return <span style={{ color: '#8C8C8C' }}>{t('employee.notBound')}</span>
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
    { title: t('employee.colEmpId'), dataIndex: 'empId', key: 'empId', width: 100 },
    { title: t('employee.colName'), dataIndex: 'name', key: 'name', width: 100 },
    { title: t('employee.colDepartment'), dataIndex: 'department', key: 'department', width: 140, render: (v: string) => v || '-' },
    { title: t('employee.colPositionZh'), dataIndex: 'position', key: 'position', width: 140, render: (v: string) => v || '-' },
    { title: t('employee.colPositionEn'), dataIndex: 'positionEn', key: 'positionEn', width: 170, render: (v: string) => v || '-' },
    {
      title: t('employee.colSequence'),
      dataIndex: 'sequence',
      key: 'sequence',
      width: 110,
      render: (v: string) => (
        v ? <Tag color={POSITION_SEQUENCE_TAG_COLOR[v] || 'default'}>{SEQ_LABEL[v] || v}</Tag> : '-'
      ),
    },
    { title: t('employee.colJobLevel'), dataIndex: 'jobLevel', key: 'jobLevel', width: 80, render: (v: string) => v || '-' },
    { title: t('employee.colRank'), dataIndex: 'rank', key: 'rank', width: 70, render: (v: string) => v || '-' },
    {
      title: t('employee.colRoleAuth'),
      dataIndex: 'functionRoleIds',
      key: 'functionRoleIds',
      render: (roleIds: number[]) => renderRoleTags(roleIds),
    },
    {
      title: t('employee.colDeptAuth'),
      dataIndex: 'departmentId',
      key: 'deptPermission',
      width: 110,
      render: (_: unknown, record: EmployeeItem) => {
        if (!record.departmentId) return <span style={{ color: '#8C8C8C' }}>{t('employee.noDept')}</span>
        const dept = departments.find(d => d.id === record.departmentId)
        const hasDeptPerm = dept?.permissions && dept.permissions.length > 0
        return hasDeptPerm
          ? <Tag color="success">{t('employee.authorized')}</Tag>
          : <Tag color="default">{t('employee.unauthorized')}</Tag>
      },
    },
    {
      title: t('common.colStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (value: number) => (
        value === EMPLOYEE_STATUS.ENABLED
          ? <Tag color="success">{t('employee.statusEnabled')}</Tag>
          : <Tag color="default">{t('employee.statusDisabled')}</Tag>
      ),
    },
    {
      title: t('employee.colUpdatedBy'),
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: t('employee.colUpdatedAt'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 165,
      render: (date: string) => (date ? dayjs(date).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: t('common.colAction'),
      key: 'action',
      width: 200,
      render: (_, record) => {
        const isBuiltinAdmin = record.username === BUILTIN_ADMIN
        return (
          <Space size={4}>
            {hasPermission('employee-management:edit') && (
              <Button type="link" size="small" onClick={() => handleEdit(record)}>
                {t('common.edit')}
              </Button>
            )}
            {hasPermission('employee-management:edit') && (
              <Button type="link" size="small" onClick={() => handleOpenResetPwd(record)}>
                {t('employee.resetPassword')}
              </Button>
            )}
            {!isBuiltinAdmin && hasPermission('employee-management:edit') && (
              <Button type="link" size="small" onClick={() => handleToggleStatus(record)}>
                {record.status === EMPLOYEE_STATUS.ENABLED ? t('common.disable') : t('common.enable')}
              </Button>
            )}
            {!isBuiltinAdmin && hasPermission('employee-management:delete') && (
              <Popconfirm
                title={t('common.confirmDelete')}
                description={t('employee.confirmDeleteContent', { name: record.name })}
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
          <Form.Item label={t('employee.searchKeyword')} name="keyword">
            <Input placeholder={t('employee.keywordPlaceholder')} allowClear onPressEnter={handleSearch} />
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

      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>{t('common.export')}</Button>
        </div>
        <div className="action-section-right">
          {hasPermission('employee-management:create') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              {t('common.add')}
            </Button>
          )}
          {configComponent}
        </div>
      </div>

      <Table
        columns={applyConfig(columns)}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
        }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => t('common.total', { count: total }),
          onChange: (p, s) => {
            setPage(s !== pageSize ? 1 : p)
            setPageSize(s)
          },
        }}
      />

      {/* 新增/编辑员工弹窗：createFormKey 变化时强制重建，确保新增时表单无残留数据 */}
      <Modal
        key={editing ? 'edit' : `create-${createFormKey}`}
        title={editing ? t('employee.editTitle') : t('employee.addTitle')}
        open={editModalVisible}
        onOk={handleSubmit}
        onCancel={() => setEditModalVisible(false)}
        confirmLoading={submitting}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={560}
      >
        <Form form={form} layout="vertical" autoComplete="off">
          <Form.Item name="name" label={t('employee.nameLabel')} rules={[{ required: true, message: t('employee.nameRequired') }]}>
            <Input placeholder={t('employee.namePlaceholder')} allowClear autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="empId"
            label={t('employee.empIdLabel')}
            extra={editing ? t('employee.empIdExtraEdit') : t('employee.empIdExtraCreate')}
          >
            <Input placeholder={t('employee.empIdPlaceholder')} disabled />
          </Form.Item>
          {!editing && (
            <Form.Item
              name="password"
              label={t('employee.passwordLabel')}
              rules={[
                { required: true, message: t('employee.passwordRequired') },
                { min: 6, max: 32, message: t('employee.passwordLength') },
              ]}
            >
              <Input.Password placeholder={t('employee.passwordPlaceholder')} autoComplete="new-password" />
            </Form.Item>
          )}
          <Form.Item name="departmentId" label={t('employee.deptLabel')} extra={t('employee.deptExtra')}>
            <TreeSelect
              treeData={deptTreeData}
              placeholder={t('employee.deptPlaceholder')}
              allowClear
              treeDefaultExpandAll
              showSearch
              treeNodeFilterProp="title"
            />
          </Form.Item>
          <Form.Item
            name="sequence"
            label={t('employee.sequenceLabel')}
            extra={t('employee.sequenceExtra')}
          >
            <Select
              placeholder={t('employee.sequencePlaceholder')}
              allowClear
              options={SEQ_OPTIONS}
              onChange={handleSequenceChange}
            />
          </Form.Item>
          <Form.Item
            name="positionId"
            label={t('employee.positionLabel')}
            extra={selectedPosition
              ? t('employee.positionLevelExtra', { level: selectedPosition.jobLevel })
                + (selectedPosition.rank ? t('employee.positionRankExtra', { rank: selectedPosition.rank }) : '')
                + (selectedPosition.nameEn ? t('employee.positionNameEnExtra', { nameEn: selectedPosition.nameEn }) : '')
              : t('employee.positionExtra')}
          >
            <Select
              placeholder={watchSequence ? t('employee.positionPlaceholder') : t('employee.positionPlaceholderSeq')}
              allowClear
              showSearch
              optionFilterProp="label"
              options={filteredPositions.map(p => ({ value: p.id, label: `${getPositionDisplayName(p)}（${p.jobLevel}）` }))}
              onChange={handlePositionChange}
            />
          </Form.Item>
          <Form.Item name="rank" label={t('employee.rankLabel')} extra={watchPositionId ? t('employee.rankAutoExtra') : t('employee.rankConfigExtra')}>
            <Select placeholder={watchPositionId ? t('employee.rankAutoPlaceholder') : t('employee.rankSelectPlaceholder')} disabled={!watchPositionId} allowClear={!watchPositionId} options={availableRankOptions} />
          </Form.Item>
          <Form.Item
            name="functionRoleIds"
            label={t('employee.roleAuthLabel')}
            extra={t('employee.roleAuthExtra')}
          >
            <Select
              mode="multiple"
              placeholder={t('employee.roleAuthPlaceholder')}
              allowClear
              optionFilterProp="label"
              options={roles.map(r => ({ value: r.id, label: r.name, disabled: r.status !== 1 }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 重置密码弹窗 */}
      <Modal
        title={t('employee.resetPwdTitle', { name: pwdTarget?.name ?? '' })}
        open={pwdModalVisible}
        onOk={handleResetPwd}
        onCancel={() => setPwdModalVisible(false)}
        confirmLoading={submitting}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={420}
        destroyOnClose
      >
        <Form form={pwdForm} layout="vertical">
          <Form.Item
            name="password"
            label={t('employee.newPasswordLabel')}
            rules={[
              { required: true, message: t('employee.newPasswordRequired') },
              { min: 6, max: 32, message: t('employee.passwordLength') },
            ]}
          >
            <Input.Password placeholder={t('employee.newPasswordPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
