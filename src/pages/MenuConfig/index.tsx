import { useState, useMemo, useCallback } from 'react'
import { Table, Button, Input, Tag, Space, Tooltip, message, Modal, Form, Select, Switch, Popconfirm } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Key } from 'react'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ExportOutlined,
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  ExpandAltOutlined,
  ShrinkOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'

/** ────── 类型定义 ────── */
interface MenuItem {
  id: string
  parentId: string
  name: string           // 中文名称
  menuKey: string        // 后台英文 Key
  path: string           // 路由路径
  icon: string           // 图标名称
  type: 'directory' | 'menu' | 'button'  // 类型：目录/菜单/按钮
  sortOrder: number      // 排序
  status: 'enabled' | 'disabled'  // 状态
  children?: MenuItem[]
}

/** ────── 类型常量 ────── */
const MENU_TYPE_MAP = {
  directory: { label: '目錄', color: 'blue' },
  menu: { label: '菜單', color: 'green' },
  button: { label: '按鈕', color: 'orange' },
} as const

const MENU_TYPE_OPTIONS = [
  { label: '目錄', value: 'directory' },
  { label: '菜單', value: 'menu' },
  { label: '按鈕', value: 'button' },
]

/** ────── 模拟数据（从 Sidebar menuItems 提取） ────── */
const generateMockData = (): MenuItem[] => [
  {
    id: 'home', parentId: '0', name: '首頁', menuKey: 'home', path: '/',
    icon: 'HomeOutlined', type: 'menu', sortOrder: 1, status: 'enabled',
  },
  {
    id: 'merchant_group', parentId: '0', name: '商戶集團管理', menuKey: 'merchant_group', path: '',
    icon: 'ShopOutlined', type: 'directory', sortOrder: 2, status: 'enabled',
    children: [
      { id: 'merchant-group-list', parentId: 'merchant_group', name: '集團管理', menuKey: 'merchant-group-list', path: '/merchant-group-list', icon: 'ShopOutlined', type: 'menu', sortOrder: 1, status: 'enabled' },
      { id: 'store-list', parentId: 'merchant_group', name: '門店管理', menuKey: 'store-list', path: '/store-list', icon: 'ShopOutlined', type: 'menu', sortOrder: 2, status: 'enabled' },
    ],
  },
  {
    id: 'merchant_promotion', parentId: '0', name: '商家推广工具', menuKey: 'merchant_promotion', path: '',
    icon: 'CrownOutlined', type: 'directory', sortOrder: 3, status: 'enabled',
    children: [
      { id: 'promotion-dashboard', parentId: 'merchant_promotion', name: '數據看板', menuKey: 'promotion-dashboard', path: '/promotion-dashboard', icon: 'PieChartOutlined', type: 'menu', sortOrder: 1, status: 'enabled' },
      { id: 'promotion-algorithm', parentId: 'merchant_promotion', name: '算法库', menuKey: 'promotion-algorithm', path: '/promotion-algorithm', icon: 'AppstoreOutlined', type: 'menu', sortOrder: 2, status: 'enabled' },
      { id: 'promotion-slot-config', parentId: 'merchant_promotion', name: '瀑布流策略', menuKey: 'promotion-slot-config', path: '/promotion-slot-config', icon: 'ColumnHeightOutlined', type: 'menu', sortOrder: 3, status: 'enabled' },
      { id: 'promotion-waterfall', parentId: 'merchant_promotion', name: '銷售定價', menuKey: 'promotion-waterfall', path: '/promotion-waterfall', icon: 'WalletOutlined', type: 'menu', sortOrder: 4, status: 'enabled' },
      {
        id: 'gift-manage', parentId: 'merchant_promotion', name: '贈送管理', menuKey: 'gift-manage', path: '',
        icon: 'GiftOutlined', type: 'directory', sortOrder: 5, status: 'enabled',
        children: [
          { id: 'gift-detail', parentId: 'gift-manage', name: '推廣贈送', menuKey: 'gift-detail', path: '/gift-detail', icon: 'RedEnvelopeOutlined', type: 'menu', sortOrder: 1, status: 'enabled' },
          { id: 'gift-consume-detail', parentId: 'gift-manage', name: '消費明細', menuKey: 'gift-consume-detail', path: '/gift-consume-detail', icon: 'FileTextOutlined', type: 'menu', sortOrder: 2, status: 'enabled' },
        ],
      },
      { id: 'ad-sales', parentId: 'merchant_promotion', name: '廣告銷售', menuKey: 'ad-sales', path: '/ad-sales', icon: 'ShoppingFilled', type: 'menu', sortOrder: 6, status: 'enabled' },
      { id: 'promotion-word-library', parentId: 'merchant_promotion', name: '詞庫管理', menuKey: 'promotion-word-library', path: '/promotion-word-library', icon: 'ReadOutlined', type: 'menu', sortOrder: 7, status: 'enabled' },
    ],
  },
  {
    id: 'promotion-tool', parentId: '0', name: '推广通', menuKey: 'promotion-tool', path: '',
    icon: 'ThunderboltOutlined', type: 'directory', sortOrder: 4, status: 'enabled',
    children: [
      { id: 'promotion-sales-config', parentId: 'promotion-tool', name: '店鋪推廣', menuKey: 'promotion-sales-config', path: '/promotion-sales-config', icon: 'ShoppingFilled', type: 'menu', sortOrder: 1, status: 'enabled' },
      {
        id: 'promotion-report-group', parentId: 'promotion-tool', name: '報表分析', menuKey: 'promotion-report-group', path: '',
        icon: 'BarChartOutlined', type: 'directory', sortOrder: 2, status: 'enabled',
        children: [
          { id: 'promotion-report-overview', parentId: 'promotion-report-group', name: '數據概覽', menuKey: 'promotion-report-overview', path: '/promotion-report-overview', icon: 'DashboardOutlined', type: 'menu', sortOrder: 1, status: 'enabled' },
          { id: 'promotion-report-order', parentId: 'promotion-report-group', name: '訂單效果報表', menuKey: 'promotion-report-order', path: '/promotion-report-order', icon: 'LineChartOutlined', type: 'menu', sortOrder: 2, status: 'enabled' },
          { id: 'promotion-report-compare', parentId: 'promotion-report-group', name: '推薦類型對比', menuKey: 'promotion-report-compare', path: '/promotion-report-compare', icon: 'PieChartOutlined', type: 'menu', sortOrder: 3, status: 'enabled' },
        ],
      },
    ],
  },
  {
    id: 'search', parentId: '0', name: '搜索管理', menuKey: 'search', path: '',
    icon: 'SearchOutlined', type: 'directory', sortOrder: 5, status: 'enabled',
    children: [
      {
        id: 'search-config-new', parentId: 'search', name: '搜索配置', menuKey: 'search-config-new', path: '',
        icon: 'SettingOutlined', type: 'directory', sortOrder: 1, status: 'enabled',
        children: [
          { id: 'global-config', parentId: 'search-config-new', name: '全局配置', menuKey: 'global-config', path: '/global-config', icon: 'GlobalOutlined', type: 'menu', sortOrder: 1, status: 'enabled' },
          { id: 'channel-strategy', parentId: 'search-config-new', name: '維度策略', menuKey: 'channel-strategy', path: '/channel-strategy', icon: 'ThunderboltOutlined', type: 'menu', sortOrder: 2, status: 'enabled' },
        ],
      },
      {
        id: 'search-guide', parentId: 'search', name: '搜索引導', menuKey: 'search-guide', path: '',
        icon: 'AimOutlined', type: 'directory', sortOrder: 2, status: 'enabled',
        children: [
          { id: 'hint-config', parentId: 'search-guide', name: '底紋配置', menuKey: 'hint-config', path: '/hint-config', icon: 'FontSizeOutlined', type: 'menu', sortOrder: 1, status: 'enabled' },
          { id: 'hot-search-config', parentId: 'search-guide', name: '熱搜配置', menuKey: 'hot-search-config', path: '/hot-search-config', icon: 'FireOutlined', type: 'menu', sortOrder: 2, status: 'enabled' },
          { id: 'search-weight-config', parentId: 'search-guide', name: '權重干預', menuKey: 'search-weight-config', path: '/search-weight-config', icon: 'ColumnHeightOutlined', type: 'menu', sortOrder: 3, status: 'enabled' },
        ],
      },
      {
        id: 'search-library', parentId: 'search', name: '搜索詞庫', menuKey: 'search-library', path: '',
        icon: 'ReadOutlined', type: 'directory', sortOrder: 3, status: 'enabled',
        children: [
          { id: 'word-segmentation', parentId: 'search-library', name: '分詞詞庫', menuKey: 'word-segmentation', path: '/word-segmentation', icon: 'ScissorOutlined', type: 'menu', sortOrder: 1, status: 'enabled' },
          { id: 'synonym-config', parentId: 'search-library', name: '同義詞庫', menuKey: 'synonym-config', path: '/synonym-config', icon: 'SwapOutlined', type: 'menu', sortOrder: 2, status: 'enabled' },
          { id: 'hot-search-library', parentId: 'search-library', name: '熱搜詞庫', menuKey: 'hot-search-library', path: '/hot-search-library', icon: 'FireOutlined', type: 'menu', sortOrder: 3, status: 'enabled' },
          { id: 'stop-words', parentId: 'search-library', name: '停用詞庫', menuKey: 'stop-words', path: '/stop-words', icon: 'StopOutlined', type: 'menu', sortOrder: 4, status: 'enabled' },
        ],
      },
      {
        id: 'search-verify-group', parentId: 'search', name: '效果校驗', menuKey: 'search-verify-group', path: '',
        icon: 'SafetyCertificateOutlined', type: 'directory', sortOrder: 4, status: 'enabled',
        children: [
          { id: 'search-verify', parentId: 'search-verify-group', name: '搜索校驗', menuKey: 'search-verify', path: '/search-verify', icon: 'SearchOutlined', type: 'menu', sortOrder: 1, status: 'enabled' },
          { id: 'hint-verify', parentId: 'search-verify-group', name: '底紋校驗', menuKey: 'hint-verify', path: '/hint-verify', icon: 'FontSizeOutlined', type: 'menu', sortOrder: 2, status: 'enabled' },
          { id: 'hot-search-verify', parentId: 'search-verify-group', name: '熱搜校驗', menuKey: 'hot-search-verify', path: '/hot-search-verify', icon: 'FireOutlined', type: 'menu', sortOrder: 3, status: 'enabled' },
        ],
      },
      {
        id: 'report', parentId: 'search', name: '報表統計', menuKey: 'report', path: '',
        icon: 'BarChartOutlined', type: 'directory', sortOrder: 5, status: 'enabled',
        children: [
          { id: 'hint-report', parentId: 'report', name: '底紋報表', menuKey: 'hint-report', path: '/hint-report', icon: 'LineChartOutlined', type: 'menu', sortOrder: 1, status: 'enabled' },
          { id: 'hot-search-report', parentId: 'report', name: '熱搜報表', menuKey: 'hot-search-report', path: '/hot-search-report', icon: 'LineChartOutlined', type: 'menu', sortOrder: 2, status: 'enabled' },
        ],
      },
    ],
  },
  {
    id: 'finance', parentId: '0', name: '財務管理', menuKey: 'finance', path: '',
    icon: 'MoneyCollectOutlined', type: 'directory', sortOrder: 6, status: 'enabled',
    children: [
      {
        id: 'promotion', parentId: 'finance', name: '推廣金管理', menuKey: 'promotion', path: '',
        icon: 'WalletOutlined', type: 'directory', sortOrder: 1, status: 'enabled',
        children: [
          { id: 'account-balance', parentId: 'promotion', name: '賬戶餘額', menuKey: 'account-balance', path: '/account-balance', icon: 'AccountBookOutlined', type: 'menu', sortOrder: 1, status: 'enabled' },
          { id: 'batch-query', parentId: 'promotion', name: '批次查詢', menuKey: 'batch-query', path: '/batch-query', icon: 'SearchOutlined', type: 'menu', sortOrder: 2, status: 'enabled' },
          { id: 'detail-query', parentId: 'promotion', name: '明細查詢', menuKey: 'detail-query', path: '/detail-query', icon: 'FileSearchOutlined', type: 'menu', sortOrder: 3, status: 'enabled' },
        ],
      },
      {
        id: 'merchant-reconcile', parentId: 'finance', name: '商戶通對賬', menuKey: 'merchant-reconcile', path: '',
        icon: 'AuditOutlined', type: 'directory', sortOrder: 2, status: 'enabled',
        children: [
          { id: 'writeoff-reconcile', parentId: 'merchant-reconcile', name: '充消對賬', menuKey: 'writeoff-reconcile', path: '/writeoff-reconcile', icon: 'AuditOutlined', type: 'menu', sortOrder: 1, status: 'enabled' },
          { id: 'debt-reconcile', parentId: 'merchant-reconcile', name: '欠款對賬', menuKey: 'debt-reconcile', path: '/debt-reconcile', icon: 'CheckCircleOutlined', type: 'menu', sortOrder: 2, status: 'enabled' },
        ],
      },
      {
        id: 'approval', parentId: 'finance', name: '審批管理', menuKey: 'approval', path: '',
        icon: 'CheckCircleOutlined', type: 'directory', sortOrder: 3, status: 'enabled',
        children: [
          { id: 'approval-center', parentId: 'approval', name: '審批中心', menuKey: 'approval-center', path: '/approval-center', icon: 'AuditOutlined', type: 'menu', sortOrder: 1, status: 'enabled' },
        ],
      },
    ],
  },
  {
    id: 'hr', parentId: '0', name: '集團人事', menuKey: 'hr', path: '',
    icon: 'TeamOutlined', type: 'directory', sortOrder: 7, status: 'enabled',
    children: [
      { id: 'employee-management', parentId: 'hr', name: '員工管理', menuKey: 'employee-management', path: '/employee-management', icon: 'UserOutlined', type: 'menu', sortOrder: 1, status: 'enabled' },
      { id: 'organization-management', parentId: 'hr', name: '組織管理', menuKey: 'organization-management', path: '/organization-management', icon: 'ApartmentOutlined', type: 'menu', sortOrder: 2, status: 'enabled' },
      { id: 'position-management', parentId: 'hr', name: '職位管理', menuKey: 'position-management', path: '/position-management', icon: 'IdcardOutlined', type: 'menu', sortOrder: 3, status: 'enabled' },
      { id: 'login-log', parentId: 'hr', name: '員工動態', menuKey: 'login-log', path: '/login-log', icon: 'ScheduleOutlined', type: 'menu', sortOrder: 4, status: 'enabled' },
    ],
  },
  {
    id: 'permission', parentId: '0', name: '權限管理', menuKey: 'permission', path: '',
    icon: 'LockOutlined', type: 'directory', sortOrder: 8, status: 'enabled',
    children: [
      { id: 'role-management', parentId: 'permission', name: '角色管理', menuKey: 'role-management', path: '/role-management', icon: 'SolutionOutlined', type: 'menu', sortOrder: 1, status: 'enabled' },
      { id: 'function-permission', parentId: 'permission', name: '功能授權', menuKey: 'function-permission', path: '/function-permission', icon: 'AppstoreOutlined', type: 'menu', sortOrder: 2, status: 'enabled' },
      { id: 'data-permission', parentId: 'permission', name: '數據授權', menuKey: 'data-permission', path: '/data-permission', icon: 'DatabaseOutlined', type: 'menu', sortOrder: 3, status: 'enabled' },
    ],
  },
  {
    id: 'system-config', parentId: '0', name: '系統配置', menuKey: 'system-config', path: '',
    icon: 'SettingOutlined', type: 'directory', sortOrder: 9, status: 'enabled',
    children: [
      { id: 'menu-config', parentId: 'system-config', name: '菜單配置', menuKey: 'menu-config', path: '/menu-config', icon: 'MenuOutlined', type: 'menu', sortOrder: 1, status: 'enabled' },
    ],
  },
]

