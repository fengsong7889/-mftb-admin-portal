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
import TimePeriodScorePanel from './TimePeriodScorePanel'
import {
  DEFAULT_TIME_PERIOD_SCORE_CONFIG, TIME_PERIOD_KEYS, TIME_PERIOD_LABELS,
  computeTimePeriodScore, normalizeTimePeriodScoreConfig, timePeriodText, validateTimePeriodScoreConfig,
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

const CONFIG: TimePeriodScoreConfig = {
  items: [
    { periodValue: 'lunch', periodName: '午餐', score: 60 },
    { periodValue: 'dinner', periodName: '晚餐', score: 80 },
  ],
}
const DESCRIPTION = '當前時段命中已配置的主營時段即得該時段加分'
const PANEL_ARIA = '主營時段加分分時段加分配置'

function mount(props: Partial<React.ComponentProps<typeof TimePeriodScorePanel>> = {}) {
  render(<ConfigProvider theme={{ token: { motion: false } }}>
    <TimePeriodScorePanel ruleName="主營時段加分" config={CONFIG} hasSavedConfig description={DESCRIPTION}
      onSave={() => undefined} {...props} />
  </ConfigProvider>)
  return within(screen.getByLabelText(PANEL_ARIA))
}

/** 进入编辑态并返回面板作用域（编辑态控件都在同一个 section 内） */
function mountEditing(props: Partial<React.ComponentProps<typeof TimePeriodScorePanel>> = {}) {
  const panel = mount(props)
  fireEvent.click(panel.getByRole('button', { name: '編輯' }))
  return within(screen.getByLabelText(PANEL_ARIA))
}

/** antd Select 在 jsdom 里靠 mouseDown 展开，再点下拉选项；aria-label 会同时落在外层与 input 上，
 * 所以按 role 定位（与商家权重分页的用法一致），不用 getByLabelText 避免多命中 */
const periodSelect = (rowIndex: number) => screen.getByRole('combobox', { name: `第 ${rowIndex} 行主營時段` })
const openPeriodDropdown = (rowIndex: number) => {
  fireEvent.mouseDown(periodSelect(rowIndex))
  const dropdown = document.querySelector<HTMLElement>('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
  expect(dropdown, '下拉未展開').toBeTruthy()
  return dropdown as HTMLElement
}
const pickPeriod = (rowIndex: number, label: string) => fireEvent.click(within(openPeriodDropdown(rowIndex)).getByText(label))

beforeEach(() => { vi.clearAllMocks() })

describe('主營時段分時段計分純函數', () => {
  it('時段枚舉固定五檔且名稱與五餐段口径一致', () => {
    expect(TIME_PERIOD_KEYS).toEqual(['breakfast', 'lunch', 'afternoonTea', 'dinner', 'lateNight'])
    expect(TIME_PERIOD_KEYS.map(key => TIME_PERIOD_LABELS[key])).toEqual(['早餐', '午餐', '下午茶', '晚餐', '宵夜'])
    expect(timePeriodText('宵夜')).toBe('宵夜')
    // 未知编码退回原始值，界面不出现空白
    expect(timePeriodText('BRUNCH')).toBe('BRUNCH')
  })

  it('按當前時段命中一檔即停，不累加、不兜底', () => {
    expect(computeTimePeriodScore(CONFIG, 'lunch')).toMatchObject({ total: 60, unconfigured: false })
    expect(computeTimePeriodScore(CONFIG, 'dinner').total).toBe(80)
    // 业务系统传了时段但后台未配分值：0 分并标记待补配
    expect(computeTimePeriodScore(CONFIG, 'lateNight')).toMatchObject({ total: 0, unconfigured: true })
    // 没拿到当前时段：同样 0 分，不猜
    expect(computeTimePeriodScore(CONFIG, undefined)).toMatchObject({ total: 0, unconfigured: false })
  })

  it('校驗攔住未選時段、重複時段與越界分值', () => {
    expect(validateTimePeriodScoreConfig(CONFIG)).toBeNull()
    expect(validateTimePeriodScoreConfig({ items: [{ periodValue: '', periodName: '', score: 10 }] })).toContain('請選擇時段')
    expect(validateTimePeriodScoreConfig({ items: [CONFIG.items[0], CONFIG.items[0]] })).toContain('重複配置')
    expect(validateTimePeriodScoreConfig({ items: [{ periodValue: 'lunch', periodName: '午餐', score: -1 }] })).toContain('0～1000')
    expect(validateTimePeriodScoreConfig({ items: [{ periodValue: 'lunch', periodName: '午餐', score: 12.5 }] })).toContain('0～1000')
  })

  it('歸一化丢弃非法行，缺名稱快照時回查枚舉', () => {
    const raw = JSON.stringify({ items: [
      { periodValue: 'dinner', score: '45' },
      { periodValue: '', score: 10 },
      { periodValue: 'lunch', periodName: '午餐', score: null },
    ] })
    expect(normalizeTimePeriodScoreConfig(raw)).toEqual({ items: [{ periodValue: 'dinner', periodName: '晚餐', score: 45 }] })
    expect(normalizeTimePeriodScoreConfig('不是JSON').items).toEqual([])
    expect(normalizeTimePeriodScoreConfig(undefined).items).toEqual([])
  })

  it('默认模板只预填午餐一档（沿用原固定加分 60 分）', () => {
    expect(DEFAULT_TIME_PERIOD_SCORE_CONFIG.items).toEqual([{ periodValue: 'lunch', periodName: '午餐', score: 60 }])
  })
})

describe('主營時段分時段計分面板', () => {
  it('只读态按档位列出已配置时段，不再走单一固定分入口', () => {
    const panel = mount()
    expect(panel.getByText('計分明細')).toBeInTheDocument()
    expect(panel.getByText('分時段加分 · 按當前時段命中一檔即停')).toBeInTheDocument()
    expect(panel.getByText('午餐')).toBeInTheDocument()
    expect(panel.getByText('晚餐')).toBeInTheDocument()
    // 一档一行：两档就是两行，而不是原来那一行「主營時段加分 = 固定加分 60」
    expect(document.querySelectorAll('.organic-score-panel .organic-score-row')).toHaveLength(2)
    // 只读态不给分值输入框（旧固定分编辑器带 InputNumber）
    expect(panel.queryByRole('spinbutton')).toBeNull()
  })

  it('编辑态新增时段行、选定时段后把配置上抛保存', () => {
    const onSave = vi.fn()
    const body = mountEditing({ onSave })
    expect(body.getByText('已配置時段（2/5）')).toBeInTheDocument()

    fireEvent.click(body.getByRole('button', { name: /添加時段/ }))
    expect(body.getByText('已配置時段（3/5）')).toBeInTheDocument()

    pickPeriod(3, '宵夜')
    fireEvent.change(body.getByRole('spinbutton', { name: '第 3 行時段分值' }), { target: { value: '30' } })
    fireEvent.click(body.getByRole('button', { name: '保存' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    const [next, desc] = onSave.mock.calls[0] as [TimePeriodScoreConfig, string]
    expect(next.items).toHaveLength(3)
    // 选中枚举即带出名称快照，不依赖枚举表后续变动
    expect(next.items[2]).toEqual({ periodValue: 'lateNight', periodName: '宵夜', score: 30 })
    expect(desc).toBe(DESCRIPTION)
  })

  it('取消编辑不保存，回到已保存配置', () => {
    const onSave = vi.fn()
    const body = mountEditing({ onSave })
    fireEvent.click(body.getByRole('button', { name: /添加時段/ }))
    fireEvent.click(body.getByRole('button', { name: /取\s*消/ }))
    expect(onSave).not.toHaveBeenCalled()
    const panel = within(screen.getByLabelText(PANEL_ARIA))
    // 取消后回到只读清单（编辑态计数器随之消失，不留下未保存的第三行）
    expect(panel.queryByText(/已配置時段（/)).toBeNull()
    expect(document.querySelectorAll('.organic-score-panel .organic-score-row')).toHaveLength(2)
  })

  it('同一时段不得重复：已被其他行选中的时段在下拉里禁用', () => {
    const body = mountEditing()
    fireEvent.click(body.getByRole('button', { name: /添加時段/ }))
    const dropdown = openPeriodDropdown(3)
    // 午餐、晚餐已分别被第 1、2 行占用，第 3 行只能选其余三档（禁用标在选项容器上，不在文本节点）
    const optionClass = (label: string) => (within(dropdown).getByText(label)
      .closest('.ant-select-item-option') as HTMLElement).className
    expect(optionClass('午餐')).toContain('ant-select-item-option-disabled')
    expect(optionClass('晚餐')).toContain('ant-select-item-option-disabled')
    expect(optionClass('宵夜')).not.toContain('ant-select-item-option-disabled')
  })

  it('未选时段就保存会被拦住，不回调父级', () => {
    const onSave = vi.fn()
    const body = mountEditing({ onSave })
    fireEvent.click(body.getByRole('button', { name: /添加時段/ }))
    fireEvent.click(body.getByRole('button', { name: '保存' }))
    expect(onSave).not.toHaveBeenCalled()
    // 拦住时明确指到行（第 3 行），而不是只报一个笼统错误
    expect(within(document.querySelector<HTMLElement>('.ant-alert')!).getByText('第 3 行請選擇時段')).toBeInTheDocument()
  })

  it('试算按当前时段给分，未配置时段明确提示不计分', () => {
    const panel = mount()
    fireEvent.click(panel.getByRole('button', { name: '試算當前時段' }))
    const dialog = screen.getByRole('dialog')
    // 默认落在午餐：命中 60 分
    expect(within(dialog).getByLabelText('單項總得分')).toHaveTextContent('60 分')
    fireEvent.click(within(dialog).getByLabelText('宵夜（未配置，不計分）'))
    expect(within(dialog).getByText('時段「宵夜」未配置分值，本次不計分')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('單項總得分')).toHaveTextContent('0 分')
  })

  it('五档全部配置后新增入口关闭，避免造出重复时段', () => {
    const full: TimePeriodScoreConfig = { items: TIME_PERIOD_KEYS.map((key, i) => ({ periodValue: key, periodName: TIME_PERIOD_LABELS[key], score: 10 + i })) }
    const body = mountEditing({ config: full })
    expect(body.getByText('已配置時段（5/5）')).toBeInTheDocument()
    expect(body.getByRole('button', { name: /全部時段已配置/ })).toBeDisabled()
  })

  it('面板文案全部走语言包：渲染结果里不出现未解析的 key', () => {
    const panel = mount()
    expect(document.body.textContent).not.toContain('organicTrafficScore.timePeriod.')
    expect(panel.getByText('計分明細')).toBeInTheDocument()
  })
})
