/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
/**
 * 算法库列表页查询区 —— 渲染契约测试
 *
 * 本页取数口径是「一次性拉全量（size=500）+ 前端过滤」，查询区因此必须守住三件事，
 * 本文件逐条钉住：
 * 1. 六个条件（算法ID／算法名称／所属品牌／状态／最后更新人／最后更新时间）齐备，
 *    且查询区排在操作区之前（UI 规范 §E.8：条件区永远在结果动作之上）；
 * 2. 过滤口径：文本走模糊包含且大小写不敏感，品牌／状态走精确匹配，
 *    时间走「按日」区间且含首尾两端（拿当天 23:59:59 与本月首日 08:00 两条边界记录验证不被时分截断）；
 * 3. 查询不得缩小也不得放大「广告类型 + 业务 Tab」的原有口径，切换类型／返回列表必须清空旧条件，
 *    否则用户会拿着上一个类型的关键词去过滤下一个类型，看到「查无数据」误判数据丢了。
 *
 * 另附一条卡片入口守卫：团购到店 Tab 已下线「盘活复苏」卡片（卡片是进入列表的唯一入口，
 * 摘掉即不可达），但外卖到家 Tab 必须继续保留 —— 本文件与列表页共用同一套 mock，不再另起一份 harness。
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import dayjs from 'dayjs'
import AlgorithmList from './index'
import { AlgorithmType, RecommendChannel, ServiceStatus } from '@mftb/contracts/recommendConstants'
import type { AdAlgorithm } from '@/api/adPromotion'

const api = vi.hoisted(() => ({
  list: vi.fn(),
  toggleStatus: vi.fn(),
  remove: vi.fn(),
  references: vi.fn(),
  fetchCardOrder: vi.fn(),
  saveCardOrder: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh-TW' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('antd', async importOriginal => ({
  ...await importOriginal<typeof import('antd')>(), message: { success: vi.fn(), error: vi.fn() },
}))
// 只替换取数函数：brandToAppType 是品牌过滤的口径本身，必须用真实实现
vi.mock('@/api/adPromotion', async importOriginal => ({
  ...await importOriginal<typeof import('@/api/adPromotion')>(),
  fetchAdAlgorithms: api.list, updateAdAlgorithmStatus: api.toggleStatus,
  deleteAdAlgorithm: api.remove, fetchAlgorithmWaterfallReferences: api.references,
  fetchCardOrder: api.fetchCardOrder, saveCardOrder: api.saveCardOrder,
}))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true, hasMenuPermission: () => true }),
}))
// 列配置抽屉要真实拖拽 DOM、品牌胶囊要 CompanyBrand context，都不是本页被测点
vi.mock('@/hooks/useColumnConfig', () => ({
  useColumnConfig: () => ({ configComponent: null, applyConfig: (cols: unknown[]) => cols }),
}))
vi.mock('@/components/BrandTag', () => ({
  default: ({ value }: { value?: number }) => <span data-testid={`brand-tag-${value}`} />,
}))

/** 前三条属于「無敵星星 + 外賣到家」，后两条分别是其它类型／其它业务 Tab，用来验证叠加口径 */
const MONTH_FIRST = dayjs().startOf('month')
/** 区间固定取「本月首日 ~ 今天」：两个格子在面板默认月份里必然可见，用例不依赖时钟落在本月哪一天 */
const RANGE_START = MONTH_FIRST.format('YYYY-MM-DD')
const RANGE_END = dayjs().format('YYYY-MM-DD')
const stamp = (day: dayjs.Dayjs, time: string) => `${day.format('YYYY-MM-DD')} ${time}`
const FIXTURES: AdAlgorithm[] = [
  { id: 1, algoCode: 'SFAL0001', algoName: '無敵星星首頁', algoType: AlgorithmType.INVINCIBLE_STAR, channel: RecommendChannel.DELIVERY, brand: 'flashBee', status: ServiceStatus.ENABLED, updatedBy: '張三', updatedAt: stamp(dayjs(), '23:59:59') },
  { id: 2, algoCode: 'MFAL0002', algoName: '無敵星星外賣', algoType: AlgorithmType.INVINCIBLE_STAR, channel: RecommendChannel.DELIVERY, brand: 'mFood', status: ServiceStatus.DISABLED, updatedBy: '李四', updatedAt: stamp(MONTH_FIRST, '08:00:00') },
  { id: 3, algoCode: 'SFAL0003', algoName: '無敵星星超市', algoType: AlgorithmType.INVINCIBLE_STAR, channel: RecommendChannel.SUPERMARKET, brand: 'mFood', status: ServiceStatus.ENABLED, updatedBy: '王五', updatedAt: stamp(MONTH_FIRST.subtract(1, 'day'), '23:00:00') },
  { id: 4, algoCode: 'SFAL0004', algoName: '盤活復蘇首頁', algoType: AlgorithmType.HOT_REVIVE_AD, channel: RecommendChannel.DELIVERY, brand: 'flashBee', status: ServiceStatus.ENABLED, updatedBy: '張三', updatedAt: '2026-11-05 11:00:00' },
  { id: 5, algoCode: 'SFAL0005', algoName: '無敵星星團購', algoType: AlgorithmType.INVINCIBLE_STAR, channel: RecommendChannel.GROUP_BUY, brand: 'flashBee', status: ServiceStatus.ENABLED, updatedBy: '張三', updatedAt: '2026-11-05 11:00:00' },
]
/** 进入列表的默认口径：無敵星星 + 外賣到家，命中 1/2/3 三条 */
const STAR_ROWS = ['無敵星星首頁', '無敵星星外賣', '無敵星星超市']

