/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AlgorithmAdd from '../AlgorithmAdd'
import { PRODUCT_STAR_PREVIEW_DEFAULTS, ProductExposureStrategy } from './preview'
import { AlgorithmType } from '@mftb/contracts/recommendConstants'
import { StarTarget, STAR_SCHEMA_VERSION } from '@mftb/contracts/starAlgorithm'

const api = vi.hoisted(() => ({ fetch: vi.fn(), create: vi.fn(), update: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh-TW' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/adPromotion', async importOriginal => ({
  ...await importOriginal<typeof import('@/api/adPromotion')>(),
  fetchAdAlgorithmDetail: api.fetch, createAdAlgorithm: api.create, updateAdAlgorithm: api.update,
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true, hasMenuPermission: () => true }) }))
vi.mock('../OrganicTrafficScoreConfig', () => ({ default: () => null }))
vi.mock('@/components/PopularLayoutPreviewModal', () => ({ default: () => null }))

const BASE = `type=${AlgorithmType.INVINCIBLE_STAR}&tab=groupBuy`
const PRODUCT = `${BASE}&target=product`
const STORE = `${BASE}&target=store`
const PRODUCT_PARAMS = { schemaVersion: STAR_SCHEMA_VERSION, applicableBusinessTypes: [2], targetType: StarTarget.PRODUCT, revision: 3, productRules: { consistencyCheckInterval: 5, exposureStrategy: 'roundRobin' } }
function Navigation() {
  const location = useLocation()
  const navigate = useNavigate()
  return <nav>
    <output aria-label="當前網址">{location.pathname}{location.search}</output>
    <Link to={`/promotion-algorithm-add?${PRODUCT}`}>商品頁</Link>
    <Link to={`/promotion-algorithm-add?${STORE}`}>門店頁</Link>
    <button onClick={() => navigate(-1)}>後退</button>
    <button onClick={() => navigate(1)}>前進</button>
  </nav>
}
function mount(query = PRODUCT) {
  return render(<ConfigProvider theme={{ token: { motion: false } }}>
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[`/promotion-algorithm-add?${query}`]}>
      <Routes>
        <Route path="/promotion-algorithm-add" element={<AlgorithmAdd />} />
        <Route path="/promotion-algorithm" element={<span>算法列表</span>} />
      </Routes>
      <Navigation />
    </MemoryRouter>
  </ConfigProvider>)
}
async function click(name: string | RegExp) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
async function choose(name: string, text: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name }))
  const option = await waitFor(() => {
    const dropdown = document.querySelector<HTMLElement>('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    expect(dropdown).toBeTruthy()
    return within(dropdown!).getByText(text)
  })
  await act(async () => { fireEvent.click(option) })
}
const intervalInput = () => screen.getByRole('spinbutton', { name: 'recommend.starProduct.intervalLabel' })
const strategySelect = () => screen.getByRole('combobox', { name: 'recommend.starProduct.strategyLabel' })
const nameInput = () => screen.getByRole('textbox', { name: 'recommend.algoName' })

beforeEach(() => {
  vi.clearAllMocks()
  api.fetch.mockResolvedValue({ id: 7, algoName: '既有商品算法', algoType: AlgorithmType.INVINCIBLE_STAR, brand: 'flashBee',
    params: JSON.stringify(PRODUCT_PARAMS), updatedBy: '張三', updatedAt: '2026-11-19T10:00:00' })
  api.create.mockResolvedValue({ id: 8 })
  api.update.mockResolvedValue({ id: 7 })
})

