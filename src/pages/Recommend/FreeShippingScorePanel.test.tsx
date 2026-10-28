import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ConfigProvider, Form, message } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrganicTrafficScoreConfig from './OrganicTrafficScoreConfig'
import { AppType } from '@mftb/contracts/recommendConstants'
import {
  DEFAULT_FREE_SHIPPING_SCORE_CONFIG, computeFreeShippingScore, freeShippingScoreHint,
  normalizeFreeShippingScoreConfig, validateFreeShippingScoreConfig,
} from './organicTrafficConfig'

const api = vi.hoisted(() => ({ fetch: vi.fn(), update: vi.fn(), create: vi.fn(), toggle: vi.fn(), remove: vi.fn() }))
vi.mock('@/api/organicScore', () => ({
  fetchOrganicScoreConfig: api.fetch, updateOrganicRule: api.update,
  createOrganicRule: api.create, toggleOrganicRuleStatus: api.toggle, deleteOrganicRule: api.remove,
  updateDimensionWeights: vi.fn(),
}))
vi.mock('@/api/systemConfig', () => ({ getSystemConfig: vi.fn().mockResolvedValue(null), updateSystemConfig: vi.fn() }))
vi.mock('@/api/store', () => ({ fetchStores: vi.fn().mockResolvedValue({ records: [] }) }))
vi.mock('@/api/adPromotion', () => ({ fetchAdAlgorithms: vi.fn().mockResolvedValue({ records: [] }), fetchAdAlgorithmByCode: vi.fn() }))
vi.mock('@/hooks/useSystemRules', () => ({ getSystemRuleValue: () => false }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('antd', async importOriginal => ({
  ...await importOriginal<typeof import('antd')>(),
  message: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

async function mount(readOnly = false) {
  await act(async () => {
    render(<ConfigProvider theme={{ token: { motion: false } }}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/promotion-algorithm-add?type=7']}>
        <Form disabled={readOnly}><OrganicTrafficScoreConfig readOnly={readOnly} brand={AppType.SHANFENG} /></Form>
      </MemoryRouter>
    </ConfigProvider>)
  })
}

/** 展开减免运费计分面板（COM_02） */
function openPanel() {
  fireEvent.click(screen.getByText('COM_02'))
  return within(screen.getByLabelText('減免運費計分配置'))
}

beforeEach(() => {
  vi.clearAllMocks()
  api.fetch.mockResolvedValue({ rules: [], dimensions: [] })
})

describe('减免运费计分纯函数', () => {
  it('默认档位合法，按运营配置的减免门槛金额查档，命中即停', () => {
    expect(validateFreeShippingScoreConfig(DEFAULT_FREE_SHIPPING_SCORE_CONFIG)).toBeNull()
    // 无门槛 → 0 元档满 20 + 报名 20
    expect(computeFreeShippingScore(DEFAULT_FREE_SHIPPING_SCORE_CONFIG, 0)).toMatchObject({ thresholdScore: 20, total: 40, guarded: false })
    // 门槛落在 0~30 区间同样命中首档（≤ 30）
    expect(computeFreeShippingScore(DEFAULT_FREE_SHIPPING_SCORE_CONFIG, 30).thresholdScore).toBe(15)
    expect(computeFreeShippingScore(DEFAULT_FREE_SHIPPING_SCORE_CONFIG, 80).thresholdScore).toBe(5)
    // 默认上限跟随末档（80）：超限视为空转，门槛分与报名分都不发
    expect(computeFreeShippingScore(DEFAULT_FREE_SHIPPING_SCORE_CONFIG, 100)).toMatchObject({
      thresholdBand: undefined, thresholdScore: 0, guarded: true, limit: 80, total: 0,
    })
  })

  it('护栏可配置：手填上限高于末档时区间内只发报名分，也可选择超限仍发报名分', () => {
    const keepEnrollment = { ...DEFAULT_FREE_SHIPPING_SCORE_CONFIG, enrollWhenGuarded: true }
    expect(computeFreeShippingScore(keepEnrollment, 100)).toMatchObject({ guarded: true, enrollmentScore: 20, total: 20 })
    // 上限抬到 120：100 元门槛不再超限，但超出末档仍无门槛分
    const wider = { ...DEFAULT_FREE_SHIPPING_SCORE_CONFIG, guardThreshold: 120 }
    expect(computeFreeShippingScore(wider, 100)).toMatchObject({ guarded: false, thresholdScore: 0, enrollmentScore: 20, limit: 120, total: 20 })
    expect(computeFreeShippingScore(wider, 130)).toMatchObject({ guarded: true, total: 0 })
    // 手填上限低于末档 → 会出现「档位有分但报名分停发」，保存时拦截；等于末档合法
    expect(validateFreeShippingScoreConfig({ ...DEFAULT_FREE_SHIPPING_SCORE_CONFIG, guardThreshold: 50 })).toContain('不得低於末檔')
    expect(validateFreeShippingScoreConfig({ ...DEFAULT_FREE_SHIPPING_SCORE_CONFIG, guardThreshold: 80 })).toBeNull()
  })

  it('停用门槛模块只影响门槛分，护栏仍拦空转报名分', () => {
    const thresholdOff = { ...DEFAULT_FREE_SHIPPING_SCORE_CONFIG, thresholdEnabled: false }
    expect(computeFreeShippingScore(thresholdOff, 0).total).toBe(20)
    // 停用仍回传命中档位，供界面灰显对照
    expect(computeFreeShippingScore(thresholdOff, 0).thresholdBand).toBeDefined()
    expect(computeFreeShippingScore(thresholdOff, 500)).toMatchObject({ guarded: true, total: 0 })
  })

  it('硬校验门槛递增与分值方向：门槛越高分值不得更高，停用模块跳过校验', () => {
    const notIncreasing = { ...DEFAULT_FREE_SHIPPING_SCORE_CONFIG, thresholdBands: [{ threshold: 30, score: 10 }, { threshold: 30, score: 5 }] }
    expect(validateFreeShippingScoreConfig(notIncreasing)).toContain('門檻金額必須嚴格遞增')
    const reversed = { ...DEFAULT_FREE_SHIPPING_SCORE_CONFIG, thresholdBands: [{ threshold: 0, score: 5 }, { threshold: 30, score: 20 }] }
    expect(validateFreeShippingScoreConfig(reversed)).toContain('門檻越高，分值必須不高於上一檔')
    // 分值持平合法；停用模块时档位不合法也不拦保存
    expect(validateFreeShippingScoreConfig({ ...DEFAULT_FREE_SHIPPING_SCORE_CONFIG, thresholdBands: [{ threshold: 0, score: 10 }, { threshold: 30, score: 10 }] })).toBeNull()
    expect(validateFreeShippingScoreConfig({ ...notIncreasing, thresholdEnabled: false })).toBeNull()
    // 报名分必须是 0~100 整数
    expect(validateFreeShippingScoreConfig({ ...DEFAULT_FREE_SHIPPING_SCORE_CONFIG, enrollmentScore: 101 })).toContain('報名分')
  })

  it('首档不是 0 元 / 上限高于末档时给出软提示，默认配置不提示', () => {
    expect(freeShippingScoreHint(DEFAULT_FREE_SHIPPING_SCORE_CONFIG)).toBeNull()
    expect(freeShippingScoreHint({ ...DEFAULT_FREE_SHIPPING_SCORE_CONFIG, thresholdBands: [{ threshold: 30, score: 10 }] })).toContain('建議補一檔 0 元檔')
    expect(freeShippingScoreHint({ ...DEFAULT_FREE_SHIPPING_SCORE_CONFIG, guardThreshold: 100 })).toContain('高於末檔')
  })

  it('归一化后端配置：过滤非法档位与类型，报名分以规则 score 为准', () => {
    const normalized = normalizeFreeShippingScoreConfig({
      thresholdEnabled: 'false' as unknown as boolean,
      thresholdBands: [
        { threshold: 0, score: 5 },
        null as unknown as { threshold: number; score: number },
        { threshold: Number.NaN, score: 1 },
      ],
      guardThreshold: 'abc' as unknown as number,
      enrollWhenGuarded: 'true' as unknown as boolean,
      enrollmentScore: 99,
    }, 12)
    expect(normalized.enrollmentScore).toBe(12)
    // 非 false 字面量不误关闭门槛计分，非法档位被丢弃
    expect(normalized.thresholdEnabled).toBe(true)
    expect(normalized.thresholdBands).toEqual([{ threshold: 0, score: 5 }])
    expect(normalized.guardThreshold).toBeUndefined()
    expect(normalized.enrollWhenGuarded).toBe(false)
    // 无后端配置时回退默认档位
    expect(normalizeFreeShippingScoreConfig(undefined, 30)).toMatchObject({
      enrollmentScore: 30, thresholdBands: DEFAULT_FREE_SHIPPING_SCORE_CONFIG.thresholdBands, enrollWhenGuarded: false,
    })
  })
})

describe('减免运费计分面板', () => {
  it('只读态展示报名分与人工配置的门槛档位，试算按门槛金额查档', async () => {
    await mount()
    const panel = openPanel()
    expect(panel.getByText('報名分＋門檻分 · 門檻人工配置')).toBeInTheDocument()
    expect(panel.getByText('無門檻（0 元）').closest('.organic-score-row')).toHaveTextContent('+20 分')
    expect(panel.getByText('減免門檻 ≤ 50 元').closest('.organic-score-row')).toHaveTextContent('+10 分')
    // 复用券类的客单价/力度口径不应出现在减免运费里
    expect(panel.queryByText('力度計分檔位')).not.toBeInTheDocument()
    expect(panel.queryByText(/硬護欄/)).not.toBeInTheDocument()
    // 报名分护栏：默认跟随末档，超限一併停发
    expect(panel.getByText('報名分護欄')).toBeInTheDocument()
    expect(panel.getByText('80 元')).toBeInTheDocument()
    expect(panel.getByText('一併停發')).toBeInTheDocument()

    fireEvent.click(panel.getByRole('button', { hidden: true, name: '試算與說明' }))
    const dialog = within(screen.getByRole('dialog'))
    // 默认示例门槛 30 元：报名 20 + 门槛 15
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('35 分')
    fireEvent.click(dialog.getByRole('button', { name: '無門檻' }))
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('40 分')
    // 超出末档（默认上限 80）：命中不到档位且護欄触发，报名分一併停发
    fireEvent.click(dialog.getByRole('button', { name: '滿 100 免運' }))
    expect(dialog.getByText('未命中')).toBeInTheDocument()
    expect(dialog.getByText(/已超有效上限 80 元/)).toBeInTheDocument()
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('0 分')
    fireEvent.click(dialog.getByRole('button', { name: '滿 500 免運（超限）' }))
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('0 分')
    fireEvent.click(dialog.getByRole('button', { hidden: true, name: /[关關]\s*[闭閉]/ }))
    expect(api.update).not.toHaveBeenCalled()
  }, 120000)

  it('编辑态可增删门槛档位并保存落库，反向分值被拦截', async () => {
    api.update.mockResolvedValue({})
    await mount()
    const panel = openPanel()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    expect(panel.getAllByText('當減免門檻 ≤')).toHaveLength(4)
    expect(panel.getByLabelText('第 1 檔門檻金額')).toHaveValue('0.00')

    // 反填高分到高门槛：直接拦保存
    fireEvent.change(panel.getByLabelText('第 1 檔門檻分值'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(message.warning).toHaveBeenCalledWith(expect.stringContaining('門檻越高，分值必須不高於上一檔'))
    expect(panel.getByText('門檻得分條件')).toBeInTheDocument()

    // 还原首档分值并新增一档：保存后回到只读态，档位与护栏随配置落库
    fireEvent.change(panel.getByLabelText('第 1 檔門檻分值'), { target: { value: '20' } })
    fireEvent.click(panel.getByRole('button', { hidden: true, name: '添加門檻檔位' }))
    expect(panel.getAllByText('當減免門檻 ≤')).toHaveLength(5)
    fireEvent.change(panel.getByLabelText('第 5 檔門檻金額'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(panel.getByText('減免門檻 ≤ 100 元').closest('.organic-score-row')).toHaveTextContent('+5 分')
    await waitFor(() => expect(panel.getByText(/已保存配置/)).toBeInTheDocument())
    const payload = api.update.mock.calls[0][1]
    const saved = JSON.parse(payload.freeShippingConfig)
    expect(saved.thresholdBands).toHaveLength(5)
    expect(saved.thresholdBands[4]).toEqual({ threshold: 100, score: 5 })
    // 护栏默认：上限留空（跟随末档）+ 超限停发报名分
    expect(saved.guardThreshold).toBeUndefined()
    expect(saved.enrollWhenGuarded).toBe(false)
  }, 120000)

  it('可手填有效上限并选择超限仍发报名分，配置随保存落库', async () => {
    api.update.mockResolvedValue({})
    await mount()
    const panel = openPanel()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    fireEvent.change(panel.getByLabelText('有效門檻上限'), { target: { value: '120' } })
    fireEvent.click(panel.getByRole('switch', { name: '超過上限仍發報名分' }))
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(panel.getByText('120 元')).toBeInTheDocument()
    expect(panel.getByText('仍發放')).toBeInTheDocument()
    const saved = JSON.parse(api.update.mock.calls[0][1].freeShippingConfig)
    expect(saved).toMatchObject({ guardThreshold: 120, enrollWhenGuarded: true })

    // 超限试算：500 元门槛仍发报名分 20，门槛分 0
    fireEvent.click(panel.getByRole('button', { hidden: true, name: '試算與說明' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: '滿 500 免運（超限）' }))
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('20 分')
  }, 120000)

  it('加载后端已保存的减免运费配置，不再回退示例模板', async () => {
    api.fetch.mockResolvedValue({ dimensions: [], rules: [{ id: 2, ruleCode: 'COM_02', dimension: 1,
      name: '減免運費', description: '已保存口徑', mode: 1, score: 12, status: 1, builtin: 1,
      freeShippingConfig: JSON.stringify({ enrollmentScore: 12, thresholdEnabled: true,
        thresholdBands: [{ threshold: 0, score: 8 }, { threshold: 40, score: 3 }],
        guardThreshold: 60, enrollWhenGuarded: true }) }] })
    await mount()
    const panel = openPanel()
    expect(panel.getByText(/已保存配置/)).toBeInTheDocument()
    expect(panel.getByText('減免門檻 ≤ 40 元').closest('.organic-score-row')).toHaveTextContent('+3 分')
    expect(panel.getByText('60 元')).toBeInTheDocument()
    expect(panel.getByText('仍發放')).toBeInTheDocument()
  }, 120000)

  it('停用门槛计分后档位灰显且试算只算报名分', async () => {
    await mount()
    const panel = openPanel()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    fireEvent.click(panel.getByRole('switch', { name: '啟用門檻計分' }))
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(panel.getByText('停用不計分')).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: '試算與說明' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('門檻計分模組已停用，該項不計入總分。')).toBeInTheDocument()
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('20 分')
  }, 120000)

  it('详情只读模式可试算，但没有编辑入口', async () => {
    await mount(true)
    const panel = openPanel()
    expect(panel.queryByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ })).not.toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: '試算與說明' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('35 分')
    expect(dialog.getByRole('button', { hidden: true, name: '重置試算' })).toBeEnabled()
  }, 120000)
})
