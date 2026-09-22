import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import type { MenuVO } from '../api/menu'
import { BACKEND_CONNECTED_KEYS, keyToPath, pathToKey } from '../constants/menuDataSource'
import { CONTROLLED_MENU_KEYS, ROUTE_MENU_KEY_MAP } from '../pages/Permission/types'
import { renderMenuIcon } from './MenuIcon'
import MenuPermissionGuard from './MenuPermissionGuard'

/**
 * 侧边栏菜单真值来源回归测试。
 *
 * 业务规则：后端停服时只展示尚未对接后端业务接口的菜单。
 * - 菜单名称/层级唯一真值源是后端 /api/menus/tree；
 * - 前端只保留「完全未接入后端 API 的离线菜单」(src/constants/offlineMenus.ts)，
 *   后端树可用时它只能补挂 DB 完全缺失的项，且绝不覆盖 DB 名称；
 * - 后端不可用时只渲染离线菜单并显示提示条。
 *
 * 注：菜单获取已统一由 MenuContext 管理，测试通过 mock useMenu 控制状态。
 */

/** 可控的菜单 Context mock */
let mockMenuTree: MenuVO[] | null = null
let mockMenuStatus: 'loading' | 'online' | 'offline' | 'error' = 'online'
const mockDeniedMenuKeys = new Set<string>()
const hasMockMenuPermission = (key: string) => !CONTROLLED_MENU_KEYS.includes(key) || !mockDeniedMenuKeys.has(key)

vi.mock('../contexts/MenuContext', () => ({
  useMenu: () => ({ menuTree: mockMenuTree, status: mockMenuStatus, refresh: vi.fn() }),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    hasMenuPermission: hasMockMenuPermission,
    user: { role: 'guest' },
  }),
}))

// 语言映射依赖 i18next 实例，测试里固定为「原样返回 DB 名称」
vi.mock('../i18n/menuNameEn', () => ({
  translateMenuName: (_menuKey: string, zhName: string) => zhName,
}))

import Sidebar from './Sidebar'

const setMenuState = (tree: MenuVO[] | null, status: 'loading' | 'online' | 'offline' | 'error') => {
  mockMenuTree = tree
  mockMenuStatus = status
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="current-path">{location.pathname}</output>
}

const renderSidebar = (path = '/') => render(
  <MemoryRouter initialEntries={[path]}>
    <Sidebar collapsed={false} />
    <LocationProbe />
  </MemoryRouter>,
)

const consumableMenus: MenuVO[] = [
  { id: 2, parentId: 1, menuKey: 'consumable-inbound', name: '耗材入庫', path: '/consumable-inbound', icon: 'ImportOutlined', type: 2, status: 1, sort: 3 },
  { id: 3, parentId: 1, menuKey: 'consumable-report', name: '消耗統計', path: '/consumable-report', icon: 'FundOutlined', type: 2, status: 1, sort: 8 },
]

function setConsumableMenus(withIcons = true) {
  setMenuState([{
    id: 1, parentId: null, menuKey: 'consumable-ops', name: '耗材管理', type: 1, status: 1, sort: 2,
    children: consumableMenus.map((menu) => ({ ...menu, icon: withIcons ? menu.icon : undefined })),
  }], 'online')
}

afterEach(() => {
  cleanup()
  mockMenuTree = null
  mockMenuStatus = 'online'
  mockDeniedMenuKeys.clear()
})

