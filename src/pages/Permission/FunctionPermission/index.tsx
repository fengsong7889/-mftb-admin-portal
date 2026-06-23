import { useState, useEffect } from 'react'
import { Button, Table, Modal, Form, Input, Tree, Space, message, Tag, Pagination } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, CheckCircleOutlined, StopOutlined } from '@ant-design/icons'
import type { DataNode } from 'antd/es/tree'
import type { Role, UserAccount, MenuPermission } from '../types'
import { menuPermissionTree, STORAGE_KEYS, PERMISSION_ACTIONS, getMenuActions } from '../types'
import './index.css'

const { TextArea } = Input

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

/** 默认所有功能操作 */
const DEFAULT_ACTIONS = PERMISSION_ACTIONS.map(a => a.key)

/** 模拟员工账号数据 */
const mockUsers: UserAccount[] = [
  { empId: 'A0001', name: '小蜜蜂', username: 'admin', roles: [], department: '技術部' },
  { empId: 'G0001', name: '訪客', username: 'guest', roles: [], department: '運營部' },
  { empId: 'E0001', name: '張三', username: 'zhangsan', roles: [], department: '財務部' },
  { empId: 'E0002', name: '李四', username: 'lisi', roles: [], department: '運營部' },
  { empId: 'E0003', name: '王五', username: 'wangwu', roles: [], department: '技術部' },
]