const starRow = () => FIXTURES[0]
/**
 * antd 图标本身带 `role="img"` + `aria-label`（search / reload / arrow-left），
 * 会一起并进按钮的可访问名，所以按钮一律用「包含 key」的正则定位，不能写精确串。
 */
const clickButton = (key: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(key) }))
const searchBox = (name: string) => screen.getByRole('textbox', { name })
/**
 * 提交走 rc-field-form 的 `validateFields().then(onFinish)`，过滤结果要等一个微任务才落到表格；
 * 点完立即断言读到的一定是旧列表（表现是「断言全挂但产品代码没问题」）。
 */
const flush = (run: () => void) => act(async () => { run() })
const clickSearch = () => flush(() => clickButton('common\\.search'))
const clickReset = () => flush(() => clickButton('common\\.reset'))
const clickBack = () => flush(() => clickButton('common\\.back'))

/** 文本条件输入后提交，行级结果由调用方断言 */
async function searchBy(name: string, value: string) {
  fireEvent.change(searchBox(name), { target: { value } })
  await clickSearch()
}

/** antd Select 的 aria-label 会同时挂到外层 div 与内部 input，必须按 role 定位；选项再限定到未隐藏的下拉框，避免两个下拉同时命中 */
async function pickOption(comboboxName: string, labelKey: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: comboboxName }))
  const option = await waitFor(() => {
    const match = Array.from(
      document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content'),
    ).find(el => el.textContent === labelKey)
    if (!match) throw new Error(`${labelKey} 選項尚未渲染`)
    return match as HTMLElement
  })
  await flush(() => fireEvent.click(option))
}

/**
 * RangePicker 只能走面板点选：实测在 jsdom 里往输入框灌文本再按 Enter 不会把值提交给表单
 *（rc-picker 的提交依赖真实 focus 链路），所以按单元格 title 命中日期格。
 */
async function pickDateRange(start: string, end: string) {
  const picker = screen.getByPlaceholderText('common.startDate').closest('.ant-picker') as HTMLElement
  // 面板由根节点的 click 打开，mousedown 不会触发（实测 dropdown 始终带 hidden）
  await flush(() => fireEvent.click(picker))
  await pickCell(start)
  await pickCell(end)
}