describe('Sidebar 菜单真值来源', () => {
  it.each(consumableMenus)('$menuKey：导航、后端连接、权限与图标登记完整', (menu) => {
    expect(keyToPath[menu.menuKey]).toBe(menu.path)
    expect(pathToKey[menu.path!]).toBe(menu.menuKey)
    expect(BACKEND_CONNECTED_KEYS.has(menu.menuKey)).toBe(true)
    expect(CONTROLLED_MENU_KEYS).toContain(menu.menuKey)
    expect(ROUTE_MENU_KEY_MAP[menu.path!]).toBe(menu.menuKey)
    expect(renderMenuIcon(menu.icon)).not.toBeNull()
  })

  it.each(consumableMenus)('$menuKey：点击后进入页面并高亮，不再提示开发中', async (menu) => {
    setConsumableMenus()
    renderSidebar()
    fireEvent.click(await screen.findByText('耗材管理'))
    const item = await screen.findByRole('menuitem', { name: new RegExp(menu.name) })
    expect(item.querySelector('.anticon')).not.toBeNull()
    fireEvent.click(item)
    await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent(menu.path!))
    expect(item).toHaveClass('ant-menu-item-selected')
    expect(screen.queryByText('sidebar.underDevelopment')).not.toBeInTheDocument()
  })

  it.each(consumableMenus)('$menuKey：直接打开时展开父菜单，缺失数据库图标时有兜底', async (menu) => {
    setConsumableMenus(false)
    renderSidebar(menu.path)
    const item = await screen.findByRole('menuitem', { name: new RegExp(menu.name) })
    expect(item).toHaveClass('ant-menu-item-selected')
    expect(item.querySelector('.anticon')).not.toBeNull()
  })

  it.each(consumableMenus)('$menuKey：未授权时隐藏菜单，直接访问返回 403', async (menu) => {
    setConsumableMenus()
    mockDeniedMenuKeys.add(menu.menuKey)
    renderSidebar()
    fireEvent.click(await screen.findByText('耗材管理'))
    expect(screen.queryByText(menu.name)).not.toBeInTheDocument()
    render(
      <MemoryRouter initialEntries={[menu.path!]}>
        <MenuPermissionGuard><div>受保护的耗材页面</div></MenuPermissionGuard>
      </MemoryRouter>,
    )
    expect(await screen.findByText('403')).toBeInTheDocument()
    expect(screen.queryByText('受保护的耗材页面')).not.toBeInTheDocument()
  })

  it.each(consumableMenus)('$menuKey：后端离线时阻断直接访问', async (menu) => {
    setMenuState(null, 'offline')
    render(
      <MemoryRouter initialEntries={[menu.path!]}>
        <MenuPermissionGuard><div>受保护的耗材页面</div></MenuPermissionGuard>
      </MemoryRouter>,
    )
    expect(await screen.findByText('503')).toBeInTheDocument()
    expect(screen.queryByText('受保护的耗材页面')).not.toBeInTheDocument()
  })

  it('后端菜单树可用时：名称以 DB 为准，本地离线快照不得覆盖 DB 名称', async () => {
    setMenuState([{
      menuKey: 'search',
      name: '搜索管理（DB名）',
      type: 1,
      status: 1,
      sort: 5,
      children: [{ menuKey: 'word-segmentation', name: '分詞詞庫', type: 2, status: 1, sort: 1 }],
    } as unknown as MenuVO], 'online')

    renderSidebar()

    await waitFor(() => expect(screen.getByText('搜索管理（DB名）')).toBeInTheDocument())
    // 展开子菜单：叶子菜单名同样以 DB 为准
    fireEvent.click(screen.getByText('搜索管理（DB名）'))
    await waitFor(() => expect(screen.getByText('分詞詞庫')).toBeInTheDocument())
  })

  it('后端菜单树可用时：已对接后端的菜单不来自本地副本（DB 缺失的顶级菜单不显示）', async () => {
    setMenuState([{ menuKey: 'search', name: '搜索管理', type: 1, status: 1, sort: 5 } as unknown as MenuVO], 'online')

    renderSidebar()

    await waitFor(() => expect(screen.getByText('搜索管理')).toBeInTheDocument())
    // 「商戶集團管理」「團購管理」等已对接后端的菜单在 DB 未返回时不得由本地副本冒出
    expect(screen.queryByText('商戶集團管理')).not.toBeInTheDocument()
    expect(screen.queryByText('團購管理')).not.toBeInTheDocument()
    expect(screen.queryByText('流量沙盤')).not.toBeInTheDocument()
    expect(screen.queryByText('實驗沙盤')).not.toBeInTheDocument()
  })

  it('后端返回实验沙盘时：仍展示目录和四个子菜单，名称使用 DB 值', async () => {
    const children: MenuVO[] = [
      { id: 2, parentId: 1, menuKey: 'waterfall-simulation', name: '瀑布流推演', type: 2, status: 1, sort: 1 },
      { id: 3, parentId: 1, menuKey: 'algorithm-simulation', name: '算法推演', type: 2, status: 1, sort: 2 },
      { id: 4, parentId: 1, menuKey: 'merchant-score-insight', name: '商家評分透視', type: 2, status: 1, sort: 3 },
      { id: 5, parentId: 1, menuKey: 'merchant-promotion-diagnose', name: '商家推廣診斷', type: 2, status: 1, sort: 4 },
    ]
    setMenuState([{
      id: 1,
      parentId: null,
      menuKey: 'traffic-sandbox',
      name: '實驗沙盤',
      type: 1,
      status: 1,
      sort: 1,
      children,
    }], 'online')

    const { container } = renderSidebar()

    fireEvent.click(await screen.findByText('實驗沙盤'))
    for (const child of children) {
      expect(await screen.findByText(child.name)).toBeInTheDocument()
    }
    expect(screen.queryByText('流量沙盤')).not.toBeInTheDocument()
    expect(container.querySelector('.sidebar-offline-tip')).not.toBeInTheDocument()
  })

  it('后端菜单树不可用时：只渲染离线菜单，并显示离线提示条', async () => {
    setMenuState(null, 'offline')

    const { container } = renderSidebar()

    // 离线清单内的顶级菜单（搜索管理：完全未接后端 API）照常展示
    await waitFor(() => expect(screen.getByText('搜索管理')).toBeInTheDocument())
    // 推廣報表仍在离线清单内；实验沙盘已依赖后端，不再离线展示
    await waitFor(() => expect(screen.getByText('推廣報表')).toBeInTheDocument())
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
    expect(screen.queryByText('流量沙盤')).not.toBeInTheDocument()
    expect(screen.queryByText('實驗沙盤')).not.toBeInTheDocument()
    // 已对接后端的模块不展示
    expect(screen.queryByText('商戶集團管理')).not.toBeInTheDocument()
    expect(screen.queryByText('團購管理')).not.toBeInTheDocument()
    expect(screen.queryByText('物資管理')).not.toBeInTheDocument()
    expect(screen.queryByText('財務管理')).not.toBeInTheDocument()
    expect(container.querySelector('.sidebar-offline-tip')).toBeInTheDocument()
  })
})
