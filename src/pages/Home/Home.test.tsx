import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Home from './index'
import { collectHomeMenus } from './homeUtils'
import type { MenuVO } from '../../api/menu'
import { fetchPortalContext } from '../../api/portal'
import { fetchQuickFavorites, saveQuickFavorites } from '../../api/auth'
import { sendAgentMessage } from '../../api/agent'
import { writeCurrentSystemCode } from '../../hooks/useCurrentSystem'

const state = vi.hoisted(() => ({
  denied: new Set<string>(),
  navigation: { loading: false, loaded: true, error: null as string | null },
  emptyNavigation: false,
  refetch: vi.fn().mockResolvedValue(undefined),
}))

const financeMenu: MenuVO = { id: 1, parentId: null, menuKey: 'finance-entry', name: '財務測試菜單', path: '/finance-entry', systemCode: 'finance', type: 2, status: 1, sort: 1 }
const adsMenu: MenuVO = { ...financeMenu, id: 2, menuKey: 'ads-entry', name: '廣告測試菜單', path: '/ads-entry', systemCode: 'ads' }
const menus = [financeMenu, adsMenu]
const systems = [
  { code: 'finance', name: '財務系統' },
  { code: 'ads', name: '廣告推薦系統' },
  { code: 'ai', name: 'AI 智能中心' },
]
const t = (key: string, options?: { defaultValue?: string } | string) =>
  (typeof options === 'string' ? options : options?.defaultValue) ?? key

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t, i18n: { language: 'zh-TW' } }) }))
vi.mock('../../i18n/menuNameEn', () => ({ translateMenuName: (_key: string, name: string) => name }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({
  user: { username: 'home-test', name: '測試員工', avatar: 'default', role: 'user' },
  hasMenuPermission: (key: string) => !state.denied.has(key),
}) }))
vi.mock('../../contexts/MenuContext', () => ({ useMenu: () => ({ menuTree: menus, status: 'online', refresh: state.refetch }) }))
vi.mock('../../hooks/useSystemNavigation', () => ({ useSystemNavigation: (code: string | null) => ({
  ...state.navigation,
  tree: state.emptyNavigation ? [] : menus.filter(menu => menu.systemCode === code),
  refetch: state.refetch,
}) }))
vi.mock('../../api/portal', () => ({ fetchPortalContext: vi.fn() }))
vi.mock('../../api/auth', () => ({ fetchQuickFavorites: vi.fn(), saveQuickFavorites: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../api/agent', () => ({
  sendAgentMessage: vi.fn().mockResolvedValue({ text: '測試回答', tokens: 0, model: 'test' }),
  fetchEngineStatus: vi.fn().mockResolvedValue(null),
  probeEngineStatus: vi.fn().mockResolvedValue(null),
  getEngineMode: () => 'auto',
  setEngineMode: vi.fn(),
  getContextWindowOptions: () => [128_000],
  formatContextWindow: () => '128K',
}))
vi.mock('../../api/aiMyCenter', () => ({
  fetchMyQuotaUsage: vi.fn().mockRejectedValue(new Error('测试中不加载用量')),
  fetchMyModels: vi.fn().mockResolvedValue([{ modelKey: 'test', modelName: 'Test' }]),
  fetchQuotaCheck: vi.fn().mockResolvedValue({ action: 'allow' }),
  currencySymbol: () => '$',
  formatNumber: String,
  formatCost: String,
}))
vi.mock('../../api/aiConversation', () => ({
  fetchConversations: vi.fn().mockResolvedValue([{ id: 1, title: '新對話', messages: '[]', totalTokens: 0, createdAt: '', updatedAt: '' }]),
  createConversation: vi.fn(),
  updateConversation: vi.fn().mockResolvedValue(undefined),
  deleteConversation: vi.fn(),
  fetchDeletedConversations: vi.fn().mockResolvedValue([]),
  restoreConversation: vi.fn(),
  permanentDeleteConversation: vi.fn(),
}))
vi.mock('../../components/PikachuFace', () => ({ default: () => null }))
vi.mock('../../components/AiLogo', () => ({ default: () => null }))

function Location() {
  return <output data-testid="route">{useLocation().pathname}</output>
}
function mount() {
  return render(<MemoryRouter><Location /><Routes><Route path="/" element={<Home />} /><Route path="*" element={<div>業務頁面</div>} /></Routes></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('current_system_code', 'finance')
  state.denied.clear()
  state.navigation = { loading: false, loaded: true, error: null }
  state.emptyNavigation = false
  vi.mocked(fetchPortalContext).mockResolvedValue({ systems, superAdmin: false })
  vi.mocked(fetchQuickFavorites).mockResolvedValue(['finance-entry', 'ads-entry'])
})

