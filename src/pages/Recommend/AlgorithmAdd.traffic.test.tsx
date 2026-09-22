import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { Link, MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AlgorithmAdd from './AlgorithmAdd'
import { readTrafficParams } from './TrafficAlgorithmConfig/config'
import { ALGORITHM_TYPE_OPTIONS, AlgorithmType } from './constants'
import MenuTabs from '../../components/MenuTabs'

const api = vi.hoisted(() => ({ fetch: vi.fn(), create: vi.fn(), update: vi.fn(), t: (key: string) => key, i18n: { language: 'zh-TW' } }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: api.t, i18n: api.i18n }) }))
vi.mock('../../contexts/MenuContext', () => ({ useMenu: () => ({ menuTree: null, status: 'online' }) }))
vi.mock('../../components/Sidebar', () => ({ pathToKey: {} }))
vi.mock('antd', async importOriginal => ({
  ...await importOriginal<typeof import('antd')>(), message: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../api/adPromotion', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/adPromotion')>(),
  fetchAdAlgorithmDetail: api.fetch, createAdAlgorithm: api.create, updateAdAlgorithm: api.update,
}))
vi.mock('./OrganicTrafficScoreConfig', () => ({ default: () => <section aria-label="自然流量评分配置" /> }))
vi.mock('../../components/PopularLayoutPreviewModal', () => ({ default: () => null }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }))

function LocationIndicator() {
  const location = useLocation()
  return <output aria-label="当前路由">{location.pathname}</output>
}
function NavigationControls({ queries }: { queries: string[] }) {
  const navigate = useNavigate()
  return <nav aria-label="算法测试导航">
    {queries.map(query => <Link key={query} to={`/promotion-algorithm-add?${query}`}>{query}</Link>)}
    <button onClick={() => navigate(-1)}>后退</button>
    <button onClick={() => navigate(1)}>前进</button>
  </nav>
}

function mountPage(query: string, destinations: string[] = []) {
  return render(<ConfigProvider theme={{ token: { motion: false } }}>
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[`/promotion-algorithm-add?${query}`]}>
      {destinations.length > 0 && <NavigationControls queries={destinations} />}
      <AlgorithmAdd /><LocationIndicator />
    </MemoryRouter>
  </ConfigProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.fetch.mockResolvedValue({
    id: 7, algoCode: 'SFLL0007', algoName: '实际父页面投流', algoType: 15, brand: 'flashBee',
    params: JSON.stringify({ ...readTrafficParams({}), consistencyCheckInterval: 15, statusRest: true }),
  })
  api.create.mockResolvedValue({ id: 8 })
  api.update.mockResolvedValue({ id: 7 })
})

describe('算法详情页签', () => {
  beforeEach(() => { localStorage.clear() })

  const modes = [
    { query: '', title: 'recommend.addAlgo' },
    { query: '&id=7', title: 'recommend.editAlgo' },
    { query: '&id=7&mode=detail', title: 'recommend.algoDetail' },
  ]
  const cases = ALGORITHM_TYPE_OPTIONS.flatMap(option => modes.map(mode => ({ ...option, ...mode })))

  it.each(cases)('类型 $value 的 $title 页签保留正确的模式和广告名称', ({ value, labelKey, query, title }) => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[`/promotion-algorithm-add?type=${value}${query}`]}>
      <MenuTabs />
    </MemoryRouter>)
    expect(screen.getByText(`${title} · ${labelKey}`).closest('.menu-tab-item')).toHaveClass('menu-tab-item--active')
  })

  it('恢复历史详情页签时纠正旧的新增标题，切换编辑后仍保留详情标题', () => {
    const query = `type=${AlgorithmType.HOT_REVIVE_AD}&id=7`
    const detailPath = `/promotion-algorithm-add?${query}&mode=detail`
    localStorage.setItem('menu_tabs_history', JSON.stringify([{ path: detailPath, title: '新增算法 · 盤活復蘇' }]))
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[detailPath]}>
      <NavigationControls queries={[query]} /><MenuTabs />
    </MemoryRouter>)
    const detailTitle = 'recommend.algoDetail · recommend.algoHotReviveAd'
    expect(screen.getByText(detailTitle).closest('.menu-tab-item')).toHaveClass('menu-tab-item--active')
    fireEvent.click(screen.getByText(query))
    expect(screen.getByText('recommend.editAlgo · recommend.algoHotReviveAd').closest('.menu-tab-item')).toHaveClass('menu-tab-item--active')
    fireEvent.click(screen.getByText(detailTitle))
    expect(screen.getByText(detailTitle).closest('.menu-tab-item')).toHaveClass('menu-tab-item--active')
    expect(screen.queryByText('新增算法 · 盤活復蘇')).not.toBeInTheDocument()
  })
})

