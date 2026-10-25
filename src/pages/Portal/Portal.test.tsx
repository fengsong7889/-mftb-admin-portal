import { readFileSync } from 'node:fs'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { I18nextProvider, useTranslation } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigProvider } from 'antd'
import enUS from 'antd/locale/en_US'
import Portal from './index'
import SystemArtwork from './SystemArtwork'
import PortalTopBar from '../../components/PortalTopBar'
import HeaderBar from '../../components/HeaderBar'
import { fetchPortalContext, type PortalSystem } from '../../api/portal'
import { fetchMySystemAccessRequests } from '../../api/systemAccessRequest'
import { fetchPortalFavorites, savePortalFavorites } from '../../api/auth'
import { fetchLanguages, LANGUAGES_CHANGED_EVENT, type LanguageVO } from '../../api/translation'
import { loadSystemNavigation } from '../../hooks/useSystemNavigation'
import i18n, { ensureLanguageBundle, getSavedLanguage, injectTranslationBundle, SUPPORTED_LANGUAGES } from '../../i18n'
import en from '../../i18n/locales/en.json'
import zh from '../../i18n/locales/zh-TW.json'
import ja from '../../i18n/locales/ja.json'
import ko from '../../i18n/locales/ko.json'
import ru from '../../i18n/locales/ru.json'

/** 门户收藏按 username 隔离，默认不提供 username 以保持其余用例不受影响。 */
const authState = vi.hoisted(() => ({ username: undefined as string | undefined }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({
  user: { name: '测试员工', empId: 'TEST', role: 'user', username: authState.username },
  hasMenuPermission: () => true,
  logout: vi.fn(),
}) }))
vi.mock('../../contexts/MenuContext', () => ({ useMenu: () => ({ menuTree: null }) }))
vi.mock('../../api/portal', () => ({ fetchPortalContext: vi.fn() }))
// 默认 null = 「该账号从未同步过」，门户保留 localStorage 缓存，不干扰既有用例
vi.mock('../../api/auth', () => ({
  fetchPortalFavorites: vi.fn().mockResolvedValue(null),
  savePortalFavorites: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../api/translation', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/translation')>(),
  fetchLanguages: vi.fn(),
}))
vi.mock('../../api/notification', () => ({ fetchNotifications: vi.fn().mockResolvedValue({ items: [], unreadCount: 0 }) }))
// 门户多拉一个「我的在途权限申請」只为卡片标「審批中」，默认空列表：
// 不 mock 会让每个门户用例都发一次真 axios 请求，而准入判定绝不允许依赖它。
vi.mock('../../api/systemAccessRequest', () => ({
  fetchMySystemAccessRequests: vi.fn(),
  submitSystemAccessRequest: vi.fn(),
  fetchRequestableSystems: vi.fn(),
  fetchSystemAccessRequestByFlow: vi.fn(),
  fetchSystemAccessGrantOptions: vi.fn(),
}))
vi.mock('../../hooks/useSystemNavigation', async importOriginal => ({
  ...await importOriginal<typeof import('../../hooks/useSystemNavigation')>(),
  loadSystemNavigation: vi.fn(),
}))
vi.mock('../../i18n', async importOriginal => ({
  ...await importOriginal<typeof import('../../i18n')>(),
  ensureLanguageBundle: vi.fn().mockResolvedValue(undefined),
}))

const finance: PortalSystem = { code: 'finance', name: '財務結算系統', nameEn: 'Old finance subtitle', description: '旧描述' }
const resources = { en, 'zh-TW': zh, ja, ko, ru }
/** 有静态 JSON 兆底的语言（zh-CN 由数据库 bundle 动态注入，无静态 JSON） */
const STATIC_LANGUAGES = (SUPPORTED_LANGUAGES as readonly string[]).filter(l => l in resources) as Array<Exclude<(typeof SUPPORTED_LANGUAGES)[number], 'zh-CN'>>
const configuredLanguages: LanguageVO[] = [
  { id: 1, code: 'zh-TW', name: '繁體中文', flag: '🇹🇼' },
  { id: 2, code: 'en', name: 'English', flag: '🇺🇸' },
  { id: 3, code: 'ja', name: '日本語', flag: '🇯🇵' },
  { id: 4, code: 'ko', name: '한국어', flag: '🇰🇷' },
  { id: 5, code: 'ru', name: 'Русский', flag: '🇷🇺' },
]

function SystemPage() {
  const { t, i18n: instance } = useTranslation()
  const location = useLocation()
  return <><HeaderBar collapsed={false} onToggle={() => undefined} /><h1>{t('portal.systems.finance.name')}</h1><output data-testid="system-route">{location.pathname}:{instance.language}</output></>
}

/** 系統權限申請页桩：只回显路由与查询参数，用于断言「我要申請」带系统编码跳转 */
function SystemAccessApplyPage() {
  const location = useLocation()
  return <output data-testid="apply-route">{location.pathname}{location.search}</output>
}

function mount(path = '/portal') {
  return render(
    <I18nextProvider i18n={i18n}>
      <ConfigProvider locale={enUS}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/portal" element={<><PortalTopBar /><Portal /><output data-testid="portal-route">/portal</output></>} />
            <Route path="/" element={<SystemPage />} />
            <Route path="/account-balance" element={<SystemPage />} />
            <Route path="/system-access-apply" element={<SystemAccessApplyPage />} />
          </Routes>
        </MemoryRouter>
      </ConfigProvider>
    </I18nextProvider>,
  )
}

/**
 * 等入场自动播收尾（评审 M3①：首行卡片会自动播一遍 6s 分镜）。
 * 用 data-autoplay 归零作信号：播完后 Portal 会移除这个标记，
 * 之后的 data-motion 变化才确定是悬停/指针引起的。
 */
async function waitAutoplaySettled(container: HTMLElement) {
  await waitFor(
    () => expect(container.querySelector('.portal-card-shell[data-autoplay="1"]')).toBeNull(),
    { timeout: 9000 },
  )
}

async function selectLanguage(label: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: i18n.t('portal.language') }))
  fireEvent.click(await screen.findByText(label, { selector: '.ant-select-item-option-content' }))
}

beforeEach(async () => {
  localStorage.clear()
  authState.username = undefined
  vi.clearAllMocks()
  vi.mocked(ensureLanguageBundle).mockResolvedValue(undefined)
  vi.mocked(fetchLanguages).mockResolvedValue(configuredLanguages)
  await i18n.changeLanguage('zh-TW')
  vi.mocked(fetchPortalContext).mockResolvedValue({ systems: [finance], superAdmin: false })
  // 在途权限申請默认空：卡片仍展示「我要申請」，与无在途时的口径一致
  vi.mocked(fetchMySystemAccessRequests).mockResolvedValue([])
  // clearAllMocks 只清调用记录不清实现，逐用例改过的云端返回值必须在这里复位
  vi.mocked(fetchPortalFavorites).mockResolvedValue(null)
  vi.mocked(loadSystemNavigation).mockResolvedValue([
    { id: 1, parentId: null, menuKey: 'account-balance', name: '賬戶餘額', path: '/account-balance', type: 2, sort: 1, status: 1 },
  ])
})

