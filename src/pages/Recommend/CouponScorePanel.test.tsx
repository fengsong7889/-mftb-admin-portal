import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ConfigProvider, Form, message } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrganicTrafficScoreConfig from './OrganicTrafficScoreConfig'
import { AppType } from '@mftb/contracts/recommendConstants'
import { DEFAULT_COUPON_SCORE_CONFIG, validateCouponScoreConfig, computeCouponScore, couponScoreMonotonicHint } from './organicTrafficConfig'

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

/** 展开指定券类计分项的 v1 面板（COM_01/03/04/05/07 共用同一面板） */
function openPanel(id = 'COM_03', name = '進店領券') {
  fireEvent.click(screen.getByText(id))
  return within(screen.getByLabelText(`${name}計分配置`))
}

beforeEach(() => {
  vi.clearAllMocks()
  api.fetch.mockResolvedValue({ rules: [], dimensions: [] })
})

describe('方案 v1 纯函数', () => {
  it('默认档位合法，门槛越低于客单价得分越高，护栏与开关按预期生效', () => {
    expect(validateCouponScoreConfig(DEFAULT_COUPON_SCORE_CONFIG)).toBeNull()
    // B=100 / 門檻 100 / 券面 60：報名 10 + 門檻 8 + 力度 60
    expect(computeCouponScore(DEFAULT_COUPON_SCORE_CONFIG, 100, 100, 60).total).toBe(78)
    // 方向：門檻越低於客單價（越好用）分越高；匹配不到檔位即 0 分（無兌底行）
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

  it('力度分母取计价基数：门槛高于客单价时分母被抬高，空转券自动压低', () => {
    // 門檻 > 客單價：分母 = 門檻（200 元）
    expect(computeCouponScore(DEFAULT_COUPON_SCORE_CONFIG, 100, 200, 100)).toMatchObject({
      intensityBase: 200, intensityBaseFromThreshold: true, discountRate: 50, discountScore: 60, total: 72,
    })
    // 空轉券：滿 190 減 10 → 10/190 = 5.26% → 僅 8 分
    expect(computeCouponScore(DEFAULT_COUPON_SCORE_CONFIG, 100, 190, 10)).toMatchObject({
      intensityBase: 190, discountScore: 8, total: 20,
    })
    // 門檻 ≤ 客單價：分母就是客單價，好券分數不變
    expect(computeCouponScore(DEFAULT_COUPON_SCORE_CONFIG, 100, 30, 30)).toMatchObject({
      intensityBase: 100, intensityBaseFromThreshold: false, discountScore: 45, total: 75,
    })
    // 無門檻券同樣以客單價為分母
    expect(computeCouponScore(DEFAULT_COUPON_SCORE_CONFIG, 100, 0, 30).discountScore).toBe(45)
    // 超硬護欄：直接 0
    expect(computeCouponScore(DEFAULT_COUPON_SCORE_CONFIG, 100, 290, 100).total).toBe(0)
    // 區分度：好券（滿100減60）比空轉券（滿190減10）高 50 分以上
    expect(computeCouponScore(DEFAULT_COUPON_SCORE_CONFIG, 100, 100, 60).total - computeCouponScore(DEFAULT_COUPON_SCORE_CONFIG, 100, 190, 10).total).toBeGreaterThan(50)
  })

  it('硬校验分值方向：回填反了直接拦保存（门槛越高分越高 / 力度越低分越高）', () => {
    const badThreshold = { ...DEFAULT_COUPON_SCORE_CONFIG, thresholdBands: [{ upper: 1, score: 10 }, { upper: 2, score: 20 }] }
    expect(validateCouponScoreConfig(badThreshold)).toContain('門檻越高，分值必須不高於上一檔')
    const badDiscount = { ...DEFAULT_COUPON_SCORE_CONFIG, discountBands: [{ lower: 50, score: 10 }, { lower: 30, score: 20 }] }
    expect(validateCouponScoreConfig(badDiscount)).toContain('力度越低，分值必須不高於上一檔')
    // 分值持平合法
    expect(validateCouponScoreConfig({ ...DEFAULT_COUPON_SCORE_CONFIG, thresholdBands: [{ upper: 1, score: 10 }, { upper: 2, score: 10 }] })).toBeNull()
  })

  it('末档容错提示：末档低于硬护栏倍数时提醒补一档', () => {
    const hint = couponScoreMonotonicHint({ ...DEFAULT_COUPON_SCORE_CONFIG, thresholdBands: [{ upper: 1, score: 10 }] })
    expect(hint).toContain('低於硬護欄')
    expect(couponScoreMonotonicHint(DEFAULT_COUPON_SCORE_CONFIG)).toBeNull()
  })

  it('停用模块跳过校验：档位表不合法也不拦保存，启用时才报错', () => {
    const badThreshold = { ...DEFAULT_COUPON_SCORE_CONFIG, thresholdBands: [{ upper: 1, score: 10 }, { upper: 1, score: 20 }] }
    expect(validateCouponScoreConfig(badThreshold)).toBeTruthy()
    expect(validateCouponScoreConfig({ ...badThreshold, thresholdEnabled: false })).toBeNull()
    const badDiscount = { ...DEFAULT_COUPON_SCORE_CONFIG, discountBands: [{ lower: 0, score: 10 }] }
    expect(validateCouponScoreConfig(badDiscount)).toBeTruthy()
    expect(validateCouponScoreConfig({ ...badDiscount, discountEnabled: false })).toBeNull()
    // 档位不再需要兜底行：全部为有限上界也合法
    expect(validateCouponScoreConfig({ ...DEFAULT_COUPON_SCORE_CONFIG, thresholdBands: [{ upper: 0.5, score: 10 }] })).toBeNull()
    expect(validateCouponScoreConfig({ ...DEFAULT_COUPON_SCORE_CONFIG, discountBands: [{ lower: 8, score: 10 }] })).toBeNull()
  })
})

describe('进店领券方案 v1 面板', () => {
  it('只读态按「报名分 + 门槛分 + 力度分」三段档位表展示，不再出现折减系数', async () => {
    await mount()
    const panel = openPanel()
    expect(panel.getByText('方案 v1 · 報名分＋門檻分＋力度分')).toBeInTheDocument()
    expect(panel.getAllByText('報名計分').length).toBeGreaterThan(0)
    // 基准客单价模块已删除，直接取系统门店客单价（口径说明只在试算弹窗里）
    expect(panel.queryByText('基準客單價')).not.toBeInTheDocument()
    expect(panel.queryByText(/基準 = 門店客單價/)).not.toBeInTheDocument()
    expect(panel.queryByText(/得分 = 報名分/)).not.toBeInTheDocument()
    expect(panel.getByText('門檻計分檔位')).toBeInTheDocument()
    expect(panel.getByText('力度計分檔位')).toBeInTheDocument()
    // 两条线各自独立给分：無門檻～≤0.3 倍 +20，券面 ≥50% 計價基數 +60
    expect(panel.getByText('無門檻 ～ ≤ 0.3 倍門店客單價').closest('.organic-score-row')).toHaveTextContent('+20 分')
    expect(panel.getByText('券面金額 ≥ 50% 計價基數').closest('.organic-score-row')).toHaveTextContent('+60 分')
    // 檔位表不再有兌底行：末檔就是 ≤2 倍（對齊硬護欄），匹配不到即 0 分
    expect(panel.getByText('使用門檻 > 1.5 倍且 ≤ 2 倍門店客單價').closest('.organic-score-row')).toHaveTextContent('+2 分')
    expect(panel.queryByText(/兜底檔|不限（/)).not.toBeInTheDocument()
    expect(panel.getByText('一併停發')).toBeInTheDocument()
    // 两个计分模块默认启用，行内展示「計入總分」
    expect(panel.getAllByText('計入總分').length).toBe(2)
    // 公式+示例内联在每个模块标题右侧，不再单独占一块区域
    expect(panel.queryByText('算法與示例')).not.toBeInTheDocument()
    expect(panel.getByText(/公式：使用門檻 ÷ 門店客單價/)).toBeInTheDocument()
    expect(panel.getByText(/150 ÷ 100 = 1\.5 倍 → 命中 4 分/)).toBeInTheDocument()
    expect(panel.getByText(/公式：券面金額 D ÷ 計價基數（B 與 T 取大）/)).toBeInTheDocument()
    expect(panel.getByText(/30 ÷ 150 = 20% → 命中 30 分/)).toBeInTheDocument()
    // 力度口径结论挂在问号上，点击弹出结构化 Popover 查看
    fireEvent.click(screen.getByLabelText('力度口徑說明'))
    await waitFor(() => expect(screen.getByText(/這張券真正生效的那筆消費額/)).toBeInTheDocument())
    // 門檻保護只剩硬護欄：闸门规则已删除，不再需要三条交叉条件
    expect(panel.queryByText(/閘門/)).not.toBeInTheDocument()
    expect(panel.getByText(/硬護欄：門檻 > 2 倍客單價/)).toBeInTheDocument()
    expect(panel.getByText(/滿 290 減 100 → 0 分/)).toBeInTheDocument()
    // 试算弹窗已同步到新口径：公式与口径只在弹窗里描述，顶部模板 Alert 已删除
    fireEvent.click(panel.getByRole('button', { hidden: true, name: '試算與說明' }))
    const drawer = within(screen.getByRole('dialog'))
    expect(drawer.queryByText('示例模板試算')).not.toBeInTheDocument()
    expect(drawer.getByText(/符號：B = 門店客單價，T = 使用門檻，D = 券面金額/)).toBeInTheDocument()
    expect(drawer.getByText(/無門檻券也只有本口徑能直接計算/)).toBeInTheDocument()
    expect(drawer.getByText(/基準 = 門店客單價/)).toBeInTheDocument()
    expect(drawer.getByText('優惠力度 = D ÷ 計價基數（B 與 T 取大）')).toBeInTheDocument()
    expect(drawer.queryByText('優惠力度 = D / B')).not.toBeInTheDocument()
    expect(drawer.getByText('計價基數 = max(B, T)')).toBeInTheDocument()
    expect(drawer.getByText('100 元')).toBeInTheDocument()
    expect(drawer.getByText('門檻未超客單價，取 B')).toBeInTheDocument()
    expect(drawer.getByLabelText('單項總得分')).toHaveTextContent('78 分')
    fireEvent.click(drawer.getByRole('button', { hidden: true, name: /[关關]\s*[闭閉]/ }))
    // 旧面板的折减系数概念不应再出现在进店领券里
    expect(panel.queryByText('折減係數')).not.toBeInTheDocument()
    expect(api.update).not.toHaveBeenCalled()
  }, 120000)

  it('详情只读模式下仍可打开试算弹窗，但没有编辑入口', async () => {
    await mount(true)
    const panel = openPanel()
    expect(panel.queryByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ })).not.toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: '試算與說明' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('78 分')
    expect(dialog.getByRole('button', { hidden: true, name: '重置試算' })).toBeEnabled()
  }, 120000)

  it('改报名分与停用力度模块后按开关计分；护栏触发时一分不得', async () => {
    await mount()
    const panel = openPanel()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    // 编辑态用整句式条件，不再出现“倍數上界/力度下界”这类术语
    expect(panel.getAllByText('當使用門檻 ≤').length).toBe(6)
    expect(panel.getAllByText('當券面金額 ≥').length).toBe(5)
    // 档位表不再有兜底行，也没有「超過/未達」这类兜底表述
    expect(panel.queryByText(/當使用門檻超過/)).not.toBeInTheDocument()
    expect(panel.queryByText(/未達/)).not.toBeInTheDocument()
    expect(panel.queryByText(/兜底檔/)).not.toBeInTheDocument()
    expect(panel.queryByText(/上界|下界/)).not.toBeInTheDocument()
    // 防误配：每行分值旁显示「≤ 上一档」约束，避免把高分回填到高门槛/低力度档
    expect(panel.getAllByText(/≤ 上一檔 20 分/).length).toBe(1)
    expect(panel.getAllByText(/≤ 上一檔 60 分/).length).toBe(1)
    // 编辑态同样每个模块一行公式+示例
    expect(panel.getByText(/公式：券面金額 D ÷ 計價基數（B 與 T 取大）/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('報名分值'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(panel.getByText('滿足條件才給分').closest('.organic-score-row')).toHaveTextContent('+25 分')
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
    // 高門檻真狠券：分母被門檻抬高到 200，仍命中 ≥50% 檔，力度分照發
    fireEvent.click(drawer2.getByRole('button', { name: '高門檻真狠券滿 200 減 100' }))
    expect(drawer2.getByText('200 元')).toBeInTheDocument()
    expect(drawer2.getByText('門檻較高，取 T')).toBeInTheDocument()
    expect(drawer2.getByLabelText('單項總得分')).toHaveTextContent('87 分')
    // 高門檻低面額：分母被抬高后力度僅 5.26% → 8 分力度分，加 25+2
    fireEvent.click(drawer2.getByRole('button', { name: '高門檻低面額滿 190 減 10' }))
    expect(drawer2.getByLabelText('單項總得分')).toHaveTextContent('35 分')
    fireEvent.click(drawer2.getByRole('button', { hidden: true, name: /[关關]\s*[闭閉]/ }))
    expect(api.update).not.toHaveBeenCalled()
  }, 120000)

  it('报名开关关闭后保留配置值、灰显，不误显示为生效加分', async () => {
    await mount()
    const panel = openPanel()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    fireEvent.click(panel.getByRole('switch', { name: '啟用報名分' }))
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    const tag = panel.getByText('報名分已停用')
    expect(tag).toBeInTheDocument()
    // 灰显行仍展示原值 10 分，但试算里的报名分为 0，避免把停用值误读成生效加分
    expect(tag.closest('.organic-score-row')?.querySelector('.organic-score-value--disabled')).toHaveTextContent('+10 分')
    fireEvent.click(panel.getByRole('button', { hidden: true, name: '試算與說明' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('報名分')).toBeInTheDocument()
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('68 分')
    fireEvent.click(dialog.getByRole('button', { hidden: true, name: /[关關]\s*[闭閉]/ }))
    expect(api.update).not.toHaveBeenCalled()
  }, 120000)

  it('只读态工具条展示最后修改人与时间，编辑中收起', async () => {
    api.fetch.mockResolvedValue({ dimensions: [], rules: [{ id: 3, ruleCode: 'COM_03', dimension: 1,
      name: '進店領券', description: '原有规则', mode: 4, score: 2, status: 1, builtin: 1,
      updatedBy: 'system', updateTime: '2026-09-23 19:49:55' }] })
    await mount()
    const panel = openPanel()
    // 「修改人：」与人名分属两个节点，逐段断言
    expect(panel.getByText('修改人：')).toBeInTheDocument()
    expect(panel.getByText('system')).toBeInTheDocument()
    expect(panel.getByText('2026-09-23 19:49:55')).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    expect(panel.queryByText('修改人：')).not.toBeInTheDocument()
  }, 120000)
})

describe('滿額立減與券類活動統一使用 v1 面板', () => {
  const couponRules = [
    ['COM_01', '滿額立減'], ['COM_03', '進店領券'], ['COM_04', '門店新客券'], ['COM_05', '收藏送券'],
    ['COM_07', '平台官方神券'],
  ] as const

  it('COM_01/03/04/05/07 都渲染 v1 面板，不再出现旧面板的比例档与折减系数', async () => {
    await mount()
    for (const [id, name] of couponRules) {
      const panel = openPanel(id, name)
      expect(panel.getByText('方案 v1 · 報名分＋門檻分＋力度分'), id).toBeInTheDocument()
      expect(panel.getByText('門檻計分檔位'), id).toBeInTheDocument()
      expect(panel.getByText('力度計分檔位'), id).toBeInTheDocument()
      // 旧面板概念：比例檔位表 / 折减系数 / 力度分上限 / 满额立减旧倍率梯度 均不应再现
      expect(panel.queryByText(/折減係數/), id).not.toBeInTheDocument()
      expect(panel.queryByText('力度分上限'), id).not.toBeInTheDocument()
      expect(panel.queryByText(/優惠比例第/), id).not.toBeInTheDocument()
      expect(panel.queryByText('基礎條件加分'), id).not.toBeInTheDocument()
      expect(panel.queryByText('倍數梯度加分'), id).not.toBeInTheDocument()
    }
  }, 240000)

  it('满额立减复用同一面板，金额术语换成立減金額', async () => {
    await mount()
    const panel = openPanel('COM_01', '滿額立減')
    expect(panel.getByText('立減金額 ≥ 50% 計價基數')).toBeInTheDocument()
    expect(panel.getByText(/公式：立減金額 D ÷ 計價基數（B 與 T 取大）/)).toBeInTheDocument()
    // 券类术语不应泄漏到满额立减面板
    expect(panel.queryByText(/券面金額/)).not.toBeInTheDocument()
    // 试算弹窗里的 D 也跟随术语
    fireEvent.click(panel.getByRole('button', { hidden: true, name: '試算與說明' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText(/D = 立減金額/)).toBeInTheDocument()
    expect(dialog.getByLabelText('立減金額 D')).toBeInTheDocument()
    expect(dialog.queryByText('券面金額 D（元）')).not.toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { hidden: true, name: /[关關]\s*[闭閉]/ }))
    expect(api.update).not.toHaveBeenCalled()
  }, 180000)

  it('各活動草稿互相獨立，改一個不影響其他三項', async () => {
    await mount()
    const target = openPanel('COM_05', '收藏送券')
    fireEvent.click(target.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    fireEvent.change(target.getByLabelText('報名分值'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(target.getByText('滿足條件才給分').closest('.organic-score-row')).toHaveTextContent('+30 分')
    expect(target.getByText(/當前頁面草稿/)).toBeInTheDocument()
    // 其他三項仍为默认模板 10 分，且不因一项展开而丢失自己的状态
    for (const [id, name] of [['COM_03', '進店領券'], ['COM_04', '門店新客券'], ['COM_07', '平台官方神券']] as const) {
      const other = openPanel(id, name)
      expect(other.getByText('滿足條件才給分').closest('.organic-score-row'), id).toHaveTextContent('+10 分')
      expect(other.getByText(/示例模板/), id).toBeInTheDocument()
    }
    expect(api.update).not.toHaveBeenCalled()
  }, 180000)
})

describe('券類面板的評分說明', () => {
  it('只读态展示规则描述，编辑态可修改并随保存写库（全量覆盖，不丢其他字段）', async () => {
    await mount()
    const panel = openPanel()
    expect(panel.getByText('商家設置進店領券：報名分 + 門檻分（門檻 ÷ 門店客單價） + 力度分（券面 ÷ 計價基數）')).toBeInTheDocument()

    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    // 区块标题的 aria-labelledby 也叫「評分說明」，因此用 role 定位输入框
    const box = panel.getByRole('textbox', { name: '評分說明' })
    expect(box).toHaveValue('商家設置進店領券：報名分 + 門檻分（門檻 ÷ 門店客單價） + 力度分（券面 ÷ 計價基數）')
    fireEvent.change(box, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    // 必填拦截：说明为空不得保存，也不得误发后端请求
    expect(message.warning).toHaveBeenCalledWith('請填寫評分說明')
    expect(api.update).not.toHaveBeenCalled()

    fireEvent.change(box, { target: { value: '新口徑：報名分＋門檻分＋力度分' } })
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    await waitFor(() => expect(api.update).toHaveBeenCalled())
    const [identifier, payload] = api.update.mock.calls[0]
    expect(identifier).toBe('COM_03')
    expect(payload.description).toBe('新口徑：報名分＋門檻分＋力度分')
    // 后端 updateRule 是整行覆盖，其余字段必须原样带上
    expect(payload.name).toBe('進店領券')
    expect(payload.dimension).toBeTruthy()
    expect(payload.mode).toBeTruthy()
    expect(payload.status).toBeTruthy()
    expect(message.success).toHaveBeenCalledWith(expect.stringContaining('評分說明'))
    await waitFor(() => expect(panel.getByText('新口徑：報名分＋門檻分＋力度分')).toBeInTheDocument())
  }, 180000)

  it('说明未变动时不发后端请求，取消则回滚输入值', async () => {
    await mount()
    const panel = openPanel()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    const box = panel.getByRole('textbox', { name: '評分說明' })
    // 只改档位、不动说明 → 仅存草稿，不写库
    fireEvent.change(screen.getByLabelText('報名分值'), { target: { value: '18' } })
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(api.update).not.toHaveBeenCalled()
    expect(message.info).toHaveBeenCalledWith(expect.stringContaining('當前頁面草稿'))
    expect(panel.getByText('滿足條件才給分').closest('.organic-score-row')).toHaveTextContent('+18 分')

    // 改说明后取消：不发请求、不保留输入
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    fireEvent.change(box, { target: { value: '不该被保存的修改' } })
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /取\s*消/ }))
    expect(api.update).not.toHaveBeenCalled()
    expect(panel.queryByText('不该被保存的修改')).not.toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    expect(panel.getByRole('textbox', { name: '評分說明' })).toHaveValue('商家設置進店領券：報名分 + 門檻分（門檻 ÷ 門店客單價） + 力度分（券面 ÷ 計價基數）')
  }, 180000)
})
