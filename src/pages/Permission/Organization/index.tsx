import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Tree, TreeSelect, message } from 'antd'
import type { TableColumnsType, TreeDataNode } from 'antd'
import { ApartmentOutlined, ExportOutlined, FolderOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, TeamOutlined, TranslationOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { useAuth } from '../../../contexts/AuthContext'
import {
  DEPT_STATUS,
  createDepartment,
  deleteDepartment,
  fetchDepartments,
  updateDepartment,
  updateDepartmentStatus,
} from '../../../api/department'
import type { DepartmentItem, DepartmentPayload } from '../../../api/department'
import { fetchEmployees } from '../../../api/employee'
import type { EmployeeItem } from '../../../api/employee'
import { exportToCSV } from '../../../utils/exportCSV'
import { translateText } from '../../../api/translation'
import './index.css'

/** 新增/编辑表单值 */
interface DepartmentFormValues {
  parentId?: number
  name: string
  nameEn?: string
  leader?: string
  sort?: number
}

/** 树节点（带业务数据） */
interface DeptTreeNode extends TreeDataNode {
  key: number
  children?: DeptTreeNode[]
}

/** 平铺部门列表构建 antd 树数据 */
function buildTreeData(list: DepartmentItem[], excludeId?: number): DeptTreeNode[] {
  const nodeMap = new Map<number, DeptTreeNode>()
  list.forEach(dept => {
    nodeMap.set(dept.id, { key: dept.id, title: dept.name, value: dept.id, children: [] } as DeptTreeNode)
  })
  const roots: DeptTreeNode[] = []
  list.forEach(dept => {
    const node = nodeMap.get(dept.id)!
    const parent = dept.parentId ? nodeMap.get(dept.parentId) : undefined
    if (parent) {
      parent.children!.push(node)
    } else {
      roots.push(node)
    }
  })
  // 编辑部门时，上级部门下拉需排除自身及其所有下级（防止成环）
  if (excludeId != null) {
    const prune = (nodes: DeptTreeNode[]): DeptTreeNode[] =>
      nodes.filter(n => n.key !== excludeId).map(n => ({ ...n, children: n.children ? prune(n.children) : [] }))
    return prune(roots)
  }
  return roots
}

/** 收集某部门自身及所有后代 id */
function collectDescendantIds(list: DepartmentItem[], rootId: number): Set<number> {
  const childrenMap = new Map<number, number[]>()
  list.forEach(dept => {
    if (dept.parentId != null) {
      const arr = childrenMap.get(dept.parentId) ?? []
      arr.push(dept.id)
      childrenMap.set(dept.parentId, arr)
    }
  })
  const result = new Set<number>([rootId])
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const childId of childrenMap.get(current) ?? []) {
      if (!result.has(childId)) {
        result.add(childId)
        queue.push(childId)
      }
    }
  }
  return result
}