describe('门户常用入口带（收藏与最近使用）', () => {
  beforeEach(() => { authState.username = 'TEST01' })

  it('收藏的系统提到第一屏，权限已撤销的收藏编码不残留', async () => {
    localStorage.setItem('portal_favorites:TEST01', JSON.stringify(['finance', 'revoked-system']))
    const { container } = mount()
    // 常用带出现即代表加载完成；'revoked-system' 不在接口返回的系统里，必须被过滤掉
    await screen.findByText('我的常用')
    const chips = container.querySelectorAll('.portal-quick-item')
    expect(chips).toHaveLength(1)
    expect(chips[0]).toHaveTextContent('財務結算系統')
    // 已收藏的卡片星标常亮，未授权系统不给收藏入口
    expect(container.querySelector('.portal-card-fav.is-on')).toBeInTheDocument()
  })

  it('点击卡片星标写入个人收藏，收藏项不会成为进入未授权系统的通道', async () => {
    const { container } = mount()
    const card = await screen.findByRole('button', { name: '財務結算系統 · 進入系統' })
    const shell = card.closest('.portal-card-shell')!
    fireEvent.click(shell.querySelector('.portal-card-fav')!)
    expect(JSON.parse(localStorage.getItem('portal_favorites:TEST01')!)).toEqual(['finance'])
    // 本地写成功的同时整份覆盖到云端账号，换设备/清缓存才不会丢
    expect(savePortalFavorites).toHaveBeenCalledWith(['finance'])
    expect(container.querySelector('.portal-quick-item')).toHaveTextContent('財務結算系統')
    // 星标点击不得冒泡触发整卡进入，仍停留在门户路由
    expect(screen.getByTestId('portal-route')).toHaveTextContent('/portal')
  })

  it('云端同步过且已清空时覆盖本地缓存，换设备的清空动作能同步过来', async () => {
    localStorage.setItem('portal_favorites:TEST01', JSON.stringify(['finance']))
    vi.mocked(fetchPortalFavorites).mockResolvedValue([])
    const { container } = mount()
    await screen.findByRole('button', { name: '財務結算系統 · 進入系統' })
    // 云端已清空 → 不再有任何收藏星标；常用模块仍渲染，但展示空态占位（评审 F1③）
    expect(container.querySelector('.portal-card-fav.is-on')).toBeNull()
    expect(container.querySelector('.portal-favorites-empty')).toBeInTheDocument()
    expect(container.querySelector('.portal-quick-item')).toBeNull()
  })

  it('云端从未同步（null）时保留本地缓存，不被误判成「用户清空了」', async () => {
    localStorage.setItem('portal_favorites:TEST01', JSON.stringify(['finance']))
    vi.mocked(fetchPortalFavorites).mockResolvedValue(null)
    const { container } = mount()
    await screen.findByText('我的常用')
    expect(container.querySelectorAll('.portal-quick-item')).toHaveLength(1)
  })

  it('收藏不设数量上限，已有 12 项时仍能继续加入', async () => {
    const seeded = Array.from({ length: 12 }, (_, index) => `sys-${index}`)
    localStorage.setItem('portal_favorites:TEST01', JSON.stringify(seeded))
    const { container } = mount()
    const card = await screen.findByRole('button', { name: '財務結算系統 · 進入系統' })
    fireEvent.click(card.closest('.portal-card-shell')!.querySelector('.portal-card-fav')!)
    expect(JSON.parse(localStorage.getItem('portal_favorites:TEST01')!)).toEqual([...seeded, 'finance'])
    // 12 个种子编码都不在接口返回的系统里，因此带内只会出现新收藏的这一张
    expect(container.querySelectorAll('.portal-quick-item')).toHaveLength(1)
  })
})

