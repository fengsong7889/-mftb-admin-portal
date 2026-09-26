import { act, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import type { MenuVO } from '../api/menu'
import { BACKEND_CONNECTED_KEYS, keyToPath, pathToKey } from '../constants/menuDataSource'
import { CONTROLLED_MENU_KEYS, ROUTE_MENU_KEY_MAP } from '../pages/Permission/types'
import { renderMenuIcon } from './MenuIcon'
import MenuPermissionGuard from './MenuPermissionGuard'
import { fetchPortalContext } from '../api/portal'
import { readCurrentSystemCode, writeCurrentSystemCode } from '../hooks/useCurrentSystem'
import i18n from '../i18n'
import zh from '../i18n/locales/zh-TW.json'

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
let mockSystemNavigation: { tree: MenuVO[]; loaded: boolean } = { tree: [], loaded: false }
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

vi.mock('../api/portal', () => ({ fetchPortalContext: vi.fn() }))
vi.mock('../hooks/useSystemNavigation', () => ({
  useSystemNavigation: () => mockSystemNavigation,
}))

import Sidebar from './Sidebar'
import SystemSwitcher from './SystemSwitcher'
import Portal from '../pages/Portal'

beforeEach(async () => {
  localStorage.clear()
  await i18n.changeLanguage('zh-TW')
  vi.mocked(fetchPortalContext).mockResolvedValue({ systems: [], superAdmin: false })
})

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
  mockSystemNavigation = { tree: [], loaded: false }
  mockDeniedMenuKeys.clear()
})

describe('Sidebar 系统品牌', () => {
  it.each(Object.entries(zh.portal.systems))('%s 显示系统图标和 MFTB 名称，不保留搜广推副标题', async (code, copy) => {
    writeCurrentSystemCode(code)
    vi.mocked(fetchPortalContext).mockResolvedValue({ systems: [{ code, name: copy.name, icon: 'AccountBookOutlined' }], superAdmin: false })
    const { container } = renderSidebar()
    await waitFor(() => expect(container.querySelector('.sidebar-system-icon .anticon-account-book')).toBeInTheDocument())
    expect(container.querySelector('.sidebar-logo')).toHaveTextContent(`MFTB${copy.name}`)
    expect(container.querySelector('.logo-text-sub')).not.toBeInTheDocument()
    expect(screen.queryByText('MFTB Search · Ads · Recommendation')).not.toBeInTheDocument()
  })

  it('切换系统和折叠时图标跟随当前系统；语言切换同步更新名称', async () => {
    writeCurrentSystemCode('finance')
    vi.mocked(fetchPortalContext).mockResolvedValue({ systems: [
      { code: 'finance', name: '財務系統', icon: 'AccountBookOutlined' },
      { code: 'hr', name: '人力資源系統', icon: 'TeamOutlined' },
    ], superAdmin: false })
    const { container, rerender } = renderSidebar()
    await waitFor(() => expect(container.querySelector('.sidebar-logo')).toHaveTextContent('MFTB財務系統'))
    act(() => writeCurrentSystemCode('hr'))
    await waitFor(() => expect(container.querySelector('.sidebar-system-icon .anticon-team')).toBeInTheDocument())
    expect(container.querySelector('.sidebar-logo')).toHaveTextContent(`MFTB${zh.portal.systems.hr.name}`)
    await act(async () => { await i18n.changeLanguage('en') })
    expect(container.querySelector('.sidebar-logo')).toHaveTextContent(`MFTB ${i18n.t('portal.systems.hr.name')}`)
    rerender(<MemoryRouter><Sidebar collapsed /></MemoryRouter>)
    expect(container.querySelector('.logo-text-main')).not.toBeInTheDocument()
    expect(container.querySelector('.sidebar-system-icon .anticon-team')).toBeInTheDocument()
    expect(container.querySelector('.sidebar-logo')).toHaveAttribute('title', `MFTB ${i18n.t('portal.systems.hr.name')}`)
  })

  it('刷新直达页面时根据菜单归属恢复系统品牌，缺失图标使用对应系统兜底', async () => {
    setMenuState([{
      id: 1, parentId: null, menuKey: 'account-balance', name: '賬戶餘額', path: '/account-balance',
      type: 2, status: 1, sort: 1, systemCode: 'finance',
    }], 'online')
    vi.mocked(fetchPortalContext).mockRejectedValueOnce(new Error('网络错误'))
    const { container } = renderSidebar('/account-balance')
    await waitFor(() => expect(container.querySelector('.sidebar-logo')).toHaveTextContent('MFTB財務系統'))
    expect(container.querySelector('.sidebar-system-icon .anticon-account-book')).toBeInTheDocument()
  })

  it('自定义系统使用后端名称，避免重复 MFTB 前缀，非法图标使用通用图标', async () => {
    writeCurrentSystemCode('custom')
    vi.mocked(fetchPortalContext).mockResolvedValue({ systems: [{ code: 'custom', name: 'MFTB測試系統', icon: 'UnknownIcon' }], superAdmin: false })
    const { container } = renderSidebar()
    await waitFor(() => expect(container.querySelector('.sidebar-logo')).toHaveTextContent('MFTB測試系統'))
    expect(container.querySelector('.sidebar-system-icon .anticon-appstore')).toBeInTheDocument()
  })
})