/** ────── 扁平化树数据 ────── */
const flattenTree = (data: MenuItem[]): MenuItem[] => {
  const result: MenuItem[] = []
  data.forEach((item) => {
    result.push(item)
    if (item.children?.length) {
      result.push(...flattenTree(item.children))
    }
  })
  return result
}

/** ────── 主组件 ────── */
export default function MenuConfig() {
  const [data, setData] = useState<MenuItem[]>(generateMockData)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editForm] = Form.useForm()
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [searchText, setSearchText] = useState('')
  const [allExpanded, setAllExpanded] = useState(false)
  const [searchForm] = Form.useForm()

  // 新增/编辑弹窗
  const [modalVisible, setModalVisible] = useState(false)
  const [editing, setEditing] = useState<MenuItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [modalForm] = Form.useForm()

  /** 获取所有菜单 key */
  const allKeys = useMemo(() => {
    const keys: string[] = []
    const walk = (items: MenuItem[]) => {
      items.forEach((item) => {
        keys.push(item.id)
        if (item.children) walk(item.children)
      })
    }
    walk(data)
    return keys
  }, [data])

  /** 展开全部 / 收起全部 */
  const handleToggleExpandAll = useCallback(() => {
    if (allExpanded) {
      setExpandedKeys([])
      setAllExpanded(false)
    } else {
      setExpandedKeys(allKeys)
      setAllExpanded(true)
    }
  }, [allExpanded, allKeys])

  /** 搜索过滤 */
  const filteredData = useMemo(() => {
    if (!searchText.trim()) return data
    const keyword = searchText.trim().toLowerCase()
    const matchKeys = new Set<string>()
    const walk = (items: MenuItem[], parents: string[] = []) => {
      items.forEach((item) => {
        const isMatch = item.name.toLowerCase().includes(keyword)
          || item.menuKey.toLowerCase().includes(keyword)
          || item.path.toLowerCase().includes(keyword)
        if (isMatch) {
          matchKeys.add(item.id)
          parents.forEach((p) => matchKeys.add(p))
        }
        if (item.children) {
          walk(item.children, [...parents, item.id])
        }
      })
    }
    walk(data)
    const filter = (items: MenuItem[]): MenuItem[] => {
      return items
        .filter((item) => matchKeys.has(item.id))
        .map((item) => ({
          ...item,
          children: item.children ? filter(item.children) : undefined,
        }))
    }
    return filter(data)
  }, [data, searchText])

  /** 查询 */
  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    setSearchText(values.keyword?.trim() || '')
  }

  /** 重置 */
  const handleReset = () => {
    searchForm.resetFields()
    setSearchText('')
  }

  /** 开始行内编辑 */
  const handleEdit = (record: MenuItem) => {
    editForm.setFieldsValue({
      name: record.name,
      path: record.path,
      status: record.status,
    })
    setEditingKey(record.id)
  }

  /** 保存行内编辑 */
  const handleSave = async (id: string) => {
    try {
      const values = await editForm.validateFields()
      const updateItem = (items: MenuItem[]): MenuItem[] => {
        return items.map((item) => {
          if (item.id === id) {
            return { ...item, ...values }
          }
          if (item.children) {
            return { ...item, children: updateItem(item.children) }
          }
          return item
        })
      }
      setData(updateItem(data))
      setEditingKey(null)
      message.success('保存成功')
    } catch {
      // validation failed
    }
  }

  /** 取消行内编辑 */
  const handleCancel = () => {
    setEditingKey(null)
    editForm.resetFields()
  }

  /** 上移/下移 */
  const handleMove = (id: string, direction: 'up' | 'down') => {
    const moveInList = (items: MenuItem[]): MenuItem[] => {
      const idx = items.findIndex((i) => i.id === id)
      if (idx !== -1) {
        const newItems = [...items]
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1
        if (targetIdx >= 0 && targetIdx < newItems.length) {
          ;[newItems[idx], newItems[targetIdx]] = [newItems[targetIdx], newItems[idx]]
          newItems.forEach((item, i) => { item.sortOrder = i + 1 })
          return newItems
        }
        return items
      }
      return items.map((item) => {
        if (item.children) {
          return { ...item, children: moveInList(item.children) }
        }
        return item
      })
    }
    setData(moveInList(data))
    message.success(direction === 'up' ? '已上移' : '已下移')
  }

  /** 切换状态（带确认弹窗） */
  const handleToggleStatus = (record: MenuItem) => {
    const newStatus = record.status === 'enabled' ? 'disabled' : 'enabled'
    const actionText = newStatus === 'enabled' ? '啟用' : '停用'
    Modal.confirm({
      title: `確認${actionText}`,
      content: `確定要${actionText}菜單「${record.name}」嗎？`,
      okText: '確認',
      cancelText: '取消',
      onOk: () => {
        const toggle = (items: MenuItem[]): MenuItem[] => {
          return items.map((item) => {
            if (item.id === record.id) {
              return { ...item, status: newStatus }
            }
            if (item.children) {
              return { ...item, children: toggle(item.children) }
            }
            return item
          })
        }
        setData(toggle(data))
        message.success(`已${actionText}菜單「${record.name}」`)
      },
    })
  }

  /** 新增菜单 */
  const handleCreate = () => {
    setEditing(null)
    modalForm.resetFields()
    modalForm.setFieldsValue({ type: 'menu', status: 'enabled' })
    setModalVisible(true)
  }

  /** 弹窗提交 */
  const handleModalSubmit = async () => {
    try {
      const values = await modalForm.validateFields()
      setSubmitting(true)
      // Mock: 模拟保存
      await new Promise((resolve) => setTimeout(resolve, 500))
      if (editing) {
        message.success('菜單信息已更新')
      } else {
        message.success('菜單創建成功')
      }
      setModalVisible(false)
    } catch {
      // validation failed
    } finally {
      setSubmitting(false)
    }
  }

  /** 导出 */
  const handleExport = () => {
    const allItems = flattenTree(filteredData)
    if (allItems.length === 0) {
      message.warning('當前無數據可導出')
      return
    }
    // 简单 CSV 导出
    const headers = ['排序', '菜單名稱', '菜單Key', '路由路徑', '圖標', '類型', '狀態']
    const rows = allItems.map((item) => [
      item.sortOrder,
      item.name,
      item.menuKey,
      item.path || '-',
      item.icon,
      MENU_TYPE_MAP[item.type].label,
      item.status === 'enabled' ? '啟用' : '停用',
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '菜單配置.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  /** 判断是否在行内编辑中 */
  const isEditing = (record: MenuItem) => record.id === editingKey

  /** 表格列定义 */
  const columns: ColumnsType<MenuItem> = [
    {
      title: '排序',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 70,
      align: 'center',
      render: (sort: number) => (
        <span style={{ color: '#8C8C8C', fontSize: 13 }}>{sort}</span>
      ),
    },
    {
      title: '菜單名稱（中文）',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name: string, record) => {
        if (isEditing(record)) {
          return (
            <Form.Item name="name" style={{ margin: 0 }} rules={[{ required: true, message: '請輸入菜單名稱' }]}>
              <Input size="small" placeholder="菜單名稱" style={{ width: 160 }} />
            </Form.Item>
          )
        }
        return (
          <span style={{ fontWeight: record.type === 'directory' ? 600 : 400, color: '#262626' }}>
            {name}
          </span>
        )
      },
    },
    {
      title: '路由路徑',
      dataIndex: 'path',
      key: 'path',
      width: 200,
      render: (path: string, record) => {
        if (isEditing(record)) {
          return (
            <Form.Item name="path" style={{ margin: 0 }}>
              <Input size="small" placeholder="/path" style={{ width: 160 }} />
            </Form.Item>
          )
        }
        return path ? (
          <code style={{ fontSize: 12, color: '#595959', background: '#F5F5F5', padding: '2px 6px', borderRadius: 4 }}>{path}</code>
        ) : (
          <span style={{ color: '#BFBFBF' }}>—</span>
        )
      },
    },
    {
      title: '菜單 Key（英文）',
      dataIndex: 'menuKey',
      key: 'menuKey',
      width: 180,
      render: (key: string) => (
        <code style={{ fontSize: 12, color: '#722ED1' }}>{key}</code>
      ),
    },
    {
      title: '圖標',
      dataIndex: 'icon',
      key: 'icon',
      width: 140,
      render: (icon: string) => (
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{icon}</span>
      ),
    },
    {
      title: '類型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      align: 'center',
      render: (type: keyof typeof MENU_TYPE_MAP) => {
        const cfg = MENU_TYPE_MAP[type]
        return <Tag color={cfg.color} style={{ borderRadius: 4, fontSize: 12 }}>{cfg.label}</Tag>
      },
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      align: 'center',
      render: (status: string) => (
        status === 'enabled'
          ? <Tag color="success" style={{ borderRadius: 4 }}>啟用</Tag>
          : <Tag color="default" style={{ borderRadius: 4 }}>停用</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      align: 'center',
      fixed: 'right',
      render: (_: unknown, record) => {
        if (isEditing(record)) {
          return (
            <Space size={4}>
              <Button type="link" size="small" onClick={() => handleSave(record.id)}>保存</Button>
              <Button type="link" size="small" onClick={handleCancel}>取消</Button>
            </Space>
          )
        }
        return (
          <Space size={4}>
            <Button type="link" size="small" onClick={() => handleEdit(record)}>編輯</Button>
            <Tooltip title="上移">
              <Button type="link" size="small" icon={<ArrowUpOutlined />} onClick={() => handleMove(record.id, 'up')} />
            </Tooltip>
            <Tooltip title="下移">
              <Button type="link" size="small" icon={<ArrowDownOutlined />} onClick={() => handleMove(record.id, 'down')} />
            </Tooltip>
            <Button
              type="link"
              size="small"
              danger={record.status === 'enabled'}
              onClick={() => handleToggleStatus(record)}
            >
              {record.status === 'enabled' ? '停用' : '啟用'}
            </Button>
          </Space>
        )
      },
    },
  ]

  /** 列字段配置 */
  const columnMeta = columns.map((col) => ({ key: col.key as string, title: (col.title ?? '') as string }))
  const { configComponent, applyConfig } = useColumnConfig('menu-config', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  /** 展开配置 */
  const expandConfig = {
    expandedRowKeys: expandedKeys.length > 0 ? expandedKeys : undefined,
    onExpandedRowsChange: (keys: readonly Key[]) => {
      const strKeys = keys.map(String)
      setExpandedKeys(strKeys)
      setAllExpanded(strKeys.length === allKeys.length)
    },
  }

  return (
    <div className="content-area">
      {/* 搜索区 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label="搜索">
            <Input
              placeholder="菜單名稱 / Key / 路徑"
              allowClear
              onPressEnter={handleSearch}
            />
          </Form.Item>
          <Form.Item label="類型">
            <Select
              placeholder="全部"
              allowClear
              options={MENU_TYPE_OPTIONS}
            />
          </Form.Item>
          <Form.Item label="狀態">
            <Select
              placeholder="全部"
              allowClear
              options={[
                { label: '啟用', value: 'enabled' },
                { label: '停用', value: 'disabled' },
              ]}
            />
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

      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>導出</Button>
          <Button
            icon={allExpanded ? <ShrinkOutlined /> : <ExpandAltOutlined />}
            onClick={handleToggleExpandAll}
          >
            {allExpanded ? '收起全部' : '展開全部'}
          </Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新增
          </Button>
          {configComponent}
        </div>
      </div>

      {/* 表格 */}
      <Form form={editForm} component={false}>
        <Table<MenuItem>
          columns={applyConfig(columns)}
          dataSource={filteredData}
          rowKey="id"
          pagination={false}
          size="middle"
          scroll={{ x: 1100 }}
          {...expandConfig}
        />
      </Form>

      {/* 新增菜单弹窗 */}
      <Modal
        title={editing ? '編輯菜單' : '新增菜單'}
        open={modalVisible}
        onOk={handleModalSubmit}
        onCancel={() => setModalVisible(false)}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        width={520}
        destroyOnClose
      >
        <Form form={modalForm} layout="vertical">
          <Form.Item name="name" label="菜單名稱（中文）" rules={[{ required: true, message: '請輸入菜單名稱' }]}>
            <Input placeholder="例如：菜單配置" allowClear maxLength={50} />
          </Form.Item>
          <Form.Item name="menuKey" label="菜單 Key（英文）" rules={[{ required: true, message: '請輸入菜單Key' }]}>
            <Input placeholder="例如：menu-config" allowClear maxLength={100} disabled={!!editing} />
          </Form.Item>
          <Form.Item name="path" label="路由路徑">
            <Input placeholder="例如：/menu-config" allowClear maxLength={200} />
          </Form.Item>
          <Form.Item name="parentId" label="上級菜單" rules={[{ required: true, message: '請選擇上級菜單' }]}>
            <Select placeholder="請選擇上級菜單" allowClear>
              <Select.Option value="0">頂級菜單</Select.Option>
              {flattenTree(data)
                .filter((item) => item.type !== 'button')
                .map((item) => (
                  <Select.Option key={item.id} value={item.id}>
                    {item.name}
                  </Select.Option>
                ))}
            </Select>
          </Form.Item>
          <Form.Item name="type" label="菜單類型" rules={[{ required: true, message: '請選擇菜單類型' }]}>
            <Select placeholder="請選擇菜單類型" options={MENU_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="icon" label="圖標名稱">
            <Input placeholder="例如：SettingOutlined" allowClear maxLength={100} />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序">
            <Input placeholder="數字越小越靠前" allowClear />
          </Form.Item>
          <Form.Item name="status" label="狀態" valuePropName="checked"
            getValueFromEvent={(checked: boolean) => checked ? 'enabled' : 'disabled'}
            getValueProps={(value: string) => ({ checked: value === 'enabled' })}
          >
            <Switch checkedChildren="啟用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
