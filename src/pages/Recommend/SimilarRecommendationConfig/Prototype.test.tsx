/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AlgorithmList from '../Algorithm'
import AlgorithmAdd from '../AlgorithmAdd'
import ReturnPreview from './ReturnPreview'
import WaterfallBinding from './WaterfallBinding'
import { PROTOTYPE_DEFAULTS, SIMILAR_ALGO_NAME, serializeSimilarParams, type PrototypeValues } from './prototype'
import { RANK_FACTOR_OPTIONS } from '../TrafficAlgorithmConfig/config'

const api = vi.hoisted(() => ({
  list: vi.fn(), detail: vi.fn(), create: vi.fn(), update: vi.fn(), status: vi.fn(), remove: vi.fn(),
  references: vi.fn(), revisions: vi.fn(), publish: vi.fn(), getBinding: vi.fn(), putBinding: vi.fn(),
}))
const auth = vi.hoisted(() => ({ user: { username: 'similar-ui-test' }, hasPermission: vi.fn(() => true), hasMenuPermission: vi.fn(() => true) }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/api/adPromotion', async original => ({
  ...await original<typeof import('@/api/adPromotion')>(),
  fetchAdAlgorithms: api.list, fetchAdAlgorithmDetail: api.detail, createAdAlgorithm: api.create,
  updateAdAlgorithm: api.update, updateAdAlgorithmStatus: api.status, deleteAdAlgorithm: api.remove,
  fetchAlgorithmWaterfallReferences: api.references, fetchAdAlgorithmRevisions: api.revisions,
  publishAdAlgorithmRevision: api.publish, fetchWaterfallRecommendation: api.getBinding,
  updateWaterfallRecommendation: api.putBinding,
}))
vi.mock('@/hooks/useColumnConfig', () => ({ useColumnConfig: () => ({ configComponent: null, applyConfig: (c: unknown[]) => c }) }))
vi.mock('@/hooks/useCardOrder', () => ({ useCardOrder: () => ({ sortCards: (cards: unknown[]) => cards, getDragProps: () => ({}) }) }))
vi.mock('@/components/BrandTag', () => ({ default: () => <span>品牌</span> }))
vi.mock('@/components/HelpPopover', () => ({ default: () => <span>说明</span> }))
// i18n 桩与真 i18next 对齐：取 defaultValue 兜底并对 {{var}} 插值（真源 stub 不插值会让参数化文案断言恒红）。
// hoisted 供两个 vi.mock 工厂安全引用，避免 mock 工厂先于顶层 const 执行的 TDZ。
const { stubT } = vi.hoisted(() => ({
  stubT: (key: string, opts?: Record<string, unknown>) => {
    let v = typeof opts?.defaultValue === 'string' ? opts.defaultValue : key
    for (const [k, val] of Object.entries(opts ?? {})) {
      if (k !== 'defaultValue') v = v.split(`{{${k}}}`).join(String(val))
    }
    return v
  },
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: stubT }), initReactI18next: { type: '3rdParty', init: () => {} } }))
// prototype.ts 的校验/试算消息走真实 i18n 实例；测试环境 lng 不定，同样桩住以 defaultValue 回落繁中，保持断言口径。
vi.mock('@/i18n', () => ({ default: { t: stubT }, i18n: { t: stubT } }))

beforeAll(() => {
  configure({ asyncUtilTimeout: 5000 })
  const getComputedStyle = window.getComputedStyle
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => getComputedStyle(element))
})
beforeEach(() => { vi.clearAllMocks(); auth.hasPermission.mockReturnValue(true)
  api.list.mockResolvedValue({ records: [], total: 0 })
  api.revisions.mockResolvedValue([])
  api.references.mockResolvedValue([])
  api.getBinding.mockResolvedValue({ configured: false, waterfallId: 9, sceneCode: 1, enabled: 0, candidateScope: 1, version: 0, trafficAlgorithmIds: [] })
})
afterAll(() => { vi.restoreAllMocks(); configure({ asyncUtilTimeout: 1000 }) })