describe('Sidebar 系统首页与 AI 导航', () => {
  it.each(Object.keys(zh.portal.systems))('%s 系统始终置顶首页，点击后保留系统上下文', async (code) => {
    writeCurrentSystemCode(code)
    mockSystemNavigation = { tree: [], loaded: true }
    renderSidebar('/test-page')

    const home = await screen.findByRole('menuitem', { name: /首頁/ })
    expect(screen.getAllByRole('menuitem')[0]).toBe(home)
    fireEvent.click(home)
    await waitFor(() => expect(screen.getByTestId('current-path').textContent).toBe('/'))
    expect(home).toHaveClass('ant-menu-item-selected')
    expect(readCurrentSystemCode()).toBe(code)
  })

  it.each(['loading', 'online', 'offline', 'error'] as const)('菜单状态为 %s 时仍能返回系统首页', async (status) => {
    writeCurrentSystemCode('ai')
    setMenuState(status === 'online' ? [] : null, status)
    renderSidebar('/ai-model-list')

    fireEvent.click(await screen.findByRole('menuitem', { name: /首頁/ }))
    await waitFor(() => expect(screen.getByTestId('current-path').textContent).toBe('/'))
    expect(readCurrentSystemCode()).toBe('ai')
  })

  it('成功返回空导航时只展示首页，不补出全量 AI 业务菜单', async () => {
    writeCurrentSystemCode('ai')
    setMenuState([{
      id: 1, parentId: null, menuKey: 'ai-model-list', name: '模型接入',
      type: 2, status: 1, sort: 1, systemCode: 'ai',
    }], 'online')
    mockSystemNavigation = { tree: [], loaded: true }
    renderSidebar()

    await screen.findByRole('menuitem', { name: /首頁/ })
    expect(screen.getAllByRole('menuitem')).toHaveLength(1)
    expect(screen.queryByText('模型接入')).not.toBeInTheDocument()
  })

  it('服务端已包含首页时不重复添加', async () => {
    writeCurrentSystemCode('finance')
    mockSystemNavigation = { tree: [{
      id: 1, parentId: null, menuKey: 'home', name: '首頁',
      type: 2, status: 1, sort: 1, systemCode: 'portal',
    }], loaded: true }
    renderSidebar()
    expect(await screen.findAllByRole('menuitem', { name: /首頁/ })).toHaveLength(1)
  })

  it('AI 服务端导航展示模型菜单，未授权项隐藏，业务页面可返回首页', async () => {
    writeCurrentSystemCode('ai')
    mockDeniedMenuKeys.add('ai-conversation-audit')
    mockSystemNavigation = { tree: [{
      id: 1, parentId: null, menuKey: 'ai-assistant', name: '智能中心(AI)',
      type: 1, status: 1, sort: 1, systemCode: 'ai', children: [
        { id: 2, parentId: 1, menuKey: 'ai-model-list', name: '模型接入', type: 2, status: 1, sort: 1 },
        { id: 3, parentId: 1, menuKey: 'ai-conversation-audit', name: '對話審計', type: 2, status: 1, sort: 2 },
      ],
    }], loaded: true }
    renderSidebar()

    expect(screen.queryByText('智能中心(AI)')).not.toBeInTheDocument()
    expect(screen.queryByText('對話審計')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('menuitem', { name: /模型接入/ }))
    await waitFor(() => expect(screen.getByTestId('current-path').textContent).toBe('/ai-model-list'))
    fireEvent.click(screen.getByRole('menuitem', { name: /首頁/ }))
    await waitFor(() => expect(screen.getByTestId('current-path').textContent).toBe('/'))
    expect(readCurrentSystemCode()).toBe('ai')
  })
})

