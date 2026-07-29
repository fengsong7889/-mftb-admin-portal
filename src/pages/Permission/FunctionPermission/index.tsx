import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, Tree, TreeSelect, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { DataNode } from 'antd/es/tree'
import type { MenuPermission } from '../types'
import { menuPermissionTree, getMenuActions } from '../types'
import { fetchRoles, updateRolePermissions } from '../../../api/role'
import type { RoleItem } from '../../../api/role'
import { DEPT_STATUS, fetchDepartments, updateDepartmentPermissions } from '../../../api/department'
import type { DepartmentItem } from '../../../api/department'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
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

function buildDeptTreeData(list: DepartmentItem[], disabledIds?: Set<number>): DeptTreeOption[] {
  const nodeMap = new Map<number, DeptTreeOption>()
  list.forEach(dept => {
    nodeMap.set(dept.id, {
      value: dept.id,
      title: dept.name,
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
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<TargetType>(TARGET_TYPE.ROLE)

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
      message.warning(activeTab === TARGET_TYPE.ROLE ? '請選擇要授權的角色' : '請選擇要授權的部門')
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
      message.warning('請至少勾選一個授權功能')
      return
    }
    setSubmitting(true)
    try {
      if (activeTab === TARGET_TYPE.ROLE) {
        await updateRolePermissions(targetId, permissions)
      } else {
        await updateDepartmentPermissions(targetId, permissions)
      }
      message.success(editingId ? '授權已更新' : '授權已創建')
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
      message.success('授權已刪除')
      fetchList()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  /** 详情弹窗：授权菜单与对应功能操作 */
  const detailColumns: TableColumnsType<MenuPermission> = [
    {
      title: '授權菜單',
      dataIndex: 'menuKey',
      key: 'menuKey',
      width: 200,
      render: (menuKey: string) => MENU_NAME_MAP[menuKey] ?? menuKey,
    },
    {
      title: '對應功能',
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
        詳情
      </Button>
      <Button type="link" size="small" onClick={() => handleEdit(record)}>
        編輯
      </Button>
      <Popconfirm
        title="確認刪除"
        description={`確定要刪除「${record.name}」的授權嗎？刪除後其成員將失去對應菜單權限。`}
        onConfirm={() => handleDelete(record)}
        okText="確認"
        cancelText="取消"
      >
        <Button type="link" size="small" danger>
          刪除
        </Button>
      </Popconfirm>
    </Space>
  )

  const roleColumns: TableColumnsType<RoleItem> = [
    { title: '角色名稱', dataIndex: 'name', key: 'name', width: 200 },
    { title: '員工人數', dataIndex: 'userCount', key: 'userCount', width: 120, render: (v: number) => `${v} 人` },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 120, render: (v: string) => v || '-' },
    {
      title: '最後更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (date: string) => (date ? new Date(date).toLocaleString('zh-TW', { hour12: false }) : '-'),
    },
    { title: '操作', key: 'action', width: 180, render: (_, record) => renderActions(record) },
  ]

  const deptColumns: TableColumnsType<DepartmentItem> = [
    { title: '部門名稱', dataIndex: 'name', key: 'name', width: 200 },
    { title: '上級部門', dataIndex: 'parentName', key: 'parentName', width: 180, render: (v: string) => v || '-' },
    { title: '員工人數', dataIndex: 'userCount', key: 'userCount', width: 120, render: (v: number) => `${v} 人` },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 120, render: (v: string) => v || '-' },
    {
      title: '最後更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (date: string) => (date ? new Date(date).toLocaleString('zh-TW', { hour12: false }) : '-'),
    },
    { title: '操作', key: 'action', width: 180, render: (_, record) => renderActions(record) },
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
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新增
          </Button>
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
            showTotal: (t) => `共 ${t} 條數據`,
          }}
          locale={{ emptyText: '暫無授權數據，點擊「新增」為角色配置功能授權' }}
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
            showTotal: (t) => `共 ${t} 條數據`,
          }}
          locale={{ emptyText: '暫無授權數據，點擊「新增」為部門配置功能授權' }}
        />
      )}
    </div>
  )

  /** 弹窗中编辑对象的名称（编辑模式展示） */
  const editingName = editingId != null
    ? (activeTab === TARGET_TYPE.ROLE
      ? roles.find(r => r.id === editingId)?.name
      : departments.find(d => d.id === editingId)?.name)
    : undefined

  return (
    <div className="content-area">
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as TargetType)}
        items={[
          { key: TARGET_TYPE.ROLE, label: '角色授權', children: renderTabContent(TARGET_TYPE.ROLE) },
          { key: TARGET_TYPE.DEPARTMENT, label: '部門授權', children: renderTabContent(TARGET_TYPE.DEPARTMENT) },
        ]}
      />

      {/* 新增/编辑授权弹窗 */}
      <Modal
        title={
          editingId
            ? `編輯授權 - ${editingName ?? ''}`
            : (activeTab === TARGET_TYPE.ROLE ? '新增角色授權' : '新增部門授權')
        }
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        width={920}
        destroyOnClose
      >
        {/* 授权对象选择（编辑模式锁定） */}
        <div className="permission-target-bar">
          <span className="permission-target-label">
            {activeTab === TARGET_TYPE.ROLE ? '授權角色：' : '授權部門：'}
          </span>
          {activeTab === TARGET_TYPE.ROLE ? (
            <Select
              className="permission-target-select"
              placeholder="請選擇角色"
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
              placeholder="請選擇部門"
              showSearch
              treeDefaultExpandAll
              treeNodeFilterProp="title"
              disabled={editingId != null}
              value={targetId}
              onChange={(id) => setTargetId(id)}
              treeData={buildDeptTreeData(departments, editingId != null ? undefined : authedDeptIds)}
            />
          )}
          <Tag color={activeTab === TARGET_TYPE.ROLE ? 'blue' : 'purple'}>
            {activeTab === TARGET_TYPE.ROLE
              ? '加入該角色的員工將獲得所配置的權限'
              : '進入該部門的人員將自動獲得所配置的權限'}
          </Tag>
        </div>

        {/* 权限配置工作台 */}
        <div className="permission-edit-container">
          {/* 左侧：菜单树 */}
          <div className="permission-menu-tree">
            <div className="permission-tree-actions">
              <Button size="small" onClick={() => handleCheckAll(true)}>全選</Button>
              <Button size="small" onClick={() => handleCheckAll(false)}>取消全選</Button>
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
            <h4 className="permission-actions-title">請選擇功能</h4>
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
              提示：勾選左側菜單後，點擊菜單名稱可在右側細化功能操作權限；登錄時系統會合併「角色權限 + 部門權限」生效
            </div>
          </div>
        </div>
      </Modal>

      {/* 授权详情弹窗 */}
      <Modal
        title={`授權詳情 - ${detailRecord?.name ?? ''}`}
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
          locale={{ emptyText: '暫無授權功能' }}
        />
      </Modal>
    </div>
  )
}