function mount(entry: string) {
  return render(<ConfigProvider theme={{ token: { motion: false } }}><MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes><Route path="/promotion-algorithm" element={<AlgorithmList />} /><Route path="/promotion-algorithm-add" element={<AlgorithmAdd />} /></Routes>
  </MemoryRouter></ConfigProvider>)
}
async function choose(label: string, text: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: label }))
  const option = await waitFor(() => {
    const el = [...document.querySelectorAll<HTMLElement>('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content')].find(o => o.textContent === text)
    expect(el).toBeDefined()
    return el!
  })
  await act(async () => { fireEvent.click(option) })
}
const values: PrototypeValues = { ...PROTOTYPE_DEFAULTS, name: '匿名演示', count: 2 }
const binding = { enabled: true, trafficOnly: false, trafficSources: [] }
function enterAndReturn() {
  fireEvent.click(screen.getByRole('button', { name: '進入商家詳情' }))
  fireEvent.click(screen.getByRole('button', { name: /返回瀑布流/ }))
}
const revision = (id: number, algoId: number, no: number, params: Record<string, unknown>) =>
  ({ id, algorithmId: algoId, revision: no, schemaVersion: 1, params, contentHash: 'x'.repeat(64), algorithmName: '漢堡相似算法', brand: 'flashBee' })

describe('算法库列表与真实读写', () => {
  it.each(['delivery', 'groupBuy'])('%s 标准入口卡进入服务端分页列表', async tab => {
    api.list.mockResolvedValue({ records: [{ id: 31, algoCode: 'SFJH20261120001', algoName: '漢堡相似算法', algoType: 17, brand: 'flashBee', status: 1, updatedBy: '運營', updatedAt: '2026-11-20 10:00:00' }], total: 1 })
    mount(`/promotion-algorithm?tab=${tab}`)
    const card = screen.getByText(SIMILAR_ALGO_NAME).closest('.algo-card-wrapper')!
    expect(card).toHaveClass('algo-card-hero')
    await act(async () => { fireEvent.click(card) })
    expect(await screen.findByText('SFJH20261120001')).toBeInTheDocument()
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ algoType: 17, usage: 'library' }))
    expect(screen.getByRole('button', { name: /algorithm\.addAlgorithm/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /全局標籤衰變規則/ })).not.toBeInTheDocument()
  })
  it('新增保存提交 type17 参数协议且不写旧字段', async () => {
    api.create.mockResolvedValue({ id: 41 })
    mount('/promotion-algorithm-add?type=17&tab=delivery')
    fireEvent.change(screen.getByRole('textbox', { name: '算法名稱' }), { target: { value: '漢堡相似算法' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: '每次推薦商家數' }), { target: { value: '2' } })
    fireEvent.blur(screen.getByRole('spinbutton', { name: '每次推薦商家數' }))
    expect(screen.getByRole('combobox', { name: '第 2 位優先來源' })).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /保\s*存/ })) })
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1))
    const payload = api.create.mock.calls[0][0]
    expect(payload).toMatchObject({ algoType: 17, algoName: '漢堡相似算法', brand: 'flashBee' })
    expect(payload.params).toEqual(serializeSimilarParams({ ...PROTOTYPE_DEFAULTS, name: '漢堡相似算法', count: 2 }, 'delivery'))
    expect(payload).not.toHaveProperty('channel')
  })
  it('编辑回填服务端参数，保存走更新，发布版本携带期望版本', async () => {
    const params = serializeSimilarParams({ ...values, name: '漢堡相似算法' }, 'delivery')
    api.detail.mockResolvedValue({ id: 31, algoCode: 'SFJH0001', algoName: '漢堡相似算法', algoType: 17, brand: 'flashBee', status: 1, params: JSON.stringify(params), updatedBy: '運營', updatedAt: '2026-11-20 10:00:00' })
    api.revisions.mockResolvedValue([revision(91, 31, 1, params)])
    api.publish.mockResolvedValue(revision(92, 31, 2, params))
    mount('/promotion-algorithm-add?type=17&id=31&tab=delivery')
    expect(await screen.findByRole('spinbutton', { name: '商家相似度門檻' })).toHaveValue('60')
    expect(screen.getByRole('heading', { name: /編輯算法/ })).toBeInTheDocument()
    await waitFor(() => expect(api.revisions).toHaveBeenCalled())
    const publishButton = screen.getByRole('button', { name: /發布新版本/ })
    expect(publishButton).not.toBeDisabled()
    await act(async () => { fireEvent.click(publishButton) })
    await waitFor(() => expect(api.publish).toHaveBeenCalledWith(31, { expectedRevision: 1 }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /保\s*存/ })) })
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(31, expect.objectContaining({ algoType: 17 })))
    expect(api.create).not.toHaveBeenCalled()
  })
  it('详情只读无保存，试算弹窗仍可用且不改参数', async () => {
    const params = serializeSimilarParams(values, 'delivery')
    api.detail.mockResolvedValue({ id: 31, algoName: '漢堡相似算法', algoType: 17, brand: 'flashBee', status: 1, params: JSON.stringify(params) })
    api.revisions.mockResolvedValue([revision(91, 31, 1, params)])
    mount('/promotion-algorithm-add?type=17&id=31&tab=delivery&mode=detail')
    expect(await screen.findByRole('heading', { name: /算法詳情/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '算法名稱' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /保\s*存/ })).not.toBeInTheDocument()
    // 试算入口已与投流同源合并（Prototype 不再另造一个「相似推薦試算」弹层，见 index.tsx 推荐模式行注释）。
    // 页面上有两处相似度試算（相似度公式行 + 推荐模式行），取哪一处钉的是同一条契约：
    // 只读详情里弹层仍可交互，且试算不会把参数回写成一次 update 请求。
    fireEvent.click(screen.getAllByRole('button', { name: '相似度试算' })[0])
    const trial = within(await screen.findByRole('dialog'))
    expect(trial.getByRole('textbox', { name: '用户标签1' })).not.toBeDisabled()
    expect(api.update).not.toHaveBeenCalled()
  })
  it('非 type17 记录拒绝挂载相似表单', async () => {
    api.detail.mockResolvedValue({ id: 7, algoName: '投流', algoType: 15, brand: 'flashBee', params: '{}' })
    mount('/promotion-algorithm-add?type=17&id=7&tab=delivery')
    expect(await screen.findByText('加載失敗')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '算法名稱' })).not.toBeInTheDocument()
  })
})