describe('Sidebar 分系统目录提升', () => {
  const financeTree: MenuVO[] = [{
    id: 1, parentId: null, menuKey: 'finance', name: '財務管理', type: 1, status: 1, sort: 1, systemCode: 'finance', children: [
      { id: 2, parentId: 1, menuKey: 'promotion', name: '推廣金管理', type: 2, status: 1, sort: 1, children: [
        { id: 3, parentId: 2, menuKey: 'account-balance', name: '賬戶餘額', type: 2, status: 1, sort: 1 },
      ] },
      { id: 4, parentId: 1, menuKey: 'merchant-reconcile', name: '商戶通對賬', type: 2, status: 1, sort: 2, children: [
        { id: 5, parentId: 4, menuKey: 'writeoff-reconcile', name: '核銷對賬', type: 2, status: 1, sort: 1 },
      ] },
      { id: 6, parentId: 1, menuKey: 'approval', name: '審批管理', type: 2, status: 1, sort: 3, children: [
        { id: 7, parentId: 6, menuKey: 'approval-center', name: '審批中心', type: 2, status: 1, sort: 1 },
      ] },
    ],
  }]

  it.each([true, false])('财务导航 loaded=%s 时三级目录提升为二级，保持顺序和路由高亮', async (loaded) => {
    writeCurrentSystemCode('finance')
    setMenuState(financeTree, 'online')
    mockSystemNavigation = { tree: financeTree, loaded }
    const { container } = renderSidebar('/account-balance')
    expect(screen.queryByText('財務管理')).not.toBeInTheDocument()
    const roots = container.querySelectorAll('.sidebar-menu > li')
    expect(roots).toHaveLength(4)
    expect(roots[0]).toHaveTextContent('首頁')
    expect(roots[1]).toHaveTextContent('推廣金管理')
    expect(roots[2]).toHaveTextContent('商戶通對賬')
    expect(roots[3]).toHaveTextContent('審批管理')
    const account = await screen.findByRole('menuitem', { name: /賬戶餘額/ })
    expect(account).toHaveClass('ant-menu-item-selected')
    fireEvent.click(account)
    expect(screen.getByTestId('current-path')).toHaveTextContent('/account-balance')
  })

  it.each([
    ['merchant', 'merchant_group', 'store-list'], ['seller', 'seller-center', 'promotion-sales-config'],
    ['search', 'search', 'word-segmentation'], ['ai', 'ai-assistant', 'ai-model-list'],
    ['hr', 'hr', 'employee-management'], ['eam', 'asset-management', 'asset-list'],
    ['oa', 'oa-center', 'process-center'], ['iam', 'permission', 'role-management'],
    ['platform', 'system-config', 'rule-config'], ['i18n', 'i18n-center', 'i18n-language'],
  ])('%s 去除旧包装目录，原二级菜单直接可点击', async (systemCode, wrapper, key) => {
    writeCurrentSystemCode(systemCode)
    const tree: MenuVO[] = [{
      id: 1, parentId: null, menuKey: wrapper, name: '旧包装目录', systemCode, type: 1, status: 1, sort: 1,
      children: [{ id: 2, parentId: 1, menuKey: key, name: '业务入口', type: 2, status: 1, sort: 1 }],
    }]
    setMenuState(tree, 'online')
    mockSystemNavigation = { tree, loaded: true }
    const { container } = renderSidebar()
    expect(screen.queryByText('旧包装目录')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.sidebar-menu > li')).toHaveLength(2)
    fireEvent.click(await screen.findByRole('menuitem', { name: /业务入口/ }))
    expect(screen.getByTestId('current-path').textContent).toBe(keyToPath[key])
  })

  it('授权后仅剩一个分组时仍保留分组，停用的包装目录不展示子项', () => {
    writeCurrentSystemCode('finance')
    mockDeniedMenuKeys.add('writeoff-reconcile')
    mockDeniedMenuKeys.add('approval-center')
    mockSystemNavigation = { tree: financeTree, loaded: true }
    const { container, rerender } = renderSidebar()
    expect(container.querySelectorAll('.sidebar-menu > li')).toHaveLength(2)
    expect(screen.getByText('推廣金管理')).toBeInTheDocument()
    expect(screen.queryByText('商戶通對賬')).not.toBeInTheDocument()
    mockSystemNavigation = { tree: [{ ...financeTree[0], status: 0 }], loaded: true }
    rerender(<MemoryRouter><Sidebar collapsed={false} /></MemoryRouter>)
    expect(screen.getAllByRole('menuitem')).toHaveLength(1)
  })

  it('广告系统保留原有目录层级，不提升业务菜单', async () => {
    writeCurrentSystemCode('ads')
    mockSystemNavigation = { tree: [{
      id: 1, parentId: null, menuKey: 'merchant_promotion', name: '商家推廣工具', type: 1, status: 1, sort: 1, systemCode: 'ads',
      children: [{ id: 2, parentId: 1, menuKey: 'ad-sales', name: '廣告銷售', type: 2, status: 1, sort: 1 }],
    }], loaded: true }
    const { container } = renderSidebar()
    expect(container.querySelectorAll('.sidebar-menu > li')).toHaveLength(2)
    fireEvent.click(screen.getByText('商家推廣工具'))
    expect(await screen.findByRole('menuitem', { name: /廣告銷售/ })).toBeInTheDocument()
  })

  it('商家工作台同时展示原购买入口和报表分组，直达报表保持 seller 归属', async () => {
    const tree: MenuVO[] = [{
      id: 1, parentId: null, menuKey: 'seller-center', name: '工作台包装', type: 1, status: 1, sort: 1, systemCode: 'seller', children: [
        { id: 2, parentId: 1, menuKey: 'promotion-sales-config', name: '店鋪隨心推', type: 2, status: 1, sort: 1 },
        { id: 3, parentId: 1, menuKey: 'promotion-report-group', name: '報表分析', type: 2, status: 1, sort: 2, children: [
          { id: 4, parentId: 3, menuKey: 'promotion-report-overview', name: '數據概覽', type: 2, status: 1, sort: 1 },
          { id: 5, parentId: 3, menuKey: 'promotion-report-order', name: '訂單效果報表', type: 2, status: 1, sort: 2 },
          { id: 6, parentId: 3, menuKey: 'promotion-report-compare', name: '推薦類型對比', type: 2, status: 1, sort: 3 },
        ] },
      ],
    }]
    setMenuState(tree, 'online')
    mockSystemNavigation = { tree, loaded: true }
    const { container } = renderSidebar('/promotion-report-order')
    await waitFor(() => expect(readCurrentSystemCode()).toBe('seller'))
    expect(container.querySelectorAll('.sidebar-menu > li')).toHaveLength(3)
    expect(screen.getByText('店鋪隨心推')).toBeInTheDocument()
    expect(screen.getByText('報表分析')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /訂單效果報表/ })).toHaveClass('ant-menu-item-selected')
    expect(screen.queryByText('工作台包装')).not.toBeInTheDocument()
  })

  it.each([true, false])('导航 loaded=%s 时排除跨系统子项，按真实归属显示', async (loaded) => {
    const tree: MenuVO[] = [{
      id: 1, parentId: null, menuKey: 'system-config', name: '系統配置', type: 1, status: 1, sort: 1, systemCode: 'platform', children: [
        { id: 2, parentId: 1, menuKey: 'rule-config', name: '規則配置', type: 2, status: 1, sort: 1 },
        { id: 3, parentId: 1, menuKey: 'menu-config', name: '菜單配置', type: 2, status: 1, sort: 2, systemCode: 'iam' },
      ],
    }]
    writeCurrentSystemCode('platform')
    setMenuState(tree, 'online')
    mockSystemNavigation = { tree, loaded }
    renderSidebar()
    expect(screen.getByText('規則配置')).toBeInTheDocument()
    expect(screen.queryByText('菜單配置')).not.toBeInTheDocument()
    act(() => writeCurrentSystemCode('iam'))
    expect(await screen.findByText('菜單配置')).toBeInTheDocument()
    expect(screen.queryByText('規則配置')).not.toBeInTheDocument()
  })

  it('离线报表只归属商家工作台，不在广告或财务系统复活', async () => {
    setMenuState(null, 'offline')
    writeCurrentSystemCode('ads')
    renderSidebar()
    expect(screen.queryByText('推廣報表')).not.toBeInTheDocument()
    expect(screen.queryByText('搜索管理')).not.toBeInTheDocument()
    act(() => writeCurrentSystemCode('seller'))
    expect(await screen.findByText('推廣報表')).toBeInTheDocument()
    act(() => writeCurrentSystemCode('finance'))
    expect(screen.getAllByRole('menuitem')).toHaveLength(1)
  })
})