describe('门户场景卡片与授权边界', () => {
  it('上图下文、无英文副标题，全部十六张卡片各有不同场景；未授权卡片点击弹出申请引导', async () => {
    const { container } = mount()
    const card = await screen.findByRole('button', { name: '財務結算系統 · 進入系統' })
    expect(card.querySelector('.portal-card-cover > svg[data-scene="finance"]')).toBeInTheDocument()
    expect(card.querySelector('.portal-card-body .portal-card-title')).toHaveTextContent('財務結算系統')
    expect(card.querySelector('.portal-card-desc')).toHaveTextContent(zh.portal.systems.finance.description)
    expect(screen.queryByText(finance.nameEn!)).not.toBeInTheDocument()
    expect(container.querySelector('.portal-card-title-en')).toBeNull()
    expect(container.querySelector('.portal-card-action')).toBeNull()
    expect(container.querySelector('.portal-card-enter-icon')).toBeNull()
    expect(card.querySelector('.portal-card-body .anticon')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /未獲得權限/ }))
    const cards = within(screen.getByRole('tabpanel')).getAllByRole('button')
    // 目录卡片数 = sys_system 业务系统数（新增 organization 组织编制系统后为 16）
    expect(cards).toHaveLength(16)
    cards.forEach(button => {
      expect(button).toBeEnabled()
      expect(button).toHaveClass('is-locked')
      expect(button.querySelector('.portal-card-locked-prompt')).toHaveTextContent('我要申請')
    })
    fireEvent.click(cards[0])
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('暫無該系統權限')
    expect(dialog).toHaveTextContent('您尚未獲得「廣告推薦系統」的使用權限')
    expect(loadSystemNavigation).not.toHaveBeenCalled()
    expect(localStorage.getItem('current_system_code')).toBeNull()
    const scenes = Array.from(container.querySelectorAll('[data-scene]'), image => image.getAttribute('data-scene'))
    // 16 个目录系统 + 接口返回的 finance = 17 张卡片，每张都有专属场景插画
    expect(new Set(scenes).size).toBe(17)
    expect(Array.from(screen.getByRole('tabpanel').querySelectorAll('.portal-card-body'), node => node.textContent).join('')).not.toMatch(/[A-Za-z]/)
  })

  it('未授权卡片点击弹出申请弹窗，确认申请带系统编码进入系統權限申請页', async () => {
    mount()
    await screen.findByRole('button', { name: '財務結算系統 · 進入系統' })
    fireEvent.click(screen.getByRole('tab', { name: /未獲得權限/ }))
    fireEvent.click(screen.getByRole('button', { name: /流程審批系統/ }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('您尚未獲得「流程審批系統」的使用權限')
    fireEvent.click(within(dialog).getByRole('button', { name: /我要申請|申請/ }))
    /*
     * 必须是带 system 参数的申请页，不能是 /process-center：
     * 后者是 OA 系统内的受控菜单，连 OA 都未授权的员工跳过去只会看到 403（原缺陷）。
     */
    await waitFor(() => {
      const route = screen.getByTestId('apply-route').textContent ?? ''
      expect(route).toContain('/system-access-apply')
      expect(route).toContain('system=oa')
    })
    // 未真正进入系统：不拉系统导航、不写当前系统编码
    expect(loadSystemNavigation).not.toHaveBeenCalled()
    expect(localStorage.getItem('current_system_code')).toBeNull()
  })

  /**
   * 提交后回到门户，卡片不能再写「我要申請」（否则看着像没生效、逼人再点一次）。
   * 但卡片仍可点：进申请页后由在途提示 + 禁用提交兜住，「審批中」只是状态展示，
   * 绝不能反过来参与准入判定（准入永远只看 /portal/context 的返回）。
   */
  it('已有在途权限申請的卡片标「審批中」，其它未授权卡片仍是「我要申請」', async () => {
    vi.mocked(fetchMySystemAccessRequests).mockResolvedValue([
      { systemCode: 'eam', status: 'pending', flowNo: 'XTSQ2026101801' },
      { systemCode: 'search', status: 'approved', flowNo: 'XTSQ2026101802' },
    ] as never)
    const { container } = mount()
    await screen.findByRole('button', { name: '財務結算系統 · 進入系統' })
    fireEvent.click(screen.getByRole('tab', { name: /未獲得權限/ }))
    // 直接等标出现（/我要申請/ 会命中15 张卡中的多张，不能当就绪信号用）
    await screen.findByText(zh.portal.cardPendingRequest)

    const promptOf = (code: string) => container.querySelector(`button[data-system="${code}"] .portal-card-locked-prompt`)
    expect(promptOf('eam')).toHaveTextContent(zh.portal.cardPendingRequest)
    // 已审结的单子不再占「審批中」，否则用户永远等不到下一步
    expect(promptOf('search')).toHaveTextContent(zh.portal.requestAccess)

    // 点击仍进申请页（页内展示在途单号并禁用提交）
    fireEvent.click(container.querySelector('button[data-system="eam"]')!)
    expect(await screen.findByRole('dialog')).toHaveTextContent(zh.portal.requestTitle)
  })

  it('申请弹窗取消只关闭弹窗，不进入系统也不切换当前系统', async () => {
    mount()
    await screen.findByRole('button', { name: '財務結算系統 · 進入系統' })
    fireEvent.click(screen.getByRole('tab', { name: /未獲得權限/ }))
    fireEvent.click(screen.getByRole('button', { name: /流程審批系統/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /取\s*消/ }))
    await waitFor(() => expect(dialog).toHaveClass(/ant-zoom-leave/))
    expect(document.querySelector('[data-testid="system-route"]')).toBeNull()
    expect(document.querySelectorAll('.portal-card.is-locked').length).toBe(16)
    expect(localStorage.getItem('current_system_code')).toBeNull()
    expect(loadSystemNavigation).not.toHaveBeenCalled()
  })

  it('接口失败显示重试，不误判授权；重试成功恢复卡片', async () => {
    vi.mocked(fetchPortalContext).mockRejectedValueOnce(new Error('测试网络错误'))
    const { container } = mount()
    expect(await screen.findByText(zh.portal.loadError)).toBeInTheDocument()
    expect(container.querySelector('.portal-card')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /重\s*試/ }))
    expect(await screen.findByRole('button', { name: '財務結算系統 · 進入系統' })).toBeEnabled()
  })

  it('成功返回空权限时不放行目录卡片', async () => {
    vi.mocked(fetchPortalContext).mockResolvedValue({ systems: [], superAdmin: false })
    mount()
    expect(await screen.findByText(zh.portal.noSystem)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /未獲得權限/ }))
    const cards = within(screen.getByRole('tabpanel')).getAllByRole('button')
    // 16 个业务系统 + 测试内注入的 future 系统 = 17 张未授权卡片
    expect(cards).toHaveLength(17)
    cards.forEach(button => expect(button).toHaveClass('is-locked'))
  })

  it('未知系统保留后端名称和描述并使用通用场景', async () => {
    vi.mocked(fetchPortalContext).mockResolvedValue({ systems: [{ code: 'future', name: '新系統', description: '新系統說明' }], superAdmin: false })
    mount()
    const card = await screen.findByRole('button', { name: '新系統 · 進入系統' })
    expect(card).toHaveTextContent('新系統說明')
    expect(card.querySelector('svg[data-scene="generic"]')).toBeInTheDocument()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('每个系统统一进入自身首页', () => {
  it('从授权卡片进入首页，不依赖首个业务菜单接口', async () => {
    vi.mocked(loadSystemNavigation).mockRejectedValue(new Error('导航暂不可用'))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: '財務結算系統 · 進入系統' }))
    expect(await screen.findByTestId('system-route')).toHaveTextContent('/:zh-TW')
    expect(localStorage.getItem('current_system_code')).toBe('finance')
    expect(loadSystemNavigation).not.toHaveBeenCalled()
  })

  it.each(['finance', 'ads'])('切换器选择 %s 都返回对应系统首页', async (code) => {
    localStorage.setItem('current_system_code', 'finance')
    vi.mocked(fetchPortalContext).mockResolvedValue({ systems: [finance, { code: 'ads', name: '廣告推薦系統' }], superAdmin: false })
    const { container } = mount('/account-balance')
    await waitFor(() => expect(container.querySelector('.system-switcher-trigger-label')).toHaveTextContent('財務結算系統'))
    fireEvent.click(container.querySelector('.system-switcher-trigger')!)
    const name = i18n.t(`portal.systems.${code}.name`)
    fireEvent.click(await screen.findByRole('menuitem', { name: new RegExp(name) }))
    expect(await screen.findByTestId('system-route')).toHaveTextContent('/:zh-TW')
    expect(localStorage.getItem('current_system_code')).toBe(code)
    expect(loadSystemNavigation).not.toHaveBeenCalled()
  })
})