export default function OrganizationManagement() {
  const { t, i18n } = useTranslation()

  /** 當前是否非繁中語言（用於顯示英文名稱） */
  const isNonZh = !i18n.language?.startsWith('zh')

  /** 獲取部門顯示名稱：非繁中時取英文名，無則回退中文名 */
  const getDeptDisplayName = (dept: DepartmentItem) =>
    isNonZh ? (dept.nameEn || dept.name) : dept.name

  /** 狀態選項（依賴 t，定義在組件內以便響應語言切換） */
  const STATUS_OPTIONS = [
    { value: DEPT_STATUS.ENABLED, label: t('organization.statusValid') },
    { value: DEPT_STATUS.DISABLED, label: t('organization.statusInvalid') },
  ]

  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const [loading, setLoading] = useState(false)
  // 左侧树选中的部门（过滤右侧表格）
  const [selectedDeptId, setSelectedDeptId] = useState<number>()
  // 查询条件（点击查询后生效）
  const [keyword, setKeyword] = useState<string>()
  const [leaderKeyword, setLeaderKeyword] = useState<string>()
  const [status, setStatus] = useState<number>()
  const [searchForm] = Form.useForm()

  // 新增/编辑弹窗
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editing, setEditing] = useState<DepartmentItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<DepartmentFormValues>()
  // 功能权限校验（菜单 key: organization-management）
  const { hasPermission } = useAuth()
  // 全选
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  // 树展开节点（受控：数据加载后默认仅展开根节点）
  const [expandedKeys, setExpandedKeys] = useState<number[]>([])

  // 员工列表（部門對接人下拉選擇）
  const [employees, setEmployees] = useState<EmployeeItem[]>([])

  /** 加载员工列表（用于部门对接人下拉） */
  const fetchEmployeeList = useCallback(async () => {
    try {
      const result = await fetchEmployees({ page: 1, size: 1000 })
      setEmployees(result.records)
    } catch {
      // 接口异常时员工列表置空
    }
  }, [])

  /** 加载部门列表（平铺） */
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchDepartments()
      setDepartments(list)
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  /** 左侧组织架构树数据（語言切換時使用對應語言名稱） */
  const treeData = useMemo(() => {
    const nodeMap = new Map<number, DeptTreeNode>()
    departments.forEach(dept => {
      nodeMap.set(dept.id, { key: dept.id, title: getDeptDisplayName(dept), value: dept.id, children: [] } as DeptTreeNode)
    })
    const roots: DeptTreeNode[] = []
    departments.forEach(dept => {
      const node = nodeMap.get(dept.id)!
      const parent = dept.parentId ? nodeMap.get(dept.parentId) : undefined
      if (parent) {
        parent.children!.push(node)
      } else {
        roots.push(node)
      }
    })
    return roots
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departments, isNonZh])

  /** 数据加载完成后，默认仅展开根节点（MFTB集团），其它部门折叠 */
  useEffect(() => {
    if (treeData.length > 0 && expandedKeys.length === 0) {
      setExpandedKeys(treeData.map(node => node.key))
    }
  }, [treeData]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 树节点元数据：层级（决定图标）+ 在编人数（徽章） */
  const deptMetaMap = useMemo(() => {
    const byId = new Map(departments.map(dept => [dept.id, dept]))
    const map = new Map<number, { level: number; count?: number }>()
    departments.forEach(dept => {
      let level = 0
      let parentId = dept.parentId
      while (parentId != null && byId.has(parentId)) {
        level += 1
        parentId = byId.get(parentId)!.parentId
      }
      map.set(dept.id, { level, count: dept.userCount })
    })
    return map
  }, [departments])

  /** 树节点渲染：层级图标 + 单行省略名称 + 人数徽章 */
  const renderTreeTitle = (node: TreeDataNode) => {
    const meta = deptMetaMap.get(node.key as number)
    const name = String(node.title)
    const icon = meta?.level === 0
      ? <ApartmentOutlined className="org-tree-node-icon org-tree-node-icon-root" />
      : meta?.level === 1
        ? <FolderOutlined className="org-tree-node-icon org-tree-node-icon-branch" />
        : <TeamOutlined className="org-tree-node-icon org-tree-node-icon-leaf" />
    return (
      <span className="org-tree-node" title={name}>
        {icon}
        <span className="org-tree-node-name">{name}</span>
        {meta?.count != null && meta.count > 0 && (
          <span className="org-tree-node-count">{meta.count}</span>
        )}
      </span>
    )
  }

  /** 表格数据：按树选中节点 + 搜索条件过滤 */
  const tableData = useMemo(() => {
    let list = departments
    if (selectedDeptId != null) {
      const scope = collectDescendantIds(departments, selectedDeptId)
      list = list.filter(dept => scope.has(dept.id))
    }
    if (keyword) {
      const kw = keyword.toLowerCase()
      list = list.filter(dept => dept.name.toLowerCase().includes(kw) || (dept.nameEn ?? '').toLowerCase().includes(kw) || dept.code.toLowerCase().includes(kw))
    }
    if (leaderKeyword) {
      const kw = leaderKeyword.toLowerCase()
      list = list.filter(dept => (dept.leader ?? '').toLowerCase().includes(kw))
    }
    if (status !== undefined) {
      list = list.filter(dept => dept.status === status)
    }
    return list
  }, [departments, selectedDeptId, keyword, leaderKeyword, status])

  /** 查询 */
  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    setKeyword(values.keyword?.trim() || undefined)
    setLeaderKeyword(values.leader?.trim() || undefined)
    setStatus(values.status)
  }

  /** 重置 */
  const handleReset = () => {
    searchForm.resetFields()
    setKeyword(undefined)
    setLeaderKeyword(undefined)
    setStatus(undefined)
  }

  /** 新增部门（默认上级为当前树选中节点） */
  const handleCreate = () => {
    setEditing(null)
    form.resetFields()
    if (selectedDeptId != null) {
      form.setFieldsValue({ parentId: selectedDeptId })
    }
    fetchEmployeeList()
    setEditModalVisible(true)
  }

  /** 编辑部门 */
  const handleEdit = (record: DepartmentItem) => {
    setEditing(record)
    form.setFieldsValue({
      parentId: record.parentId ?? undefined,
      name: record.name,
      nameEn: record.nameEn,
      leader: record.leader,
      sort: record.sort,
    })
    fetchEmployeeList()
    setEditModalVisible(true)
  }

  /** 提交新增/编辑 */
  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload: DepartmentPayload = {
      name: values.name.trim(),
      nameEn: values.nameEn?.trim(),
      parentId: values.parentId ?? null,
      leader: values.leader?.trim(),
      sort: values.sort,
    }
    setSubmitting(true)
    try {
      if (editing) {
        await updateDepartment(editing.id, payload)
        message.success(t('organization.updateSuccess'))
      } else {
        await createDepartment(payload)
        message.success(t('organization.createSuccess'))
      }
      setEditModalVisible(false)
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setSubmitting(false)
    }
  }

  /** 停用/启用（带确认弹窗） */
  const handleToggleStatus = (record: DepartmentItem) => {
    const isEnable = record.status === DEPT_STATUS.DISABLED
    Modal.confirm({
      title: isEnable ? t('organization.confirmEnableTitle') : t('organization.confirmDisableTitle'),
      content: isEnable
        ? t('organization.confirmEnableContent', { name: record.name })
        : t('organization.confirmDisableContent', { name: record.name }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        const next = isEnable ? DEPT_STATUS.ENABLED : DEPT_STATUS.DISABLED
        try {
          await updateDepartmentStatus(record.id, next)
          message.success(next === DEPT_STATUS.ENABLED ? t('organization.enabled') : t('organization.disabled'))
          fetchList()
        } catch {
          // 错误提示由请求层统一处理
        }
      },
    })
  }

  /** 删除 */
  const handleDelete = async (record: DepartmentItem) => {
    try {
      await deleteDepartment(record.id)
      message.success(t('common.deleteSuccess'))
      if (selectedDeptId === record.id) {
        setSelectedDeptId(undefined)
      }
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  /** 导出当前过滤后的列表数据 */
  const handleExport = () => {
    if (tableData.length === 0) {
      message.warning(t('organization.noDataToExport'))
      return
    }
    const exportColumns = [
      { title: t('organization.colDeptStatus'), dataIndex: 'status', render: (v: number) => v === DEPT_STATUS.ENABLED ? t('organization.statusValid') : t('organization.statusInvalid') },
      { title: t('organization.colDeptCode'), dataIndex: 'code' },
      { title: t('organization.colDeptName'), dataIndex: 'name' },
      { title: t('organization.colDeptNameEn'), dataIndex: 'nameEn' },
      { title: t('organization.colLeader'), dataIndex: 'leader' },
      { title: t('organization.colParentDept'), dataIndex: 'parentName' },
      { title: t('organization.colUserCount'), dataIndex: 'userCount' },
    ]
    exportToCSV(t('organization.pageTitle'), exportColumns, tableData)
  }

  const columns: TableColumnsType<DepartmentItem> = [
    {
      title: t('organization.colDeptStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (value: number) => (
        value === DEPT_STATUS.ENABLED
          ? <Tag color="success">{t('organization.statusValid')}</Tag>
          : <Tag color="error">{t('organization.statusInvalid')}</Tag>
      ),
    },
    { title: t('organization.colDeptCode'), dataIndex: 'code', key: 'code', width: 140 },
    { title: t('organization.colDeptName'), dataIndex: 'name', key: 'name', width: 180 },
    { title: t('organization.colDeptNameEn'), dataIndex: 'nameEn', key: 'nameEn', width: 180, render: (v: string) => v || '-' },
    { title: t('organization.colLeader'), dataIndex: 'leader', key: 'leader', width: 130, render: (v: string) => v || '-' },
    { title: t('organization.colParentDept'), dataIndex: 'parentName', key: 'parentName', width: 160, render: (v: string) => v || '-' },
    { title: t('organization.colUserCount'), dataIndex: 'userCount', key: 'userCount', width: 100 },
    {
      title: t('common.colAction'),
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size={4}>
          {hasPermission('organization-management:edit') && (
            <Button type="link" size="small" onClick={() => handleEdit(record)}>
              {t('common.edit')}
            </Button>
          )}
          {hasPermission('organization-management:edit') && (
            <Button type="link" size="small" onClick={() => handleToggleStatus(record)}>
              {record.status === DEPT_STATUS.ENABLED ? t('common.disable') : t('common.enable')}
            </Button>
          )}
          {hasPermission('organization-management:delete') && (
            <Popconfirm
              title={t('common.confirmDelete')}
              description={t('organization.confirmDeleteContent', { name: record.name })}
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

  /** 列字段配置 */
  const columnMeta = columns.map(col => ({ key: col.key as string, title: col.title as string }))
  const { configComponent, applyConfig } = useColumnConfig('organization-management', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  return (
    <div className="content-area">
      <div className="org-container">
      {/* 左侧组织架构树 */}
      <div className="org-tree-panel">
        <h3 className="org-tree-panel-title">
          <ApartmentOutlined className="org-tree-panel-title-icon" />
          {t('organization.orgStructure')}
        </h3>
        <Tree
          treeData={treeData}
          expandedKeys={expandedKeys}
          onExpand={(keys) => setExpandedKeys(keys as number[])}
          blockNode
          titleRender={renderTreeTitle}
          selectedKeys={selectedDeptId != null ? [selectedDeptId] : []}
          onSelect={(keys) => setSelectedDeptId(keys.length > 0 ? Number(keys[0]) : undefined)}
        />
      </div>

      {/* 右侧主区 */}
      <div className="org-main">
        {/* 搜索区 */}
        <div className="search-section">
          <Form form={searchForm} layout="inline">
            <Form.Item label={t('organization.searchDeptNameCode')} name="keyword">
              <Input placeholder={t('organization.nameCodePlaceholder')} allowClear onPressEnter={handleSearch} />
            </Form.Item>
            <Form.Item label={t('organization.searchLeader')} name="leader">
              <Input placeholder={t('organization.leaderPlaceholder')} allowClear onPressEnter={handleSearch} />
            </Form.Item>
            <Form.Item label={t('organization.searchDeptStatus')} name="status">
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
            {hasPermission('organization-management:create') && (
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
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
          }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => t('common.total', { count: total }),
          }}
        />
      </div>

      {/* 新增/编辑部门弹窗 */}
      <Modal
        title={editing ? t('organization.editTitle') : t('organization.addTitle')}
        open={editModalVisible}
        onOk={handleSubmit}
        onCancel={() => setEditModalVisible(false)}
        confirmLoading={submitting}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={520}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="parentId" label={t('organization.parentDeptLabel')} extra={t('organization.parentDeptExtra')}>
            <TreeSelect
              treeData={buildTreeData(departments, editing?.id)}
              placeholder={t('organization.parentDeptPlaceholder')}
              allowClear
              treeDefaultExpandAll
              showSearch
              treeNodeFilterProp="title"
            />
          </Form.Item>
          <Form.Item name="name" label={t('organization.deptNameLabel')} rules={[{ required: true, message: t('organization.deptNameRequired') }]}>
            <Input placeholder={t('organization.deptNamePlaceholder')} allowClear />
          </Form.Item>
          <Form.Item name="nameEn" label={t('organization.deptNameEnLabel')}>
            <Input
              placeholder={t('organization.deptNameEnPlaceholder')}
              allowClear
              maxLength={100}
              suffix={
                <TranslationOutlined
                  className="org-translate-btn"
                  title={t('organization.translateThisName')}
                  onClick={async () => {
                    const name = form.getFieldValue('name')?.trim()
                    if (!name) {
                      message.warning(t('organization.translateNeedName'))
                      return
                    }
                    try {
                      const translated = await translateText(name, 'en')
                      if (translated) {
                        form.setFieldsValue({ nameEn: translated })
                        message.success(t('organization.translateDone'))
                      } else {
                        message.error(t('organization.translateFailed'))
                      }
                    } catch {
                      // 错误提示由请求层统一处理
                    }
                  }}
                />
              }
            />
          </Form.Item>
          <Form.Item name="leader" label={t('organization.leaderLabel')}>
            <Select
              placeholder={t('organization.leaderPlaceholderModal')}
              allowClear
              showSearch
              optionFilterProp="label"
              options={employees.map(emp => ({ value: emp.name, label: `${emp.name}（${emp.empId}）` }))}
            />
          </Form.Item>
          <Form.Item name="sort" label={t('organization.sortLabel')} extra={t('organization.sortExtra')}>
            <InputNumber min={0} style={{ width: '100%' }} placeholder={t('organization.sortPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
      </div>
    </div>
  )
}