describe('团购推广标题与策略命名统一', () => {
  it.each([
    { query: STORE, title: 'recommend.addAlgo', scope: 'recommend.algoInvincibleStar · 門店推廣' },
    { query: `${STORE}&id=7`, title: 'recommend.editAlgo', scope: 'recommend.algoInvincibleStar · 門店推廣' },
    { query: `${STORE}&id=7&mode=detail`, title: 'recommend.algoDetail', scope: 'recommend.algoInvincibleStar · 門店推廣' },
    { query: PRODUCT, title: 'recommend.addAlgo', scope: 'recommend.algoInvincibleStar · recommend.starProduct.targetProduct' },
    { query: `${PRODUCT}&id=7&mode=detail`, title: 'recommend.algoDetail', scope: 'recommend.algoInvincibleStar · recommend.starProduct.targetProduct' },
  ])('$query 的标题统一为模式、广告类型及推广对象', async ({ query, title, scope }) => {
    await act(async () => { mount(query) })
    const heading = screen.getByRole('heading', { name: title })
    expect(heading.parentElement).toHaveTextContent(scope)
    expect(api.create).not.toHaveBeenCalled()
    expect(api.update).not.toHaveBeenCalled()
  })

  it('商品轮询选项和盘活复苏复用相同的翻译键，不附加建议字样', async () => {
    const revive = mount(`type=${AlgorithmType.HOT_REVIVE_AD}&tab=delivery`)
    const reviveLabel = screen.getByRole('combobox', { name: 'recommend:merchantExposureLabel' }).closest('.ant-select')!.textContent!.trim()
    revive.unmount()
    mount()
    const productLabel = strategySelect().closest('.ant-select')!.textContent!.trim()
    expect(productLabel).toBe(reviveLabel.replace(':', '.'))
    expect(productLabel).toBe('recommend.roundRobinCalc')
    await choose('recommend.starProduct.strategyLabel', 'recommend.randomCalc')
    expect(screen.queryByText(/均衡輪播|（建議）/)).not.toBeInTheDocument()
  })
})