describe('返回插卡与基础列表稳定', () => {
  it.each([1, 50, 1000])('第%d位任意商家返回可插两家，无投流坑位限制', async position => {
    render(<ReturnPreview values={values} binding={binding} />)
    await choose('被點擊商家位置（示例）', `第 ${position} 位`)
    await choose('被點擊卡片類型', '新店廣告')
    const before = [...document.querySelectorAll('[data-base-position]')].map(e => e.getAttribute('data-base-position'))
    enterAndReturn()
    expect(screen.getAllByTestId('similar-preview-item')).toHaveLength(2)
    expect([...document.querySelectorAll('[data-base-position]')].map(e => e.getAttribute('data-base-position'))).toEqual(before)
    fireEvent.click(screen.getByRole('button', { name: '重播同一次返回' }))
    expect(screen.getAllByTestId('similar-preview-item')).toHaveLength(2)
  })
  it('双列在锚点整行后插入，原卡对保持，滚动位置保留', () => {
    render(<ReturnPreview values={values} binding={binding} columns={2} />)
    const before = screen.getAllByTestId('base-row').map(row => row.textContent)
    screen.getByTestId('similar-preview-feed').scrollTop = 70
    enterAndReturn()
    expect(screen.getAllByTestId('base-row').map(row => row.textContent)).toEqual(before)
    expect(screen.getByTestId('recommendation-row').previousElementSibling).toHaveTextContent('基礎 #50')
    expect(screen.getByTestId('similar-preview-feed').scrollTop).toBe(70)
  })
  it('旧代次返回和不足停留均不插入', () => {
    const view = render(<ReturnPreview values={values} binding={binding} />)
    fireEvent.click(screen.getByRole('button', { name: '進入商家詳情' }))
    fireEvent.click(screen.getByRole('button', { name: /模擬 Feed 已刷新/ }))
    fireEvent.click(screen.getByRole('button', { name: /返回瀑布流/ }))
    expect(screen.queryAllByTestId('similar-preview-item')).toHaveLength(0)
    expect(screen.getByText(/舊代次結果已丟棄/)).toBeInTheDocument()
    view.rerender(<ReturnPreview values={{ ...values, triggerMode: 'dwell' }} binding={binding} />)
    fireEvent.click(screen.getByRole('button', { name: '進入商家詳情' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: '模擬停留秒數' }), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /返回瀑布流/ }))
    expect(screen.queryAllByTestId('similar-preview-item')).toHaveLength(0)
    expect(screen.getByText(/示例停留未達門檻/)).toBeInTheDocument()
  })
})

