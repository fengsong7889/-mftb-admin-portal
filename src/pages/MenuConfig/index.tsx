import { useState, useMemo, useCallback, useEffect } from 'react'
import { Table, Button, Input, Tag, Space, Tooltip, message, Modal, Form, Select, Switch, AutoComplete } from 'antd'
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
import { fetchMenuTree, createMenu, updateMenu, updateMenuStatus, deleteMenu } from '../../api/menu'
import type { MenuVO, MenuPayload } from '../../api/menu'
import { renderMenuIcon, getMenuIconOptions } from '../../components/MenuIcon'

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

/** ────── 前后端类型映射 ────── */
const TYPE_TO_NUM: Record<string, number> = { directory: 1, menu: 2, button: 3 }
const NUM_TO_TYPE: Record<number, string> = { 1: 'directory', 2: 'menu', 3: 'button' }
const STATUS_TO_NUM: Record<string, number> = { enabled: 1, disabled: 0 }
const NUM_TO_STATUS: Record<number, string> = { 1: 'enabled', 0: 'disabled' }

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

/** ────── 后端 VO → 前端 MenuItem 转换 ────── */
const voToItem = (vo: MenuVO): MenuItem => ({
  id: String(vo.id),
  parentId: vo.parentId != null ? String(vo.parentId) : '0',
  name: vo.name,
  menuKey: vo.menuKey,
  path: vo.path || '',
  icon: vo.icon || '',
  type: (NUM_TO_TYPE[vo.type] || 'menu') as MenuItem['type'],
  sortOrder: vo.sort ?? 0,
  status: (NUM_TO_STATUS[vo.status] || 'enabled') as MenuItem['status'],
  children: vo.children?.map(voToItem),
})