describe('团购商品无敌星星真实读写', () => {
  it('新增页只保留基础信息、周期与策略，保存按钮可用且默认值来自契约', async () => {
    const { container } = mount()
    await waitFor(() => expect(screen.getByRole('button', { name: /common:save/ })).not.toBeDisabled())
    expect(screen.getByRole('heading', { name: 'recommend.addAlgo' })).toBeInTheDocument()
    expect(intervalInput()).toHaveValue('5')
    expect(screen.getAllByRole('spinbutton')).toHaveLength(1)
    expect(container.querySelectorAll('.algorithm-section')).toHaveLength(3)
    expect(strategySelect().closest('.ant-select')).toHaveTextContent('recommend.roundRobinCalc')
    expect(PRODUCT_STAR_PREVIEW_DEFAULTS).toEqual({ consistencyCheckInterval: 5, exposureStrategy: ProductExposureStrategy.ROUND_ROBIN })
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByTestId('algorithm-merchant-status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(api.fetch).not.toHaveBeenCalled()
  })

  it('新增保存提交版本化商品参数（revision=0、targetType=2），成功后返回商品列表', async () => {
    mount()
    await waitFor(() => expect(screen.getByRole('button', { name: /common:save/ })).not.toBeDisabled())
    fireEvent.change(nameInput(), { target: { value: '團購套餐星星' } })
    await choose('common:brand', 'recommend.appShanfeng')
    await click(/common:save/)
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1))
    const payload = api.create.mock.calls[0][0]
    expect(payload.algoType).toBe(AlgorithmType.INVINCIBLE_STAR)
    expect(payload.brand).toBe('flashBee')
    expect(payload.params).toEqual({ schemaVersion: 1, applicableBusinessTypes: [2], targetType: 2, revision: 0, productRules: { consistencyCheckInterval: 5, exposureStrategy: 'roundRobin' } })
    expect(payload).not.toHaveProperty('channel')
    await waitFor(() => expect(screen.getByLabelText('當前網址')).toHaveTextContent(`/promotion-algorithm?${PRODUCT}`))
  })

  it('名称为空时校验拦截，不发起创建请求', async () => {
    mount()
    await waitFor(() => expect(screen.getByRole('button', { name: /common:save/ })).not.toBeDisabled())
    await click(/common:save/)
    expect(await screen.findByText('recommend.algoNamePh')).toBeInTheDocument()
    expect(api.create).not.toHaveBeenCalled()
  })

  it('编辑既有商品记录回填并携带读取到的 revision，品牌锁定', async () => {
    mount(`${PRODUCT}&id=7`)
    await waitFor(() => expect(nameInput()).toHaveValue('既有商品算法'))
    expect(intervalInput()).toHaveValue('5')
    expect(screen.getByRole('combobox', { name: 'common:brand' })).toBeDisabled()
    await click(/common:save/)
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1))
    expect(api.update.mock.calls[0][0]).toBe(7)
    expect(api.update.mock.calls[0][1].params.revision).toBe(3)
    expect(api.update.mock.calls[0][1].params.targetType).toBe(2)
  })

  it('并发冲突（409）禁止覆盖，转为加载失败并禁用保存', async () => {
    api.update.mockRejectedValueOnce(Object.assign(new Error('conflict'), { code: 409 }))
    mount(`${PRODUCT}&id=7`)
    await waitFor(() => expect(nameInput()).toHaveValue('既有商品算法'))
    await click(/common:save/)
    await waitFor(() => expect(screen.getByRole('button', { name: /common:save/ })).toBeDisabled())
    expect(screen.getByRole('alert')).toHaveTextContent('recommend.starProduct.conflict')
  })

  it('记录不是商品协议（门店参数）时拒绝加载，不开放保存', async () => {
    api.fetch.mockResolvedValueOnce({ id: 7, algoName: '門店記錄', algoType: AlgorithmType.INVINCIBLE_STAR, brand: 'flashBee',
      params: JSON.stringify({ schemaVersion: 1, applicableBusinessTypes: [2], targetType: 1, revision: 1, storeRules: { consistencyCheckInterval: 5, merchantExposureStrategy: 'random', statusOpen: true, statusRest: false, statusOverwhelmed: false, statusClosed: false } }) })
    mount(`${PRODUCT}&id=7`)
    await waitFor(() => expect(screen.getByRole('button', { name: /common:save/ })).toBeDisabled())
    expect(screen.getByRole('alert')).toHaveTextContent('recommend.starProduct.invalidParams')
    expect(api.update).not.toHaveBeenCalled()
  })

  it('详情模式只读并展示真实更新人/时间，无保存按钮', async () => {
    mount(`${PRODUCT}&id=7&mode=detail`)
    await waitFor(() => expect(nameInput()).toHaveValue('既有商品算法'))
    expect(nameInput()).toBeDisabled()
    expect(intervalInput()).toBeDisabled()
    expect(screen.queryByRole('button', { name: /common:save/ })).not.toBeInTheDocument()
    expect(screen.getByText('recommend.starProduct.lastUpdater：')).toBeInTheDocument()
    expect(screen.getByText('張三')).toBeInTheDocument()
  })

  it('策略切换更新摘要文案，资格说明指向团购业务系统', async () => {
    mount()
    await waitFor(() => expect(screen.getByRole('button', { name: /common:save/ })).not.toBeDisabled())
    const summary = screen.getByLabelText('recommend.starProduct.strategySummaryAria')
    expect(summary).toHaveTextContent('recommend.starProduct.roundRobinSummary')
    await choose('recommend.starProduct.strategyLabel', 'recommend.randomCalc')
    expect(summary).toHaveTextContent('recommend.starProduct.randomSummary')
    await act(async () => { fireEvent.click(screen.getByLabelText('recommend.starProduct.eligibilityHelpTitle')) })
    expect(await screen.findByText('recommend.starProduct.eligibilityHelp')).toBeInTheDocument()
  })

  it('检查周期分钟级校验，清空报错', async () => {
    mount()
    await waitFor(() => expect(screen.getByRole('button', { name: /common:save/ })).not.toBeDisabled())
    expect(intervalInput()).toHaveAttribute('aria-valuemax', '1440')
    await act(async () => { fireEvent.change(intervalInput(), { target: { value: '' } }) })
    expect(await screen.findByText('recommend.starProduct.intervalRule')).toBeInTheDocument()
  })

  it.each(['common:cancel', 'common:back'])('商品页 %s 返回团购商品列表', async button => {
    mount()
    await waitFor(() => expect(screen.getByRole('button', { name: /common:save/ })).not.toBeDisabled())
    await click(new RegExp(button.replace(':', '\\:')))
    expect(screen.getByLabelText('當前網址')).toHaveTextContent(`/promotion-algorithm?${PRODUCT}`)
    expect(screen.getByText('算法列表')).toBeInTheDocument()
  })

  it.each([
    `${BASE}&target=wrong`, `${BASE}&target=`,
    `type=${AlgorithmType.INVINCIBLE_STAR}&tab=delivery&target=product`,
    `type=${AlgorithmType.TRAFFIC_AD}&tab=groupBuy&target=product`,
  ])('非法对象组合 %s 拒绝挂载表单', query => {
    mount(query)
    expect(screen.queryByTestId('algorithm-merchant-status')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /common:save/ })).not.toBeInTheDocument()
    expect(api.create).not.toHaveBeenCalled()
    expect(api.update).not.toHaveBeenCalled()
  })
})