export default function FunctionPermission() {
  const [roles, setRoles] = useState<Role[]>([])
  const [permissionModalVisible, setPermissionModalVisible] = useState(false)
  const [bindUserModalVisible, setBindUserModalVisible] = useState(false)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [currentRole, setCurrentRole] = useState<Role | null>(null)
  const [checkedKeys, setCheckedKeys] = useState<string[]>([])
  const [selectedMenuKey, setSelectedMenuKey] = useState<string | null>(null)
  const [checkedActions, setCheckedActions] = useState<string[]>([])
  const [selectedUserKeys, setSelectedUserKeys] = useState<string[]>([])
  const [form] = Form.useForm()
  const [searchText, setSearchText] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // 从 localStorage 加载数据
  useEffect(() => {
    const savedRoles = localStorage.getItem(STORAGE_KEYS.ROLES)
    if (savedRoles) {
      const parsedRoles = JSON.parse(savedRoles)
      // 如果数据少于15条，重新生成
      if (parsedRoles.length < 15) {
        generateInitialRoles()
      } else {
        setRoles(parsedRoles)
      }
    } else {
      generateInitialRoles()
    }
  }, [])

  /** 生成初始角色数据 */
  const generateInitialRoles = () => {
    const roleTemplates = [
      { name: '财务主管', desc: '财务管理相关权限', menus: ['account-balance', 'batch-query', 'detail-query', 'writeoff-reconcile', 'debt-reconcile'] },
      { name: '搜索运营', desc: '搜索配置和管理权限', menus: ['hint-config', 'hot-search-config', 'search-weight-config', 'search-verify'] },
      { name: '推广金管理员', desc: '推广金充值和管理权限', menus: ['account-balance', 'batch-query', 'detail-query'] },
      { name: '内容审核员', desc: '内容审核和查看权限', menus: ['hint-config', 'hot-search-config', 'hint-verify', 'hot-search-verify'] },
      { name: '数据分析师', desc: '数据查看和导出权限', menus: ['recommend-effect-report', 'recommend-revenue-report', 'hint-report', 'hot-search-report'] },
      { name: '系统管理员', desc: '系统配置和管理权限', menus: ['global-config', 'channel-strategy', 'word-segmentation', 'synonym-config'] },
      { name: '商户运营', desc: '商户推广和订单管理', menus: ['recommend-dashboard', 'recommend-order', 'recommend-calendar'] },
      { name: '算法工程师', desc: '算法配置和监控权限', menus: ['recommend-algorithm', 'recommend-algorithm-monitor'] },
      { name: '财务审计', desc: '财务审计和对账权限', menus: ['writeoff-reconcile', 'debt-reconcile', 'debt-detail', 'approval-center'] },
      { name: '关键词运营', desc: '词库管理权限', menus: ['word-segmentation', 'synonym-config', 'hot-search-library', 'stop-words'] },
      { name: '报表查看员', desc: '只读报表权限', menus: ['hint-report', 'hot-search-report', 'recommend-effect-report'] },
      { name: '搜索配置员', desc: '搜索基础配置权限', menus: ['global-config', 'hint-config', 'hot-search-config'] },
      { name: '权限管理员', desc: '权限管理和分配权限', menus: ['function-permission', 'data-permission'] },
      { name: '订单处理员', desc: '订单查询和处理权限', menus: ['recommend-order', 'batch-query', 'detail-query'] },
      { name: '投放优化师', desc: '投放策略和价格配置', menus: ['recommend-slot', 'recommend-pricing', 'recommend-package'] },
    ]

    const initialRoles: Role[] = roleTemplates.map((template, index) => ({
      id: (index + 1).toString(),
      name: template.name,
      description: template.desc,
      permissions: template.menus.map(menuKey => ({
        menuKey,
        actions: ['view', 'create', 'edit', 'export'],
      })),
      userCount: Math.floor(Math.random() * 10),
      createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: index < 12 ? 'active' : 'inactive',
    }))

    setRoles(initialRoles)
    localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(initialRoles))
  }

  /** 保存角色数据 */
  const saveRoles = (newRoles: Role[]) => {
    setRoles(newRoles)
    localStorage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(newRoles))
  }

  /** 新建角色 */
  const handleCreate = () => {
    form.resetFields()
    setCurrentRole(null)
    setCreateModalVisible(true)
  }

  /** 提交新建/编辑角色 */
  const handleCreateSubmit = async () => {
    const values = await form.validateFields()
    const newRole: Role = {
      id: currentRole ? currentRole.id : Date.now().toString(),
      name: values.name,
      description: values.description || '',
      permissions: currentRole ? currentRole.permissions : [],
      userCount: currentRole ? currentRole.userCount : 0,
      createdAt: currentRole ? currentRole.createdAt : new Date().toISOString(),
      status: currentRole ? currentRole.status : 'active',
    }

    if (currentRole) {
      const newRoles = roles.map(r => r.id === currentRole.id ? newRole : r)
      saveRoles(newRoles)
      message.success('角色信息已更新')
    } else {
      const newRoles = [...roles, newRole]
      saveRoles(newRoles)
      message.success('角色创建成功')
    }
    setCreateModalVisible(false)
  }

  /** 编辑角色信息 */
  const handleEditRole = (record: Role) => {
    setCurrentRole(record)
    form.setFieldsValue({
      name: record.name,
      description: record.description,
    })
    setCreateModalVisible(true)
  }

  /** 编辑权限 */
  const handleEditPermission = (record: Role) => {
    setCurrentRole(record)
    // 提取已选择的菜单key
    const menuKeys = record.permissions.map(p => p.menuKey)
    setCheckedKeys(menuKeys)
    // 默认选择第一个叶子节点
    const firstLeaf = LEAF_KEYS.find(key => menuKeys.includes(key)) || LEAF_KEYS[0]
    setSelectedMenuKey(firstLeaf)
    const perm = record.permissions.find(p => p.menuKey === firstLeaf)
    setCheckedActions(perm ? perm.actions : [])
    setPermissionModalVisible(true)
  }

  /** 保存权限 */
  const handleSavePermission = () => {
    if (!currentRole) return
    
    // 构建新的权限列表
    const newPermissions: MenuPermission[] = []
    
    // 遍历所有选中的菜单
    checkedKeys.forEach(menuKey => {
      // 如果是叶子节点且有选中
      if (LEAF_KEYS.includes(menuKey)) {
        const perm = currentRole.permissions.find(p => p.menuKey === menuKey)
        const actions = menuKey === selectedMenuKey ? checkedActions : (perm ? perm.actions : DEFAULT_ACTIONS)
        if (actions.length > 0) {
          newPermissions.push({ menuKey, actions })
        }
      }
    })
    
    const newRoles = roles.map(r =>
      r.id === currentRole.id ? { ...r, permissions: newPermissions } : r
    )
    saveRoles(newRoles)
    message.success('权限配置已保存')
    setPermissionModalVisible(false)
  }

  /** 绑定账号 */
  const handleBindUser = (record: Role) => {
    setCurrentRole(record)
    // 获取已绑定该角色的用户
    const boundUsers = mockUsers.filter(u => u.roles.includes(record.id))
    setSelectedUserKeys(boundUsers.map(u => u.empId))
    setBindUserModalVisible(true)
  }

  /** 保存绑定的账号 */
  const handleSaveBindUser = () => {
    if (!currentRole) return
    // 这里只是模拟，实际需要更新用户数据
    const newRoles = roles.map(r =>
      r.id === currentRole.id
        ? { ...r, userCount: selectedUserKeys.length }
        : r
    )
    saveRoles(newRoles)
    message.success(`已绑定 ${selectedUserKeys.length} 个账号`)
    setBindUserModalVisible(false)
  }

  /** 切换状态 */
  const handleToggleStatus = (record: Role) => {
    const newStatus: 'active' | 'inactive' = record.status === 'active' ? 'inactive' : 'active'
    const newRoles = roles.map(r =>
      r.id === record.id ? { ...r, status: newStatus } : r
    )
    saveRoles(newRoles)
    message.success(newStatus === 'active' ? '已启用' : '已停用')
  }

  /** 删除角色 */
  const handleDelete = (record: Role) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除角色"${record.name}"吗？`,
      onOk: () => {
        const newRoles = roles.filter(r => r.id !== record.id)
        saveRoles(newRoles)
        message.success('角色已删除')
      },
    })
  }

  /** 选择菜单 */
  const handleSelectMenu = (menuKey: string) => {
    setSelectedMenuKey(menuKey)
    // 加载该菜单已选的操作
    const perm = currentRole?.permissions.find(p => p.menuKey === menuKey)
    setCheckedActions(perm ? perm.actions : DEFAULT_ACTIONS)
  }

  /** 全选/取消全选 */
  const handleCheckAll = (checked: boolean) => {
    setCheckedKeys(checked ? ALL_MENU_KEYS : [])
    setSelectedMenuKey(null)
    setCheckedActions([])
  }

  /** 过滤用户 */
  const filteredUsers = mockUsers.filter(user =>
    user.name.includes(searchText) ||
    user.empId.includes(searchText) ||
    user.username.includes(searchText)
  )

  const columns: TableColumnsType<Role> = [
    {
      title: '角色名稱',
      dataIndex: 'name',
      key: 'name',
      width: 180,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 250,
      ellipsis: true,
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: 'active' | 'inactive') => (
        <Tag color={status === 'active' ? 'green' : 'default'}>
          {status === 'active' ? '啟用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '綁定賬號數',
      dataIndex: 'userCount',
      key: 'userCount',
      width: 120,
      render: (count: number) => (
        <Tag color="blue">{count} 個</Tag>
      ),
    },
    {
      title: '創建時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: string) => new Date(date).toLocaleString('zh-TW', { hour12: false }),
    },
    {
      title: '操作',
      key: 'action',
      width: 340,
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button 
            type="link" 
            size="small" 
            icon={record.status === 'active' ? <StopOutlined /> : <CheckCircleOutlined />}
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === 'active' ? '停用' : '啟用'}
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditPermission(record)}>
            編輯權限
          </Button>
          <Button type="link" size="small" icon={<UserOutlined />} onClick={() => handleBindUser(record)}>
            綁定賬號
          </Button>
          <Button type="link" size="small" onClick={() => handleEditRole(record)}>
            編輯信息
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
            刪除
          </Button>
        </Space>
      ),
    },
  ]

  const userColumns: TableColumnsType<UserAccount> = [
    {
      title: '工號',
      dataIndex: 'empId',
      key: 'empId',
      width: 100,
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 120,
    },
    {
      title: '用戶名',
      dataIndex: 'username',
      key: 'username',
      width: 120,
    },
    {
      title: '部門',
      dataIndex: 'department',
      key: 'department',
      width: 120,
    },
    {
      title: '狀態',
      key: 'status',
      width: 100,
      render: (_, record) => (
        selectedUserKeys.includes(record.empId)
          ? <Tag color="green">已綁定</Tag>
          : <Tag color="default">未綁定</Tag>
      ),
    },
  ]

  return (
    <div className="permission-container">
      <div className="permission-header">
        <h2>功能權限</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新建角色
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={roles.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
        rowKey="id"
        pagination={false}
        bordered
      />

      <div className="permission-pagination">
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={roles.length}
          showSizeChanger
          showQuickJumper
          showTotal={(total) => `共 ${total} 條數據`}
          onChange={(page, size) => {
            setCurrentPage(page)
            if (size !== pageSize) {
              setPageSize(size)
              setCurrentPage(1)
            }
          }}
        />
      </div>

      {/* 新建/编辑角色弹窗 */}
      <Modal
        title={currentRole ? '編輯角色信息' : '新建角色'}
        open={createModalVisible}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateModalVisible(false)}
        width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="角色名稱"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="例如：财务主管" />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea rows={3} placeholder="请输入角色描述" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑权限弹窗 */}
      <Modal
        title={`編輯權限 - ${currentRole?.name}`}
        open={permissionModalVisible}
        onOk={handleSavePermission}
        onCancel={() => setPermissionModalVisible(false)}
        width={900}
        okText="保存"
        cancelText="取消"
      >
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
                  handleSelectMenu(keys[0] as string)
                }
              }}
              treeData={convertToTreeData(menuPermissionTree)}
              className="permission-tree"
            />
          </div>

          {/* 右侧：功能操作勾选 */}
          <div className="permission-actions-panel">
            <h4 className="permission-actions-title">
              请选择功能
            </h4>
            {selectedMenuKey && (
              <div className="permission-actions-list">
                {getMenuActions(selectedMenuKey).map(action => (
                  <div key={action.key} className="permission-action-item">
                    <input
                      type="checkbox"
                      id={`action-${action.key}`}
                      checked={checkedActions.includes(action.key)}
                      onChange={(e) => {
                        const newActions = e.target.checked
                          ? [...checkedActions, action.key]
                          : checkedActions.filter(a => a !== action.key)
                        setCheckedActions(newActions)
                      }}
                    />
                    <label htmlFor={`action-${action.key}`}>{action.label}</label>
                  </div>
                ))}
              </div>
            )}
            <div className="permission-actions-tip">
              提示：勾選左側菜單後，在右側勾選對應的功能操作權限
            </div>
          </div>
        </div>
      </Modal>

      {/* 绑定账号弹窗 */}
      <Modal
        title={`綁定賬號 - ${currentRole?.name}`}
        open={bindUserModalVisible}
        onOk={handleSaveBindUser}
        onCancel={() => setBindUserModalVisible(false)}
        width={800}
        okText={`保存 (${selectedUserKeys.length} 個)`}
        cancelText="取消"
      >
        <div className="bind-user-container">
          <Input.Search
            placeholder="搜索姓名、工號、用戶名"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ marginBottom: 16 }}
          />
          <Table
            columns={userColumns}
            dataSource={filteredUsers}
            rowKey="empId"
            pagination={false}
            rowSelection={{
              selectedRowKeys: selectedUserKeys,
              onChange: (keys) => setSelectedUserKeys(keys as string[]),
            }}
            size="small"
            scroll={{ y: 400 }}
          />
        </div>
      </Modal>
    </div>
  )
}