/** ────── 前端 MenuItem → 后端 Payload 转换 ────── */
const itemToPayload = (item: MenuItem, parentId?: string): MenuPayload => ({
  parentId: parentId != null ? Number(parentId) : (item.parentId !== '0' ? Number(item.parentId) : null),
  menuKey: item.menuKey,
  name: item.name,
  path: item.path || undefined,
  icon: item.icon || undefined,
  type: TYPE_TO_NUM[item.type] ?? 2,
  sort: item.sortOrder,
  status: STATUS_TO_NUM[item.status] ?? 1,
})

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
  const [data, setData] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(false)
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

  // 行勾选（导出用）
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])
  const [selectedRows, setSelectedRows] = useState<MenuItem[]>([])

  /** 当前弹窗选择的图标（用于预览） */
  const currentIcon = Form.useWatch('icon', modalForm)

  /** 加载菜单数据 */
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const tree = await fetchMenuTree()
      setData(tree.map(voToItem))
    } finally {
      setLoading(false)
    }
  }, [])

  /** 初始化加载 */
  useEffect(() => { loadData() }, [loadData])

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
      // 找到当前行数据
      const findItem = (items: MenuItem[]): MenuItem | undefined => {
        for (const item of items) {
          if (item.id === id) return item
          if (item.children) {
            const found = findItem(item.children)
            if (found) return found
          }
        }
        return undefined
      }
      const record = findItem(data)
      if (!record) return
      const updated = { ...record, ...values }
      await updateMenu(Number(id), itemToPayload(updated))
      message.success('保存成功')
      setEditingKey(null)
      loadData()
    } catch {
      // validation failed or API error
    }
  }

  /** 取消行内编辑 */
  const handleCancel = () => {
    setEditingKey(null)
    editForm.resetFields()
  }

  /** 上移/下移 */
  const handleMove = async (id: string, direction: 'up' | 'down') => {
    // 找到同级列表
    const findSiblings = (items: MenuItem[]): MenuItem[] | null => {
      for (const item of items) {
        if (item.children) {
          const idx = item.children.findIndex((c) => c.id === id)
          if (idx !== -1) return item.children
          const deeper = findSiblings(item.children)
          if (deeper) return deeper
        }
      }
      // 检查顶层
      const topIdx = items.findIndex((c) => c.id === id)
      if (topIdx !== -1) return items
      return null
    }
    const siblings = findSiblings(data)
    if (!siblings) return
    const idx = siblings.findIndex((i) => i.id === id)
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= siblings.length) {
      message.warning(direction === 'up' ? '已經是最前面' : '已經是最後面')
      return
    }
    // 交换排序
    const current = siblings[idx]
    const target = siblings[targetIdx]
    try {
      await updateMenu(Number(current.id), { ...itemToPayload(current), sort: target.sortOrder })
      await updateMenu(Number(target.id), { ...itemToPayload(target), sort: current.sortOrder })
      message.success(direction === 'up' ? '已上移' : '已下移')
      loadData()
    } catch {
      // API error
    }
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
      onOk: async () => {
        await updateMenuStatus(Number(record.id), STATUS_TO_NUM[newStatus])
        message.success(`已${actionText}菜單「${record.name}」`)
        loadData()
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

  /** 打开弹窗编辑（完整字段，含图标修改） */
  const handleOpenModalEdit = (record: MenuItem) => {
    setEditing(record)
    modalForm.setFieldsValue({
      name: record.name,
      menuKey: record.menuKey,
      path: record.path,
      parentId: record.parentId,
      type: record.type,
      icon: record.icon,
      sortOrder: record.sortOrder,
      status: record.status,
    })
    setModalVisible(true)
  }

  /** 弹窗提交 */
  const handleModalSubmit = async () => {
    try {
      const values = await modalForm.validateFields()
      setSubmitting(true)
      const payload: MenuPayload = {
        parentId: values.parentId === '0' || values.parentId === 0 ? null : Number(values.parentId),
        menuKey: values.menuKey,
        name: values.name,
        path: values.path || undefined,
        icon: values.icon || undefined,
        type: TYPE_TO_NUM[values.type] ?? 2,
        sort: values.sortOrder ? Number(values.sortOrder) : 0,
        status: values.status === 'enabled' ? 1 : 0,
      }
      if (editing) {
        await updateMenu(Number(editing.id), payload)
        message.success('菜單信息已更新')
      } else {
        await createMenu(payload)
        message.success('菜單創建成功')
      }
      setModalVisible(false)
      loadData()
    } catch {
      // validation failed or API error
    } finally {
      setSubmitting(false)
    }
  }

  /** 导出（优先导出勾选数据，未勾选时导出当前列表全部） */
  const handleExport = () => {
    const source = selectedRows.length > 0 ? selectedRows : filteredData
    const allItems = flattenTree(source)
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
    message.success(`已導出 ${allItems.length} 條數據${selectedRows.length > 0 ? '（勾選數據）' : ''}`)
  }

  /** 行勾选变化 */
  const handleRowSelectChange = (keys: Key[], rows: MenuItem[]) => {
    setSelectedRowKeys(keys)
    setSelectedRows(rows)
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
      width: 200,
      render: (icon: string) => {
        const node = renderMenuIcon(icon)
        return node ? (
          <Space size={8}>
            <span style={{ fontSize: 15, color: '#595959' }}>{node}</span>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{icon}</span>
          </Space>
        ) : (
          <span style={{ fontSize: 12, color: '#BFBFBF' }}>{icon || '—'}</span>
        )
      },
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
      width: 260,
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
            <Button type="link" size="small" onClick={() => handleOpenModalEdit(record)}>設置</Button>
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
          {selectedRowKeys.length > 0 && (
            <span style={{ fontSize: 12, color: '#8C8C8C', alignSelf: 'center' }}>
              已選 {selectedRowKeys.length} 項
            </span>
          )}
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
          loading={loading}
          rowSelection={{
            selectedRowKeys,
            onChange: handleRowSelectChange,
          }}
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
          <Form.Item
            name="icon"
            label="圖標"
            extra={currentIcon ? (
              <Space size={6} style={{ marginTop: 4 }}>
                <span style={{ fontSize: 15, color: '#595959' }}>{renderMenuIcon(currentIcon) ?? <span style={{ fontSize: 12, color: '#FF4D4F' }}>未識別圖標</span>}</span>
                <span style={{ fontSize: 12, color: '#8C8C8C' }}>{currentIcon}</span>
              </Space>
            ) : null}
          >
            <AutoComplete
              placeholder="選擇或輸入圖標名稱，如 SettingOutlined"
              allowClear
              showSearch
              filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
              options={getMenuIconOptions()}
            />
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
