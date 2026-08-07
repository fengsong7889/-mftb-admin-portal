import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, Tree, TreeSelect, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { DataNode } from 'antd/es/tree'
import type { MenuPermission } from '../types'
import { menuPermissionTree, getMenuActions } from '../types'
import { fetchRoles, updateRolePermissions } from '../../../api/role'
import type { RoleItem } from '../../../api/role'
import { DEPT_STATUS, fetchDepartments, updateDepartmentPermissions } from '../../../api/department'
import type { DepartmentItem } from '../../../api/department'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { useAuth } from '../../../contexts/AuthContext'
import './index.css'

/** 授权对象类型（Tab） */
const TARGET_TYPE = {
  ROLE: 'role',
  DEPARTMENT: 'department',
} as const

type TargetType = typeof TARGET_TYPE[keyof typeof TARGET_TYPE]

/** 角色/部门状态：启用 */
const STATUS_ENABLED = 1

/** 将权限树转换为 Tree 组件数据 */
const convertToTreeData = (modules: typeof menuPermissionTree): DataNode[] => {
  return modules.map(module => ({
    title: module.name,
    key: module.key,
    children: module.children ? convertToTreeData(module.children) : undefined,
  }))
}

/** 获取所有菜单key（包括父节点） */
const getAllMenuKeys = (modules: typeof menuPermissionTree): string[] => {
  const keys: string[] = []
  const traverse = (items: typeof menuPermissionTree) => {
    items.forEach(item => {
      keys.push(item.key)
      if (item.children) {
        traverse(item.children)
      }
    })
  }
  traverse(modules)
  return keys
}

const ALL_MENU_KEYS = getAllMenuKeys(menuPermissionTree)

/** 获取叶子节点key */
const getLeafKeys = (modules: typeof menuPermissionTree): string[] => {
  const keys: string[] = []
  const traverse = (items: typeof menuPermissionTree) => {
    items.forEach(item => {
      if (!item.children || item.children.length === 0) {
        keys.push(item.key)
      } else {
        traverse(item.children)
      }
    })
  }
  traverse(modules)
  return keys
}

const LEAF_KEYS = getLeafKeys(menuPermissionTree)

/** 菜单key → 菜单名称 映射（用于列表展示授权功能） */
const MENU_NAME_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  const traverse = (items: typeof menuPermissionTree) => {
    items.forEach(item => {
      map[item.key] = item.name
      if (item.children) {
        traverse(item.children)
      }
    })
  }
  traverse(menuPermissionTree)
  return map
})()

/** 某菜单的默认操作（该菜单支持的全部操作） */
const defaultActionsOf = (menuKey: string): string[] => getMenuActions(menuKey).map(a => a.key)

/** 平铺部门列表构建 TreeSelect 树数据 */
interface DeptTreeOption {
  value: number
  title: string
  disabled?: boolean
  children?: DeptTreeOption[]
}