async function pickCell(title: string) {
  const cell = await waitFor(() => {
    const el = document.querySelector(`.ant-picker-dropdown:not(.ant-picker-dropdown-hidden) td[title="${title}"] .ant-picker-cell-inner`)
    if (!el) throw new Error(`日期格 ${title} 尚未渲染`)
    return el as HTMLElement
  })
  await flush(() => fireEvent.click(cell))
}

function expectRows(names: string[]) {
  names.forEach(name => expect(screen.getByText(name)).toBeInTheDocument())
  STAR_ROWS.filter(n => !names.includes(n)).forEach(name => expect(screen.queryByText(name)).not.toBeInTheDocument())
}

async function mountList(query = `type=${AlgorithmType.INVINCIBLE_STAR}&tab=delivery`) {
  const view = render(<ConfigProvider theme={{ token: { motion: false } }}>
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[`/promotion-algorithm?${query}`]}>
      <AlgorithmList />
    </MemoryRouter>
  </ConfigProvider>)
  await waitFor(() => expect(screen.getByText(starRow().algoName)).toBeInTheDocument())
  return view
}

/** 不带 type 参数即停在 Step 1 卡片选择页，用于核对各 Tab 的卡片集合 */
async function mountCardPage() {
  render(<ConfigProvider theme={{ token: { motion: false } }}>
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/promotion-algorithm']}>
      <AlgorithmList />
    </MemoryRouter>
  </ConfigProvider>)
  await waitFor(() => expect(screen.getByRole('tab', { name: 'algorithm.bizGroupBuy' })).toBeInTheDocument())
}

/**
 * rc-tabs 默认不销毁已看过的面板，所以负向断言必须限定在活动面板内 ——
 * 用 `screen.queryByText` 会命中另一个 Tab 里那张卡，把「口径正确」误报成「没删干净」。
 */
const activePane = () => document.querySelector('.ant-tabs-tabpane-active') as HTMLElement

async function switchTab(labelKey: string) {
  await flush(() => fireEvent.click(screen.getByRole('tab', { name: labelKey })))
  await waitFor(() => expect(activePane()).toBeTruthy())
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  api.list.mockResolvedValue({ records: FIXTURES, total: FIXTURES.length })
  api.fetchCardOrder.mockResolvedValue(null)
  api.saveCardOrder.mockResolvedValue(undefined)
  api.references.mockResolvedValue([])
})