describe('场景区分与低干扰动效', () => {
  it('目录外的商家工作台、平台设置、翻译中心通过原始名称匹配独立插画', async () => {
    vi.mocked(fetchPortalContext).mockResolvedValue({ systems: [
      { code: 'custom-store', name: '商家工作台' },
      { code: 'custom-settings', name: '平台设置' },
      { code: 'custom-language', name: '翻译中心' },
    ], superAdmin: false })
    const { container } = mount()
    await screen.findByRole('button', { name: '店鋪經營系統 · 進入系統' })
    expect(Array.from(container.querySelectorAll('[data-scene]'), node => node.getAttribute('data-scene')))
      .toEqual(['merchantWorkbench', 'platform', 'translation'])
    const scenes = Array.from(container.querySelectorAll('svg[data-scene]'))
    expect(new Set(scenes.map(scene => scene.innerHTML)).size).toBe(3)
    for (const scene of scenes) expect(scene.querySelector('.portal-art-motion')).toBeInTheDocument()
    expect(container.querySelector('.portal-card-body .anticon')).toBeNull()
    await act(async () => { await i18n.changeLanguage('en') })
    expect(screen.getByRole('button', { name: 'Store Operations · Enter system' })).toHaveTextContent(en.portal.systems.merchantWorkbench.description)
    expect(screen.getByRole('button', { name: 'Translation Management · Enter system' })).toHaveTextContent(en.portal.systems.translation.description)
    expect(Array.from(container.querySelectorAll('[data-scene]'), node => node.getAttribute('data-scene')))
      .toEqual(['merchantWorkbench', 'platform', 'translation'])
  })

  it.each([
    ['seller', 'merchantWorkbench'],
    ['i18n', 'translation'],
    ['merchant-workbench', 'merchantWorkbench'],
    ['merchant_workspace', 'merchantWorkbench'],
    ['system-config', 'platform'],
    ['i18n-center', 'translation'],
    ['translation', 'translation'],
  ])('编码 %s 保持固定场景 %s，不随显示语言变更', (code, expected) => {
    const { container, rerender } = render(<SystemArtwork code={code} name="系统" />)
    expect(container.querySelector('svg')).toHaveAttribute('data-scene', expected)
    rerender(<SystemArtwork code={code} name="System" />)
    expect(container.querySelector('svg')).toHaveAttribute('data-scene', expected)
  })

  it('响应系统减少动态效果偏好，保留可见性管理并清理监听器', () => {
    const query = { ...window.matchMedia('(prefers-reduced-motion: reduce)'), matches: true }
    vi.mocked(window.matchMedia).mockReturnValueOnce(query)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const { container, unmount } = render(<SystemArtwork code="translation" active />)
    const image = container.querySelector('svg')
    expect(image).toHaveAttribute('data-reduced-motion', 'true')
    expect(image).toHaveAttribute('data-motion', 'idle')
    expect(image?.querySelectorAll('.portal-map-scene')).toHaveLength(1)
    const listener = vi.mocked(query.addEventListener).mock.calls.find(([event]) => event === 'change')?.[1]
    query.matches = false
    act(() => { if (typeof listener === 'function') listener.call(query, new Event('change')) })
    expect(image).toHaveAttribute('data-reduced-motion', 'false')
    unmount()
    expect(query.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('默认静态且无播放按钮，仅悬停当前卡片播放，移出和切换分组恢复静态', async () => {
    localStorage.setItem('portal_artwork_motion', 'on')
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    vi.mocked(fetchPortalContext).mockResolvedValue({ systems: [finance, { code: 'search', name: '搜索運營系統' }], superAdmin: false })
    const { container, unmount } = mount()
    const financeCard = await screen.findByRole('button', { name: '財務結算系統 · 進入系統' })
    const searchCard = screen.getByRole('button', { name: /搜索運營.*進入系統/ })
    const financeShell = financeCard.closest('.portal-card-shell')!
    const searchShell = searchCard.closest('.portal-card-shell')!
    // 入场自动播（评审 M3①）：首行卡片挂载后先自己播一遍，播完才归为静态
    expect(container.querySelectorAll('.portal-card-shell[data-autoplay="1"]').length).toBeGreaterThan(0)
    await waitAutoplaySettled(container)
    expect(container.querySelector('.portal-motion-toggle')).toBeNull()
    expect(container.querySelector('[data-motion="running"]')).toBeNull()
    fireEvent.pointerEnter(financeShell, { pointerType: 'mouse' })
    expect(financeCard.querySelector('svg[data-scene]')).toHaveAttribute('data-motion', 'running')
    expect(searchCard.querySelector('svg[data-scene]')).toHaveAttribute('data-motion', 'idle')
    fireEvent.pointerEnter(searchShell, { pointerType: 'mouse' })
    expect(container.querySelectorAll('[data-motion="running"]')).toHaveLength(1)
    expect(financeCard.querySelector('svg[data-scene]')).toHaveAttribute('data-motion', 'idle')
    fireEvent.pointerLeave(searchShell, { pointerType: 'mouse' })
    expect(container.querySelector('[data-motion="running"]')).toBeNull()
    fireEvent.pointerEnter(financeShell, { pointerType: 'mouse' })
    fireEvent.click(screen.getByRole('tab', { name: /未獲得權限/ }))
    expect(container.querySelector('[data-motion="running"]')).toBeNull()
    const lockedCard = within(screen.getByRole('tabpanel')).getByRole('button', { name: /權限管理系統/ })
    expect(lockedCard).toHaveClass('is-locked')
    fireEvent.pointerEnter(lockedCard.closest('.portal-card-shell')!, { pointerType: 'mouse' })
    expect(lockedCard.querySelector('svg[data-scene]')).toHaveAttribute('data-motion', 'running')
    fireEvent.click(lockedCard)
    expect(loadSystemNavigation).not.toHaveBeenCalled()
    expect(localStorage.getItem('current_system_code')).toBeNull()
    unmount()
    const refreshed = mount()
    await screen.findByRole('button', { name: '財務結算系統 · 進入系統' })
    // 重新进门户会再自动播一次（每次进页面都有一次「这里能动」的提示）
    await waitAutoplaySettled(refreshed.container)
    expect(refreshed.container.querySelector('[data-motion="running"]')).toBeNull()
  })

  it('触摸不会滞留播放，指针取消和搜索也清除悬停', async () => {
    const { container } = mount()
    const card = await screen.findByRole('button', { name: '財務結算系統 · 進入系統' })
    const shell = card.closest('.portal-card-shell')!
    // 先等入场自动播收尾，否则会把自动播的 running 误判成触摸引起的残留
    await waitAutoplaySettled(container)
    fireEvent.pointerEnter(shell, { pointerType: 'touch' })
    expect(container.querySelector('[data-motion="running"]')).toBeNull()
    fireEvent.pointerEnter(shell, { pointerType: 'mouse' })
    fireEvent.pointerCancel(shell)
    expect(container.querySelector('[data-motion="running"]')).toBeNull()
    fireEvent.pointerEnter(shell, { pointerType: 'mouse' })
    fireEvent.change(screen.getByRole('textbox', { name: zh.portal.search }), { target: { value: '財務' } })
    expect(container.querySelector('[data-motion="running"]')).toBeNull()
  })

  it('翻译卡是平铺世界地图 + 随机地标，静态层自身完整且品牌橙只出现一次', () => {
    const { container } = render(<SystemArtwork code="translation" />)
    const map = container.querySelector('.portal-map-scene')!
    expect(map).toBeInTheDocument()
    // 平铺地图：陆地与国界两条 path 都带真实几何数据，不是占位图形
    const paths = map.querySelectorAll('path')
    expect(paths.length).toBeGreaterThanOrEqual(2)
    expect((paths[0].getAttribute('d') ?? '').length).toBeGreaterThan(100)
    // 地标候选 8 个国家，静态默认第一个（CN），播放时随机切换
    expect(map).toHaveAttribute('data-country', 'CN')
    expect(Number(map.getAttribute('data-country-total'))).toBe(8)
    // 文字 2 处：问候语 + 国家名
    expect(map).toHaveTextContent('你好')
    // 品牌橙只出现 1 次（地标实心点），扩散环是描边不算
    expect(map.querySelectorAll('[fill="#E8720C"]')).toHaveLength(1)
    // 大动作（评审 M1）：扩散环挂 portal-art-motion
    expect(map.querySelector('.portal-map-ripple')).toHaveClass('portal-art-motion')
  })

  it('权限钥匙的初始配色中性，并具备身份扫描、门禁及准确结果文案', () => {
    const { container } = render(<SystemArtwork code="iam" />)
    for (const key of container.querySelectorAll('.portal-key-denied, .portal-key-granted')) expect(key).toHaveAttribute('stroke', '#8C8C8C')
    expect(container.querySelector('.portal-identity-scan')).toBeInTheDocument()
    expect(container.querySelector('.portal-access-door-left')).toBeInTheDocument()
    expect(container).toHaveTextContent('驗證成功，允許訪問')
    expect(container).toHaveTextContent('驗證失敗，拒絕訪問')
  })

  it.each([
    ['search', ['.portal-search-lens', '.portal-art-typing']],
    ['finance', ['.portal-finance-check', '.portal-finance-display', '.portal-art-typing']],
    ['iam', ['.portal-key-denied', '.portal-key-granted', '.portal-lock-alarm', '.portal-lock-shackle']],
    ['ai', ['.portal-robot-eye', '.portal-robot-pupil', '.portal-robot-smile', '.portal-robot-signal']],
    ['eam', ['.portal-eam-laptop', '.portal-eam-custodian', '.portal-eam-asset-tag', '.portal-eam-assignment-path', '.portal-eam-supply', '.portal-eam-supply-confirm']],
    ['hr', ['.portal-hr-profile', '.portal-hr-match-path', '.portal-hr-member', '.portal-hr-welcome']],
    ['oa', ['.portal-workflow-paper', '.portal-workflow-stage-2', '.portal-office-signature', '.portal-office-archived']],
    ['translation', ['.portal-map-scene', '.portal-map-ripple']],
    ['ads', ['.portal-ads-target', '.portal-ads-intake', '.portal-ads-scan', '.portal-ads-lead', '.portal-ads-promote', '.portal-ads-slot', '.portal-ads-heart', '.portal-ads-loop', '.portal-ads-result']],
    ['merchant', ['.portal-merchant-route', '.portal-merchant-pin-2', '.portal-merchant-metric']],
    ['merchantWorkbench', ['.portal-order-receipt', '.portal-order-stamp', '.portal-order-done']],
    ['platform', ['.portal-config-slider-0', '.portal-config-packet', '.portal-config-node-2']],
  ] as const)('%s 包含完整场景的动作元素', (code, selectors) => {
    const { container } = render(<SystemArtwork code={code} />)
    for (const selector of selectors) expect(container.querySelector(selector)).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    if (code === 'finance') {
      expect(container.querySelector('.portal-finance-display')).toHaveTextContent('ROI=F/PV')
      // 三行公式已按评审 P0-1 删除：它会被计算器与硬币叠压，且是全站唯一衬线体
      expect(container.querySelector('.portal-finance-formulas')).toBeNull()
      expect(container.querySelector('.portal-finance-check')).toBeInTheDocument()
    }
    if (code === 'translation') expect(container.querySelectorAll('.portal-map-scene')).toHaveLength(1)
  })

  it('广告推荐场景画的是算法投流链路：人群定向、竞价排序、首屏坑位与曝光回流', () => {
    const { container } = render(<SystemArtwork code="ads" name="廣告推薦系統" />)
    const image = container.querySelector('svg[data-scene="ads"]')!
    expect(image).toHaveAttribute('data-motion', 'idle')
    // 静态层必须自行讲完故事：定向圈、三个偏好标签、三行竞价排序、首屏信息流在静止态都要可见
    expect(image.querySelector('.portal-ads-scene ellipse')).toBeInTheDocument()
    expect(image.querySelectorAll('.portal-ads-tag')).toHaveLength(3)
    expect(image.querySelectorAll('.portal-ads-scene text')).toHaveLength(8)
    expect(image.querySelector('.portal-ads-feed')).toBeInTheDocument()
    // 引擎面板顶部写竞价公式，底部写激活函数，回流弧线写梯度更新公式
    expect(image).toHaveTextContent('eCPM=bid×pCTR')
    expect(image).toHaveTextContent('p=σ(z)')
    expect(image).toHaveTextContent('w←w−η∇L')
    // 结果性元素只在悬停播放时出现
    for (const selector of ['.portal-ads-target', '.portal-ads-intake', '.portal-ads-scan', '.portal-ads-lead', '.portal-ads-promote', '.portal-ads-slot', '.portal-ads-heart', '.portal-ads-result']) {
      expect(image.querySelector(selector)).toHaveAttribute('opacity', '0')
    }
    // 旧的喇叭/鼠标点击构图不得残留，否则语义又退回「打广告」
    expect(image.querySelector('.portal-ads-match, .portal-ads-cursor, .portal-ads-click, .portal-ads-growth')).toBeNull()
    expect(image).toHaveTextContent(zh.portal.artwork.recommendMatched)
  })

  it('广告推荐第二套构图把推荐面画成分层模型，逐层标公式且与链路版共用结果文案', () => {
    const { container } = render(<SystemArtwork code="ads" name="廣告推薦系統" style="alternate" />)
    const image = container.querySelector('svg[data-scene="ads"]')!
    // data-scene 不变，随机切换构图不影响场景识别与样式选择器
    expect(image).toHaveAttribute('data-scene', 'ads')
    // 四层结构：特征 token → embedding → 双层交互网络 → 多目标预估头与打分柱
    expect(image.querySelectorAll('.portal-ads-token')).toHaveLength(4)
    expect(image.querySelectorAll('.portal-ads-cell')).toHaveLength(4)
    expect(image.querySelectorAll('.portal-ads-node')).toHaveLength(7)
    expect(image.querySelectorAll('.portal-ads-edge')).toHaveLength(3)
    expect(image.querySelectorAll('.portal-ads-head')).toHaveLength(3)
    expect(image.querySelectorAll('.portal-ads-bar')).toHaveLength(3)
    // 左侧公式带逐层对应，公式是数学记号所以不随界面语言变化
    for (const formula of ['H=−Σp·log p', 'e=x·E', 'z=W·h+b', 'α=softmax(z)', 'pCTR=σ(z)', 'eCPM=bid×pCTR', 'w←w−η∇L']) {
      expect(image).toHaveTextContent(formula)
    }
    // 静止态只保留结构，坑位高亮与结果文案仍由悬停触发
    for (const selector of ['.portal-ads-slot', '.portal-ads-heart', '.portal-ads-result', '.portal-ads-intake']) {
      expect(image.querySelector(selector)).toHaveAttribute('opacity', '0')
    }
    // 两套构图共用同一文案，随机展示不会漏掉多语言断言
    expect(image).toHaveTextContent(zh.portal.artwork.recommendMatched)
  })

  it('物资场景展示设备归属和耗材领用，不再包含仓储扫码；悬停播放后移出复位', async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    vi.mocked(fetchPortalContext).mockResolvedValue({ systems: [{ code: 'eam', name: '物資管理系統' }], superAdmin: false })
    mount()
    const card = await screen.findByRole('button', { name: '物資管理系統 · 進入系統' })
    const image = card.querySelector('svg[data-scene="eam"]')!
    const shell = card.closest('.portal-card-shell')!
    // 先等入场自动播播完，否则拿到的是自动播的 running 而不是静止态
    await waitAutoplaySettled(document.body)
    expect(image).toHaveAttribute('data-motion', 'idle')
    expect(image.querySelector('[class*="portal-stock-"]')).toBeNull()
    expect(image.querySelector('.portal-eam-asset-tag')).toHaveTextContent('IT-024')
    expect(image.querySelector('.portal-eam-custodian')).toHaveTextContent(zh.portal.artwork.assetCustodian)
    expect(image.querySelector('.portal-eam-overview')).toHaveClass('portal-art-static')
    expect(image.querySelector('.portal-eam-count-full')).toHaveTextContent('12')
    expect(image.querySelector('.portal-eam-count-full')).toHaveClass('portal-art-static')
    expect(image.querySelector('.portal-eam-count-issued')).toHaveTextContent('11')
    expect(image.querySelector('.portal-eam-deduction')).toHaveTextContent('−1')
    for (const selector of ['.portal-eam-assigned-label', '.portal-eam-issued-label', '.portal-eam-asset-confirm', '.portal-eam-supply-confirm', '.portal-eam-count-issued']) {
      expect(image.querySelector(selector)).toHaveAttribute('opacity', '0')
    }
    fireEvent.pointerEnter(shell, { pointerType: 'mouse' })
    expect(image).toHaveAttribute('data-motion', 'running')
    fireEvent.pointerLeave(shell, { pointerType: 'mouse' })
    expect(image).toHaveAttribute('data-motion', 'idle')
    fireEvent.pointerEnter(shell, { pointerType: 'mouse' })
    expect(image).toHaveAttribute('data-motion', 'running')
    expect(loadSystemNavigation).not.toHaveBeenCalled()
    expect(localStorage.getItem('current_system_code')).toBeNull()
  })

  it('每个系统插画场景都有专属卡片色调，同组系统不得只靠颜色区分', () => {
    // 色调是纯 CSS（以 data-scene 为唯一真源），这里直接解析样式表做回归门禁，防止后续新增系统又共用一个色
    const css = readFileSync('src/pages/Portal/index.css', 'utf8')
    const tones = new Map<string, string>()
    for (const [, scene, color] of css.matchAll(/\.portal-card-artwork\[data-scene='(\w+)'\]\s*\{\s*color:\s*(#[\dA-Fa-f]{6})/g)) tones.set(scene, color)
    expect([...tones.keys()].sort()).toEqual([
      'ads', 'ai', 'attendance', 'doc', 'eam', 'finance', 'hr', 'iam', 'meeting', 'merchant', 'merchantWorkbench', 'oa', 'organization', 'platform', 'rdm', 'search', 'translation',
    ].sort())
    expect(new Set(tones.values()).size).toBe(tones.size)
    // 营销与商家增长组内四张卡并排展示，色相必须彼此互斥
    expect(new Set(['ads', 'search', 'merchant', 'merchantWorkbench'].map(scene => tones.get(scene)))).toHaveLength(4)
    // 协作与交付组（oa/rdm/meeting）同样并排，会议的深蓝必须与流程琥珀、产研洋红拉开
    expect(new Set(['oa', 'rdm', 'meeting'].map(scene => tones.get(scene)))).toHaveLength(3)
  })

  it('每次进入门户轮换一档插画构图，连续两次不会看到同一风格', async () => {
    vi.mocked(fetchPortalContext).mockResolvedValue({ systems: [{ code: 'ads', name: '廣告推薦系統' }], superAdmin: false })
    localStorage.removeItem('portal_artwork_style')
    // 广告推荐两套构图用各自专属元素识别：链路版有定向圈，模型版有特征 token
    const layoutOf = (container: HTMLElement) => container.querySelector('.portal-card-artwork[data-scene="ads"] .portal-ads-token')
      ? 'model'
      : container.querySelector('.portal-card-artwork[data-scene="ads"] .portal-ads-target') ? 'traffic' : 'none'
    const open = async (container: HTMLElement) => {
      await screen.findByRole('button', { name: '廣告推薦系統 · 進入系統' })
      return layoutOf(container)
    }
    const first = mount()
    expect(await open(first.container)).toBe('traffic')
    first.unmount()
    const second = mount()
    expect(await open(second.container)).toBe('model')
    second.unmount()
    const third = mount()
    expect(await open(third.container)).toBe('traffic')
    third.unmount()
  })

  it('重复场景的裁切标识独立，所有裁切引用均存在', () => {
    const { container } = render(<>{['search', 'finance', 'translation', 'search', 'translation'].map((code, index) => <SystemArtwork key={index} code={code} />)}</>)
    const ids = Array.from(container.querySelectorAll('[id]'), node => node.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const node of container.querySelectorAll('[clip-path]')) {
      const id = node.getAttribute('clip-path')!.slice(5, -1)
      expect(document.getElementById(id)).toBeInTheDocument()
    }
  })

  it.each(STATIC_LANGUAGES)('%s 场景状态文案完整且跟随界面语言', async lang => {
    await i18n.changeLanguage(lang)
    const copy = resources[lang].portal.artwork
    expect(Object.keys(copy).sort()).toEqual(Object.keys(en.portal.artwork).sort())
    // 考勤假勤两套构图各承载一条状态文案，必须两套都渲染才能覆盖 portal.artwork 全键
    const frames: Array<[string, 'primary' | 'alternate']> = [
      ['search', 'primary'], ['iam', 'primary'], ['eam', 'primary'], ['hr', 'primary'], ['oa', 'primary'],
      ['translation', 'primary'], ['ads', 'primary'], ['merchant', 'primary'], ['seller', 'primary'],
      ['platform', 'primary'], ['rdm', 'primary'],
      ['attendance', 'primary'], ['attendance', 'alternate'],
      // 会议两套构图各承载状态文案：场景一讲"已预订"，场景二讲"邀约送达 + 已签到"
      ['meeting', 'primary'], ['meeting', 'alternate'],
      // 文檔中心两套构图各承载状态文案：主構成讲"沉淀与检索"，副構成讲"企业知识库与档案资料"
      ['doc', 'primary'], ['doc', 'alternate'],
    ]
    const { container } = render(<>{frames.map(([code, style]) => <SystemArtwork key={`${code}-${style}`} code={code} style={style} />)}</>)
    for (const text of Object.values(copy)) expect(container).toHaveTextContent(text)
  })

  it('產研交付静态构图包含六个阶段站点、驳回回路与挂起支路', () => {
    const { container } = render(<SystemArtwork code="rdm" name="產研交付系統" />)
    const image = container.querySelector('svg[data-scene="rdm"]')!
    expect(image).toHaveAttribute('data-motion', 'idle')
    // 静态构图只保留阶段标签（六个站点），交互动效才点亮站点与验收章
    // 插画固定 6 站（站距与光环节拍绑定），阶段已扩为 9 段，此处 6 是示意里程碑而非阶段总数
    expect(image.querySelectorAll('text')).toHaveLength(6)
    for (let index = 0; index < 6; index += 1) expect(image.querySelector(`.portal-rdm-stage-${index}`)).toHaveAttribute('opacity', '0')
    expect(image.querySelector('.portal-rdm-halo')).toHaveClass('portal-art-motion')
    expect(image.querySelector('.portal-rdm-delivered')).toHaveAttribute('opacity', '0')
    expect(image).toHaveTextContent(zh.portal.artwork.rdmSubmit)
    expect(image).toHaveTextContent(zh.portal.artwork.rdmRelease)
    // 驳回（红）与挂起（琥珀）两条支路静态可见，不占用主线节拍
    expect(image.querySelector('path[stroke="#FF4D4F"]')).toBeInTheDocument()
    expect(image.querySelector('circle[stroke="#FA8C16"]')).toBeInTheDocument()
  })

  it('考勤假勤两套构图分别讲今日出勤与请假额度，静态层自身完整可读', () => {
    const punch = render(<SystemArtwork code="attendance" name="考勤假勤系統" />)
    const image = punch.container.querySelector('svg[data-scene="attendance"]')!
    // 场景一：打卡机指纹 + 分针 + 周排班日历 + 逐字揭示标题 + 等连线到位才上升的工时柱
    expect(image.querySelector('.portal-attendance-ripple')).toHaveClass('portal-art-motion')
    expect(image.querySelector('.portal-attendance-hand')).toBeInTheDocument()
    expect(image.querySelectorAll('.portal-attendance-today')).toHaveLength(1)
    expect(image.querySelectorAll('.portal-attendance-bars')).toHaveLength(4)
    expect(image.querySelector('.portal-attendance-type')).toBeInTheDocument()
    expect(image.querySelector('.portal-attendance-connection')).toBeInTheDocument()
    expect(image).toHaveTextContent(zh.portal.artwork.attendancePunched)

    const leave = render(<SystemArtwork code="attendance" name="考勤假勤系統" style="alternate" />)
    const alt = leave.container.querySelector('svg[data-scene="attendance"]')!
    // 场景二：假单 + 核准章 + 被徽章拍下的休假日 + 紫/橙两段额度环与绕行标记点
    expect(alt.querySelector('.portal-attendance-stamp')).toBeInTheDocument()
    expect(alt.querySelector('.portal-attendance-mark')).toBeInTheDocument()
    expect(alt.querySelector('.portal-attendance-umbrella')).toBeInTheDocument()
    expect(alt.querySelector('.portal-attendance-hourglass')).toBeInTheDocument()
    expect(alt.querySelector('.portal-attendance-ring')).toBeInTheDocument()
    expect(alt.querySelector('.portal-attendance-used')).toBeInTheDocument()
    expect(alt.querySelector('.portal-attendance-orbit')).toBeInTheDocument()
    expect(alt.querySelector('circle[stroke="#52C41A"]')).toBeInTheDocument()
    expect(alt.querySelector('path[stroke="#722ED1"]')).toBeInTheDocument()
    expect(alt).not.toHaveTextContent(zh.portal.artwork.attendancePunched)
    expect(alt).toHaveTextContent(zh.portal.artwork.leaveApproved)
    // 两套构图必须真的画得不一样，否则轮换只是重复展示同一张图
    expect(alt.innerHTML).not.toBe(image.innerHTML)
    punch.unmount()
    leave.unmount()
  })

  it.each([
    ['finance', false], ['finance', true], ['eam', false], ['eam', true],
  ] as const)('%s 减少动态效果=%s 时离屏/后台均暂停，可见后恢复', (code, reduced) => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    vi.mocked(window.matchMedia).mockReturnValueOnce({ ...query, matches: reduced })
    let onIntersection: IntersectionObserverCallback = () => undefined
    const disconnect = vi.fn()
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { onIntersection = callback }
      observe = vi.fn()
      disconnect = disconnect
    })
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const { container, unmount } = render(<SystemArtwork code={code} active />)
    const image = container.querySelector('svg')
    const intersect = (isIntersecting: boolean) => onIntersection([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver)
    expect(image).toHaveAttribute('data-motion', reduced ? 'idle' : 'paused')
    act(() => intersect(true))
    expect(image).toHaveAttribute('data-motion', reduced ? 'idle' : 'running')
    hidden.mockReturnValue(true)
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(image).toHaveAttribute('data-motion', reduced ? 'idle' : 'paused')
    hidden.mockReturnValue(false)
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(image).toHaveAttribute('data-motion', reduced ? 'idle' : 'running')
    act(() => intersect(false))
    expect(image).toHaveAttribute('data-motion', reduced ? 'idle' : 'paused')
    unmount()
    expect(disconnect).toHaveBeenCalled()
  })
})

describe('门户多语言与系统继承', () => {
  it.each(['/portal', '/account-balance'])('%s 只展示接口配置的语言并保留服务端顺序和名称', async path => {
    const configured = [configuredLanguages[1], { id: 6, code: 'fr', name: 'Français personnalisé', flag: '🇫🇷' }]
    vi.mocked(fetchLanguages).mockResolvedValue(configured)
    await i18n.changeLanguage('en')
    const { container } = mount(path)
    const language = screen.getByRole('combobox', { name: 'Language' })
    await waitFor(() => expect(language.closest('.ant-select')).toHaveTextContent('English'))
    fireEvent.mouseDown(language)
    await screen.findByText('Français personnalisé', { selector: '.ant-select-item-option-content' })
    expect(Array.from(document.querySelectorAll('.ant-select-item-option-content'), node => node.textContent))
      .toEqual(['English', 'Français personnalisé'])
    expect(container.querySelector('.portal-country-select')).toBeInTheDocument()
    expect(container.querySelector('.portal-language-select')).toBeInTheDocument()
    expect(container.querySelectorAll('.portal-locale-field label')).toHaveLength(2)
  })

  it('动态注册语言可切换、注入语言包并在进入系统及刷新后恢复', async () => {
    vi.mocked(fetchLanguages).mockResolvedValue([...configuredLanguages, { id: 6, code: 'fr', name: 'Français', flag: '🇫🇷' }])
    vi.mocked(ensureLanguageBundle).mockImplementation(async lang => {
      if (lang === 'fr') injectTranslationBundle(lang, { 'portal.systems.finance.name': 'Finances' })
    })
    const { unmount } = mount()
    await selectLanguage('Français')
    await waitFor(() => expect(i18n.language).toBe('fr'))
    expect(ensureLanguageBundle).toHaveBeenCalledWith('fr')
    expect(getSavedLanguage()).toBe('fr')
    fireEvent.click(await screen.findByRole('button', { name: 'Finances · Enter system' }))
    expect(await screen.findByTestId('system-route')).toHaveTextContent('/:fr')
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Language' }).closest('.ant-select')).toHaveTextContent('Français'))
    unmount()
    await i18n.changeLanguage(getSavedLanguage())
    mount('/')
    expect(await screen.findByTestId('system-route')).toHaveTextContent('/:fr')
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Language' }).closest('.ant-select')).toHaveTextContent('Français'))
  })

  it('配置变更即时刷新，删除当前语言后回退到接口中的英文', async () => {
    await i18n.changeLanguage('ja')
    mount('/account-balance')
    await waitFor(() => expect(screen.getByRole('combobox', { name: '言語' }).closest('.ant-select')).toHaveTextContent('日本語'))
    vi.mocked(fetchLanguages).mockResolvedValue([configuredLanguages[0], configuredLanguages[1]])
    act(() => { window.dispatchEvent(new Event(LANGUAGES_CHANGED_EVENT)) })
    await waitFor(() => expect(i18n.language).toBe('en'))
    expect(getSavedLanguage()).toBe('en')
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Language' }))
    expect(await screen.findByText('English', { selector: '.ant-select-item-option-content' })).toBeInTheDocument()
    expect(screen.queryByText('日本語', { selector: '.ant-select-item-option-content' })).not.toBeInTheDocument()
  })

  it.each(['empty', 'offline', 'error'])('语言接口 %s 不补入本地语言，恢复后重新展开可重试', async state => {
    if (state === 'error') vi.mocked(fetchLanguages).mockRejectedValue(new Error('网络错误'))
    else vi.mocked(fetchLanguages).mockResolvedValue(state === 'empty' ? [] : null)
    mount('/account-balance')
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '語言' }))
    expect(await screen.findByText(state === 'empty' ? zh.header.noLanguages : zh.header.languagesLoadError)).toBeInTheDocument()
    expect(document.querySelectorAll('.ant-select-item-option-content')).toHaveLength(0)
    expect(i18n.language).toBe('zh-TW')
    // rc-select 使用 which 判断 Escape，补齐真实键盘事件，确保重试前下拉框已关闭。
    fireEvent.keyDown(screen.getByRole('combobox', { name: '語言' }), { key: 'Escape', keyCode: 27, which: 27 })
    expect(screen.getByRole('combobox', { name: '語言' })).toHaveAttribute('aria-expanded', 'false')
    vi.mocked(fetchLanguages).mockResolvedValue(configuredLanguages)
    await selectLanguage('English')
    await waitFor(() => expect(i18n.language).toBe('en'))
  })

  it('当前语言已移除且没有英文时，使用接口返回的首个语言', async () => {
    vi.mocked(fetchLanguages).mockResolvedValue([configuredLanguages[2]])
    mount()
    await waitFor(() => expect(i18n.language).toBe('ja'))
    expect(getSavedLanguage()).toBe('ja')
  })

  it('迟到的旧语言列表不得覆盖新的配置', async () => {
    let finish: (languages: LanguageVO[]) => void = () => undefined
    vi.mocked(fetchLanguages).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    mount('/account-balance')
    vi.mocked(fetchLanguages).mockResolvedValue([configuredLanguages[1]])
    act(() => { window.dispatchEvent(new Event(LANGUAGES_CHANGED_EVENT)) })
    await waitFor(() => expect(i18n.language).toBe('en'))
    await act(async () => { finish([configuredLanguages[2]]) })
    expect(i18n.language).toBe('en')
    expect(screen.getByRole('combobox', { name: 'Language' }).closest('.ant-select')).toHaveTextContent('English')
  })

  it.each(STATIC_LANGUAGES)('%s 的门户文案完整且可按当前语言搜索', async lang => {
    await i18n.changeLanguage(lang)
    const copy = resources[lang].portal
    expect(Object.keys(copy).sort()).toEqual(Object.keys(en.portal).sort())
    expect(Object.keys(copy.systems).sort()).toEqual(Object.keys(en.portal.systems).sort())
    const { container } = mount()
    expect(await screen.findByRole('button', { name: `${copy.systems.finance.name} · ${copy.enter}` })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: copy.appCenter })).toBeInTheDocument()
    expect(container.querySelector('.portal-card-desc')).toHaveTextContent(copy.systems.finance.description)
    const search = screen.getByRole('textbox', { name: copy.search })
    fireEvent.change(search, { target: { value: copy.systems.finance.name } })
    expect(container.querySelectorAll('.portal-card')).toHaveLength(1)
    fireEvent.change(search, { target: { value: copy.systems.finance.description.slice(0, 8) } })
    expect(container.querySelectorAll('.portal-card')).toHaveLength(1)
    fireEvent.change(search, { target: { value: 'does-not-exist' } })
    expect(screen.getByText(copy.noMatch)).toBeInTheDocument()
    fireEvent.change(search, { target: { value: '' } })
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(copy.unauthorized) }))
    const panel = screen.getByRole('tabpanel')
    for (const [key, system] of Object.entries(copy.systems)) {
      if (key === 'finance') continue
      expect(panel).toHaveTextContent(system.name)
      expect(panel).toHaveTextContent(system.description)
    }
  })

  it('通过顶栏切换语言后立即更新卡片，进入真实系统顶栏且刷新恢复同一语言', async () => {
    const { unmount, container } = mount()
    await screen.findByRole('button', { name: '財務結算系統 · 進入系統' })
    await selectLanguage('日本語')
    const card = await screen.findByRole('button', { name: `${ja.portal.systems.finance.name} · ${ja.portal.enter}` })
    expect(localStorage.getItem('app_language')).toBe('ja')
    expect(ensureLanguageBundle).toHaveBeenCalledWith('ja')
    fireEvent.click(card)
    expect(await screen.findByTestId('system-route')).toHaveTextContent('/:ja')
    await waitFor(() => expect(container.querySelector('.system-switcher-trigger-label')).toHaveTextContent('財務決済システム'))
    expect(container.querySelector('.header-right')).toHaveTextContent('日本語')
    expect(localStorage.getItem('current_system_code')).toBe('finance')
    unmount()
    await i18n.changeLanguage(getSavedLanguage())
    const refreshed = mount('/')
    expect(await screen.findByTestId('system-route')).toHaveTextContent('/:ja')
    await waitFor(() => expect(refreshed.container.querySelector('.system-switcher-trigger-label')).toHaveTextContent('財務決済システム'))
    refreshed.unmount()
    mount()
    expect(await screen.findByRole('button', { name: `${ja.portal.systems.finance.name} · ${ja.portal.enter}` })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '言語' }).closest('.ant-select')).toHaveTextContent('日本語')
  })

  it('国家独立持久化，不改变当前语言；重新挂载恢复国家', async () => {
    const { unmount } = mount()
    await screen.findByRole('button', { name: '財務結算系統 · 進入系統' })
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '國家' }))
    fireEvent.change(screen.getByRole('combobox', { name: '國家' }), { target: { value: '日本' } })
    fireEvent.click(await screen.findByText('🇯🇵 日本', { selector: '.ant-select-item-option-content' }))
    expect(localStorage.getItem('selected_country')).toBe('japan')
    expect(i18n.language).toBe('zh-TW')
    unmount()
    mount()
    expect(screen.getByRole('combobox', { name: '國家' }).closest('.ant-select')).toHaveTextContent('日本')
    await screen.findByRole('button', { name: '財務結算系統 · 進入系統' })
  })

  it('慢语言包不会阻塞进入系统，也不会把后来的语言切回旧语言', async () => {
    let finish: () => void = () => undefined
    const pending = new Promise<void>(resolve => { finish = resolve })
    vi.mocked(ensureLanguageBundle).mockReturnValueOnce(pending)
    mount()
    await screen.findByRole('button', { name: '財務結算系統 · 進入系統' })
    await selectLanguage('日本語')
    expect(screen.getByRole('button', { name: `${ja.portal.systems.finance.name} · ${ja.portal.enter}` })).toBeEnabled()
    await selectLanguage('English')
    await act(async () => { finish(); await pending })
    expect(i18n.language).toBe('en')
    expect(getSavedLanguage()).toBe('en')
    expect(screen.getByRole('button', { name: 'Finance & Settlement · Enter system' })).toBeInTheDocument()
  })

  it('后端语言包的英文兜底不会覆盖已翻译的门户名称', async () => {
    injectTranslationBundle('ja', { 'portal.systems.finance.name': 'Finance' })
    await i18n.changeLanguage('ja')
    expect(i18n.t('portal.systems.finance.name')).toBe('財務決済システム')
    expect(i18n.t('portal:systems.finance.name')).toBe('財務決済システム')
  })

  it('门户页把浏览器标签页标题回落为门户名称，切换语言后同步', async () => {
    // 模拟从业务系统返回门户：Sidebar 卸载后残留的标题必须被门户顶栏覆盖
    document.title = 'MFTB財務結算系統'
    mount()
    await screen.findByRole('button', { name: '財務結算系統 · 進入系統' })
    expect(document.title).toBe(`MFTB${zh.portal.title}`)
    await selectLanguage('English')
    await screen.findByRole('button', { name: 'Finance & Settlement · Enter system' })
    expect(document.title).toBe('MFTB Group Portal')
  })
})
