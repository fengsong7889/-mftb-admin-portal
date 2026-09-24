/**
 * 系统切换器（Round 2 · 分系统视图）。
 *
 * 位置：HeaderBar 左上角，跟随 Sidebar 折叠按钮右侧。
 * 数据源：`fetchPortalContext` 缓存的用户可进入系统列表；
 * 交互：
 *   1) 展示当前系统中文名 + 图标（未选中时展示"企業門戶"占位）；
 *   2) 点击展开下拉，可选择其他有权限的系统或返回门户；
 *   3) 选中另一个系统时：写 currentSystemCode → 跳该系统第一个可用菜单；无可用菜单则停留当前路径。
 *
 * 空态：无 portal 系统权限（用户 `accessibleSystems` 为空）时仅显示"返回門戶"按钮，不显示切换。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Dropdown, Button, Space, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { AppstoreOutlined, RightOutlined, SwapOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchPortalContext, type PortalSystem } from '../api/portal'
import { useAuth } from '../contexts/AuthContext'
import { useMenu } from '../contexts/MenuContext'
import { useCurrentSystem } from '../hooks/useCurrentSystem'
import { loadSystemNavigation, pickFirstEntryPath } from '../hooks/useSystemNavigation'
import { renderMenuIcon } from './MenuIcon'
import type { MenuVO } from '../api/menu'
import { resolveMenuPath } from '../constants/menuDataSource'
import './SystemSwitcher.css'

/** 系统内首个可用菜单：与 Portal 页保持一致的解析口径，避免进入系统后 Sidebar 高亮与跳转路径不一致 */
function resolveFirstEntryPath(
  systemCode: string,
  menuTree: MenuVO[] | null,
  hasMenuPermission: (key: string) => boolean,
  isAdmin: boolean,
): string | null {
  if (!menuTree) return null
  const roots = menuTree.filter((m) => m.systemCode === systemCode && m.status === 1)
  if (roots.length === 0) return null
  const visit = (nodes: MenuVO[]): string | null => {
    for (const node of nodes) {
      if (node.status !== 1) continue
      if (node.children?.length) {
        const child = visit(node.children)
        if (child) return child
      }
      const path = resolveMenuPath(node)
      if (node.type === 2 && path) {
        if (isAdmin || hasMenuPermission(node.menuKey)) return path
      }
    }
    return null
  }
  return visit(roots)
}

export default function SystemSwitcher() {
  const { t, i18n: i18nInstance } = useTranslation()
  const navigate = useNavigate()
  const { user, hasMenuPermission } = useAuth()
  const { menuTree } = useMenu()
  const { currentSystemCode, setCurrentSystemCode } = useCurrentSystem()
  const [systems, setSystems] = useState<PortalSystem[]>([])
  const switchRequest = useRef(0)
  useEffect(() => () => { switchRequest.current += 1 }, [])

  /** 加载可访问系统列表；无权限用户 systems=[]，仅显示"返回門戶"按钮。 */
  useEffect(() => {
    let cancelled = false
    fetchPortalContext()
      .then((ctx) => {
        if (!cancelled) setSystems(ctx.systems ?? [])
      })
      .catch(() => {
        if (!cancelled) setSystems([])
      })
    return () => { cancelled = true }
  }, [])

  const currentSystem = useMemo(
    () => systems.find((s) => s.code === currentSystemCode) ?? null,
    [systems, currentSystemCode],
  )

  const menuItems: MenuProps['items'] = useMemo(() => {
    const items: MenuProps['items'] = []
    if (systems.length > 0) {
      items.push({
        key: '__header_systems',
        label: <span className="system-switcher-group">業務系統</span>,
        type: 'group',
        children: systems.map((s) => ({
          key: s.code,
          icon: renderMenuIcon(s.icon ?? 'AppstoreOutlined'),
          label: (
            <div className="system-switcher-item">
              <span className="system-switcher-item-name">{s.name}</span>
              {s.code === currentSystemCode ? (
                <RightOutlined className="system-switcher-item-active" />
              ) : null}
            </div>
          ),
        })),
      })
    }
    items.push({ type: 'divider' as const })
    items.push({
      key: '__portal',
      icon: <AppstoreOutlined />,
      label: t('headerBar.backToPortal', '返回企業門戶'),
    })
    return items
  }, [systems, currentSystemCode, t, i18nInstance.language])

  const handleClick: MenuProps['onClick'] = ({ key }) => {
    const ticket = ++switchRequest.current
    if (key === '__portal') {
      setCurrentSystemCode(null)
      navigate('/portal')
      return
    }
    if (!currentSystemCode || key !== currentSystemCode) {
      // Round 5：优先走服务端剪枝导航，与后端 strict-mode 同源；失败回退旧的 menuTree 客户端解析。
      void (async () => {
        let firstPath: string | null
        try {
          const navTree = await loadSystemNavigation(key)
          firstPath = pickFirstEntryPath(navTree)
        } catch {
          firstPath = resolveFirstEntryPath(key, menuTree, hasMenuPermission, user?.role === 'admin')
        }
        if (ticket !== switchRequest.current) return
        // 路径与系统同步提交，避免旧页面的自动归属覆盖新选择；迟到请求不再导航。
        setCurrentSystemCode(key)
        navigate(firstPath ?? '/')
      })()
    }
  }

  const triggerLabel = currentSystem
    ? currentSystem.name
    : t('headerBar.selectSystem', '選擇系統')

  return (
    <Dropdown
      menu={{ items: menuItems, onClick: handleClick, selectable: false }}
      trigger={['click']}
      placement="bottomLeft"
      overlayClassName="system-switcher-dropdown"
    >
      <Tooltip title={t('headerBar.switchSystemTip', '切换业务系统')} placement="bottom">
        <Button type="text" className="system-switcher-trigger" icon={<SwapOutlined />}>
          <Space size={6}>
            <span className="system-switcher-trigger-label">{triggerLabel}</span>
          </Space>
        </Button>
      </Tooltip>
    </Dropdown>
  )
}