describe('算法详情标题同行布局', () => {
  it.each(ALGORITHM_TYPE_OPTIONS)('类型 $value 的名称和算法详情标题处于同一行', async ({ value, labelKey }) => {
    api.fetch.mockResolvedValueOnce({ id: 7, algoName: '详情标题测试', algoType: value, brand: 'flashBee', params: '{}' })
    await act(async () => { mountPage(`type=${value}&id=7&mode=detail`) })
    const row = screen.getByText('recommend.algoDetail').parentElement
    expect(row).toHaveStyle({ display: 'flex', alignItems: 'center' })
    expect(row).toHaveTextContent(labelKey)
    expect(row?.querySelector('span')).toHaveStyle({ fontSize: '14px', color: '#595959', whiteSpace: 'nowrap' })
  })
})

describe('算法库统一表单样式', () => {
  const statusTypes = [AlgorithmType.INVINCIBLE_STAR, AlgorithmType.NEW_STORE_AD, AlgorithmType.HOT_REVIVE_AD,
    AlgorithmType.EXCLUSIVE_MERCHANT, AlgorithmType.GUESS_YOU_LIKE, AlgorithmType.BRAND_MERCHANT]
  const cases = statusTypes.flatMap(type => ['add', 'edit', 'detail'].map(mode => ({ type, mode })))

  it.each(cases)('类型 $type 的 $mode 模式使用同一商家状态组件', async ({ type, mode }) => {
    api.fetch.mockResolvedValueOnce({ id: 7, algoName: '统一样式', algoType: type, brand: 'flashBee',
      params: JSON.stringify({ consistencyCheckInterval: 11, statusOpen: true, statusRest: true, statusOverwhelmed: false, statusClosed: false }),
    })
    const { container } = mountPage(`type=${type}${mode !== 'add' ? '&id=7' : ''}${mode === 'detail' ? '&mode=detail' : ''}`)
    if (mode !== 'add') await waitFor(() => expect(screen.getByRole('textbox', { name: 'recommend.algoName' })).toHaveValue('统一样式'))
    const group = within(screen.getByTestId('algorithm-merchant-status'))
    expect(group.getAllByRole('switch')).toHaveLength(4)
    expect(group.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(group.getByRole('switch', { name: 'recommend.statusOpen' })).toBeDisabled()
    expect(group.getByRole('switch', { name: 'recommend.statusOpen' })).toBeChecked()
    const rest = group.getByRole('switch', { name: 'recommend.statusRest' })
    expect(rest).toHaveAttribute('aria-checked', mode === 'add' ? 'false' : 'true')
    if (mode === 'detail') {
      group.getAllByRole('switch').forEach(control => expect(control).toBeDisabled())
      expect(screen.queryByRole('button', { name: /common:save/ })).not.toBeInTheDocument()
      expect(container.querySelector('.algorithm-form__footer')).toHaveTextContent('最后更新人')
    } else expect(rest).not.toBeDisabled()
    expect(container.querySelectorAll('.algorithm-section').length).toBeGreaterThanOrEqual(3)
    expect(api.create).not.toHaveBeenCalled()
    expect(api.update).not.toHaveBeenCalled()
    // 消耗残留的 mockResolvedValueOnce，防止泄漏到下一个测试
    await api.fetch().catch(() => {})
  })

  it('商家状态改为开关后仍按原字段和布尔值提交', async () => {
    api.fetch.mockResolvedValueOnce({ id: 7, algoName: '状态测试', algoType: 1, brand: 'flashBee',
      params: JSON.stringify({ consistencyCheckInterval: 11, statusRest: false }),
    })
    mountPage('type=1&id=7')
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'recommend.algoName' })).toHaveValue('状态测试'))
    fireEvent.click(screen.getByRole('switch', { name: 'recommend.statusRest' }))
    fireEvent.click(screen.getByRole('button', { name: /common:save/ }))
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1))
    expect(api.update.mock.calls[0][1].params).toMatchObject({ statusOpen: true, statusRest: true, statusOverwhelmed: false, statusClosed: false, consistencyCheckInterval: 11 })
  })

  it('金字招牌详情可切换标签查看，字段仍只读', async () => {
    api.fetch.mockResolvedValueOnce({ id: 7, algoName: '招牌详情', algoType: AlgorithmType.GOLDEN_SIGNBOARD, brand: 'flashBee', params: '{}' })
    mountPage(`type=${AlgorithmType.GOLDEN_SIGNBOARD}&id=7&mode=detail`)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'recommend.algoName' })).toHaveValue('招牌详情'))
    const favorites = screen.getByRole('button', { name: /收藏/ })
    fireEvent.click(favorites)
    expect(favorites).toHaveAttribute('aria-pressed', 'true')
    screen.queryAllByRole('spinbutton').forEach(control => expect(control).toBeDisabled())
    expect(screen.queryByRole('button', { name: /common:save/ })).not.toBeInTheDocument()
    expect(api.update).not.toHaveBeenCalled()
  })

  it.each([AlgorithmType.POPULAR_MERCHANT_KA, AlgorithmType.GOLDEN_SIGNBOARD, AlgorithmType.GOLD_AD, AlgorithmType.PRODUCT_PROMO])('类型 %s 保留原参数边界，不新增商家状态', type => {
    const { container } = mountPage(`type=${type}`)
    expect(container.querySelector('.algorithm-section')).toBeInTheDocument()
    expect(screen.queryByTestId('algorithm-merchant-status')).not.toBeInTheDocument()
  })
})