describe('广告系统与商家工作台切换隔离', () => {
  const tree: MenuVO[] = [
    { id: 1, parentId: null, menuKey: 'merchant_promotion', name: '商家推廣工具', type: 1, status: 1, sort: 1, systemCode: 'ads', children: [
      { id: 2, parentId: 1, menuKey: 'ad-sales', name: '廣告銷售', type: 2, status: 1, sort: 1 },
    ] },
    { id: 3, parentId: null, menuKey: 'seller-center', name: '商家工作台', type: 1, status: 1, sort: 2, systemCode: 'seller', children: [
      { id: 4, parentId: 3, menuKey: 'promotion-report-order', name: '訂單效果報表', type: 2, status: 1, sort: 1 },
    ] },
  ]

  beforeEach(() => {
    setMenuState(tree, 'online')
    vi.mocked(fetchPortalContext).mockResolvedValue({ systems: [
      { code: 'ads', name: '廣告推薦系統', icon: 'AimOutlined' },
      { code: 'seller', name: '商家工作台', icon: 'ShoppingOutlined' },
    ], superAdmin: false })
  })

  function renderSwitchFlow(path: string) {
    return render(<MemoryRouter initialEntries={[path]}><Routes>
      <Route path="/portal" element={<Portal />} />
      <Route path="*" element={<><Sidebar collapsed={false} /><SystemSwitcher /><LocationProbe /></>} />
    </Routes></MemoryRouter>)
  }

  it('显式切到广告系统时，尚未完成跳转的商家报表路径不能反写系统选择', async () => {
    const { container } = renderSidebar('/promotion-report-order')
    await waitFor(() => expect(readCurrentSystemCode()).toBe('seller'))
    act(() => writeCurrentSystemCode('ads'))
    expect(readCurrentSystemCode()).toBe('ads')
    expect(container.querySelector('.sidebar-logo')).toHaveTextContent('廣告推薦系統')
  })

  it('从商家报表经顶部选择广告系统，首页和侧栏同步，刷新后仍是广告系统', async () => {
    const view = renderSwitchFlow('/promotion-report-order')
    await waitFor(() => expect(view.container.querySelector('.system-switcher-trigger-label')).toHaveTextContent('商家工作台'))
    fireEvent.click(view.container.querySelector('.system-switcher-trigger')!)
    fireEvent.click(await screen.findByRole('menuitem', { name: /廣告推薦系統/ }))
    await waitFor(() => expect(screen.getByTestId('current-path').textContent).toBe('/'))
    expect(readCurrentSystemCode()).toBe('ads')
    expect(view.container.querySelector('.sidebar-logo')).toHaveTextContent('廣告推薦系統')
    expect(screen.getByText('商家推廣工具')).toBeInTheDocument()
    view.unmount()
    const refreshed = renderSwitchFlow('/')
    await waitFor(() => expect(refreshed.container.querySelector('.system-switcher-trigger-label')).toHaveTextContent('廣告推薦系統'))
    expect(readCurrentSystemCode()).toBe('ads')
  })

  it('保留商家工作台历史选择时，门户广告卡片仍进入广告系统', async () => {
    writeCurrentSystemCode('seller')
    const { container } = renderSwitchFlow('/portal')
    fireEvent.click(await screen.findByRole('button', { name: /廣告推薦系統.*進入系統/ }))
    await waitFor(() => expect(screen.getByTestId('current-path').textContent).toBe('/'))
    expect(readCurrentSystemCode()).toBe('ads')
    expect(container.querySelector('.sidebar-logo')).toHaveTextContent('廣告推薦系統')
    expect(screen.getByText('商家推廣工具')).toBeInTheDocument()
  })

  it.each([
    ['ShoppingOutlined', '.anticon-shopping'],
    ['', '.anticon-shop'],
    ['UnregisteredIcon', '.anticon-shop'],
  ])('商家工作台图标 %s 正常渲染或兜底，选中项无右箭头', async (icon, selector) => {
    writeCurrentSystemCode('seller')
    vi.mocked(fetchPortalContext).mockResolvedValue({ systems: [
      { code: 'seller', name: '商家工作台', icon },
      { code: 'custom', name: '自定义系统', icon: 'UnregisteredIcon' },
    ], superAdmin: false })
    const { container } = renderSwitchFlow('/')
    await waitFor(() => expect(container.querySelector('.system-switcher-trigger-label')).toHaveTextContent('商家工作台'))
    fireEvent.click(container.querySelector('.system-switcher-trigger')!)
    const seller = await screen.findByRole('menuitem', { name: /商家工作台/ })
    expect(seller.querySelector(selector)).toBeInTheDocument()
    expect(seller).toHaveClass('ant-dropdown-menu-item-selected')
    expect(seller.querySelector('.anticon-right')).not.toBeInTheDocument()
    const custom = screen.getByRole('menuitem', { name: /自定义系统/ })
    expect(custom.querySelector('.anticon-appstore')).toBeInTheDocument()
    expect(custom.querySelector('.anticon-right')).not.toBeInTheDocument()
  })
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
