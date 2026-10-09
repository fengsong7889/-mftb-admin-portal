/**
 * 菜单配置：按「业务系统 → 该系统菜单树」维护菜单名称。
 *
 * 设计约束（与平台约定一致，不得随意放开）：
 *  1. 只有左侧的业务系统名称由平台统一维护（sys_system + portal.systems.*.name 语言包），
 *     本页面不提供任何修改系统名称的入口；历史上「授权中心 / 门户 / 侧边栏」各自取名导致
 *     同一系统出现两套名字，现在一律经 getSystemDisplayName 取名。
 *  2. 右侧菜单树不论层级（一级入口目录 / 二级 / 三级 / 按钮）均可自由修改菜单名称。
 *  3. 菜单 Key / 路由路径 / 类型 / 上级 / 图标 / 新增 / 删除 / 排序属于结构变更：改 Key 会让该菜单的
 *     全部存量授权失效，因此收进「高级设置」独立页且仅内置超管可见（服务端另有守卫）。
 *
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Empty, Form, Input, Modal, Space, Spin, Switch, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ExpandAltOutlined,
  ExportOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShrinkOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchMenuTree, updateMenu, updateMenuStatus } from '../../api/menu'
import type { MenuVO } from '../../api/menu'
import { fetchSystemsCatalog, type SystemCatalogItem } from '../../api/systemAuthorization'
import { getSystemDisplayName } from '../../constants/portalSystems'
import { useAuth } from '../../contexts/AuthContext'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { renderMenuIcon } from '../../components/MenuIcon'
import './index.css'

/** Portal 哨兵系统：个人工作台入口，不作为可配置的业务系统展示 */
const PORTAL_SENTINEL = 'portal'

/** ────── 类型常量 ────── */
const MENU_TYPE_COLOR: Record<number, string> = { 1: 'blue', 2: 'green', 3: 'orange' }

/** 表格行：直接复用后端 MenuVO，children 保持树形结构交给 Table 渲染 */
type MenuRow = MenuVO

/** 一级菜单（系统入口目录）：名称仍可修改，仅加粗展示以区分层级 */
function isTopLevelRow(row: MenuVO): boolean {
  return row.parentId == null
}

/** 按系统裁剪菜单树：叶子菜单的 system_code 由后端回填，与顶级一致，因此可整棵裁剪 */
function pickSystemTree(nodes: MenuVO[], systemCode: string): MenuVO[] {
  return nodes
    .filter((node) => node.systemCode === systemCode)
    .map((node) => ({
      ...node,
      children: node.children ? pickSystemTree(node.children, systemCode) : undefined,
    }))
}

/** 统计系统内菜单数量（含目录/按钮，与列表可见范围一致） */
function countNodes(nodes: MenuVO[]): number {
  return nodes.reduce((sum, node) => sum + 1 + (node.children?.length ? countNodes(node.children) : 0), 0)
}

/** 关键词命中的节点及其全部祖先都要保留，否则深层菜单会因父级未命中而整棵消失 */
function filterTree(nodes: MenuVO[], keyword: string): MenuVO[] {
  if (!keyword) return nodes
  const walk = (list: MenuVO[]): MenuVO[] => list
    .map((node) => ({ ...node, children: node.children ? walk(node.children) : undefined }))
    .filter((node) => {
      const selfMatch = node.name.toLowerCase().includes(keyword)
        || node.menuKey.toLowerCase().includes(keyword)
        || (node.path ?? '').toLowerCase().includes(keyword)
      return selfMatch || (node.children?.length ?? 0) > 0
    })
  return walk(nodes)
}

/** 收集树中全部节点 id，供「展开全部」使用 */
function collectIds(nodes: MenuVO[], out: string[] = []): string[] {
  for (const node of nodes) {
    out.push(String(node.id))
    if (node.children?.length) collectIds(node.children, out)
  }
  return out
}

