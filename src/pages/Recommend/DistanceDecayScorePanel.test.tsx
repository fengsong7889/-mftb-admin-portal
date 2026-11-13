/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DistanceDecayScorePanel from './DistanceDecayScorePanel'
import {
  DEFAULT_DECAY_PERIOD_CONFIG, TIME_PERIOD_KEYS,
  computeDistanceDecayScore, validateDecayPeriodConfig,
  type TimePeriodScoreConfig,
} from './organicTrafficConfig'

// 用真实 zh-TW 文案渲染：既验证 t() 确实接到了语言包，也让断言读得懂而不是一串 key
type LocaleNode = string | { [key: string]: LocaleNode }
vi.mock('react-i18next', async () => {
  const zh = (await import('@/i18n/locales/zh-TW.json')).default as unknown as LocaleNode
  const resolve = (key: string, vars?: Record<string, unknown>): string => {
    const node = key.split('.').reduce<LocaleNode | undefined>((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), zh)
    const text = typeof node === 'string' ? node : key
    return vars ? text.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(vars[name] ?? '')) : text
  }
  return { useTranslation: () => ({ t: resolve }) }
})
vi.mock('antd', async importOriginal => ({
  ...await importOriginal<typeof import('antd')>(),
  message: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

/** 部分配置：只配午餐/晚餐，用来验证未配置时段不计分与重复时段守卫 */
const PARTIAL: TimePeriodScoreConfig = {
  items: [
    { periodValue: 'lunch', periodName: '午餐', score: 60 },
    { periodValue: 'dinner', periodName: '晚餐', score: 80 },
  ],
}
const DESCRIPTION = '滿分按時段獨立配置，得分 = 滿分（當前時段） - 衰減係數 × 距離'
const PANEL_ARIA = '距離衰減分時段滿分配置'

function mount(props: Partial<React.ComponentProps<typeof DistanceDecayScorePanel>> = {}) {
  render(<ConfigProvider theme={{ token: { motion: false } }}>
    <DistanceDecayScorePanel ruleName="距離衰減" config={DEFAULT_DECAY_PERIOD_CONFIG} coefficient={5}
      hasSavedConfig description={DESCRIPTION} onSave={() => undefined} {...props} />
  </ConfigProvider>)
  return within(screen.getByLabelText(PANEL_ARIA))
}

/** 进入编辑态并返回面板作用域 */
function mountEditing(props: Partial<React.ComponentProps<typeof DistanceDecayScorePanel>> = {}) {
  const panel = mount(props)
  fireEvent.click(panel.getByRole('button', { name: '編輯' }))
  return within(screen.getByLabelText(PANEL_ARIA))
}

/** antd Select 在 jsdom 里靠 mouseDown 展开；aria-label 会同时落在外层与 input 上，按 role 定位避免多命中 */
const periodSelect = (rowIndex: number) => screen.getByRole('combobox', { name: `第 ${rowIndex} 行時段` })
const openPeriodDropdown = (rowIndex: number) => {
  fireEvent.mouseDown(periodSelect(rowIndex))
  const dropdown = document.querySelector<HTMLElement>('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
  expect(dropdown, '下拉未展開').toBeTruthy()
  return dropdown as HTMLElement
}

beforeEach(() => { vi.clearAllMocks() })

describe('距離衰減分時段滿分純函數', () => {
  it('默认模板五时段全预填旧满分 100，时段枚举与五餐段口径一致', () => {
    expect(DEFAULT_DECAY_PERIOD_CONFIG.items.map(item => item.periodValue)).toEqual([...TIME_PERIOD_KEYS])
    expect(DEFAULT_DECAY_PERIOD_CONFIG.items.every(item => item.score === 100)).toBe(true)
    expect(DEFAULT_DECAY_PERIOD_CONFIG.items.map(item => item.periodName)).toEqual(['早餐', '午餐', '下午茶', '晚餐', '宵夜'])
  })

  it('满分取当前时段、系数单一、得分最低 0 分', () => {
    // 午餐满分 100、系数 5、3km → 85
    expect(computeDistanceDecayScore(DEFAULT_DECAY_PERIOD_CONFIG, 5, 'lunch', 3)).toMatchObject({ maxScore: 100, total: 85, unconfigured: false })
    // 晚餐满分 80、4km → 60：满分随时段切换，系数不随时段变
    expect(computeDistanceDecayScore(PARTIAL, 5, 'dinner', 4)).toMatchObject({ maxScore: 80, total: 60 })
    // 距离越远得分越低，最低 0 分（不为负）
    expect(computeDistanceDecayScore(PARTIAL, 5, 'lunch', 30).total).toBe(0)
    // 未配置时段：0 分并标记待补配，不兜底
    expect(computeDistanceDecayScore(PARTIAL, 5, 'lateNight', 3)).toMatchObject({ total: 0, unconfigured: true })
    // 没拿到当前时段：同样 0 分，不猜
    expect(computeDistanceDecayScore(PARTIAL, 5, undefined, 3)).toMatchObject({ total: 0, unconfigured: false })
    // 非法系数/距离按 0 收敛，不产生 NaN
    expect(computeDistanceDecayScore(PARTIAL, -1, 'lunch', 3).total).toBe(60)
    expect(computeDistanceDecayScore(PARTIAL, 5, 'lunch', Number.NaN).total).toBe(60)
  })

  it('校驗攔住未選時段、重複時段與越界滿分', () => {
    expect(validateDecayPeriodConfig(PARTIAL)).toBeNull()
    expect(validateDecayPeriodConfig({ items: [{ periodValue: '', periodName: '', score: 100 }] })).toContain('請選擇時段')
    expect(validateDecayPeriodConfig({ items: [PARTIAL.items[0], PARTIAL.items[0]] })).toContain('重複配置')
    expect(validateDecayPeriodConfig({ items: [{ periodValue: 'lunch', periodName: '午餐', score: -1 }] })).toContain('0～500')
    expect(validateDecayPeriodConfig({ items: [{ periodValue: 'lunch', periodName: '午餐', score: 501 }] })).toContain('0～500')
    expect(validateDecayPeriodConfig({ items: [{ periodValue: 'lunch', periodName: '午餐', score: 12.5 }] })).toContain('0～500')
  })
})

describe('距離衰減分時段滿分面板', () => {
  it('只读态按时段列出满分，衰减系数只有一行', () => {
    const panel = mount()
    expect(panel.getByText('計分明細')).toBeInTheDocument()
    expect(panel.getByText('分時段滿分 · 衰減係數全局單一')).toBeInTheDocument()
    for (const label of ['早餐', '午餐', '下午茶', '晚餐', '宵夜']) {
      expect(panel.getByText(label)).toBeInTheDocument()
    }
    // 五档满分 + 一行衰减系数 = 6 行，而不是旧版「满分 1 行 + 系数 1 行」
    expect(document.querySelectorAll('.organic-score-panel .organic-score-row')).toHaveLength(6)
    // 标签 + 语义徽标各一（decay 行徽标文案与标签同名）：恰好一行系数，不随时段增行
    expect(panel.getAllByText('衰減係數')).toHaveLength(2)
    expect(panel.getByText(/計算公式：得分 = 滿分（當前時段） - 衰減係數 × 距離/)).toBeInTheDocument()
    // 只读态不给输入框
    expect(panel.queryByRole('spinbutton')).toBeNull()
  })

  it('编辑态可逐时段改满分、系数单一，保存把三者上抛', () => {
    const onSave = vi.fn()
    const body = mountEditing({ onSave })
    expect(body.getByText('已配置時段（5/5）')).toBeInTheDocument()
    fireEvent.change(body.getByRole('spinbutton', { name: '第 1 行滿分' }), { target: { value: '80' } })
    // 衰减系数全局只有一个输入框，不随时段增行
    expect(body.getAllByRole('spinbutton', { name: '衰減係數' })).toHaveLength(1)
    fireEvent.change(body.getByRole('spinbutton', { name: '衰減係數' }), { target: { value: '2.5' } })
    fireEvent.click(body.getByRole('button', { name: '保存' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    const [next, coeff, desc] = onSave.mock.calls[0] as [TimePeriodScoreConfig, number, string]
    expect(next.items[0]).toEqual({ periodValue: 'breakfast', periodName: '早餐', score: 80 })
    expect(coeff).toBe(2.5)
    expect(desc).toBe(DESCRIPTION)
  })

  it('同一时段不得重复：已被其他行选中的时段在下拉里禁用', () => {
    const body = mountEditing({ config: PARTIAL })
    fireEvent.click(body.getByRole('button', { name: /添加時段/ }))
    const dropdown = openPeriodDropdown(3)
    const optionClass = (label: string) => (within(dropdown).getByText(label)
      .closest('.ant-select-item-option') as HTMLElement).className
    expect(optionClass('午餐')).toContain('ant-select-item-option-disabled')
    expect(optionClass('晚餐')).toContain('ant-select-item-option-disabled')
    expect(optionClass('宵夜')).not.toContain('ant-select-item-option-disabled')
  })

  it('五档全部配置后新增入口关闭，避免造出重复时段', () => {
    const body = mountEditing()
    expect(body.getByText('已配置時段（5/5）')).toBeInTheDocument()
    expect(body.getByRole('button', { name: /全部時段已配置/ })).toBeDisabled()
  })

  it('未选时段就保存会被拦住，不回调父级', () => {
    const onSave = vi.fn()
    const body = mountEditing({ config: PARTIAL, onSave })
    fireEvent.click(body.getByRole('button', { name: /添加時段/ }))
    fireEvent.click(body.getByRole('button', { name: '保存' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(within(document.querySelector<HTMLElement>('.ant-alert')!).getByText('第 3 行請選擇時段')).toBeInTheDocument()
  })

  it('试算跟随当前时段与距离：默认午餐 3km = 85，改距离即时重算', () => {
    const panel = mount()
    fireEvent.click(panel.getByRole('button', { name: '試算距離衰減' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('單項總得分')).toHaveTextContent('85 分')
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: '模擬距離' }), { target: { value: '4' } })
    expect(within(dialog).getByLabelText('單項總得分')).toHaveTextContent('80 分')
    // 距离远到扣穿满分：最低 0 分
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: '模擬距離' }), { target: { value: '30' } })
    expect(within(dialog).getByLabelText('單項總得分')).toHaveTextContent('0 分')
  })

  it('试算未配置时段明确提示不计分', () => {
    const panel = mount({ config: PARTIAL })
    fireEvent.click(panel.getByRole('button', { name: '試算距離衰減' }))
    const dialog = screen.getByRole('dialog')
    // 午餐满分 60、3km → 45
    expect(within(dialog).getByLabelText('單項總得分')).toHaveTextContent('45 分')
    fireEvent.click(within(dialog).getByLabelText('宵夜（未配置，不計分）'))
    expect(within(dialog).getByText('時段「宵夜」未配置滿分，本次不計分')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('單項總得分')).toHaveTextContent('0 分')
  })

  it('面板 chrome 文案走语言包：渲染结果里不出现未解析的 key', () => {
    mount()
    expect(document.body.textContent).not.toContain('organicTrafficScore.timePeriod.')
    expect(document.body.textContent).not.toContain('organicTrafficScore.decayPeriod.')
  })
})