describe('系统首页 AI 助手区域', () => {
  it('横幅、菜单搜索和收藏跟随当前系统，不覆盖其他系统收藏', async () => {
    const { container } = mount()
    await screen.findByRole('button', { name: '財務測試菜單' })
    expect(container.querySelector('.home-ai-scope')).toBeNull()
    expect(container.querySelector('.home-system-heading')).toBeNull()
    expect(screen.queryByText('範圍預覽')).not.toBeInTheDocument()
    expect(screen.queryByText(/上述範圍尚未限制實際查詢/)).not.toBeInTheDocument()
    expect(screen.queryByText(/預設關注/)).not.toBeInTheDocument()
    expect(screen.queryByText(/跨系統授權與執行待接入/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '跨系統協作' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '廣告測試菜單' })).not.toBeInTheDocument()
    for (const [keys] of vi.mocked(saveQuickFavorites).mock.calls) expect(keys).toEqual(['finance-entry', 'ads-entry'])

    fireEvent.focus(screen.getByRole('textbox', { name: '搜尋菜單' }))
    fireEvent.change(screen.getByRole('textbox', { name: '搜尋菜單' }), { target: { value: '廣告' } })
    expect(screen.getByText('無匹配結果')).toBeInTheDocument()
    act(() => writeCurrentSystemCode('ads'))
    expect(container.querySelector('.home-system-heading')).toBeNull()
    expect(screen.getByRole('textbox', { name: '搜尋菜單' })).toHaveValue('')
    expect(screen.queryByRole('button', { name: '財務測試菜單' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '廣告測試菜單' })).toBeInTheDocument()
    expect(sendAgentMessage).not.toHaveBeenCalled()
  })

  it.each(['empty', 'error', 'loading'])('导航 %s 时不扩大为全量菜单', async (mode) => {
    state.emptyNavigation = mode === 'empty'
    state.navigation = { loaded: mode === 'empty', error: mode === 'error' ? '请求失败' : null, loading: mode === 'loading' }
    mount()
    if (mode === 'empty') {
      expect(await screen.findByText('本系統暫無可用菜單')).toBeInTheDocument()
    } else {
      await waitFor(() => expect(screen.getByRole('textbox', { name: '搜尋菜單' })).toBeDisabled())
    }
    expect(screen.queryByRole('button', { name: '財務測試菜單' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '廣告測試菜單' })).not.toBeInTheDocument()
    if (mode === 'error') {
      fireEvent.click(screen.getByRole('button', { name: 'portal.retry' }))
      expect(state.refetch).toHaveBeenCalledOnce()
    }
  })

  it('菜单权限收回后，搜索和收藏均不显示该入口', async () => {
    state.denied.add('finance-entry')
    mount()
    expect(await screen.findByText('本系統暫無可用菜單')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '財務測試菜單' })).not.toBeInTheDocument()
  })

  it('搜索结果主按钮进入页面，收藏按钮独立', async () => {
    mount()
    await screen.findByRole('button', { name: '財務測試菜單' })
    fireEvent.focus(screen.getByRole('textbox', { name: '搜尋菜單' }))
    expect(screen.getByRole('button', { name: '已收藏 財務測試菜單' })).toBeDisabled()
    const dropdown = document.querySelector('.home-quick-dropdown') as HTMLElement
    fireEvent.click(within(dropdown).getByRole('button', { name: '財務測試菜單' }))
    expect(screen.getByTestId('route')).toHaveTextContent('/finance-entry')
    expect(sendAgentMessage).not.toHaveBeenCalled()
  })

  it('AI 中心系统首页不再渲染范围预览模块，聊天区保持完整', async () => {
    localStorage.setItem('current_system_code', 'ai')
    const { container } = mount()
    expect(await screen.findByText('本系統暫無可用菜單')).toBeInTheDocument()
    expect(container.querySelector('.home-ai-scope')).toBeNull()
    expect(container.querySelector('.home-ai-collaboration')).toBeNull()
    expect(screen.queryByText('範圍預覽')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '跨系統協作' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'AI 智能中心' })).not.toBeInTheDocument()
    expect(container.querySelector('.home-ai-body')).not.toBeNull()
    expect(sendAgentMessage).not.toHaveBeenCalled()
  })

  it('门户接口失败时不再渲染协作引导与重试入口', async () => {
    vi.mocked(fetchPortalContext).mockRejectedValueOnce(new Error('请求失败'))
    const { container } = mount()
    await screen.findByRole('button', { name: '財務測試菜單' })
    expect(container.querySelector('.home-ai-scope')).toBeNull()
    expect(screen.queryByRole('button', { name: '跨系統協作' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '目標系統' })).not.toBeInTheDocument()
  })

  it('建议问题仅填入输入框，不自动请求 AI 或执行业务', async () => {
    mount()
    const question = await screen.findByRole('button', { name: '介紹財務系統的常用功能' })
    fireEvent.click(question)
    expect(screen.getByDisplayValue('介紹財務系統的常用功能')).toBeInTheDocument()
    expect(sendAgentMessage).not.toHaveBeenCalled()
  })
})

describe('首页菜单展示规则', () => {
  it('继承系统归属、过滤停用及未授权菜单，不猜测未知路径', () => {
    const tree: MenuVO[] = [{ ...financeMenu, menuKey: 'finance-root', type: 1, path: undefined, children: [
      { ...financeMenu, systemCode: null },
      { ...financeMenu, menuKey: 'denied' },
      { ...financeMenu, menuKey: 'disabled', status: 0 },
      { ...financeMenu, menuKey: 'unknown', path: undefined },
      { ...financeMenu, menuKey: 'external', path: '//example.com' },
      adsMenu,
    ] }]
    expect(collectHomeMenus(tree, key => key !== 'denied', 'finance').map(menu => menu.key)).toEqual(['finance-entry'])
  })

  it('只为已返回的菜单使用登记路由，服务端空树保持为空', () => {
    expect(collectHomeMenus([], () => true, 'finance')).toEqual([])
    expect(collectHomeMenus([{ ...financeMenu, menuKey: 'account-balance', path: undefined }], () => true, 'finance')[0].path).toBe('/account-balance')
  })
})
