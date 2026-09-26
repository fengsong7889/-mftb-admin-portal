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
import { fetchLanguages, LANGUAGES_CHANGED_EVENT, type LanguageVO } from '../../api/translation'
import { loadSystemNavigation } from '../../hooks/useSystemNavigation'
import i18n, { ensureLanguageBundle, getSavedLanguage, injectTranslationBundle, SUPPORTED_LANGUAGES } from '../../i18n'
import en from '../../i18n/locales/en.json'
import zh from '../../i18n/locales/zh-TW.json'
import ja from '../../i18n/locales/ja.json'
import ko from '../../i18n/locales/ko.json'
import ru from '../../i18n/locales/ru.json'

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({
  user: { name: '测试员工', empId: 'TEST', role: 'user' },
  hasMenuPermission: () => true,
  logout: vi.fn(),
}) }))
vi.mock('../../contexts/MenuContext', () => ({ useMenu: () => ({ menuTree: null }) }))
vi.mock('../../api/portal', () => ({ fetchPortalContext: vi.fn() }))
vi.mock('../../api/translation', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/translation')>(),
  fetchLanguages: vi.fn(),
}))
vi.mock('../../api/notification', () => ({ fetchNotifications: vi.fn().mockResolvedValue({ items: [], unreadCount: 0 }) }))
vi.mock('../../hooks/useSystemNavigation', async importOriginal => ({
  ...await importOriginal<typeof import('../../hooks/useSystemNavigation')>(),
  loadSystemNavigation: vi.fn(),
}))
vi.mock('../../i18n', async importOriginal => ({
  ...await importOriginal<typeof import('../../i18n')>(),
  ensureLanguageBundle: vi.fn().mockResolvedValue(undefined),
}))

const finance: PortalSystem = { code: 'finance', name: '財務系統', nameEn: 'Old finance subtitle', description: '旧描述' }
const resources = { en, 'zh-TW': zh, ja, ko, ru }
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

function mount(path = '/portal') {
  return render(
    <I18nextProvider i18n={i18n}>
      <ConfigProvider locale={enUS}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/portal" element={<><PortalTopBar /><Portal /><output data-testid="portal-route">/portal</output></>} />
            <Route path="/" element={<SystemPage />} />
            <Route path="/account-balance" element={<SystemPage />} />
            <Route path="/process-center" element={<SystemPage />} />
          </Routes>
        </MemoryRouter>
      </ConfigProvider>
    </I18nextProvider>,
  )
}

async function selectLanguage(label: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: i18n.t('portal.language') }))
  fireEvent.click(await screen.findByText(label, { selector: '.ant-select-item-option-content' }))
}

beforeEach(async () => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.mocked(ensureLanguageBundle).mockResolvedValue(undefined)
  vi.mocked(fetchLanguages).mockResolvedValue(configuredLanguages)
  await i18n.changeLanguage('zh-TW')
  vi.mocked(fetchPortalContext).mockResolvedValue({ systems: [finance], superAdmin: false })
  vi.mocked(loadSystemNavigation).mockResolvedValue([
    { id: 1, parentId: null, menuKey: 'account-balance', name: '賬戶餘額', path: '/account-balance', type: 2, sort: 1, status: 1 },
  ])
})

