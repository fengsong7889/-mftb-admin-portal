import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { ConfigProvider, Form } from 'antd'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrganicTrafficScoreConfig from './OrganicTrafficScoreConfig'
import { AppType } from '@mftb/contracts/recommendConstants'
import { DEFAULT_ORGANIC_SCORE_RULES, ScoreDimension } from './organicTrafficConfig'
import ScoreRow from './AlgorithmForm/ScoreRow'

/**
 * 自然流量计分配置壳层测试：计分项列表、名称/品牌可见性、统一展示结构。
 * 券类计分 v1 面板本身见 CouponScorePanel.test.tsx。
 */

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

function LocationIndicator() {
  const location = useLocation()
  return <output aria-label="当前位置">{location.pathname + location.search}</output>
}

async function mount(readOnly = false, brand?: AppType) {
  await act(async () => {
    render(<ConfigProvider theme={{ token: { motion: false } }}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={['/promotion-algorithm-add?type=7&id=123']}>
        <Form disabled={readOnly}><OrganicTrafficScoreConfig readOnly={readOnly} brand={brand} /></Form>
        <LocationIndicator />
      </MemoryRouter>
    </ConfigProvider>)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  api.fetch.mockResolvedValue({ rules: [], dimensions: [] })
})

describe('通用计分项：模块卡片与减免运费开关', () => {
  it('减免运费走专属面板：报名计分 + 人工配置的门槛档位', async () => {
    await mount()
    fireEvent.click(screen.getByText('COM_02'))
    const panel = within(screen.getByLabelText('減免運費計分配置'))
    // 报名计分：平台活动与商家自建活动最终只生效一个，报名即给分（不提供关闭）
    expect(panel.getByText('滿足條件才給分')).toBeInTheDocument()
    expect(panel.getByText('滿足條件才給分').closest('.organic-score-row')).toHaveTextContent('+20 分')
    // 门槛档位按运营人工配置的金额展示，0 元档承接无门槛活动
    expect(panel.getByText('門檻計分檔位')).toBeInTheDocument()
    expect(panel.getByText('無門檻（0 元）').closest('.organic-score-row')).toHaveTextContent('+20 分')
    expect(panel.getByText('減免門檻 ≤ 30 元').closest('.organic-score-row')).toHaveTextContent('+15 分')
    // 减免门槛只能配置，不复用券类面板的客单价/力度口径，也不再出现通用前提条件输入
    expect(panel.queryByText('力度計分檔位')).not.toBeInTheDocument()
    expect(panel.queryByText('前提條件')).not.toBeInTheDocument()
    // 報名分護欄：默认跟随末档，超限一併停发报名分
    expect(panel.getByText('報名分護欄')).toBeInTheDocument()
    expect(panel.getByText('一併停發')).toBeInTheDocument()
  })

  it('减免运费编辑态可调报名分与门槛档位，保存后回到只读', async () => {
    api.update.mockResolvedValue({})
    await mount()
    fireEvent.click(screen.getByText('COM_02'))
    const panel = within(screen.getByLabelText('減免運費計分配置'))
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    expect(panel.getByText('門檻得分條件')).toBeInTheDocument()
    expect(panel.getAllByText('當減免門檻 ≤')).toHaveLength(4)
    fireEvent.change(panel.getByLabelText('報名分值'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    // 保存后回到只读态，报名分即时更新；报名分值与整份计分配置（含护欄）一并落库
    expect(panel.getByText('滿足條件才給分').closest('.organic-score-row')).toHaveTextContent('+30 分')
    expect(api.update).toHaveBeenCalledWith('COM_02', expect.objectContaining({ score: 30, prerequisites: '報名減免運費' }))
    const saved = JSON.parse(api.update.mock.calls[0][1].freeShippingConfig)
    expect(saved.enrollmentScore).toBe(30)
    expect(saved.thresholdBands).toHaveLength(4)
    expect(saved.enrollWhenGuarded).toBe(false)
  })

  it('其他计分项配置同样以模块卡片呈现', async () => {
    await mount()
    fireEvent.click(screen.getByRole('tab', { name: /dimStore/ }))
    fireEvent.click(screen.getByText('STB_01'))
    expect(screen.getByText('計分明細')).toBeInTheDocument()
  })

  it('金字招牌计分项走标签计分面板，不再是单一固定分', async () => {
    await mount()
    fireEvent.click(screen.getByText('COM_10'))
    const panel = within(screen.getByLabelText('金字招牌(廣告)計分配置'))
    expect(panel.getByText('標籤計分 · 已購買且投放期內逐個累加')).toBeInTheDocument()
    expect(panel.getByText('標籤分值明細')).toBeInTheDocument()
    // 旧的单一固定分展示不再出现
    expect(panel.queryByText('固定加分')).not.toBeInTheDocument()
  }, 120000)

  it('点金广告计分项已下架，后端残留数据也不再展示', async () => {
    api.fetch.mockResolvedValue({ dimensions: [], rules: [{ id: 9, ruleCode: 'COM_09', dimension: 1,
      name: '購買廣告-點金廣告', description: '購買點金廣告投放期內加分', mode: 1, score: 80, status: 1, builtin: 1 }] })
    await mount()
    expect(screen.queryByText('COM_09')).not.toBeInTheDocument()
    expect(screen.queryByText('購買廣告-點金廣告')).not.toBeInTheDocument()
  })

  it('店铺标签-金牌计分项已下架，后端残留数据也不再展示', async () => {
    api.fetch.mockResolvedValue({ dimensions: [], rules: [{ id: 4, ruleCode: 'STB_04', dimension: 2,
      name: '店鋪標籤-金牌', description: '金牌店鋪身份標籤加分', mode: 1, score: 60, status: 1, builtin: 1 }] })
    await mount()
    fireEvent.click(screen.getByRole('tab', { name: /dimStore/ }))
    expect(screen.queryByText('STB_04')).not.toBeInTheDocument()
    expect(screen.queryByText('店鋪標籤-金牌')).not.toBeInTheDocument()
  })

  it('营业状态：打烊直接过滤、休息/爆单垫底排序，只有营业中可配分', async () => {
    await mount()
    fireEvent.click(screen.getByRole('tab', { name: /dimStore/ }))
    fireEvent.click(screen.getByText('STB_02'))
    // 打烊档：只说“直接過濾”，不出现分值
    const closedRow = screen.getByText('休息打烊').closest('.organic-score-row')
    expect(closedRow).toHaveTextContent('直接過濾')
    expect(closedRow).not.toHaveTextContent(/\d+ 分/)
    // 休息/爆单：不参与加减分，直接告知业务系统垫底排序
    for (const label of ['休息一會，馬上回來', '爆單了，暫停接單一會']) {
      const row = screen.getByText(label).closest('.organic-score-row')
      expect(row, label).toHaveTextContent('自動墊底')
      expect(row, label).not.toHaveTextContent(/\d+ 分/)
    }
    // 營業中仍按固定加分展示
    expect(screen.getByText('營業中狀態').closest('.organic-score-row')).toHaveTextContent('+100 分')

    // 编辑态：打烊与垫底两档都无下拉与数字输入，只剩营业中一个分值输入
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    const editRow = screen.getByText('休息打烊').closest('.organic-score-edit-tier')
    expect(editRow).toHaveTextContent('由系統直接過濾，不加載到瀑布流，無需配置分值')
    expect(editRow!.querySelector('.ant-input-number')).toBeNull()
    expect(editRow!.querySelector('.ant-select')).toBeNull()
    for (const label of ['休息一會，馬上回來', '爆單了，暫停接單一會']) {
      const bottomRow = screen.getByText(label).closest('.organic-score-edit-tier')
      expect(bottomRow, label).toHaveTextContent('系統自動墊底排序，排在正常參與排序的商家之後，無需配置加減分')
      expect(bottomRow!.querySelector('.ant-input-number'), label).toBeNull()
      expect(bottomRow!.querySelector('.ant-select'), label).toBeNull()
    }
    expect(screen.getAllByPlaceholderText('輸入分數').length).toBe(1)
    // 營業中：加/减分下拉鎖定固定加分，不允許改成減分
    const operatingRow = screen.getByText('營業中狀態').closest('.organic-score-edit-tier')
    expect(operatingRow!.querySelector('.ant-select')).toHaveClass('ant-select-disabled')
    expect(api.update).not.toHaveBeenCalled()
  }, 120000)

  it('过滤档以库内 condition 标记为准，后端数据标到哪档就哪档不配分', async () => {
    // 模拟迁移后的数据：休息一會也被标为 filtered（验证不依赖前端常量位置）
    api.fetch.mockResolvedValue({ dimensions: [], rules: [{ id: 2, ruleCode: 'STB_02', dimension: 2,
      name: '營業狀態', description: '四檔狀態', mode: 6, score: 0, status: 1, builtin: 1,
      conditionItems: JSON.stringify([{ condition: 'bonus', score: 100 }, { condition: 'filtered', score: 0 },
        { condition: 'deduction', score: 50 }, { condition: 'filtered', score: 0 }]) }] })
    await mount()
    fireEvent.click(screen.getByRole('tab', { name: /dimStore/ }))
    fireEvent.click(screen.getByText('STB_02'))
    // 第 2 档（休息一會）因数据标记而展示为过滤档，不再显示分值
    expect(screen.getByText('休息一會，馬上回來').closest('.organic-score-row')).toHaveTextContent('直接過濾')
    // 第 3 档未标记过滤：即使库里存的是減分，也按垫底口径展示，不出现分值
    expect(screen.getByText('爆單了，暫停接單一會').closest('.organic-score-row')).toHaveTextContent('自動墊底')
  }, 120000)

  it('出餐准时率按梯度配置：只读按率降序展示，编辑态可增删档', async () => {
    await mount()
    fireEvent.click(screen.getByRole('tab', { name: /dimStore/ }))
    fireEvent.click(screen.getByText('STB_05'))
    // 只读：按准时率档位展示分值，不再出现「超过均值即扣分」的旧口径
    expect(screen.getByText('出餐準時率 ≥ 100%').closest('.organic-score-row')).toHaveTextContent('+60 分')
    expect(screen.getByText('出餐準時率 ≥ 90%').closest('.organic-score-row')).toHaveTextContent('+40 分')
    expect(screen.queryByText(/當日出餐時間/)).not.toBeInTheDocument()

    // 编辑态：默认 5 档，可添加档位
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    expect(screen.getAllByLabelText(/檔準時率/).length).toBe(5)
    fireEvent.click(screen.getByRole('button', { hidden: true, name: '添加檔位' }))
    expect(screen.getAllByLabelText(/檔準時率/).length).toBe(6)
    expect(api.update).not.toHaveBeenCalled()
  }, 120000)

  it('修改人与操作按钮同组靠右，通用计分项与券类面板位置一致', async () => {
    api.fetch.mockResolvedValue({ dimensions: [], rules: [
      { id: 2, ruleCode: 'COM_02', dimension: 1, name: '減免運費', description: '固定加分', mode: 1, score: 20, status: 1, builtin: 1,
        updatedBy: 'system', updateTime: '2026-09-23 19:49:55' },
      { id: 3, ruleCode: 'COM_03', dimension: 1, name: '進店領券', description: '券類', mode: 4, score: 2, status: 1, builtin: 1,
        updatedBy: 'system', updateTime: '2026-08-10 11:24:55' },
    ] })
    await mount()

    // 通用计分项：修改人必须和「編輯」在同一个靠右分组内（旧写法两个 margin-left:auto 会把说明挤到居中）
    fireEvent.click(screen.getByText('COM_02'))
    const genericGroup = rightAlignedGroup(screen.getByText('修改人：'))
    expect(genericGroup).toBeTruthy()
    expect(within(genericGroup!).getByRole('button', { hidden: true, name: /編\s*輯/ })).toBeInTheDocument()

    // 券类 v1 面板：同一位置语义（修改人在试算／編輯按钮左侧同组）
    fireEvent.click(screen.getByText('COM_03'))
    const panel = within(screen.getByLabelText('進店領券計分配置'))
    const couponGroup = rightAlignedGroup(panel.getByText('修改人：'))
    expect(couponGroup).toBeTruthy()
    expect(within(couponGroup!).getByRole('button', { hidden: true, name: '試算與說明' })).toBeInTheDocument()
    expect(within(couponGroup!).getByRole('button', { hidden: true, name: /編\s*輯/ })).toBeInTheDocument()
  }, 120000)
})

/** 向上找到第一个带 margin-left:auto 的靠右分组容器 */
function rightAlignedGroup(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement
  while (node && !/margin-left:\s*auto/.test(node.getAttribute('style') ?? '')) node = node.parentElement
  return node
}

describe('计分项名称与品牌可见性', () => {
  it('后端旧名称带「-按金額」后缀，界面统一展示新名称', async () => {
    api.fetch.mockResolvedValue({ dimensions: [], rules: [
      { id: 6, ruleCode: 'COM_06', dimension: 1, name: '會員紅包-按金額', description: '舊名称', mode: 4, score: 2, status: 1, builtin: 1 },
      { id: 7, ruleCode: 'COM_07', dimension: 1, name: '閃蜂官方神券-按金額', description: '舊名称', mode: 4, score: 2, status: 1, builtin: 1 },
    ] })
    await mount(false, AppType.SHANFENG)
    expect(screen.getByText('平台會員紅包')).toBeInTheDocument()
    expect(screen.getByText('平台官方神券')).toBeInTheDocument()
    expect(screen.queryByText(/按金額/)).not.toBeInTheDocument()
    // 旧显示名不得残留
    expect(screen.queryByText('會員紅包')).not.toBeInTheDocument()
    expect(screen.queryByText('閃蜂官方神券')).not.toBeInTheDocument()
  })

  it('新客立减计分项后端旧名称统一展示为「門店新客券」', async () => {
    api.fetch.mockResolvedValue({ dimensions: [], rules: [
      { id: 4, ruleCode: 'COM_04', dimension: 1, name: '新客立減', description: '舊名称', mode: 1, score: 30, status: 1, builtin: 1 },
    ] })
    await mount(false, AppType.SHANFENG)
    expect(screen.getByText('門店新客券')).toBeInTheDocument()
    expect(screen.queryByText('新客立減')).not.toBeInTheDocument()
  })

  it('金字招牌计分项后端旧名称带「購買廣告-」前缀，界面统一展示新名称', async () => {
    api.fetch.mockResolvedValue({ dimensions: [], rules: [
      { id: 10, ruleCode: 'COM_10', dimension: 1, name: '購買廣告-金字招牌', description: '購買金字招牌廣告投放期內加分', mode: 1, score: 100, status: 1, builtin: 1 },
    ] })
    await mount(false, AppType.SHANFENG)
    expect(screen.getByText('金字招牌(廣告)')).toBeInTheDocument()
    expect(screen.queryByText('購買廣告-金字招牌')).not.toBeInTheDocument()
  })

  it('所屬品牌為 MFOOD 時不展示平台官方神券，同維度其他計分项仍在', async () => {
    await mount(false, AppType.MFOOD)
    expect(screen.queryByText('COM_07')).not.toBeInTheDocument()
    expect(screen.getByText('COM_06')).toBeInTheDocument()
  })

  it('所屬品牌為閃蜂時仍展示平台官方神券', async () => {
    await mount(false, AppType.SHANFENG)
    expect(screen.getByText('COM_07')).toBeInTheDocument()
  })
})

describe('自然流量计分展示一致性', () => {
  it.each([
    [ScoreDimension.COMMERCIAL, 'dimCommercial'],
    [ScoreDimension.STORE, 'dimStore'],
    [ScoreDimension.PLATFORM, 'dimPlatform'],
  ] as const)('%s 维度所有非空计分项复用统一行、标签和分值', async (dimension, tab) => {
    await mount(true)
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(tab) }))
    const rules = DEFAULT_ORGANIC_SCORE_RULES.filter(rule => rule.dimension === dimension)
    for (const rule of rules) {
      fireEvent.click(screen.getByText(rule.id))
      const body = screen.getByText(rule.id).parentElement?.parentElement?.querySelector('.algorithm-form__rule-body')
      expect(body, rule.id).toBeTruthy()
      if (rule.id === 'STB_ACT' || rule.id === 'COM_10') {
        // 两者都靠运营自行增删条目，未配置时以空态引导而非统一行结构
        expect(body, rule.id).toHaveTextContent('尚未配置')
      } else {
        const rows = body!.querySelectorAll('.organic-score-row')
        expect(rows.length, rule.id).toBeGreaterThan(0)
        for (const row of rows) {
          expect(row.querySelector('.organic-score-row__condition')).toBeTruthy()
          expect(row.querySelector('.organic-score-value__badge')).toBeTruthy()
          expect(row.querySelector('.organic-score-value__number')).toBeTruthy()
          expect(row.closest('.organic-score-panel')).toBeTruthy()
        }
      }
      fireEvent.click(screen.getByText(rule.id))
    }
    expect(api.update).not.toHaveBeenCalled()
  }, 60000)

  it('区域切换保留各区域独立梯度，扣分展示使用统一负号', async () => {
    const rule = DEFAULT_ORGANIC_SCORE_RULES.find(item => item.id === 'PLT_03')!
    api.fetch.mockResolvedValue({ dimensions: [], rules: [{ ...rule, ruleCode: rule.id, builtin: 1,
      regionConfigs: JSON.stringify({ MACAU: { statDays: 30, tiers: [{ threshold: 50, score: 20 }] },
        TAIPA: { statDays: 7, tiers: [{ threshold: 100, score: 45 }] } }) }] })
    await mount(true)
    fireEvent.click(screen.getByRole('tab', { name: /dimPlatform/ }))
    fireEvent.click(screen.getByText('PLT_03'))
    expect(screen.getByText('+20 分')).toHaveClass('organic-score-value__number')
    fireEvent.click(screen.getByText('氹仔區域'))
    expect(screen.getByText('+45 分')).toHaveClass('organic-score-value__number')
    expect(screen.queryByText('+20 分')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('澳門區域'))
    expect(screen.getByText('+20 分')).toBeInTheDocument()
  })

  it('统一正负分、零值和倍率格式，不出现双负号或将倍率标作分', () => {
    render(<>
      <ScoreRow label="固定奖励" score={20} />
      <ScoreRow label="负数扣分" score={-30} kind="deduction" />
      <ScoreRow label="正数扣分配置" score={40} kind="deduction" />
      <ScoreRow label="零分" score={0} />
      <ScoreRow label="倍率" score={0.5} kind="coefficient" />
    </>)
    expect(screen.getByText('+20 分')).toHaveClass('organic-score-value__number')
    expect(screen.getByText('-30 分').parentElement).toHaveClass('organic-score-value--deduction')
    expect(screen.getByText('-40 分').parentElement).toHaveClass('organic-score-value--deduction')
    expect(screen.getByText('0 分')).toBeInTheDocument()
    expect(screen.getByText('×0.5').parentElement).toHaveClass('organic-score-value--multiplier')
  })
})