export default function MenuConfig() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  /** 内置超管才能进入高级设置；服务端会再校验一次，前端隐藏只是避免误点 */
  const isSuperAdmin = user?.role === 'admin'

  const [systems, setSystems] = useState<SystemCatalogItem[]>([])
  const [menuTree, setMenuTree] = useState<MenuVO[]>([])
  const [activeSystem, setActiveSystem] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [searchValue, setSearchValue] = useState('')
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [allExpanded, setAllExpanded] = useState(false)
  /** 行内编辑：一次只编辑一行，保存走单条原子写，避免批量写覆盖他人改动 */
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [nameForm] = Form.useForm<{ name: string; nameEn?: string }>()

  /** 初次加载：系统目录 + 全量菜单树 */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([fetchSystemsCatalog(), fetchMenuTree()])
      .then(([sysList, tree]) => {
        if (cancelled) return
        const configurable = (sysList ?? []).filter((s) => s.code !== PORTAL_SENTINEL)
        setSystems(configurable)
        setMenuTree(tree ?? [])
        setActiveSystem((prev) => prev ?? configurable[0]?.code ?? null)
      })
      .catch(() => {
        // 错误提示由请求层统一处理
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const reload = useCallback(async () => {
    const tree = await fetchMenuTree()
    setMenuTree(tree ?? [])
  }, [])

  /** 系统名称统一走全局取名入口，保证与门户/侧边栏/授权中心一致 */
  const systemNameOf = useCallback(
    (sys: SystemCatalogItem) => getSystemDisplayName(t, sys, i18n.language),
    [t, i18n.language],
  )

  /** 各系统菜单数量（左侧角标） */
  const menuCountBySystem = useMemo(() => {
    const map = new Map<string, number>()
    for (const sys of systems) {
      map.set(sys.code, countNodes(pickSystemTree(menuTree, sys.code)))
    }
    return map
  }, [systems, menuTree])

  const activeSystemName = useMemo(() => {
    const current = systems.find((s) => s.code === activeSystem)
    return current ? systemNameOf(current) : (activeSystem ?? '')
  }, [systems, activeSystem, systemNameOf])

  /** 当前系统全量节点数（不受筛选影响）；与筛选后的可见数分开标注，避免误导总数 */
  const systemTotalCount = menuCountBySystem.get(activeSystem ?? '') ?? 0

  /** 当前系统 + 关键词过滤后的树 */
  const treeData = useMemo(() => {
    const scoped = activeSystem ? pickSystemTree(menuTree, activeSystem) : []
    return filterTree(scoped, keyword.trim().toLowerCase())
  }, [menuTree, activeSystem, keyword])

  const allRowKeys = useMemo(() => collectIds(treeData), [treeData])

  /** 切换系统：清空行内编辑与过滤，避免把上一个系统的编辑态带过来 */
  const handleSelectSystem = (code: string) => {
    if (code === activeSystem) return
    if (editingId != null) {
      Modal.confirm({
        title: t('menuConfig.discardTitle'),
        content: t('menuConfig.discardContent'),
        okText: t('common.confirm'),
        cancelText: t('common.cancel'),
        okButtonProps: { danger: true },
        onOk: () => {
          setEditingId(null)
          nameForm.resetFields()
          setActiveSystem(code)
          setKeyword('')
          setSearchValue('')
          setExpandedKeys([])
          setAllExpanded(false)
        },
      })
      return
    }
    setActiveSystem(code)
    setKeyword('')
    setSearchValue('')
    setExpandedKeys([])
    setAllExpanded(false)
  }

  const handleToggleExpandAll = () => {
    if (allExpanded) {
      setExpandedKeys([])
      setAllExpanded(false)
    } else {
      setExpandedKeys(allRowKeys)
      setAllExpanded(true)
    }
  }

  const handleSearch = () => setKeyword(searchValue.trim())

  const handleReset = () => {
    setSearchValue('')
    setKeyword('')
  }

  /** 一级菜单不再特殊锁定：平台只锁左侧系统名称，右侧任意层级菜单都可改名 */

  const handleStartEdit = (row: MenuRow) => {
    nameForm.setFieldsValue({ name: row.name, nameEn: row.nameEn ?? '' })
    setEditingId(row.id)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    nameForm.resetFields()
  }

  /** 仅提交名称字段，其余字段原样回传，避免 update 接口把 actions/component 等结构字段清空 */
  const handleSaveName = async (row: MenuRow) => {
    let values: { name: string; nameEn?: string }
    try {
      values = await nameForm.validateFields()
    } catch {
      return
    }
    const trimmed = values.name.trim()
    if (trimmed === row.name && (values.nameEn?.trim() ?? '') === (row.nameEn ?? '')) {
      message.info(t('menuConfig.nameUnchanged'))
      setEditingId(null)
      return
    }
    setSaving(true)
    try {
      await updateMenu(row.id, {
        parentId: row.parentId,
        menuKey: row.menuKey,
        name: trimmed,
        nameEn: values.nameEn?.trim() || undefined,
        path: row.path || undefined,
        component: row.component || undefined,
        icon: row.icon || undefined,
        type: row.type,
        sort: row.sort,
        actions: row.actions ?? undefined,
        status: row.status,
      })
      message.success(t('menuConfig.updateSuccess'))
      setEditingId(null)
      await reload()
    } catch {
      // 错误提示由请求层统一处理，保留编辑态供用户重试
    } finally {
      setSaving(false)
    }
  }

  /** 启用/停用：状态开关必须先二次确认（UI 规范 §B.8） */
  const handleToggleStatus = (row: MenuRow) => {
    const enable = row.status !== 1
    const actionText = enable ? t('common.enable') : t('common.disable')
    Modal.confirm({
      title: t('menuConfig.confirmToggle', { action: actionText }),
      content: t('menuConfig.confirmToggleContent', { action: actionText, name: row.name }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await updateMenuStatus(row.id, enable ? 1 : 0)
        message.success(t('menuConfig.toggleSuccess', { action: actionText, name: row.name }))
        await reload()
      },
    })
  }

  /** 同级交换 sort；一级菜单不参与排序（结构顺序由平台维护） */
  const handleMove = async (row: MenuRow, direction: 'up' | 'down') => {
    const siblings = findSiblings(menuTree, row.id)
    if (!siblings) return
    const index = siblings.findIndex((s) => s.id === row.id)
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= siblings.length) {
      message.warning(direction === 'up' ? t('menuConfig.moveFirst') : t('menuConfig.moveLast'))
      return
    }
    const current = siblings[index]
    const target = siblings[targetIndex]
    try {
      await updateMenu(current.id, toPayload(current, target.sort))
      await updateMenu(target.id, toPayload(target, current.sort))
      message.success(direction === 'up' ? t('menuConfig.movedUp') : t('menuConfig.movedDown'))
      await reload()
    } catch {
      // 错误提示由请求层统一处理
    }
  }

  const columns: ColumnsType<MenuRow> = [
    {
      title: t('menuConfig.colNameZh'),
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (name: string, row) => {
        if (editingId === row.id) {
          return (
            <Form.Item name="name" style={{ margin: 0 }} rules={[{ required: true, message: t('menuConfig.menuNameRequired') }]}>
              <Input size="small" placeholder={t('menuConfig.namePlaceholder')} maxLength={50} />
            </Form.Item>
          )
        }
        return (
          <span className={`menucfg-name${isTopLevelRow(row) ? ' menucfg-name--top' : ''}`}>{name}</span>
        )
      },
    },
    {
      title: t('menuConfig.menuNameEn'),
      dataIndex: 'nameEn',
      key: 'nameEn',
      width: 200,
      render: (nameEn: string | undefined, row) => {
        if (editingId === row.id) {
          return (
            <Form.Item name="nameEn" style={{ margin: 0 }}>
              <Input size="small" placeholder={t('menuConfig.menuNameEnPlaceholder')} maxLength={100} />
            </Form.Item>
          )
        }
        return nameEn
          ? <span className="menucfg-name-en">{nameEn}</span>
          : <span className="menucfg-muted">—</span>
      },
    },
    {
      title: t('menuConfig.colMenuKey'),
      dataIndex: 'menuKey',
      key: 'menuKey',
      width: 190,
      render: (key: string) => <code className="menucfg-code menucfg-code--key">{key}</code>,
    },
    {
      title: t('menuConfig.colPath'),
      dataIndex: 'path',
      key: 'path',
      width: 200,
      render: (path: string | undefined) => (path
        ? <code className="menucfg-code">{path}</code>
        : <span className="menucfg-muted">—</span>),
    },
    {
      title: t('menuConfig.colIcon'),
      dataIndex: 'icon',
      key: 'icon',
      width: 170,
      render: (icon: string | undefined) => {
        const node = renderMenuIcon(icon)
        return node ? (
          <Space size={8}>
            <span className="menucfg-icon">{node}</span>
            <span className="menucfg-muted">{icon}</span>
          </Space>
        ) : <span className="menucfg-muted">—</span>
      },
    },
    {
      title: t('menuConfig.colType'),
      dataIndex: 'type',
      key: 'type',
      width: 80,
      align: 'center',
      render: (type: number) => (
        <Tag color={MENU_TYPE_COLOR[type] ?? 'default'} className="menucfg-type-tag">
          {type === 1 ? t('menuConfig.typeDirectory') : type === 2 ? t('menuConfig.typeMenu') : t('menuConfig.typeButton')}
        </Tag>
      ),
    },
    {
      title: t('menuConfig.colSort'),
      dataIndex: 'sort',
      key: 'sort',
      width: 70,
      align: 'center',
      render: (sort: number) => <span className="menucfg-muted">{sort}</span>,
    },
    {
      title: t('menuConfig.colStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 90,
      align: 'center',
      render: (_: unknown, row) => (
        <Switch
          checked={row.status === 1}
          checkedChildren="啟用"
          unCheckedChildren="停用"
          onChange={() => handleToggleStatus(row)}
        />
      ),
    },
    {
      title: t('menuConfig.colAction'),
      key: 'action',
      width: 230,
      align: 'center',
      fixed: 'right',
      render: (_: unknown, row) => {
        if (editingId === row.id) {
          return (
            <Space size={0} split={<span className="action-split">|</span>}>
              <Button type="link" size="small" loading={saving} onClick={() => handleSaveName(row)}>{t('menuConfig.btnSave')}</Button>
              <Button type="link" size="small" onClick={handleCancelEdit}>{t('menuConfig.btnCancel')}</Button>
            </Space>
          )
        }
        return (
          <Space size={0} split={<span className="action-split">|</span>}>
            <Button type="link" size="small" onClick={() => handleStartEdit(row)}>{t('menuConfig.btnEdit')}</Button>
            {isSuperAdmin ? (
              <Button
                type="link"
                size="small"
                onClick={() => navigate(`/menu-config/setting?id=${row.id}&system=${encodeURIComponent(activeSystem ?? '')}`)}
              >
                {/* 高级设置=结构字段（Key/路径/上级/类型/图标），仅超管可见 */}
                {t('menuConfig.btnAdvanced')}
              </Button>
            ) : null}
            {isSuperAdmin ? (
              <>
                <Button type="link" size="small" onClick={() => handleMove(row, 'up')}>{t('menuConfig.btnMoveUp')}</Button>
                <Button type="link" size="small" onClick={() => handleMove(row, 'down')}>{t('menuConfig.btnMoveDown')}</Button>
              </>
            ) : null}
          </Space>
        )
      },
    },
  ]

  /** 列字段配置（列表页强制规范） */
  const columnMeta = columns.map((col) => ({ key: col.key as string, title: (col.title ?? '') as string }))
  const { configComponent, applyConfig } = useColumnConfig('menu-config', columnMeta, [
    { key: 'name', visible: true, locked: 'head' },
    { key: 'action', visible: true, locked: 'tail' },
  ])

  /** 导出当前系统内的全部节点（平铺，保留层级路径便于人工核对） */
  const handleExport = () => {
    if (treeData.length === 0) {
      message.warning(t('menuConfig.noDataToExport'))
      return
    }
    const headers = [t('menuConfig.colNameZh'), t('menuConfig.menuNameEn'), t('menuConfig.colMenuKey'), t('menuConfig.colPath'), t('menuConfig.colIcon'), t('menuConfig.colType'), t('menuConfig.colSort'), t('menuConfig.colStatus')]
    const rows: (string | number)[][] = []
    const walk = (nodes: MenuVO[], prefix: string[]) => {
      for (const node of nodes) {
        rows.push([
          [...prefix, node.name].join(' / '),
          node.nameEn ?? '',
          node.menuKey,
          node.path ?? '',
          node.icon ?? '',
          node.type === 1 ? t('menuConfig.typeDirectory') : node.type === 2 ? t('menuConfig.typeMenu') : t('menuConfig.typeButton'),
          node.sort,
          node.status === 1 ? t('common.enable') : t('common.disable'),
        ])
        if (node.children?.length) walk(node.children, [...prefix, node.name])
      }
    }
    walk(treeData, [])
    const csv = [headers.join(','), ...rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${t('menuConfig.pageTitle')}_${activeSystemName}.csv`
    a.click()
    URL.revokeObjectURL(url)
    message.success(t('menuConfig.exportSuccess', { count: rows.length }))
  }

  return (
    <div className="content-area">
      {/* 顶部提示：把「系统名称不可人工修改」的边界直接写在界面上，避免管理员到处找入口 */}
      <Alert
        className="menucfg-notice"
        type="info"
        showIcon
        message={t('menuConfig.noticeTitle')}
        description={t('menuConfig.noticeDesc')}
      />

      {loading ? (
        <div className="menucfg-loading"><Spin size="large" /></div>
      ) : systems.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('menuConfig.noSystem')} />
      ) : (
        <div className="menucfg-workbench">
          {/* 左：系统列表（与授权中心同一交互与取名口径） */}
          <div className="menucfg-sys-panel">
            <div className="menucfg-sys-panel-title">{t('authorizationCenter.systemsSection', '業務系統')}</div>
            <div className="menucfg-sys-list">
              {systems.map((sys) => {
                const count = menuCountBySystem.get(sys.code) ?? 0
                return (
                  <div
                    key={sys.code}
                    className={`menucfg-sys-item${sys.code === activeSystem ? ' menucfg-sys-item--active' : ''}`}
                    onClick={() => handleSelectSystem(sys.code)}
                  >
                    <span className="menucfg-sys-name">{systemNameOf(sys)}</span>
                    <span className="menucfg-sys-count">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 右：当前系统菜单树 */}
          <div className="menucfg-main">
            <div className="menucfg-main-header">
              <span className="menucfg-main-title">{activeSystemName}</span>
              <span className="menucfg-main-sub">
                {keyword
                  ? t('menuConfig.nodeCountFiltered', { shown: allRowKeys.length, total: systemTotalCount })
                  : t('menuConfig.nodeCount', { count: systemTotalCount })}
              </span>
              <div className="menucfg-main-actions">
                <Input
                  className="menucfg-search"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onPressEnter={handleSearch}
                  placeholder={t('menuConfig.searchPlaceholder')}
                  allowClear
                  prefix={<SearchOutlined className="menucfg-search-icon" />}
                />
                <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
                <Button
                  icon={allExpanded ? <ShrinkOutlined /> : <ExpandAltOutlined />}
                  onClick={handleToggleExpandAll}
                  disabled={treeData.length === 0}
                >
                  {allExpanded ? t('menuConfig.collapseAll') : t('menuConfig.expandAll')}
                </Button>
                <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>{t('common.export')}</Button>
                {isSuperAdmin ? (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => navigate(`/menu-config/setting?system=${encodeURIComponent(activeSystem ?? '')}`)}
                  >
                    {t('common.add')}
                  </Button>
                ) : null}
                {configComponent}
              </div>
            </div>

            <Form form={nameForm} component={false}>
              <Table<MenuRow>
                key={activeSystem ?? 'none'}
                className="menucfg-table"
                columns={applyConfig(columns)}
                dataSource={treeData}
                rowKey={(row) => String(row.id)}
                pagination={false}
                size="middle"
                scroll={{ x: 1400 }}
                expandable={{
                  expandedRowKeys: expandedKeys,
                  onExpandedRowsChange: (keys) => {
                    const strKeys = keys.map(String)
                    setExpandedKeys(strKeys)
                    setAllExpanded(strKeys.length >= allRowKeys.length && allRowKeys.length > 0)
                  },
                }}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('menuConfig.noMenuInSystem')} /> }}
              />
            </Form>
          </div>
        </div>
      )}
    </div>
  )
}

/** 把后端 VO 原样转成提交载荷，只覆盖需要变更的字段（防止结构字段被清空） */
function toPayload(row: MenuVO, sort?: number) {
  return {
    parentId: row.parentId,
    menuKey: row.menuKey,
    name: row.name,
    nameEn: row.nameEn || undefined,
    path: row.path || undefined,
    component: row.component || undefined,
    icon: row.icon || undefined,
    type: row.type,
    sort: sort ?? row.sort,
    actions: row.actions ?? undefined,
    status: row.status,
  }
}

/** 在树中定位某节点的同级列表，供上移/下移交换排序 */
function findSiblings(nodes: MenuVO[], id: number): MenuVO[] | null {
  const topIndex = nodes.findIndex((n) => n.id === id)
  if (topIndex !== -1) return nodes
  for (const node of nodes) {
    if (!node.children?.length) continue
    const found = findSiblings(node.children, id)
    if (found) return found
  }
  return null
}