describe('门户场景卡片与授权边界', () => {
  it('上图下文、无英文副标题，全部十二种系统有不同场景；未授权卡片点击弹出申请引导', async () => {
    const { container } = mount()
    const card = await screen.findByRole('button', { name: '財務系統 · 進入系統' })
    expect(card.querySelector('.portal-card-cover > svg[data-scene="finance"]')).toBeInTheDocument()
    expect(card.querySelector('.portal-card-body .portal-card-title')).toHaveTextContent('財務系統')
    expect(card.querySelector('.portal-card-desc')).toHaveTextContent(zh.portal.systems.finance.description)
    expect(screen.queryByText(finance.nameEn!)).not.toBeInTheDocument()
    expect(container.querySelector('.portal-card-title-en')).toBeNull()
    expect(container.querySelector('.portal-card-action')).toBeNull()
    expect(container.querySelector('.portal-card-enter-icon')).toBeNull()
    expect(card.querySelector('.portal-card-body .anticon')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: /未獲得權限/ }))
    const cards = within(screen.getByRole('tabpanel')).getAllByRole('button')
    expect(cards).toHaveLength(11)
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
    expect(new Set(scenes).size).toBe(12)
    expect(Array.from(screen.getByRole('tabpanel').querySelectorAll('.portal-card-body'), node => node.textContent).join('')).not.toMatch(/[A-Za-z]/)
  })

  it('未授权卡片点击弹出申请弹窗，确认申请进入流程中心', async () => {
    mount()
    await screen.findByRole('button', { name: '財務系統 · 進入系統' })
    fireEvent.click(screen.getByRole('tab', { name: /未獲得權限/ }))
    fireEvent.click(screen.getByRole('button', { name: /協同辦公系統/ }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('您尚未獲得「協同辦公系統」的使用權限')
    fireEvent.click(within(dialog).getByRole('button', { name: /我要申請|申請/ }))
    await waitFor(() => expect(screen.getByTestId('system-route')).toHaveTextContent('/process-center'))
  })

  it('申请弹窗取消只关闭弹窗，不进入系统也不切换当前系统', async () => {
    mount()
    await screen.findByRole('button', { name: '財務系統 · 進入系統' })
    fireEvent.click(screen.getByRole('tab', { name: /未獲得權限/ }))
    fireEvent.click(screen.getByRole('button', { name: /協同辦公系統/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /取\s*消/ }))
    await waitFor(() => expect(dialog).toHaveClass(/ant-zoom-leave/))
    expect(document.querySelector('[data-testid="system-route"]')).toBeNull()
    expect(document.querySelectorAll('.portal-card.is-locked').length).toBe(11)
    expect(localStorage.getItem('current_system_code')).toBeNull()
    expect(loadSystemNavigation).not.toHaveBeenCalled()
  })

  it('接口失败显示重试，不误判授权；重试成功恢复卡片', async () => {
    vi.mocked(fetchPortalContext).mockRejectedValueOnce(new Error('测试网络错误'))
    const { container } = mount()
    expect(await screen.findByText(zh.portal.loadError)).toBeInTheDocument()
    expect(container.querySelector('.portal-card')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /重\s*試/ }))
    expect(await screen.findByRole('button', { name: '財務系統 · 進入系統' })).toBeEnabled()
  })

  it('成功返回空权限时不放行目录卡片', async () => {
    vi.mocked(fetchPortalContext).mockResolvedValue({ systems: [], superAdmin: false })
    mount()
    expect(await screen.findByText(zh.portal.noSystem)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /未獲得權限/ }))
    const cards = within(screen.getByRole('tabpanel')).getAllByRole('button')
    expect(cards).toHaveLength(12)
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
    fireEvent.click(await screen.findByRole('button', { name: '財務系統 · 進入系統' }))
    expect(await screen.findByTestId('system-route')).toHaveTextContent('/:zh-TW')
    expect(localStorage.getItem('current_system_code')).toBe('finance')
    expect(loadSystemNavigation).not.toHaveBeenCalled()
  })

  it.each(['finance', 'ads'])('切换器选择 %s 都返回对应系统首页', async (code) => {
    localStorage.setItem('current_system_code', 'finance')
    vi.mocked(fetchPortalContext).mockResolvedValue({ systems: [finance, { code: 'ads', name: '廣告推薦系統' }], superAdmin: false })
    const { container } = mount('/account-balance')
    await waitFor(() => expect(container.querySelector('.system-switcher-trigger-label')).toHaveTextContent('財務系統'))
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
    await screen.findByRole('button', { name: '商家工作台 · 進入系統' })
    expect(Array.from(container.querySelectorAll('[data-scene]'), node => node.getAttribute('data-scene')))
      .toEqual(['merchantWorkbench', 'platform', 'translation'])
    const scenes = Array.from(container.querySelectorAll('svg[data-scene]'))
    expect(new Set(scenes.map(scene => scene.innerHTML)).size).toBe(3)
    for (const scene of scenes) expect(scene.querySelector('.portal-art-motion')).toBeInTheDocument()
    expect(container.querySelector('.portal-card-body .anticon')).toBeNull()
    await act(async () => { await i18n.changeLanguage('en') })
    expect(screen.getByRole('button', { name: 'Merchant Workspace · Enter system' })).toHaveTextContent(en.portal.systems.merchantWorkbench.description)
    expect(screen.getByRole('button', { name: 'Translation Center · Enter system' })).toHaveTextContent(en.portal.systems.translation.description)
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
    expect(image?.querySelectorAll('.portal-globe-greeting')).toHaveLength(1)
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
    const financeCard = await screen.findByRole('button', { name: '財務系統 · 進入系統' })
    const searchCard = screen.getByRole('button', { name: /搜索運營.*進入系統/ })
    const financeShell = financeCard.closest('.portal-card-shell')!
    const searchShell = searchCard.closest('.portal-card-shell')!
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
    const lockedCard = within(screen.getByRole('tabpanel')).getByRole('button', { name: /權限中心/ })
    expect(lockedCard).toHaveClass('is-locked')
    fireEvent.pointerEnter(lockedCard.closest('.portal-card-shell')!, { pointerType: 'mouse' })
    expect(lockedCard.querySelector('svg[data-scene]')).toHaveAttribute('data-motion', 'running')
    fireEvent.click(lockedCard)
    expect(loadSystemNavigation).not.toHaveBeenCalled()
    expect(localStorage.getItem('current_system_code')).toBeNull()
    unmount()
    const refreshed = mount()
    await screen.findByRole('button', { name: '財務系統 · 進入系統' })
    expect(refreshed.container.querySelector('[data-motion="running"]')).toBeNull()
  })

  it('触摸不会滞留播放，指针取消和搜索也清除悬停', async () => {
    const { container } = mount()
    const card = await screen.findByRole('button', { name: '財務系統 · 進入系統' })
    const shell = card.closest('.portal-card-shell')!
    fireEvent.pointerEnter(shell, { pointerType: 'touch' })
    expect(container.querySelector('[data-motion="running"]')).toBeNull()
    fireEvent.pointerEnter(shell, { pointerType: 'mouse' })
    fireEvent.pointerCancel(shell)
    expect(container.querySelector('[data-motion="running"]')).toBeNull()
    fireEvent.pointerEnter(shell, { pointerType: 'mouse' })
    fireEvent.change(screen.getByRole('textbox', { name: zh.portal.search }), { target: { value: '財務' } })
    expect(container.querySelector('[data-motion="running"]')).toBeNull()
  })

  it('真实地球仅悬停时运转，随机国家抵达中心才显示问候，移出重置并取消帧回调', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    vi.spyOn(Math, 'random').mockReturnValue(0)
    let nextFrame: FrameRequestCallback = () => undefined
    let frameId = 0
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { nextFrame = callback; return ++frameId })
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    const { container, rerender, unmount } = render(<SystemArtwork code="translation" />)
    const globe = container.querySelector('.portal-globe-scene')!
    expect(globe).toHaveAttribute('data-world-source', 'natural-earth')
    expect(Number(globe.getAttribute('data-country-count'))).toBeGreaterThan(150)
    expect(globe).toHaveAttribute('data-country', 'CN')
    expect(request).not.toHaveBeenCalled()
    const initialLand = container.querySelector('.portal-globe-land')!.getAttribute('d')
    rerender(<SystemArtwork code="translation" active />)
    act(() => nextFrame(0))
    expect(globe).toHaveAttribute('data-country', 'US')
    expect(globe).toHaveAttribute('data-arrived', 'false')
    expect(container.querySelector('.portal-globe-greeting')).toHaveAttribute('opacity', '0')
    act(() => nextFrame(900))
    expect(container.querySelector('.portal-globe-land')!.getAttribute('d')).not.toBe(initialLand)
    act(() => nextFrame(1800))
    expect(globe).toHaveAttribute('data-center', '-98.00,38.00')
    expect(globe).toHaveAttribute('data-arrived', 'true')
    expect(container.querySelector('.portal-globe-greeting')).toHaveTextContent('Hello')
    const pin = container.querySelector('.portal-globe-pin circle')!
    expect(Number(pin.getAttribute('cx'))).toBeCloseTo(160)
    expect(Number(pin.getAttribute('cy'))).toBeCloseTo(94)
    act(() => nextFrame(3600))
    expect(globe).not.toHaveAttribute('data-country', 'US')
    rerender(<SystemArtwork code="translation" />)
    expect(cancel).toHaveBeenCalled()
    expect(globe).toHaveAttribute('data-country', 'CN')
    expect(container.querySelector('.portal-globe-land')).toHaveAttribute('d', initialLand)
    rerender(<SystemArtwork code="translation" active />)
    unmount()
    expect(cancel).toHaveBeenCalledTimes(2)
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
    ['finance', ['.portal-finance-formulas', '.portal-finance-display', '.portal-art-typing']],
    ['iam', ['.portal-key-denied', '.portal-key-granted', '.portal-lock-alarm', '.portal-lock-shackle']],
    ['ai', ['.portal-robot-eye', '.portal-robot-pupil', '.portal-robot-smile', '.portal-robot-signal']],
    ['eam', ['.portal-eam-laptop', '.portal-eam-custodian', '.portal-eam-asset-tag', '.portal-eam-assignment-path', '.portal-eam-supply', '.portal-eam-supply-confirm']],
    ['hr', ['.portal-hr-profile', '.portal-hr-match-path', '.portal-hr-member', '.portal-hr-welcome']],
    ['oa', ['.portal-workflow-paper', '.portal-workflow-stage-2', '.portal-office-signature', '.portal-office-archived']],
    ['translation', ['.portal-globe-land', '.portal-globe-meridian', '.portal-globe-greeting']],
    ['ads', ['.portal-ads-match', '.portal-ads-cursor', '.portal-ads-growth']],
    ['merchant', ['.portal-merchant-route', '.portal-merchant-pin-2', '.portal-merchant-metric']],
    ['merchantWorkbench', ['.portal-order-receipt', '.portal-order-stamp', '.portal-order-done']],
    ['platform', ['.portal-config-slider-0', '.portal-config-packet', '.portal-config-node-2']],
  ] as const)('%s 包含完整场景的动作元素', (code, selectors) => {
    const { container } = render(<SystemArtwork code={code} />)
    for (const selector of selectors) expect(container.querySelector(selector)).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    if (code === 'finance') expect(container.querySelector('.portal-finance-display')).toHaveTextContent('ROI=F/PV')
    if (code === 'translation') expect(container.querySelectorAll('.portal-globe-greeting')).toHaveLength(1)
  })

  it('物资场景展示设备归属和耗材领用，不再包含仓储扫码；悬停播放后移出复位', async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    vi.mocked(fetchPortalContext).mockResolvedValue({ systems: [{ code: 'eam', name: '物資管理系統' }], superAdmin: false })
    mount()
    const card = await screen.findByRole('button', { name: '物資管理系統 · 進入系統' })
    const image = card.querySelector('svg[data-scene="eam"]')!
    const shell = card.closest('.portal-card-shell')!
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

  it('重复场景的裁切标识独立，所有裁切引用均存在', () => {
    const { container } = render(<>{['search', 'finance', 'translation', 'search', 'translation'].map((code, index) => <SystemArtwork key={index} code={code} />)}</>)
    const ids = Array.from(container.querySelectorAll('[id]'), node => node.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const node of container.querySelectorAll('[clip-path]')) {
      const id = node.getAttribute('clip-path')!.slice(5, -1)
      expect(document.getElementById(id)).toBeInTheDocument()
    }
  })

  it.each(SUPPORTED_LANGUAGES)('%s 场景状态文案完整且跟随界面语言', async lang => {
    await i18n.changeLanguage(lang)
    const copy = resources[lang].portal.artwork
    expect(Object.keys(copy).sort()).toEqual(Object.keys(en.portal.artwork).sort())
    const { container } = render(<>{['search', 'iam', 'eam', 'hr', 'oa', 'translation', 'ads', 'merchant', 'seller', 'platform'].map(code => <SystemArtwork key={code} code={code} />)}</>)
    for (const text of Object.values(copy)) expect(container).toHaveTextContent(text)
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

  it.each(SUPPORTED_LANGUAGES)('%s 的门户文案完整且可按当前语言搜索', async lang => {
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
    await screen.findByRole('button', { name: '財務系統 · 進入系統' })
    await selectLanguage('日本語')
    const card = await screen.findByRole('button', { name: `${ja.portal.systems.finance.name} · ${ja.portal.enter}` })
    expect(localStorage.getItem('app_language')).toBe('ja')
    expect(ensureLanguageBundle).toHaveBeenCalledWith('ja')
    fireEvent.click(card)
    expect(await screen.findByTestId('system-route')).toHaveTextContent('/:ja')
    await waitFor(() => expect(container.querySelector('.system-switcher-trigger-label')).toHaveTextContent('財務管理'))
    expect(container.querySelector('.header-right')).toHaveTextContent('日本語')
    expect(localStorage.getItem('current_system_code')).toBe('finance')
    unmount()
    await i18n.changeLanguage(getSavedLanguage())
    const refreshed = mount('/')
    expect(await screen.findByTestId('system-route')).toHaveTextContent('/:ja')
    await waitFor(() => expect(refreshed.container.querySelector('.system-switcher-trigger-label')).toHaveTextContent('財務管理'))
    refreshed.unmount()
    mount()
    expect(await screen.findByRole('button', { name: `${ja.portal.systems.finance.name} · ${ja.portal.enter}` })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '言語' }).closest('.ant-select')).toHaveTextContent('日本語')
  })

  it('国家独立持久化，不改变当前语言；重新挂载恢复国家', async () => {
    const { unmount } = mount()
    await screen.findByRole('button', { name: '財務系統 · 進入系統' })
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '國家' }))
    fireEvent.change(screen.getByRole('combobox', { name: '國家' }), { target: { value: '日本' } })
    fireEvent.click(await screen.findByText('🇯🇵 日本', { selector: '.ant-select-item-option-content' }))
    expect(localStorage.getItem('selected_country')).toBe('japan')
    expect(i18n.language).toBe('zh-TW')
    unmount()
    mount()
    expect(screen.getByRole('combobox', { name: '國家' }).closest('.ant-select')).toHaveTextContent('日本')
    await screen.findByRole('button', { name: '財務系統 · 進入系統' })
  })

  it('慢语言包不会阻塞进入系统，也不会把后来的语言切回旧语言', async () => {
    let finish: () => void = () => undefined
    const pending = new Promise<void>(resolve => { finish = resolve })
    vi.mocked(ensureLanguageBundle).mockReturnValueOnce(pending)
    mount()
    await screen.findByRole('button', { name: '財務系統 · 進入系統' })
    await selectLanguage('日本語')
    expect(screen.getByRole('button', { name: `${ja.portal.systems.finance.name} · ${ja.portal.enter}` })).toBeEnabled()
    await selectLanguage('English')
    await act(async () => { finish(); await pending })
    expect(i18n.language).toBe('en')
    expect(getSavedLanguage()).toBe('en')
    expect(screen.getByRole('button', { name: 'Finance · Enter system' })).toBeInTheDocument()
  })

  it('后端语言包的英文兜底不会覆盖已翻译的门户名称', async () => {
    injectTranslationBundle('ja', { 'portal.systems.finance.name': 'Finance' })
    await i18n.changeLanguage('ja')
    expect(i18n.t('portal.systems.finance.name')).toBe('財務管理')
    expect(i18n.t('portal:systems.finance.name')).toBe('財務管理')
  })
})
