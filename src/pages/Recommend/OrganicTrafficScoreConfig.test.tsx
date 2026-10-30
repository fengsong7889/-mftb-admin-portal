import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ConfigProvider, Form, message } from 'antd'
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

const api = vi.hoisted(() => ({ fetch: vi.fn(), update: vi.fn(), create: vi.fn(), toggle: vi.fn(), remove: vi.fn(), algorithms: vi.fn() }))
/** localStorage 快取层的規則值（本页初始態）; 单测按用例改写, 以验证「後端真值覆盖本地快取」 */
const ruleValueMock = vi.hoisted(() => vi.fn(() => true))
vi.mock('@/api/organicScore', () => ({
  fetchOrganicScoreConfig: api.fetch, updateOrganicRule: api.update,
  createOrganicRule: api.create, toggleOrganicRuleStatus: api.toggle, deleteOrganicRule: api.remove,
  updateDimensionWeights: vi.fn(),
}))
/** 後端 sys_config 開關：默認 null（讀不到=走默認態），單測按用例改寫返回值 */
const sysConfigMock = vi.hoisted(() => vi.fn().mockResolvedValue(null))
vi.mock('@/api/systemConfig', () => ({ getSystemConfig: sysConfigMock, getSystemConfigSilent: sysConfigMock, updateSystemConfig: vi.fn() }))
vi.mock('@/api/store', () => ({ fetchStores: vi.fn().mockResolvedValue({ records: [] }) }))
vi.mock('@/api/adPromotion', () => ({ fetchAdAlgorithms: api.algorithms, fetchAdAlgorithmByCode: vi.fn() }))
vi.mock('@/hooks/useSystemRules', () => ({ getSystemRuleValue: ruleValueMock }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('antd', async importOriginal => ({
  ...await importOriginal<typeof import('antd')>(),
  message: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

function LocationIndicator() {
  const location = useLocation()
  return <output aria-label="当前位置">{location.pathname + location.search}</output>
}

/** 流量均衡面板文案已接 i18n；测试的 t mock 返回 key，故断言用 key 串（与 STB_07 用例一致）。 */
const TB = (k: string) => `organicTrafficScore.trafficBalance.${k}`

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
  api.algorithms.mockResolvedValue({ records: [] })
  sysConfigMock.mockResolvedValue(null)
  ruleValueMock.mockReturnValue(true)
})

describe('維度權重與計算配置區：受「算法配置規則」開關控制', () => {
  /** 開關 key（後端 sys_config），關閉後整卡不得渲染 */
  const WEIGHT_KEY = 'organic_traffic_show_dimension_weight'
  const weightSectionLabel = 'organicTrafficScore.dimensionWeightConfig'

  it('本地快取還是開、後端已回 false → 必須以對端為準隐藏', async () => {
    ruleValueMock.mockReturnValue(true)
    sysConfigMock.mockImplementation((key: string) =>
      Promise.resolve(key === WEIGHT_KEY ? 'false' : null))
    await mount()
    // 折疊卡以带 aria-label 的按钮为标题; 隐藏后该按钮与整卡均不应存在
    await waitFor(() => expect(screen.queryByRole('button', { name: weightSectionLabel })).not.toBeInTheDocument())
    expect(screen.queryByText('organicTrafficScore.saveWeight')).not.toBeInTheDocument()
    // 其余維度評分項配置照常展示，開關只藏高級配置區
    expect(screen.getByText('organicTrafficScore.pageTitle')).toBeInTheDocument()
  })

  it('本地快取是舊的關、後端已回 true → 照常顯示', async () => {
    ruleValueMock.mockReturnValue(false)
    sysConfigMock.mockImplementation((key: string) =>
      Promise.resolve(key === WEIGHT_KEY ? 'true' : null))
    await mount()
    await waitFor(() => expect(screen.getByRole('button', { name: weightSectionLabel })).toBeInTheDocument())
  })

  it('讀不到對端值時走本地快取, 不强制隐藏也不弹错', async () => {
    // 必须走静默讀(getSystemConfigSilent): 持有算法庫但无 rule-algorithm 权限时不能每次进页弹一句 403
    ruleValueMock.mockReturnValue(true)
    sysConfigMock.mockResolvedValue(null)
    await mount()
    await waitFor(() => expect(sysConfigMock).toHaveBeenCalledWith(WEIGHT_KEY))
    expect(screen.getByRole('button', { name: weightSectionLabel })).toBeInTheDocument()
  })
})

describe('通用计分项：模块卡片与减免运费开关', () => {
  it('减免运费走专属面板：报名计分 + 人工配置的门槛档位', async () => {
    await mount()
    fireEvent.click(screen.getByText('COM_02'))
    const panel = within(screen.getByLabelText('減免運費計分配置'))
    // 报名计分：平台活动与商家自建活动最终只生效一个，报名即给分（默认启用，可用「啟用報名分」开关停用）
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

  it('COM_02/COM_06 報名分可停用：只讀態回顯開關狀態，試算不計報名分並隨配置落庫', async () => {
    api.update.mockResolvedValue({})
    await mount()
    // COM_02 減免運費：編輯態停用報名分開關，保存後只讀態回顯停用狀態
    fireEvent.click(screen.getByText('COM_02'))
    const fsPanel = within(screen.getByLabelText('減免運費計分配置'))
    fireEvent.click(fsPanel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    fireEvent.click(fsPanel.getByRole('switch', { name: '啟用報名分' }))
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(fsPanel.getByRole('switch', { name: '啟用報名分' })).not.toBeChecked()
    // 灰顯行保留原分值 20，但標籤改為已停用
    expect(fsPanel.getByText('報名分已停用').closest('.organic-score-row')).toHaveTextContent('+20 分')
    // 試算：門檻 30 元命中 15 分檔，報名分停發 → 總分 15
    fireEvent.click(fsPanel.getByRole('button', { hidden: true, name: '試算與說明' }))
    expect(within(screen.getByRole('dialog')).getByLabelText('單項總得分')).toHaveTextContent('15 分')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { hidden: true, name: /[关關]\s*[闭閉]/ }))
    const savedFs = JSON.parse(api.update.mock.calls[0][1].freeShippingConfig)
    expect(savedFs.enrollmentEnabled).toBe(false)

    // COM_06 平台會員紅包：同一開關，停用後只剩加碼分
    fireEvent.click(screen.getByText('COM_06'))
    const mbPanel = within(screen.getByLabelText('平台會員紅包計分配置'))
    fireEvent.click(mbPanel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    fireEvent.click(mbPanel.getByRole('switch', { name: '啟用報名分' }))
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(mbPanel.getByText('報名分已停用').closest('.organic-score-row')).toHaveTextContent('+10 分')
    // 試算：加碼 10 元命中 10 分檔，報名分停發 → 總分 10
    fireEvent.click(mbPanel.getByRole('button', { hidden: true, name: '試算與說明' }))
    expect(within(screen.getByRole('dialog')).getByLabelText('單項總得分')).toHaveTextContent('10 分')
    const savedMb = JSON.parse(api.update.mock.calls[1][1].memberBonusConfig)
    expect(savedMb.enrollmentEnabled).toBe(false)
  }, 180000)

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
    // 两项旧平台规则由统一草稿替代，合并后的展示与交互由下方专项用例覆盖。
    const rules = DEFAULT_ORGANIC_SCORE_RULES.filter(rule => rule.dimension === dimension && !['PLT_03', 'PLT_04'].includes(rule.id))
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

  it('旧区域配置不被误当作流量均衡新口径，详情只读但区域可切换', async () => {
    const legacy = DEFAULT_ORGANIC_SCORE_RULES.filter(item => ['PLT_03', 'PLT_04'].includes(item.id))
    api.fetch.mockResolvedValue({ dimensions: [], rules: legacy.map(rule => ({ ...rule, ruleCode: rule.id, builtin: 1,
      blockedMerchants: JSON.stringify(['OLD_STORE']),
      regionConfigs: JSON.stringify({ MACAU: { statDays: 30, tiers: [{ threshold: 50, score: 20 }] },
        TAIPA: { statDays: 7, tiers: [{ threshold: 100, score: 45 }] } }) })) })
    await mount(true)
    fireEvent.click(screen.getByRole('tab', { name: /dimPlatform/ }))
    expect(screen.getByText('PLT_03')).toHaveClass('ant-tag-blue')
    expect(screen.queryByText('合併草稿')).not.toBeInTheDocument()
    expect(screen.queryByText('PLT_04')).not.toBeInTheDocument()
    expect(screen.getAllByText('流量均衡')).toHaveLength(1)
    fireEvent.click(screen.getByText('流量均衡'))
    const panel = within(screen.getByLabelText(TB('panelAria')))
    expect(panel.queryByText('OLD_STORE')).not.toBeInTheDocument()
    expect(panel.queryByText('+20 分')).not.toBeInTheDocument()
    expect(panel.queryByText('+45 分')).not.toBeInTheDocument()
    expect(panel.queryByRole('button', { name: TB('editAria') })).not.toBeInTheDocument()
    expect(panel.getByText(TB('cancelNotCounted'))).toBeInTheDocument()
    fireEvent.click(panel.getByText('氹仔區域'))
    expect(panel.getByRole('radio', { name: '氹仔區域' })).toBeChecked()
    fireEvent.click(panel.getByText('澳門區域'))
    expect(panel.getByRole('radio', { name: '澳門區域' })).toBeChecked()
    const visibleRows = panel.getAllByText('+80 分').filter(node => !node.closest('[hidden]'))
    expect(visibleRows).toHaveLength(1)
    expect(visibleRows[0]).toHaveClass('organic-score-value__number')
    expect(api.update).not.toHaveBeenCalled()
    expect(api.toggle).not.toHaveBeenCalled()
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

/** 展开流量均衡面板（真实 PLT_03 行） */
async function openBalancePanel() {
  await mount()
  fireEvent.click(screen.getByRole('tab', { name: /dimPlatform/ }))
  fireEvent.click(screen.getByText('流量均衡'))
  return within(screen.getByLabelText(TB('panelAria')))
}

async function openBalanceEditor() {
  const panel = await openBalancePanel()
  fireEvent.click(panel.getByRole('button', { name: TB('editAria') }))
  return panel
}

function fillBalanceThresholds(panel: ReturnType<typeof within>, region = '澳門區域', values = [20, 50, 100, 200]) {
  values.forEach((value, index) => {
    fireEvent.change(panel.getByLabelText(`${region}第 ${index + 1} 檔訂單上限`), { target: { value: String(value) } })
  })
}

/** 保存时后端回写整行 VO：echo 提交的 trafficBalanceConfig，以便只读态反映已保存值 */
function mockBalanceUpdate() {
  api.update.mockImplementation((_id: unknown, payload: { trafficBalanceConfig?: string }) => Promise.resolve({
    id: 1, ruleCode: 'PLT_03', dimension: 4, name: '流量均衡', description: 'x', mode: 5, score: 0,
    status: 1, builtin: 1, trafficBalanceConfig: payload.trafficBalanceConfig,
  }))
}

describe('流量均衡：统一口径持久化到 PLT_03', () => {
  it('默认7天60分钟，取消订单固定排除、退款可配置，底部按钮与其他评分项一致', async () => {
    const panel = await openBalanceEditor()
    expect(panel.getByLabelText(TB('statDaysAria'))).toHaveValue('7')
    expect(panel.getByLabelText(TB('refreshAria'))).toHaveValue('60')
    expect(panel.getByRole('checkbox', { name: TB('orderDelivery') })).toBeChecked()
    expect(panel.getByRole('checkbox', { name: TB('orderPickup') })).toBeChecked()
    expect(panel.getByRole('switch', { name: TB('includeRefunded') })).not.toBeChecked()
    fireEvent.click(panel.getByRole('switch', { name: TB('includeRefunded') }))
    expect(panel.getByRole('switch', { name: TB('includeRefunded') })).toBeChecked()
    expect(panel.getByText(TB('cancelNotCounted'))).toBeInTheDocument()
    expect(panel.queryByText(/部分退款/)).not.toBeInTheDocument()
    const saveButton = panel.getByRole('button', { name: /trafficBalance\.save$/ })
    expect(saveButton).toHaveClass('ant-btn-sm', 'ant-btn-primary')
    expect(panel.getByRole('button', { name: TB('cancel') }).parentElement).toBe(saveButton.parentElement)
    expect(saveButton.closest('.form-footer')).toBeNull()
    // 编辑态底部：取消/保存居中，不再重复放狀態开关（啟停統一由卡片頭部開關負責）
    expect(panel.queryByRole('switch', { name: TB('editStatusAria') })).not.toBeInTheDocument()
    expect(saveButton.closest('.organic-score-toolbar')).toHaveStyle({ justifyContent: 'center' })
    expect(panel.queryByText('參與減免運費')).not.toBeInTheDocument()
    expect(panel.queryByText('參與會員紅包')).not.toBeInTheDocument()
    expect(api.update).not.toHaveBeenCalled()
  })

  it('只读编辑按钮为橙色描边', async () => {
    const panel = await openBalancePanel()
    expect(panel.getByRole('button', { name: TB('editAria') })).toHaveStyle({ color: '#E8720C', borderColor: '#E8720C' })
    expect(api.update).not.toHaveBeenCalled()
  })

  it('保存提交后端：整行覆盖 PLT_03 并携带 trafficBalanceConfig', async () => {
    mockBalanceUpdate()
    const panel = await openBalanceEditor()
    fillBalanceThresholds(panel)
    fillBalanceThresholds(panel, '氹仔區域', [10, 30, 60, 120])
    fireEvent.click(panel.getByRole('button', { name: /trafficBalance\.save$/ }))
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1))
    const [id, payload] = api.update.mock.calls[0]
    expect(id).toBe('PLT_03')
    expect(payload).toEqual(expect.objectContaining({ dimension: 4, name: '流量均衡', mode: 5, status: 1 }))
    expect(payload.trafficBalanceConfig).toContain('"maxOrders":20')
    expect(payload.trafficBalanceConfig).toContain('"maxOrders":10')
    expect(payload.trafficBalanceConfig).toContain('"orderTypes":["DELIVERY","PICKUP"]')
    // 保存成功后回到只读态（重新出现编辑按钮）
    await waitFor(() => expect(panel.getByRole('button', { name: TB('editAria') })).toBeInTheDocument())
  })

  it('外卖和自取都不选时拦截，不提交后端', async () => {
    const panel = await openBalanceEditor()
    fillBalanceThresholds(panel)
    fillBalanceThresholds(panel, '氹仔區域', [10, 30, 60, 120])
    fireEvent.click(panel.getByRole('checkbox', { name: TB('orderDelivery') }))
    fireEvent.click(panel.getByRole('checkbox', { name: TB('orderPickup') }))
    fireEvent.click(panel.getByRole('button', { name: /trafficBalance\.save$/ }))
    expect(await panel.findByText(TB('ruleOrderType'))).toBeInTheDocument()
    expect(api.update).not.toHaveBeenCalled()
  })

  it('隐藏区域也必须配置，提示后切到有错的区域且不提交', async () => {
    const panel = await openBalanceEditor()
    fillBalanceThresholds(panel)
    fireEvent.click(panel.getByRole('button', { name: /trafficBalance\.save$/ }))
    expect(await panel.findByText(TB('errBadThreshold'))).toBeVisible()
    expect(panel.getByRole('radio', { name: '氹仔區域' })).toBeChecked()
    expect(api.update).not.toHaveBeenCalled()
  })

  it('拒绝门槛重复与分值反向，修正后合法输入可提交', async () => {
    mockBalanceUpdate()
    const panel = await openBalanceEditor()
    fillBalanceThresholds(panel, '澳門區域', [0, 0, 100, 200])
    fillBalanceThresholds(panel, '氹仔區域')
    const save = () => fireEvent.click(panel.getByRole('button', { name: /trafficBalance\.save$/ }))
    save()
    expect(await panel.findByText(TB('errNotIncreasing'))).toBeVisible()
    expect(api.update).not.toHaveBeenCalled()
    fireEvent.change(panel.getByLabelText('澳門區域第 2 檔訂單上限'), { target: { value: '50' } })
    fireEvent.change(panel.getByLabelText('澳門區域第 2 檔加分'), { target: { value: '90' } })
    save()
    expect(await panel.findByText(TB('errScoreReversed'))).toBeVisible()
    expect(api.update).not.toHaveBeenCalled()
    fireEvent.change(panel.getByLabelText('澳門區域第 2 檔加分'), { target: { value: '60' } })
    save()
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1))
  })

  it('取消编辑不提交后端', async () => {
    const panel = await openBalanceEditor()
    fireEvent.change(panel.getByLabelText(TB('statDaysAria')), { target: { value: '28' } })
    fireEvent.click(panel.getByRole('button', { name: TB('cancel') }))
    expect(api.update).not.toHaveBeenCalled()
    await waitFor(() => expect(panel.getByRole('button', { name: TB('editAria') })).toBeInTheDocument())
  })
})

describe('店鋪綜合分／訂單取消率／活動加分：新計分口径', () => {
  /** 展开店铺维度某个计分项卡片 */
  const openStoreRule = (code: string) => {
    fireEvent.click(screen.getByRole('tab', { name: /dimStore/ }))
    fireEvent.click(screen.getByText(code))
  }

  it('店鋪綜合分：按星级梯度加分，不再有统计天数与逐档减分', async () => {
    await mount()
    openStoreRule('STB_03')
    // 五档默认梯度：分数越高加分越多，命中一档即停
    expect(screen.getAllByText(/organicTrafficScore.compositeScoreAtLeast/)).toHaveLength(5)
    for (const score of ['+50 分', '+40 分', '+30 分', '+15 分', '+5 分']) {
      expect(screen.getByText(score)).toBeInTheDocument()
    }
    // 旧口径不再出现：统计天数、逐档固定/動態扣分
    expect(screen.queryByText('organicTrafficScore.statDays')).not.toBeInTheDocument()
    expect(screen.queryByText(/-20 分|-50 分/)).not.toBeInTheDocument()
    expect(screen.getByText(/業務系統實時傳遞店鋪綜合分/)).toBeInTheDocument()
  }, 120000)

  it('店鋪綜合分编辑态：可增删档位、无统计天数，梯度反向被拦截且不写库', async () => {
    await mount()
    openStoreRule('STB_03')
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    expect(document.querySelectorAll('.organic-score-edit-row .ant-rate')).toHaveLength(5)
    expect(screen.queryByText('organicTrafficScore.statDays')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'organicTrafficScore.addTier' }))
    expect(document.querySelectorAll('.organic-score-edit-row .ant-rate')).toHaveLength(6)

    // 新檔（2.5 分档）给 99 分：违背「分数越高加分不得越低」，保存必须被拦下
    fireEvent.change(screen.getByLabelText('第 6 檔加分'), { target: { value: '99' } })
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    await waitFor(() => expect(message.warning).toHaveBeenCalledWith('店鋪綜合分越高，加分不得越低'))
    expect(api.update).not.toHaveBeenCalled()
  }, 120000)

  it('訂單取消率：统计天数 + 纳入单量门槛 + 取消率梯度加分，旧按次扣分入口不再存在', async () => {
    await mount()
    openStoreRule('STB_08')
    // 只读：三档加分，取消率越低加分越多
    expect(screen.getAllByText(/organicTrafficScore.cancelRateAtMost/)).toHaveLength(3)
    expect(screen.getByText('+30 分')).toBeInTheDocument()
    // 业务取数口径必须写在界面上：只算外卖单，用户与商家取消都计入
    expect(screen.getByText(/自取單不納入計算/)).toBeInTheDocument()
    expect(screen.getByText(/用戶取消還是商家取消/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    expect(screen.getByLabelText('訂單取消率統計天數')).toHaveValue('30')
    expect(screen.getByLabelText('納入門檻訂單量')).toHaveValue('30')
    expect(screen.queryByLabelText(/每單扣分|每取消一單/)).not.toBeInTheDocument()

    // 最宽的一档（5%）改成 99 分：「取消率上界越高，加分不得越多」被拦下
    fireEvent.change(screen.getByLabelText('第 3 檔分值'), { target: { value: '99' } })
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    await waitFor(() => expect(message.warning).toHaveBeenCalledWith('取消率上界越高，加分不得越多'))
    expect(api.update).not.toHaveBeenCalled()
  }, 120000)

  it('活動加分：下拉選中活動即帶出名稱與狀態，沒有查询按钮', async () => {
    api.algorithms.mockResolvedValue({ records: [
      { algoCode: 'SFZR20261029001', algoName: '自然流量加權', status: 1 },
      { algoCode: 'SFWD20261029002', algoName: '無敵星星', status: 2 },
    ] })
    api.update.mockResolvedValue({})
    await mount()
    openStoreRule('STB_ACT')
    expect(screen.getByText(/尚未配置活動/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    fireEvent.click(screen.getByRole('button', { name: 'organicTrafficScore.addActivity' }))
    // 旧的「输入算法ID + 點查询」入口已取消
    expect(screen.queryByRole('button', { name: /查\s*詢/ })).not.toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('combobox', { name: '第 1 行活動' }))
    const dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    expect(dropdown, '下拉未展开').toBeTruthy()
    fireEvent.click(within(dropdown as HTMLElement).getByText('自然流量加權（SFZR20261029001）'))

    // 选中即回填名称快照并展示状态，不需要额外点查询
    await waitFor(() => expect(screen.getByText('organicTrafficScore.activityStatusActive')).toBeInTheDocument())
    expect(screen.getByText('SFZR20261029001')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('第 1 行加分分值'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    await waitFor(() => expect(api.update).toHaveBeenCalled())
    expect(JSON.parse(api.update.mock.calls[0][1].activityItems))
      .toEqual([{ activityId: 'SFZR20261029001', activityName: '自然流量加權', score: 20 }])
  }, 120000)

  it('活動加分：已失效活动明确标注不加分', async () => {
    api.algorithms.mockResolvedValue({ records: [
      { algoCode: 'SFWD20261029002', algoName: '無敵星星', status: 2 },
    ] })
    api.fetch.mockResolvedValue({ dimensions: [], rules: [{ id: 99, ruleCode: 'STB_ACT', dimension: 2,
      name: '活動加分', description: '活動加分', mode: 1, score: 0, status: 1, builtin: 1,
      activityItems: JSON.stringify([{ activityId: 'SFWD20261029002', activityName: '無敵星星', score: 30 }]) }] })
    await mount()
    openStoreRule('STB_ACT')
    // 状态非「進行中」的行直接告诉运营：本项不加分
    expect(screen.getByText('organicTrafficScore.activityStatusExpired')).toBeInTheDocument()
    expect(screen.getByText('無敵星星')).toBeInTheDocument()
  }, 120000)
})

describe('出餐時長（STB_07）：固定加分 + 自動校正開關落庫', () => {
  /** 库内仍是旧「出餐超時·按次计罚」口径的行（迁移前的真实形态） */
  const legacyMealTimeRule = { id: 7, ruleCode: 'STB_07', dimension: 2,
    name: '出餐超時', description: '統計天數內（不含當天），每超時一單固定扣分，即時生效',
    mode: 3, score: 0, statDays: 7, deductionPerOrder: 70, status: 1, builtin: 1 }

  const openStoreRule = (code: string) => {
    fireEvent.click(screen.getByRole('tab', { name: /dimStore/ }))
    fireEvent.click(screen.getByText(code))
  }

  it('旧按次计罚行改走「開啟自動校正 + 固定加分」面板，超时接单不再展示', async () => {
    api.fetch.mockResolvedValue({ dimensions: [], rules: [legacyMealTimeRule,
      { id: 9, ruleCode: 'STB_09', dimension: 2, name: '超時接單', description: '每超時一單扣分',
        mode: 3, score: 0, statDays: 7, deductionPerOrder: 60, status: 1, builtin: 1 }] })
    await mount()
    // 已下架的超時接單：后端残留数据也不再展示
    expect(screen.queryByText('STB_09')).not.toBeInTheDocument()
    expect(screen.queryByText('超時接單')).not.toBeInTheDocument()

    openStoreRule('STB_07')
    expect(screen.getByText('出餐時長')).toBeInTheDocument()
    expect(screen.queryByText('出餐超時')).not.toBeInTheDocument()
    expect(screen.getByText('organicTrafficScore.mealTimeAutoCorrectLabel')).toBeInTheDocument()
    // 分值徽标统一由 ScoreRow 走 display.* 文案（固定加分），不再用页面级 fixedBonusLabel 键
    expect(screen.getByText('organicTrafficScore.display.bonus')).toBeInTheDocument()
    // 旧按次计罚的可配入口不再存在（评分说明的文案由后端迁移 organic:stb07-meal-time-v1 收敛，前端不复制旧文案作保底）
    expect(screen.queryByLabelText(/每單扣分|每超時一單/)).not.toBeInTheDocument()
    expect(screen.queryByText('organicTrafficScore.statDays')).not.toBeInTheDocument()
  }, 120000)

  it('关掉自动校正保存时写显式停用值，重新加载不会被默认开启顶掉', async () => {
    api.fetch.mockResolvedValue({ dimensions: [], rules: [legacyMealTimeRule] })
    api.update.mockResolvedValue({ ...legacyMealTimeRule, prerequisites: '停用自動校正' })
    await mount()
    openStoreRule('STB_07')

    fireEvent.click(screen.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    const toggle = screen.getByRole('switch', { name: 'organicTrafficScore.mealTimeAutoCorrectAria' })
    // 未播种行按默认开启展示
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))

    await waitFor(() => expect(api.update).toHaveBeenCalled())
    // 停用必须存成显式值：存空会被 loadConfig 的默认开启兜底重新打开
    expect(api.update.mock.calls[0][1].prerequisites).toBe('停用自動校正')
    expect(api.update.mock.calls[0][1].mode).toBe(1)
  }, 120000)

  it('库内已存停用值时只读展示为停用，不被兜底打开', async () => {
    api.fetch.mockResolvedValue({ dimensions: [], rules: [{ ...legacyMealTimeRule,
      name: '出餐時長', mode: 1, score: 50, statDays: null, deductionPerOrder: null,
      prerequisites: '停用自動校正' }] })
    await mount()
    openStoreRule('STB_07')
    expect(screen.getByRole('switch', { name: 'organicTrafficScore.mealTimeAutoCorrectAria' }))
      .toHaveAttribute('aria-checked', 'false')
  }, 120000)
})
