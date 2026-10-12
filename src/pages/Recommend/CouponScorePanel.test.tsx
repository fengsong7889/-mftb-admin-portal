import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { ConfigProvider, Form, message } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrganicTrafficScoreConfig from './OrganicTrafficScoreConfig'
import { AppType } from './constants'
import { DEFAULT_COUPON_SCORE_CONFIG, validateCouponScoreConfig, computeCouponScore } from './organicTrafficConfig'

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

async function mount() {
  await act(async () => {
    render(<ConfigProvider theme={{ token: { motion: false } }}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/promotion-algorithm-add?type=7']}>
        <Form><OrganicTrafficScoreConfig brand={AppType.SHANFENG} /></Form>
      </MemoryRouter>
    </ConfigProvider>)
  })
}

/** 展开进店领券（方案 v1 试点）面板 */
function openPanel() {
  fireEvent.click(screen.getByText('COM_03'))
  return within(screen.getByLabelText('進店領券計分配置'))
}

beforeEach(() => {
  vi.clearAllMocks()
  api.fetch.mockResolvedValue({ rules: [], dimensions: [] })
})

describe('方案 v1 纯函数', () => {
  it('默认档位合法，门槛越低于客单价得分越高，闸门与护栏按预期生效', () => {
    expect(validateCouponScoreConfig(DEFAULT_COUPON_SCORE_CONFIG)).toBeNull()
    // B=100 / 門檻 100 / 券面 60：報名 10 + 門檻 8 + 力度 60（閘門①通過）
    expect(computeCouponScore(DEFAULT_COUPON_SCORE_CONFIG, 100, 100, 60).total).toBe(78)
    // 方向：門檻越低於客單價（越好用）分越高
    expect(computeCouponScore(DEFAULT_COUPON_SCORE_CONFIG, 100, 0, 30).thresholdScore).toBe(20)
    expect(computeCouponScore(DEFAULT_COUPON_SCORE_CONFIG, 100, 30, 30).thresholdScore).toBe(20)
    expect(computeCouponScore(DEFAULT_COUPON_SCORE_CONFIG, 100, 80, 30).thresholdScore).toBe(12)
    expect(computeCouponScore(DEFAULT_COUPON_SCORE_CONFIG, 100, 150, 30).thresholdScore).toBe(4)
    expect(computeCouponScore(DEFAULT_COUPON_SCORE_CONFIG, 100, 190, 30).thresholdScore).toBe(2)
    // 硬護欄（> 2 倍客單價）：門檻分也歸零
    expect(computeCouponScore(DEFAULT_COUPON_SCORE_CONFIG, 100, 250, 30)).toMatchObject({ guarded: true, thresholdScore: 0, total: 0 })
    // 門檻 600 倍客單價：硬護欄觸發，三块全部归零
    expect(computeCouponScore(DEFAULT_COUPON_SCORE_CONFIG, 10, 6000, 10000).total).toBe(0)
    // 客單價缺失时不查表，仅保留报名分
    expect(computeCouponScore(DEFAULT_COUPON_SCORE_CONFIG, 0, 100, 60)).toMatchObject({ canCompute: false, total: 10 })
    // 停用单个模块：该模块不计分，另一模块与报名分照常
    expect(computeCouponScore({ ...DEFAULT_COUPON_SCORE_CONFIG, thresholdEnabled: false }, 100, 100, 60).total).toBe(70)
    expect(computeCouponScore({ ...DEFAULT_COUPON_SCORE_CONFIG, discountEnabled: false }, 100, 100, 60).total).toBe(18)
    // 两个模块都停用：只剩报名分
    expect(computeCouponScore({ ...DEFAULT_COUPON_SCORE_CONFIG, thresholdEnabled: false, discountEnabled: false }, 100, 100, 60).total).toBe(10)
    // 停用模块仍回传命中档位，供界面灰显对照
    expect(computeCouponScore({ ...DEFAULT_COUPON_SCORE_CONFIG, discountEnabled: false }, 100, 100, 60).discountBand?.score).toBe(60)
  })

  it('力度分闸门：好够着或省得够狠才发力度分，空转券拿不到力度分', () => {
    const gate = (t: number, d: number) => computeCouponScore(DEFAULT_COUPON_SCORE_CONFIG, 100, t, d)
    // ①門檻可達：150 ≤ 1.5×100，閘門通過
    expect(gate(150, 30)).toMatchObject({ gateBy: 'threshold', gatePassed: true, discountScore: 45, total: 59 })
    // ②折扣率達標：滿 200 減 100（省 50%），真很券不被誤傷
    expect(gate(200, 100)).toMatchObject({ gateBy: 'discount', gatePassed: true, discountScore: 60, total: 72 })
    // 兩條都不滿足：滿 190 減 10（1.9 倍、省 5.3%）→ 力度分 0，只剩報名分 + 門檻分
    expect(gate(190, 10)).toMatchObject({ gateBy: null, gatePassed: false, discountScore: 0, total: 12 })
    // 空轉券（> 2 倍）：硬護欄優先，連門檻分也不發
    expect(gate(290, 100)).toMatchObject({ guarded: true, gateBy: null, discountScore: 0, total: 0 })
    // 門檻越低得分越高的同時，空轉券與好券的區分度足夠大
    expect(gate(30, 30).total).toBe(75)
    expect(gate(200, 100).total - gate(190, 10).total).toBeGreaterThan(50)
  })
})

