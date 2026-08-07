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
import { useTranslation } from 'react-i18next'
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
const MENU_TYPE_COLOR: Record<string, string> = {
  directory: 'blue',
  menu: 'green',
  button: 'orange',
}

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
  const { t } = useTranslation()
  const [data, setData] = useState<MenuItem[]>([])

  /** 菜單類型標籤（依賴 t，定義在組件內以便響應語言切換） */
  const TYPE_LABEL: Record<string, string> = {
    directory: t('menuConfig.typeDirectory'),
    menu: t('menuConfig.typeMenu'),
    button: t('menuConfig.typeButton'),
  }
  const TYPE_OPTIONS = [
    { label: t('menuConfig.typeDirectory'), value: 'directory' },
    { label: t('menuConfig.typeMenu'), value: 'menu' },
    { label: t('menuConfig.typeButton'), value: 'button' },
  ]
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
      message.success(t('menuConfig.saveSuccess'))
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
      message.warning(direction === 'up' ? t('menuConfig.moveFirst') : t('menuConfig.moveLast'))
      return
    }
    // 交换排序
    const current = siblings[idx]
    const target = siblings[targetIdx]
    try {
      await updateMenu(Number(current.id), { ...itemToPayload(current), sort: target.sortOrder })
      await updateMenu(Number(target.id), { ...itemToPayload(target), sort: current.sortOrder })
      message.success(direction === 'up' ? t('menuConfig.movedUp') : t('menuConfig.movedDown'))
      loadData()
    } catch {
      // API error
    }
  }

  /** 切换状态（带确认弹窗） */
  const handleToggleStatus = (record: MenuItem) => {
    const newStatus = record.status === 'enabled' ? 'disabled' : 'enabled'
    const actionText = newStatus === 'enabled' ? t('common.enable') : t('common.disable')
    Modal.confirm({
      title: t('menuConfig.confirmToggle', { action: actionText }),
      content: t('menuConfig.confirmToggleContent', { action: actionText, name: record.name }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await updateMenuStatus(Number(record.id), STATUS_TO_NUM[newStatus])
        message.success(t('menuConfig.toggleSuccess', { action: actionText, name: record.name }))
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
        message.success(t('menuConfig.updateSuccess'))
      } else {
        await createMenu(payload)
        message.success(t('menuConfig.createSuccess'))
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
      message.warning(t('menuConfig.noDataToExport'))
      return
    }
    const headers = [t('menuConfig.colSort'), t('menuConfig.colNameZh'), t('menuConfig.colMenuKey'), t('menuConfig.colPath'), t('menuConfig.colIcon'), t('menuConfig.colType'), t('menuConfig.colStatus')]
    const rows = allItems.map((item) => [
      item.sortOrder,
      item.name,
      item.menuKey,
      item.path || '-',
      item.icon,
      TYPE_LABEL[item.type],
      item.status === 'enabled' ? t('common.enable') : t('common.disable'),
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${t('menuConfig.pageTitle')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    message.success(`${t('menuConfig.exportSuccess', { count: allItems.length })}${selectedRows.length > 0 ? t('menuConfig.exportSelected') : ''}`)
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
      title: t('menuConfig.colSort'),
      key: 'sortOrder',
      width: 70,
      align: 'center',
      render: (sort: number) => (
        <span style={{ color: '#8C8C8C', fontSize: 13 }}>{sort}</span>
      ),
    },
    {
      title: t('menuConfig.colNameZh'),
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name: string, record) => {
        if (isEditing(record)) {
          return (
            <Form.Item name="name" style={{ margin: 0 }} rules={[{ required: true, message: t('menuConfig.menuNameRequired') }]}>
              <Input size="small" placeholder={t('menuConfig.namePlaceholder')} style={{ width: 160 }} />
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
      title: t('menuConfig.colPath'),
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
      title: t('menuConfig.colMenuKey'),
      dataIndex: 'menuKey',
      key: 'menuKey',
      width: 180,
      render: (key: string) => (
        <code style={{ fontSize: 12, color: '#722ED1' }}>{key}</code>
      ),
    },
    {
      title: t('menuConfig.colIcon'),
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
      title: t('menuConfig.colType'),
      dataIndex: 'type',
      key: 'type',
      width: 80,
      align: 'center',
      render: (type: string) => {
        return <Tag color={MENU_TYPE_COLOR[type] || 'default'} style={{ borderRadius: 4, fontSize: 12 }}>{TYPE_LABEL[type]}</Tag>
      },
    },
    {
      title: t('menuConfig.colStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 80,
      align: 'center',
      render: (status: string) => (
        status === 'enabled'
          ? <Tag color="success" style={{ borderRadius: 4 }}>{t('common.enable')}</Tag>
          : <Tag color="default" style={{ borderRadius: 4 }}>{t('common.disable')}</Tag>
      ),
    },
    {
      title: t('menuConfig.colAction'),
      key: 'action',
      width: 260,
      align: 'center',
      fixed: 'right',
      render: (_: unknown, record) => {
        if (isEditing(record)) {
          return (
            <Space size={4}>
              <Button type="link" size="small" onClick={() => handleSave(record.id)}>{t('menuConfig.btnSave')}</Button>
              <Button type="link" size="small" onClick={handleCancel}>{t('menuConfig.btnCancel')}</Button>
            </Space>
          )
        }
        return (
          <Space size={4}>
            <Button type="link" size="small" onClick={() => handleEdit(record)}>{t('menuConfig.btnEdit')}</Button>
            <Button type="link" size="small" onClick={() => handleOpenModalEdit(record)}>{t('menuConfig.btnSettings')}</Button>
            <Tooltip title={t('menuConfig.tooltipMoveUp')}>
              <Button type="link" size="small" icon={<ArrowUpOutlined />} onClick={() => handleMove(record.id, 'up')} />
            </Tooltip>
            <Tooltip title={t('menuConfig.tooltipMoveDown')}>
              <Button type="link" size="small" icon={<ArrowDownOutlined />} onClick={() => handleMove(record.id, 'down')} />
            </Tooltip>
            <Button
              type="link"
              size="small"
              danger={record.status === 'enabled'}
              onClick={() => handleToggleStatus(record)}
            >
              {record.status === 'enabled' ? t('common.disable') : t('common.enable')}
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
          <Form.Item label={t('menuConfig.searchLabel')}>
            <Input
              placeholder={t('menuConfig.searchPlaceholder')}
              allowClear
              onPressEnter={handleSearch}
            />
          </Form.Item>
          <Form.Item label={t('menuConfig.searchType')}>
            <Select
              placeholder={t('common.all')}
              allowClear
              options={TYPE_OPTIONS}
            />
          </Form.Item>
          <Form.Item label={t('menuConfig.searchStatus')}>
            <Select
              placeholder={t('common.all')}
              allowClear
              options={[
                { label: t('common.enable'), value: 'enabled' },
                { label: t('common.disable'), value: 'disabled' },
              ]}
            />
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
          {selectedRowKeys.length > 0 && (
            <span style={{ fontSize: 12, color: '#8C8C8C', alignSelf: 'center' }}>
              {t('menuConfig.selectedCount', { count: selectedRowKeys.length })}
            </span>
          )}
          <Button
            icon={allExpanded ? <ShrinkOutlined /> : <ExpandAltOutlined />}
            onClick={handleToggleExpandAll}
          >
            {allExpanded ? t('menuConfig.collapseAll') : t('menuConfig.expandAll')}
          </Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            {t('common.add')}
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
        title={editing ? t('menuConfig.editTitle') : t('menuConfig.addTitle')}
        open={modalVisible}
        onOk={handleModalSubmit}
        onCancel={() => setModalVisible(false)}
        confirmLoading={submitting}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={520}
        destroyOnClose
      >
        <Form form={modalForm} layout="vertical">
          <Form.Item name="name" label={t('menuConfig.menuName')} rules={[{ required: true, message: t('menuConfig.menuNameRequired') }]}>
            <Input placeholder={t('menuConfig.menuNamePlaceholder')} allowClear maxLength={50} />
          </Form.Item>
          <Form.Item name="menuKey" label={t('menuConfig.menuKey')} rules={[{ required: true, message: t('menuConfig.menuKeyRequired') }]}>
            <Input placeholder={t('menuConfig.menuKeyPlaceholder')} allowClear maxLength={100} disabled={!!editing} />
          </Form.Item>
          <Form.Item name="path" label={t('menuConfig.routePath')}>
            <Input placeholder={t('menuConfig.routePathPlaceholder')} allowClear maxLength={200} />
          </Form.Item>
          <Form.Item name="parentId" label={t('menuConfig.parentMenu')} rules={[{ required: true, message: t('menuConfig.parentMenuRequired') }]}>
            <Select placeholder={t('menuConfig.parentMenuPlaceholder')} allowClear>
              <Select.Option value="0">{t('menuConfig.topLevelMenu')}</Select.Option>
              {flattenTree(data)
                .filter((item) => item.type !== 'button')
                .map((item) => (
                  <Select.Option key={item.id} value={item.id}>
                    {item.name}
                  </Select.Option>
                ))}
            </Select>
          </Form.Item>
          <Form.Item name="type" label={t('menuConfig.menuType')} rules={[{ required: true, message: t('menuConfig.menuTypeRequired') }]}>
            <Select placeholder={t('menuConfig.menuTypePlaceholder')} options={TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="icon"
            label={t('menuConfig.iconLabel')}
            extra={currentIcon ? (
              <Space size={6} style={{ marginTop: 4 }}>
                <span style={{ fontSize: 15, color: '#595959' }}>{renderMenuIcon(currentIcon) ?? <span style={{ fontSize: 12, color: '#FF4D4F' }}>{t('menuConfig.iconUnknown')}</span>}</span>
                <span style={{ fontSize: 12, color: '#8C8C8C' }}>{currentIcon}</span>
              </Space>
            ) : null}
          >
            <AutoComplete
              placeholder={t('menuConfig.iconExtra')}
              allowClear
              showSearch
              filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
              options={getMenuIconOptions()}
            />
          </Form.Item>
          <Form.Item name="sortOrder" label={t('menuConfig.sortLabel')}>
            <Input placeholder={t('menuConfig.sortPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item name="status" label={t('menuConfig.statusLabel')} valuePropName="checked"
            getValueFromEvent={(checked: boolean) => checked ? 'enabled' : 'disabled'}
            getValueProps={(value: string) => ({ checked: value === 'enabled' })}
          >
            <Switch checkedChildren={t('common.enable')} unCheckedChildren={t('common.disable')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