function buildDeptTreeData(list: DepartmentItem[], disabledIds?: Set<number>, getDeptName?: (dept: DepartmentItem) => string): DeptTreeOption[] {
  const nameFn = getDeptName ?? ((d: DepartmentItem) => d.name)
  const nodeMap = new Map<number, DeptTreeOption>()
  list.forEach(dept => {
    nodeMap.set(dept.id, {
      value: dept.id,
      title: nameFn(dept),
      disabled: dept.status !== DEPT_STATUS.ENABLED || (disabledIds?.has(dept.id) ?? false),
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

export default function FunctionPermission() {
  const { t, i18n } = useTranslation()

  /** 當前是否非繁中語言 */
  const isNonZh = !i18n.language?.startsWith('zh')

  /** 獲取部門顯示名稱 */
  const getDeptDisplayName = (dept: DepartmentItem) =>
    isNonZh ? (dept.nameEn || dept.name) : dept.name

  const [roles, setRoles] = useState<RoleItem[]>([])
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<TargetType>(TARGET_TYPE.ROLE)
  // 功能权限校验（菜单 key: function-permission）
  const { hasPermission } = useAuth()

  // 新增/编辑授权弹窗
  const [modalVisible, setModalVisible] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [targetId, setTargetId] = useState<number>()
  const [checkedKeys, setCheckedKeys] = useState<string[]>([])
  const [actionsMap, setActionsMap] = useState<Record<string, string[]>>({})
  const [selectedMenuKey, setSelectedMenuKey] = useState<string | null>(null)

  // 授权详情弹窗
  const [detailRecord, setDetailRecord] = useState<RoleItem | DepartmentItem | null>(null)

  /** 加载角色与部门列表 */
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const [roleList, deptList] = await Promise.all([fetchRoles(), fetchDepartments()])
      setRoles(roleList)
      setDepartments(deptList)
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  /** 已授权的角色（形成列表数据） */
  const roleRows = useMemo(() => roles.filter(r => r.permissions.length > 0), [roles])
  /** 已授权的部门 */
  const deptRows = useMemo(() => departments.filter(d => d.permissions.length > 0), [departments])

  /** 新增授权时可选的对象（启用中且尚未授权） */
  const availableRoles = useMemo(
    () => roles.filter(r => r.status === STATUS_ENABLED && r.permissions.length === 0),
    [roles],
  )
  const authedDeptIds = useMemo(() => new Set(deptRows.map(d => d.id)), [deptRows])

  /** 打开新增授权弹窗 */
  const handleCreate = () => {
    setEditingId(null)
    setTargetId(undefined)
    setCheckedKeys([])
    setActionsMap({})
    setSelectedMenuKey(null)
    setModalVisible(true)
  }

  /** 打开编辑授权弹窗 */
  const handleEdit = (record: RoleItem | DepartmentItem) => {
    setEditingId(record.id)
    setTargetId(record.id)
    const menuKeys = record.permissions.map(p => p.menuKey)
    setCheckedKeys(menuKeys)
    const map: Record<string, string[]> = {}
    record.permissions.forEach(p => {
      map[p.menuKey] = p.actions
    })
    setActionsMap(map)
    setSelectedMenuKey(LEAF_KEYS.find(key => menuKeys.includes(key)) ?? null)
    setModalVisible(true)
  }

  /** 全选/取消全选 */
  const handleCheckAll = (checked: boolean) => {
    setCheckedKeys(checked ? ALL_MENU_KEYS : [])
    if (!checked) {
      setSelectedMenuKey(null)
    }
  }

  /** 当前选中菜单的操作权限（未配置过则默认全选该菜单支持的操作） */
  const currentActions = selectedMenuKey
    ? actionsMap[selectedMenuKey] ?? defaultActionsOf(selectedMenuKey)
    : []

  /** 勾选/取消某个操作 */
  const handleToggleAction = (actionKey: string, checked: boolean) => {
    if (!selectedMenuKey) return
    const next = checked
      ? [...currentActions, actionKey]
      : currentActions.filter(a => a !== actionKey)
    setActionsMap(prev => ({ ...prev, [selectedMenuKey]: next }))
  }

  /** 保存授权（形成/更新一条授权数据） */
  const handleSave = async () => {
    if (targetId == null) {
      message.warning(activeTab === TARGET_TYPE.ROLE ? t('functionPermission.selectRole') : t('functionPermission.selectDept'))
      return
    }
    const permissions: MenuPermission[] = []
    checkedKeys.forEach(menuKey => {
      if (!LEAF_KEYS.includes(menuKey)) return
      const actions = actionsMap[menuKey] ?? defaultActionsOf(menuKey)
      if (actions.length > 0) {
        permissions.push({ menuKey, actions })
      }
    })
    if (permissions.length === 0) {
      message.warning(t('functionPermission.selectFunction'))
      return
    }
    setSubmitting(true)
    try {
      if (activeTab === TARGET_TYPE.ROLE) {
        await updateRolePermissions(targetId, permissions)
      } else {
        await updateDepartmentPermissions(targetId, permissions)
      }
      message.success(editingId ? t('functionPermission.authUpdated') : t('functionPermission.authCreated'))
      setModalVisible(false)
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setSubmitting(false)
    }
  }

  /** 删除授权（清空该对象的菜单权限） */
  const handleDelete = async (record: RoleItem | DepartmentItem) => {
    try {
      if (activeTab === TARGET_TYPE.ROLE) {
        await updateRolePermissions(record.id, [])
      } else {
        await updateDepartmentPermissions(record.id, [])
      }
      message.success(t('common.deleteSuccess'))
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  /** 详情弹窗：授权菜单与对应功能操作 */
  const detailColumns: TableColumnsType<MenuPermission> = [
    {
      title: t('functionPermission.colAuthMenu'),
      dataIndex: 'menuKey',
      key: 'menuKey',
      width: 200,
      render: (menuKey: string) => MENU_NAME_MAP[menuKey] ?? menuKey,
    },
    {
      title: t('functionPermission.colActions'),
      dataIndex: 'actions',
      key: 'actions',
      render: (actions: string[], record) => (
        <Space size={4} wrap>
          {actions.map(actionKey => {
            const label = getMenuActions(record.menuKey).find(a => a.key === actionKey)?.label ?? actionKey
            return <Tag key={actionKey} color="blue">{label}</Tag>
          })}
        </Space>
      ),
    },
  ]

  /** 操作列（角色/部门通用） */
  const renderActions = (record: RoleItem | DepartmentItem) => (
    <Space size={4}>
      <Button type="link" size="small" onClick={() => setDetailRecord(record)}>
        {t('common.detail')}
      </Button>
      {hasPermission('function-permission:edit') && (
        <Button type="link" size="small" onClick={() => handleEdit(record)}>
          {t('common.edit')}
        </Button>
      )}
      {hasPermission('function-permission:delete') && (
        <Popconfirm
          title={t('common.confirmDelete')}
          description={t('functionPermission.confirmDeleteContent', { name: record.name })}
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

  const roleColumns: TableColumnsType<RoleItem> = [
    { title: t('functionPermission.colRoleName'), dataIndex: 'name', key: 'name', width: 200 },
    { title: t('functionPermission.colUserCount'), dataIndex: 'userCount', key: 'userCount', width: 120, render: (v: number) => t('functionPermission.personCount', { count: v }) },
    { title: t('functionPermission.colUpdatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 120, render: (v: string) => v || '-' },
    {
      title: t('functionPermission.colUpdatedAt'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (date: string) => (date ? new Date(date).toLocaleString('zh-TW', { hour12: false }) : '-'),
    },
    { title: t('common.colAction'), key: 'action', width: 180, render: (_, record) => renderActions(record) },
  ]

  const deptColumns: TableColumnsType<DepartmentItem> = [
    { title: t('functionPermission.colDeptName'), dataIndex: 'name', key: 'name', width: 200 },
    { title: t('functionPermission.colParentDept'), dataIndex: 'parentName', key: 'parentName', width: 180, render: (v: string) => v || '-' },
    { title: t('functionPermission.colUserCount'), dataIndex: 'userCount', key: 'userCount', width: 120, render: (v: number) => t('functionPermission.personCount', { count: v }) },
    { title: t('functionPermission.colUpdatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 120, render: (v: string) => v || '-' },
    {
      title: t('functionPermission.colUpdatedAt'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (date: string) => (date ? new Date(date).toLocaleString('zh-TW', { hour12: false }) : '-'),
    },
    { title: t('common.colAction'), key: 'action', width: 180, render: (_, record) => renderActions(record) },
  ]

  /** 列字段配置 */
  const roleColumnMeta = roleColumns.map(col => ({ key: col.key as string, title: col.title as string }))
  const { configComponent: roleConfigComponent, applyConfig: roleApplyConfig } = useColumnConfig('function-permission-role', roleColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])
  const deptColumnMeta = deptColumns.map(col => ({ key: col.key as string, title: col.title as string }))
  const { configComponent: deptConfigComponent, applyConfig: deptApplyConfig } = useColumnConfig('function-permission-dept', deptColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  /** 授权列表（角色/部门 Tab 内容） */
  const renderTabContent = (type: TargetType) => (
    <div>
      <div className="action-section">
        <div className="action-section-right">
          {hasPermission('function-permission:create') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              {t('common.add')}
            </Button>
          )}
          {type === TARGET_TYPE.ROLE ? roleConfigComponent : deptConfigComponent}
        </div>
      </div>
      {type === TARGET_TYPE.ROLE ? (
        <Table
          columns={roleApplyConfig(roleColumns)}
          dataSource={roleRows}
          rowKey="id"
          loading={loading}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => t('common.total', { count: total }),
          }}
          locale={{ emptyText: t('functionPermission.emptyRole') }}
        />
      ) : (
        <Table
          columns={deptApplyConfig(deptColumns)}
          dataSource={deptRows}
          rowKey="id"
          loading={loading}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => t('common.total', { count: total }),
          }}
          locale={{ emptyText: t('functionPermission.emptyDept') }}
        />
      )}
    </div>
  )

  /** 弹窗中编辑对象的名称（编辑模式展示） */
  const editingName = editingId != null
    ? (activeTab === TARGET_TYPE.ROLE
      ? roles.find(r => r.id === editingId)?.name
      : departments.find(d => d.id === editingId) ? getDeptDisplayName(departments.find(d => d.id === editingId)!) : undefined)
    : undefined

  return (
    <div className="content-area">
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as TargetType)}
        items={[
          { key: TARGET_TYPE.ROLE, label: t('functionPermission.tabRoleAuth'), children: renderTabContent(TARGET_TYPE.ROLE) },
          { key: TARGET_TYPE.DEPARTMENT, label: t('functionPermission.tabDeptAuth'), children: renderTabContent(TARGET_TYPE.DEPARTMENT) },
        ]}
      />

      {/* 新增/编辑授权弹窗 */}
      <Modal
        title={
          editingId
            ? t('functionPermission.editTitle', { name: editingName ?? '' })
            : (activeTab === TARGET_TYPE.ROLE ? t('functionPermission.addRoleTitle') : t('functionPermission.addDeptTitle'))
        }
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        confirmLoading={submitting}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={920}
        destroyOnClose
      >
        {/* 授权对象选择（编辑模式锁定） */}
        <div className="permission-target-bar">
          <span className="permission-target-label">
            {activeTab === TARGET_TYPE.ROLE ? t('functionPermission.targetRole') : t('functionPermission.targetDept')}
          </span>
          {activeTab === TARGET_TYPE.ROLE ? (
            <Select
              className="permission-target-select"
              placeholder={t('functionPermission.selectRolePlaceholder')}
              showSearch
              optionFilterProp="label"
              disabled={editingId != null}
              value={targetId}
              onChange={(id) => setTargetId(id)}
              options={(editingId != null ? roles : availableRoles).map(r => ({
                value: r.id,
                label: r.name,
              }))}
            />
          ) : (
            <TreeSelect
              className="permission-target-select"
              placeholder={t('functionPermission.selectDeptPlaceholder')}
              showSearch
              treeDefaultExpandAll
              treeNodeFilterProp="title"
              disabled={editingId != null}
              value={targetId}
              onChange={(id) => setTargetId(id)}
              treeData={buildDeptTreeData(departments, editingId != null ? undefined : authedDeptIds, getDeptDisplayName)}
            />
          )}
          <Tag color={activeTab === TARGET_TYPE.ROLE ? 'blue' : 'purple'}>
            {activeTab === TARGET_TYPE.ROLE
              ? t('functionPermission.roleTip')
              : t('functionPermission.deptTip')}
          </Tag>
        </div>

        {/* 权限配置工作台 */}
        <div className="permission-edit-container">
          {/* 左侧：菜单树 */}
          <div className="permission-menu-tree">
            <div className="permission-tree-actions">
              <Button size="small" onClick={() => handleCheckAll(true)}>{t('functionPermission.selectAll')}</Button>
              <Button size="small" onClick={() => handleCheckAll(false)}>{t('functionPermission.deselectAll')}</Button>
            </div>
            <Tree
              checkable
              checkedKeys={checkedKeys}
              onCheck={(keys) => setCheckedKeys(keys as string[])}
              onSelect={(keys) => {
                if (keys.length > 0 && LEAF_KEYS.includes(keys[0] as string)) {
                  setSelectedMenuKey(keys[0] as string)
                }
              }}
              treeData={convertToTreeData(menuPermissionTree)}
              className="permission-tree"
            />
          </div>

          {/* 右侧：功能操作勾选 */}
          <div className="permission-actions-panel">
            <h4 className="permission-actions-title">{t('functionPermission.selectFunctionTitle')}</h4>
            {selectedMenuKey && (
              <div className="permission-actions-list">
                {getMenuActions(selectedMenuKey).map(action => (
                  <div key={action.key} className="permission-action-item">
                    <input
                      type="checkbox"
                      id={`action-${action.key}`}
                      checked={currentActions.includes(action.key)}
                      onChange={(e) => handleToggleAction(action.key, e.target.checked)}
                    />
                    <label htmlFor={`action-${action.key}`}>{action.label}</label>
                  </div>
                ))}
              </div>
            )}
            <div className="permission-actions-tip">
              {t('functionPermission.tipContent')}
            </div>
          </div>
        </div>
      </Modal>

      {/* 授权详情弹窗 */}
      <Modal
        title={t('functionPermission.detailTitle', { name: detailRecord?.name ?? '' })}
        open={detailRecord != null}
        onCancel={() => setDetailRecord(null)}
        footer={null}
        width={680}
      >
        <Table
          columns={detailColumns}
          dataSource={detailRecord?.permissions ?? []}
          rowKey="menuKey"
          size="small"
          pagination={false}
          scroll={{ y: 420 }}
          locale={{ emptyText: t('functionPermission.emptyPermissions') }}
        />
      </Modal>
    </div>
  )
}