describe('进店领券方案 v1 面板', () => {
  it('只读态按「报名分 + 门槛分 + 力度分」三段档位表展示，不再出现折减系数', async () => {
    await mount()
    const panel = openPanel()
    expect(panel.getByText('方案 v1 · 報名分＋門檻分＋力度分')).toBeInTheDocument()
    expect(panel.getAllByText('報名計分').length).toBeGreaterThan(0)
    // 基准客单价模块已删除，直接取系统门店客单价
    expect(panel.queryByText('基準客單價')).not.toBeInTheDocument()
    expect(panel.getByText(/基準 = 門店客單價/)).toBeInTheDocument()
    expect(panel.getByText('門檻計分檔位')).toBeInTheDocument()
    expect(panel.getByText('力度計分檔位')).toBeInTheDocument()
    // 两条线各自独立给分：無門檻～≤0.3 倍 +20，券面 ≥50% +60
    expect(panel.getByText('無門檻 ～ ≤ 0.3 倍門店客單價').closest('.organic-score-row')).toHaveTextContent('+20 分')
    expect(panel.getByText('券面金額 ≥ 50% 門店客單價').closest('.organic-score-row')).toHaveTextContent('+60 分')
    expect(panel.getByText('一併停發')).toBeInTheDocument()
    // 两个计分模块默认启用，行内展示「計入總分」
    expect(panel.getAllByText('計入總分').length).toBe(2)
    // 公式+示例内联在每个模块标题右侧，不再单独占一块区域
    expect(panel.queryByText('算法與示例')).not.toBeInTheDocument()
    expect(panel.getByText(/公式：使用門檻 ÷ 門店客單價/)).toBeInTheDocument()
    expect(panel.getByText(/150 ÷ 100 = 1\.5 倍 → 命中 4 分/)).toBeInTheDocument()
    expect(panel.getByText(/公式：券面金額 ÷ 門店客單價/)).toBeInTheDocument()
    expect(panel.getByText(/30 ÷ 100 = 30% → 命中 45 分/)).toBeInTheDocument()
    // 護欄/閘門：两条件任一满足才发力度分，空转券两条都不满足
    expect(panel.getByText(/閘門①：門檻 ≤ 1\.5 倍門店客單價/)).toBeInTheDocument()
    expect(panel.getByText(/閘門②：券面 ≥ 50% × 門檻/)).toBeInTheDocument()
    expect(panel.getByText(/硬護欄：門檻 > 2 倍客單價/)).toBeInTheDocument()
    expect(panel.getByText(/滿 290 減 100（2\.9 倍、34%）→ 閘門不過，力度分 0 分/)).toBeInTheDocument()
    // 旧面板的折减系数概念不应再出现在进店领券里
    expect(panel.queryByText('折減係數')).not.toBeInTheDocument()
    expect(api.update).not.toHaveBeenCalled()
  }, 120000)

  it('改报名分与停用力度模块后按开关计分；护栏触发时一分不得', async () => {
    await mount()
    const panel = openPanel()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    // 编辑态用整句式条件，不再出现“倍數上界/力度下界”这类术语
    expect(panel.getAllByText('當使用門檻 ≤').length).toBe(6)
    expect(panel.getAllByText('當券面金額 ≥').length).toBe(5)
    expect(panel.getByText('當使用門檻超過 3 倍門店客單價')).toBeInTheDocument()
    expect(panel.getByText('當券面金額未達 5% 門店客單價')).toBeInTheDocument()
    expect(panel.queryByText(/上界|下界/)).not.toBeInTheDocument()
    // 编辑态同样每个模块一行公式+示例
    expect(panel.getByText(/公式：券面金額 ÷ 門店客單價/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('報名分值'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(panel.getByRole('switch', { hidden: true, name: '報名計分' }).closest('.organic-score-row')).toHaveTextContent('+25 分')
    expect(message.info).toHaveBeenCalledWith(expect.stringContaining('當前頁面草稿'))
    expect(api.update).not.toHaveBeenCalled()

    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    fireEvent.click(panel.getByRole('switch', { name: '啟用力度計分' }))
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(panel.getByText('停用不計分')).toBeInTheDocument()

    fireEvent.click(panel.getByRole('button', { hidden: true, name: '試算與說明' }))
    const drawer = within(screen.getByRole('dialog'))
    // 力度模組停用：只剩報名 25 + 門檻 8（1 倍档），並明確提示被停用的模組
    expect(drawer.getByText(/力度計分 模組已停用/)).toBeInTheDocument()
    expect(drawer.getByLabelText('單項總得分')).toHaveTextContent('33 分')
    fireEvent.click(drawer.getByRole('button', { hidden: true, name: /[关關]\s*[闭閉]/ }))

    // 重新啟用力度模組後恢復三條線相加：25 + 8 + 60
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    fireEvent.click(panel.getByRole('switch', { name: '啟用力度計分' }))
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    fireEvent.click(panel.getByRole('button', { hidden: true, name: '試算與說明' }))
    const drawer2 = within(screen.getByRole('dialog'))
    expect(drawer2.getByLabelText('單項總得分')).toHaveTextContent('93 分')

    // 空轉券：門檻 2.9 倍 > 硬護欄 2 倍，門檻分與力度分都不發，報名分一併停發
    fireEvent.click(drawer2.getByRole('button', { name: '空轉券滿 290 減 10' }))
    expect(drawer2.getByLabelText('單項總得分')).toHaveTextContent('0 分')
    expect(drawer2.getByText(/硬護欄已觸發：門檻/)).toBeInTheDocument()
    // 高門檻真狠券：走折扣率豁免，力度分照發
    fireEvent.click(drawer2.getByRole('button', { name: '高門檻真狠券滿 200 減 100' }))
    expect(drawer2.getByText(/② 折扣率達標/)).toBeInTheDocument()
    expect(drawer2.getByLabelText('單項總得分')).toHaveTextContent('87 分')
    fireEvent.click(drawer2.getByRole('button', { hidden: true, name: /[关關]\s*[闭閉]/ }))
    expect(api.update).not.toHaveBeenCalled()
  }, 120000)
})
