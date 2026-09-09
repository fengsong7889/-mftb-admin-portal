import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, TreeSelect, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ExportOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import dayjs, { Dayjs } from 'dayjs'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { useAuth } from '../../../contexts/AuthContext'
import {
  deleteEmployee,
  fetchEmployees,
  resetEmployeePassword,
  updateEmployeeStatus,
} from '../../../api/employee'
import type { EmployeeItem } from '../../../api/employee'
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

/** 查询表单值 */
interface EmployeeSearchValues {
  keyword?: string
  departmentId?: number
  sequence?: string
  jobLevel?: string
  rank?: string
  roleId?: number
  updatedBy?: string
  /** 最后更新时间范围 */
  updatedAtRange?: [Dayjs, Dayjs] | null
  status?: number
}

/** 平铺部门列表构建 TreeSelect 树数据（默认停用部门不可选，allowDisabled 用于查询区） */
interface DeptTreeOption {
  value: number
  title: string
  disabled?: boolean
  children?: DeptTreeOption[]
}

function buildDeptTreeData(list: DepartmentItem[], getDeptName?: (dept: DepartmentItem) => string, allowDisabled?: boolean): DeptTreeOption[] {
  const nameFn = getDeptName ?? ((d: DepartmentItem) => d.name)
  const nodeMap = new Map<number, DeptTreeOption>()
  list.forEach(dept => {
    nodeMap.set(dept.id, {
      value: dept.id,
      title: nameFn(dept),
      disabled: !allowDisabled && dept.status !== DEPT_STATUS.ENABLED,
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
  const navigate = useNavigate()

  /** 當前是否非繁中語言 */
  const isNonZh = !i18n.language?.startsWith('zh')

  /** 獲取部門顯示名稱 */
  const getDeptDisplayName = (dept: DepartmentItem) =>
    isNonZh ? (dept.nameEn || dept.name) : dept.name

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
  // 扩展筛选条件（所属部门/职级序列/职级/职等/角色授权/最后更新人/最后更新时间）
  const [deptFilter, setDeptFilter] = useState<number>()
  const [sequenceFilter, setSequenceFilter] = useState<string>()
  const [jobLevelFilter, setJobLevelFilter] = useState<string>()
  const [rankFilter, setRankFilter] = useState<string>()
  const [roleIdFilter, setRoleIdFilter] = useState<number>()
  const [updatedByFilter, setUpdatedByFilter] = useState<string>()
  const [updatedAtRange, setUpdatedAtRange] = useState<[string, string] | null>(null)
  const [searchForm] = Form.useForm()

  // 功能角色列表（查询筛选与列表展示）
  const [roles, setRoles] = useState<RoleItem[]>([])
  // 功能权限校验（菜单 key: employee-management）
  const { hasPermission } = useAuth()
  // 部门列表（查询筛选）
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  // 职位列表（查询筛选职级/职等选项）
  const [positions, setPositions] = useState<PositionItem[]>([])

  // 提交中（重置密码弹窗）
  const [submitting, setSubmitting] = useState(false)

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

  /** 查询区所属部门树（含停用部门，查询不应限制停用部门的员工） */
  const searchDeptTreeData = useMemo(() => buildDeptTreeData(departments, getDeptDisplayName, true), [departments, isNonZh]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 搜索区所选职级序列（用于联动过滤职级选项） */
  const searchSequence = Form.useWatch('sequence', searchForm)

  /** 搜索区职级选项：跟随职级序列过滤，取职位管理中已配置的职级 */
  const searchJobLevelOptions = useMemo(() => {
    const pool = searchSequence ? positions.filter(p => p.sequence === searchSequence) : positions
    return [...new Set(pool.map(p => p.jobLevel).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [positions, searchSequence])

  /** 职等选项：仅展示职位管理中已配置的职等，未配置的不显示 */
  const availableRankOptions = useMemo(() => {
    const configuredRanks = new Set(positions.map(p => p.rank).filter(Boolean))
    return POSITION_RANK_OPTIONS.filter(opt => configuredRanks.has(opt.value))
  }, [positions])

  /** 查询 */
  const handleSearch = () => {
    const values = searchForm.getFieldsValue() as EmployeeSearchValues
    setKeyword(values.keyword?.trim() || undefined)
    setStatus(values.status)
    setDeptFilter(values.departmentId)
    setSequenceFilter(values.sequence)
    setJobLevelFilter(values.jobLevel)
    setRankFilter(values.rank)
    setRoleIdFilter(values.roleId)
    setUpdatedByFilter(values.updatedBy?.trim() || undefined)
    if (values.updatedAtRange && values.updatedAtRange.length === 2) {
      setUpdatedAtRange([values.updatedAtRange[0].format('YYYY-MM-DD'), values.updatedAtRange[1].format('YYYY-MM-DD')])
    } else {
      setUpdatedAtRange(null)
    }
    setPage(1)
  }

  /** 重置 */
  const handleReset = () => {
    searchForm.resetFields()
    setKeyword(undefined)
    setStatus(undefined)
    setDeptFilter(undefined)
    setSequenceFilter(undefined)
    setJobLevelFilter(undefined)
    setRankFilter(undefined)
    setRoleIdFilter(undefined)
    setUpdatedByFilter(undefined)
    setUpdatedAtRange(null)
    setPage(1)
  }

  /** 所属部门及其全部子孙部门 id（查询父部门时同时匹配下级部门员工） */
  const deptDescendantIds = useMemo(() => {
    if (deptFilter == null) return undefined
    const childMap = new Map<number, number[]>()
    departments.forEach(d => {
      if (d.parentId != null) {
        const arr = childMap.get(d.parentId) ?? []
        arr.push(d.id)
        childMap.set(d.parentId, arr)
      }
    })
    const ids = new Set<number>([deptFilter])
    const stack = [deptFilter]
    while (stack.length > 0) {
      const cur = stack.pop()!
      for (const child of childMap.get(cur) ?? []) {
        if (!ids.has(child)) {
          ids.add(child)
          stack.push(child)
        }
      }
    }
    return Array.from(ids)
  }, [deptFilter, departments])

  /** 扩展筛选条件的前端过滤（后端 /employees 接口扩展前先在当前页数据上过滤） */
  const filteredData = useMemo(() => {
    let data = dataSource
    if (deptDescendantIds) data = data.filter(e => e.departmentId != null && deptDescendantIds.includes(e.departmentId))
    if (sequenceFilter) data = data.filter(e => e.sequence === sequenceFilter)
    if (jobLevelFilter) data = data.filter(e => e.jobLevel === jobLevelFilter)
    if (rankFilter) data = data.filter(e => e.rank === rankFilter)
    if (roleIdFilter != null) data = data.filter(e => e.functionRoleIds?.includes(roleIdFilter))
    if (updatedByFilter) {
      const kw = updatedByFilter.toLowerCase()
      data = data.filter(e => (e.updatedBy ?? '').toLowerCase().includes(kw))
    }
    if (updatedAtRange) {
      const [start, end] = updatedAtRange
      data = data.filter(item => {
        if (!item.updatedAt) return false
        const d = dayjs(item.updatedAt)
        return !d.isBefore(dayjs(start), 'day') && !d.isAfter(dayjs(end), 'day')
      })
    }
    return data
  }, [dataSource, deptDescendantIds, sequenceFilter, jobLevelFilter, rankFilter, roleIdFilter, updatedByFilter, updatedAtRange])

  /** 新增员工 → 跳转独立详情页（新增模式） */
  const handleCreate = () => {
    navigate('/employee-detail')
  }

  /** 编辑员工 → 跳转独立详情页 */
  const handleEdit = (record: EmployeeItem) => {
    navigate(`/employee-detail?id=${record.id}`)
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
    if (filteredData.length === 0) {
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
    exportToCSV(t('employee.pageTitle'), exportColumns, filteredData)
  }

  /** 根据角色ID渲染角色名称标签（单行展示，禁止换行） */
  const renderRoleTags = (roleIds: number[]) => {
    if (!roleIds || roleIds.length === 0) {
      return <span style={{ color: '#8C8C8C' }}>{t('employee.notBound')}</span>
    }
    return (
      <Space size={4} style={{ whiteSpace: 'nowrap' }}>
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
      width: 200,
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
      render: (_: unknown, record: EmployeeItem) => (
        <Switch
          checked={record.status === EMPLOYEE_STATUS.ENABLED}
          checkedChildren={t('employee.statusEnabled')}
          unCheckedChildren={t('employee.statusDisabled')}
          onChange={() => handleToggleStatus(record)}
        />
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
      width: 180,
      render: (date: string) => (date ? <span style={{ whiteSpace: 'nowrap' }}>{dayjs(date).format('YYYY-MM-DD HH:mm:ss')}</span> : '-'),
    },
    {
      title: t('common.colAction'),
      key: 'action',
      width: 160,
      render: (_, record) => {
        const isBuiltinAdmin = record.username === BUILTIN_ADMIN
        return (
          <Space size={0} split={<span className="action-split">|</span>}>
            {hasPermission('employee-management:edit') && (
              <Button type="link" size="small" onClick={() => handleEdit(record)}>
                詳情
              </Button>
            )}
            {hasPermission('employee-management:edit') && (
              <Button type="link" size="small" onClick={() => handleOpenResetPwd(record)}>
                {t('employee.resetPassword')}
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
          <Form.Item label={t('employee.deptLabel')} name="departmentId">
            <TreeSelect
              treeData={searchDeptTreeData}
              placeholder={t('common.all')}
              allowClear
              treeDefaultExpandAll
              showSearch
              treeNodeFilterProp="title"
            />
          </Form.Item>
          <Form.Item label={t('employee.colSequence')} name="sequence">
            <Select
              placeholder={t('common.all')}
              allowClear
              options={SEQ_OPTIONS}
              onChange={() => searchForm.setFieldValue('jobLevel', undefined)}
            />
          </Form.Item>
          <Form.Item label={t('employee.colJobLevel')} name="jobLevel">
            <Select placeholder={t('common.all')} allowClear options={searchJobLevelOptions.map(v => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item label={t('employee.colRank')} name="rank">
            <Select placeholder={t('common.all')} allowClear options={availableRankOptions} />
          </Form.Item>
          <Form.Item label={t('employee.roleAuthLabel')} name="roleId">
            <Select
              placeholder={t('common.all')}
              allowClear
              showSearch
              optionFilterProp="label"
              options={roles.map(r => ({ value: r.id, label: r.name }))}
            />
          </Form.Item>
          <Form.Item label={t('common.colStatus')} name="status">
            <Select placeholder={t('common.all')} allowClear options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item label={t('employee.colUpdatedBy')} name="updatedBy">
            <Input placeholder={t('employee.searchUpdatedByPh')} allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label={t('employee.colUpdatedAt')} name="updatedAtRange">
            <DatePicker.RangePicker style={{ width: '100%' }} allowClear />
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
        className="nowrap-table"
        columns={applyConfig(columns)}
        dataSource={filteredData}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
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