describe('算法页签切换状态隔离', () => {
  const organicQuery = `type=${AlgorithmType.ORGANIC_TRAFFIC}`
  const trafficQuery = `type=${AlgorithmType.TRAFFIC_AD}`

  function expectAlgorithmPage(type: AlgorithmType) {
    const isTraffic = type === AlgorithmType.TRAFFIC_AD
    const titleKey = isTraffic ? 'recommend.algoTrafficAd' : 'recommend.algoOrganicTraffic'
    expect(screen.getByRole('heading', { name: 'recommend.addAlgo' }).parentElement).toHaveTextContent(titleKey)
    if (isTraffic) {
      expect(screen.getByLabelText('投流配置概览')).toBeInTheDocument()
      expect(screen.queryByLabelText('自然流量评分配置')).not.toBeInTheDocument()
    } else {
      expect(screen.getByLabelText('自然流量评分配置')).toBeInTheDocument()
      expect(screen.queryByLabelText('投流配置概览')).not.toBeInTheDocument()
      expect(screen.queryByTestId('algorithm-merchant-status')).not.toBeInTheDocument()
    }
    expect(screen.getByRole('textbox', { name: 'recommend.algoName' })).toHaveValue('')
  }

  it.each([AlgorithmType.ORGANIC_TRAFFIC, AlgorithmType.TRAFFIC_AD])('从类型 %s 双向切换和前进后退时，标题、参数区与表单保持一致', firstType => {
    const secondType = firstType === AlgorithmType.ORGANIC_TRAFFIC ? AlgorithmType.TRAFFIC_AD : AlgorithmType.ORGANIC_TRAFFIC
    mountPage(`type=${firstType}`, [organicQuery, trafficQuery])
    expectAlgorithmPage(firstType)
    fireEvent.change(screen.getByRole('textbox', { name: 'recommend.algoName' }), { target: { value: '前一页未保存的名称' } })
    fireEvent.click(screen.getByRole('link', { name: `type=${secondType}` }))
    expectAlgorithmPage(secondType)
    fireEvent.change(screen.getByRole('textbox', { name: 'recommend.algoName' }), { target: { value: '另一页未保存的名称' } })
    fireEvent.click(screen.getByRole('link', { name: `type=${firstType}` }))
    expectAlgorithmPage(firstType)
    fireEvent.click(screen.getByRole('button', { name: '后退' }))
    expectAlgorithmPage(secondType)
    fireEvent.click(screen.getByRole('button', { name: '前进' }))
    expectAlgorithmPage(firstType)
    expect(api.fetch).not.toHaveBeenCalled()
    expect(api.create).not.toHaveBeenCalled()
    expect(api.update).not.toHaveBeenCalled()
  })

  it('同类型编辑页切回新增页时，不残留记录名称和配置', async () => {
    const query = `type=${AlgorithmType.INVINCIBLE_STAR}`
    api.fetch.mockResolvedValueOnce({ id: 7, algoName: '已有算法', algoType: AlgorithmType.INVINCIBLE_STAR, brand: 'flashBee',
      params: JSON.stringify({ consistencyCheckInterval: 11, statusRest: true }),
    })
    mountPage(`${query}&id=7`, [query])
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'recommend.algoName' })).toHaveValue('已有算法'))
    expect(screen.getByRole('switch', { name: 'recommend.statusRest' })).toBeChecked()
    fireEvent.click(screen.getByRole('link', { name: query }))
    expect(screen.getByRole('heading', { name: 'recommend.addAlgo' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'recommend.algoName' })).toHaveValue('')
    expect(screen.getByRole('switch', { name: 'recommend.statusRest' })).not.toBeChecked()
    expect(api.create).not.toHaveBeenCalled()
    expect(api.update).not.toHaveBeenCalled()
  })

  it('切换记录后，旧页面的延迟响应不会覆盖当前表单', async () => {
    const query = `type=${AlgorithmType.INVINCIBLE_STAR}`
    const oldDetail = { id: 1, algoName: '旧记录', algoType: AlgorithmType.INVINCIBLE_STAR, brand: 'flashBee', params: '{}' }
    let resolveOldDetail!: (detail: typeof oldDetail) => void
    api.fetch.mockReturnValueOnce(new Promise<typeof oldDetail>(resolve => { resolveOldDetail = resolve }))
    api.fetch.mockResolvedValueOnce({ ...oldDetail, id: 2, algoName: '当前记录' })
    mountPage(`${query}&id=1`, [`${query}&id=2`])
    fireEvent.click(screen.getByRole('link', { name: `${query}&id=2` }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'recommend.algoName' })).toHaveValue('当前记录'))
    await act(async () => { resolveOldDetail(oldDetail) })
    expect(screen.getByRole('textbox', { name: 'recommend.algoName' })).toHaveValue('当前记录')
    expect(api.fetch).toHaveBeenCalledTimes(2)
    expect(api.update).not.toHaveBeenCalled()
  })
})