describe('算法库列表查询区', () => {
  it('六个查询条件齐备，且查询区排在功能操作区之前', async () => {
    const { container } = await mountList()
    expect(searchBox('algorithm.colAlgorithmId')).toBeInTheDocument()
    expect(searchBox('algorithm.colAlgorithmName')).toBeInTheDocument()
    expect(searchBox('algorithm.colLastUpdater')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'common.colBrand' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'common.colStatus' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('common.startDate')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('common.endDate')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /common\.search/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /common\.reset/ })).toBeInTheDocument()
    // §E.8：条件区在上、动作区在下，反过来说查询区不能掉到表格下方
    const searchSection = container.querySelector('.search-section') as HTMLElement
    const actionSection = container.querySelector('.action-section') as HTMLElement
    expect(searchSection.compareDocumentPosition(actionSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expectRows(STAR_ROWS)
  })

  it('算法ID 模糊包含且大小写不敏感，查询不重新发请求', async () => {
    await mountList()
    await searchBy('algorithm.colAlgorithmId', 'mfal0002')
    expectRows(['無敵星星外賣'])
    // 口径是前端过滤：整个用例只允许挂载时那一次列表请求
    expect(api.list).toHaveBeenCalledTimes(1)
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, size: 500 }))
  })

  it('算法名称与最后更新人各自模糊匹配，互不干扰', async () => {
    await mountList()
    await searchBy('algorithm.colAlgorithmName', '超市')
    expectRows(['無敵星星超市'])
    await clickReset()
    expectRows(STAR_ROWS)
    await searchBy('algorithm.colLastUpdater', '王五')
    expectRows(['無敵星星超市'])
  })

  it('所属品牌与状态精确匹配，条件叠加时取交集', async () => {
    await mountList()
    await pickOption('common.colBrand', 'recommend.appMfood')
    await clickSearch()
    expectRows(['無敵星星外賣', '無敵星星超市'])
    await clickReset()
    await pickOption('common.colStatus', 'recommend.statusEnabled')
    await clickSearch()
    expectRows(['無敵星星首頁', '無敵星星超市'])
    // 两个条件同时生效：品牌 mFood ∩ 状态啟用 = 只剩超市
    await pickOption('common.colBrand', 'recommend.appMfood')
    await clickSearch()
    expectRows(['無敵星星超市'])
  })

  it('最后更新时间按日取区间，含首尾两端且不受时分截断', async () => {
    await mountList()
    // 首頁 今天 23:59:59 / 外賣 本月首日 08:00 / 超市 上月最后一天 23:00
    await pickDateRange(RANGE_START, RANGE_END)
    // 区间必须真的落到表单里，否则下面的断言会把「选择器没提交」误报成「过滤逻辑坏了」
    expect(screen.getByPlaceholderText('common.startDate')).toHaveValue(RANGE_START)
    expect(screen.getByPlaceholderText('common.endDate')).toHaveValue(RANGE_END)
    await clickSearch()
    expectRows(['無敵星星首頁', '無敵星星外賣'])
  })

  it('重置清空全部条件并回到当前类型的完整列表', async () => {
    await mountList()
    fireEvent.change(searchBox('algorithm.colAlgorithmId'), { target: { value: 'mfal0002' } })
    fireEvent.change(searchBox('algorithm.colLastUpdater'), { target: { value: '李四' } })
    await clickSearch()
    expectRows(['無敵星星外賣'])
    await clickReset()
    expectRows(STAR_ROWS)
    expect(searchBox('algorithm.colAlgorithmId')).toHaveValue('')
    expect(searchBox('algorithm.colLastUpdater')).toHaveValue('')
  })

  it('返回卡片页再进其它类型时旧条件作废，类型与业务 Tab 口径不被查询放大', async () => {
    await mountList()
    await searchBy('algorithm.colAlgorithmName', '首頁')
    // 「首頁」在無敵星星下只剩 1 条；其它类型／团购 Tab 的记录本来就不该出现
    expectRows(['無敵星星首頁'])
    await clickBack()
    await flush(() => fireEvent.click(screen.getByText('algorithm.typeHotRevive').closest('.algo-card-wrapper') as HTMLElement))
    await waitFor(() => expect(screen.getByText('盤活復蘇首頁')).toBeInTheDocument())
    expect(screen.queryByText('無敵星星首頁')).not.toBeInTheDocument()
    expect(screen.queryByText('無敵星星團購')).not.toBeInTheDocument()
    // 条件必须真的被清空，而不是仍挂在表单里默默过滤下一批数据
    expect(searchBox('algorithm.colAlgorithmName')).toHaveValue('')
  })
})

describe('算法库卡片选择页 Tab 口径', () => {
  it('团购到店含無敵星星/投流/自然流量三入口，盘活复苏仅从该 Tab 下线', async () => {
    await mountCardPage()
    await switchTab('algorithm.bizGroupBuy')
    expect(within(activePane()).getByText('algorithm.typeInvincibleStar')).toBeInTheDocument()
    // 2026-11-18 用户要求团购 tab 新增投流/自然流量两入口
    expect(within(activePane()).getByText('algorithm.typeTraffic')).toBeInTheDocument()
    expect(within(activePane()).getByText('algorithm.typeOrganicTraffic')).toBeInTheDocument()
    expect(within(activePane()).queryByText('algorithm.typeHotRevive')).not.toBeInTheDocument()
    // 三张卡：卡片是进入列表的唯一入口；盤活復甦不得出现在团购 tab
    expect(within(activePane()).getAllByText('algorithm.viewAdjustAlgorithm')).toHaveLength(3)
    // 切回外卖到家证明下线没有越界：该 Tab 仍保留盘活复苏入口
    await switchTab('algorithm.bizDelivery')
    expect(within(activePane()).getByText('algorithm.typeHotRevive')).toBeInTheDocument()
  })
})