describe('瀑布流场景绑定', () => {
  const props = { waterfallId: 9, brand: 'flashBee', businessType: 1, bizChannel: 1, contentType: 'store' as const, columns: 1 as const, readOnly: false }
  const params = serializeSimilarParams(values, 'delivery')
  it('选择已发布版本才启用，保存走独立 PUT 且带期望版本', async () => {
    api.list.mockImplementation(query => Promise.resolve(
      query.algoType === 17 ? { records: [{ id: 31, algoCode: 'SFJH0001', algoName: '漢堡相似算法', algoType: 17, brand: 'flashBee', status: 1 }], total: 1 }
        : { records: [{ id: 51, algoCode: 'SFTL0001', algoName: '投流A', algoType: 15, brand: 'flashBee', status: 1 }], total: 1 }))
    api.revisions.mockResolvedValue([revision(91, 31, 1, params)])
    api.putBinding.mockResolvedValue({ configured: true, id: 1, waterfallId: 9, sceneCode: 1, algorithmId: 31, algorithmRevisionId: 91, enabled: 1, candidateScope: 1, version: 1, trafficAlgorithmIds: [] })
    render(<ConfigProvider theme={{ token: { motion: false } }}><WaterfallBinding {...props} /></ConfigProvider>)
    expect(await screen.findByRole('combobox', { name: '交互式推薦算法' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存綁定' })).not.toBeInTheDocument()
    // 2026-11-25 非必填改造：先開啟「啟用交互式推薦」开关，算法下拉才可選。
    fireEvent.click(screen.getByRole('switch', { name: '啟用交互式推薦' }))
    await choose('交互式推薦算法', '漢堡相似算法（SFJH0001）')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存綁定' })) })
    await waitFor(() => expect(api.putBinding).toHaveBeenCalledWith(9, expect.objectContaining({
      // 绑定简化（2026-11-25）：客户端只传算法实例，最新已发布版本由服务端解析
      sceneCode: 1, algorithmId: 31, enabled: 1, candidateScope: 1, expectedVersion: null, trafficAlgorithmIds: [],
    })))
  })
  it('仅投流候选未选允许集合时阻止保存，试算标注付费口径', async () => {
    api.list.mockImplementation(query => Promise.resolve(
      query.algoType === 17 ? { records: [{ id: 31, algoCode: 'SFJH0001', algoName: '漢堡相似算法', algoType: 17, brand: 'flashBee', status: 1 }], total: 1 }
        : { records: [{ id: 51, algoCode: 'SFTL0001', algoName: '投流A', algoType: 15, brand: 'flashBee', status: 1 }], total: 1 }))
    api.revisions.mockResolvedValue([revision(91, 31, 1, params)])
    render(<ConfigProvider theme={{ token: { motion: false } }}><WaterfallBinding {...props} /></ConfigProvider>)
    fireEvent.click(screen.getByRole('switch', { name: '啟用交互式推薦' }))
    await choose('交互式推薦算法', '漢堡相似算法（SFJH0001）')
    await waitFor(() => expect(screen.getByRole('button', { name: '相似推薦試算' })).not.toBeDisabled())
    await choose('候選範圍', '僅有效投流商家（有效曝光扣量）')
    expect(screen.getByText('僅投流候選必須至少選擇一個允許的投流算法。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存綁定' })).toBeDisabled()
    await choose('允許的投流算法', '投流A（SFTL0001）')
    fireEvent.click(screen.getByRole('button', { name: '相似推薦試算' }))
    enterAndReturn()
    expect(screen.getAllByText('廣告 · 上線後有效曝光扣量').length).toBeGreaterThan(0)
    expect(api.putBinding).not.toHaveBeenCalled()
  })
  it('本地草稿与商品内容不开放绑定', async () => {
    const local = render(<ConfigProvider theme={{ token: { motion: false } }}><WaterfallBinding {...props} waterfallId={undefined} /></ConfigProvider>)
    expect(screen.getByText('請先保存為正式瀑布流記錄，再配置場景綁定。')).toBeInTheDocument()
    local.unmount()
    render(<ConfigProvider theme={{ token: { motion: false } }}><WaterfallBinding {...props} contentType="product" /></ConfigProvider>)
    expect(screen.getByRole('combobox', { name: '交互式推薦算法' })).toBeDisabled()
  })
})

describe('插入优先级与频控分区（表单契约）', () => {
  /** 当前展开的下拉里的选项文案；antd 只在打开后渲染选项，故先等下拉可见。 */
  async function openTieOptions(): Promise<string[]> {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '同分決勝' }))
    await waitFor(() => expect(document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')).toBeTruthy())
    const drop = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)') as Element
    return [...drop.querySelectorAll('.ant-select-item-option-content')].map(e => e.textContent ?? '')
  }

  it('编号子标题①准入／②相似度／①用户频控／②商家频控／③插入优先级／④插入样式齐备，决胜词表与投流同源且剔除同轴死选项', async () => {
    mount('/promotion-algorithm-add?type=17&tab=delivery')
    expect([...document.querySelectorAll('.traffic-config__subtitle')].map(e => e.textContent))
      .toEqual(['① 準入門檻', '② 相似度計算', '① 用戶頻控', '② 商家頻控', '③ 插入優先級', '④ 插入樣式'])
    // 预设态：因子行整体隐藏，且 hidden 落在外层裸 div（同元素带 display:flex 类会盖掉 [hidden]）。
    const factorsInline = screen.getByText('參與排序因子').closest('.traffic-fields-inline') as HTMLElement
    expect(factorsInline.parentElement?.hasAttribute('hidden')).toBe(true)
    expect(factorsInline.parentElement?.className).not.toContain('traffic-fields-inline')
    expect(factorsInline).not.toBeVisible()
    // 匹配优先＝主分即相似度：同分再比匹配分永远打不平；穩定商家 ID 已退出选项。
    expect(await openTieOptions()).toEqual(['剩余曝光次数多者优先', '质量分高者优先', '距离近者优先', '随机探索', '匹配标签热度高者优先'])
    fireEvent.mouseDown(document.body)
  })

  it('自定义因子沿用投流因子词表，未勾选因子的决胜项随勾选隐藏', async () => {
    mount('/promotion-algorithm-add?type=17&tab=delivery')
    await choose('排序策略', '自定義因子')
    const factorItem = screen.getByText('參與排序因子').closest('.ant-form-item') as HTMLElement
    expect(screen.getByText('參與排序因子').closest('.traffic-fields-inline')).toBeVisible()
    expect([...factorItem.querySelectorAll('.ant-checkbox-wrapper')].map(e => e.textContent?.trim()))
      .toEqual(RANK_FACTOR_OPTIONS.map(o => o.label))
    fireEvent.click(within(factorItem).getByRole('checkbox', { name: '质量分' }))
    expect(await openTieOptions()).not.toContain('质量分高者优先')
  })
})