describe('算法库父页面投流接入', () => {
  it('编辑只加载一次，使用投流保存分支并带上曾漏存的字段', async () => {
    mountPage('type=15&id=7')
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'recommend.algoName' })).toHaveValue('实际父页面投流'))
    expect(api.fetch).toHaveBeenCalledTimes(1)
    expect(screen.getAllByLabelText('投流配置概览')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /common:save/ }))
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1))
    expect(api.update.mock.calls[0]).toEqual([7, expect.objectContaining({
      algoName: '实际父页面投流', algoType: 15, brand: 'flashBee',
      params: expect.objectContaining({ statusRest: true, consistencyCheckInterval: 15, merchantExposureStrategy: 'trafficProportional' }),
    })])
    await waitFor(() => expect(screen.getByLabelText('当前路由').textContent).toBe('/promotion-algorithm'))
  })

  it('真实父页面加载失败时显示重试且保存被禁用', async () => {
    api.fetch.mockRejectedValueOnce(new Error('不可用'))
    mountPage('type=15&id=7')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('已禁止保存'))
    expect(screen.getByRole('button', { name: /common:save/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'recommend.algoName' })).toHaveValue('实际父页面投流'))
    expect(screen.getByRole('button', { name: /common:save/ })).not.toBeDisabled()
    expect(api.update).not.toHaveBeenCalled()
  })

  it('非投流算法继续走原有加载与界面，不初始化投流配置', async () => {
    api.fetch.mockResolvedValueOnce({
      id: 1, algoCode: 'SFX0001', algoName: '原有无敌星星', algoType: 1, brand: 'flashBee',
      params: JSON.stringify({ consistencyCheckInterval: 11 }),
    })
    await act(async () => { mountPage('type=1&id=1') })
    expect(api.fetch).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('投流配置概览')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'recommend.algoName' })).toHaveValue('原有无敌星星')
    expect(api.update).not.toHaveBeenCalled()
  })
})
