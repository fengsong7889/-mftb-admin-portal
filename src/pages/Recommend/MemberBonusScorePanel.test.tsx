import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ConfigProvider, Form, message } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrganicTrafficScoreConfig from './OrganicTrafficScoreConfig'
import { AppType } from '@mftb/contracts/recommendConstants'
import {
  DEFAULT_MEMBER_BONUS_SCORE_CONFIG, computeMemberBonusScore,
  normalizeMemberBonusScoreConfig, validateMemberBonusScoreConfig,
} from './organicTrafficConfig'

const api = vi.hoisted(() => ({ fetch: vi.fn(), update: vi.fn(), create: vi.fn(), toggle: vi.fn(), remove: vi.fn() }))
vi.mock('@/api/organicScore', () => ({
  fetchOrganicScoreConfig: api.fetch, updateOrganicRule: api.update,
  createOrganicRule: api.create, toggleOrganicRuleStatus: api.toggle, deleteOrganicRule: api.remove,
  updateDimensionWeights: vi.fn(),
}))
vi.mock('@/api/systemConfig', () => ({ getSystemConfig: vi.fn().mockResolvedValue(null), getSystemConfigSilent: vi.fn().mockResolvedValue(null), updateSystemConfig: vi.fn() }))
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

/** 展开平台会员红包计分面板（COM_06） */
function openPanel() {
  fireEvent.click(screen.getByText('COM_06'))
  return within(screen.getByLabelText('平台會員紅包計分配置'))
}

beforeEach(() => {
  vi.clearAllMocks()
  api.fetch.mockResolvedValue({ rules: [], dimensions: [] })
})

describe('平台会员红包计分纯函数', () => {
  it('默认档位合法，按商家加码金额命中最高一档，分数不累加', () => {
    expect(validateMemberBonusScoreConfig(DEFAULT_MEMBER_BONUS_SCORE_CONFIG)).toBeNull()
    // 未加码 / 未达首档：只拿报名分
    expect(computeMemberBonusScore(DEFAULT_MEMBER_BONUS_SCORE_CONFIG, 0)).toMatchObject({ matchedTier: undefined, bonusScore: 0, total: 10 })
    expect(computeMemberBonusScore(DEFAULT_MEMBER_BONUS_SCORE_CONFIG, 4)).toMatchObject({ bonusScore: 0, total: 10 })
    // 命中档位：加码越多分越高，只取命中档而不是逐档累加
    expect(computeMemberBonusScore(DEFAULT_MEMBER_BONUS_SCORE_CONFIG, 5)).toMatchObject({ bonusScore: 5, total: 15 })
    expect(computeMemberBonusScore(DEFAULT_MEMBER_BONUS_SCORE_CONFIG, 10)).toMatchObject({ bonusScore: 10, total: 20 })
    expect(computeMemberBonusScore(DEFAULT_MEMBER_BONUS_SCORE_CONFIG, 50)).toMatchObject({ bonusScore: 50, total: 60 })
    // 超过末档仍取末档
    expect(computeMemberBonusScore(DEFAULT_MEMBER_BONUS_SCORE_CONFIG, 100)).toMatchObject({ bonusScore: 50, total: 60 })
  })

  it('硬校验加码递增与分值方向：加码越高分值不得更低', () => {
    const empty = { ...DEFAULT_MEMBER_BONUS_SCORE_CONFIG, bonusTiers: [] }
    expect(validateMemberBonusScoreConfig(empty)).toContain('至少需要一個加碼檔位')
    const zeroAmount = { ...DEFAULT_MEMBER_BONUS_SCORE_CONFIG, bonusTiers: [{ amount: 0, score: 5 }] }
    expect(validateMemberBonusScoreConfig(zeroAmount)).toContain('必須大於 0 元')
    const duplicate = { ...DEFAULT_MEMBER_BONUS_SCORE_CONFIG, bonusTiers: [{ amount: 5, score: 5 }, { amount: 5, score: 10 }] }
    expect(validateMemberBonusScoreConfig(duplicate)).toContain('加碼金額必須嚴格遞增')
    const reversed = { ...DEFAULT_MEMBER_BONUS_SCORE_CONFIG, bonusTiers: [{ amount: 5, score: 20 }, { amount: 10, score: 10 }] }
    expect(validateMemberBonusScoreConfig(reversed)).toContain('加碼金額越高，分值不得低於上一檔')
    // 分值持平合法
    expect(validateMemberBonusScoreConfig({ ...DEFAULT_MEMBER_BONUS_SCORE_CONFIG, bonusTiers: [{ amount: 5, score: 10 }, { amount: 10, score: 10 }] })).toBeNull()
    expect(validateMemberBonusScoreConfig({ ...DEFAULT_MEMBER_BONUS_SCORE_CONFIG, enrollmentScore: 101 })).toContain('報名分')
  })

  it('归一化后端配置：过滤非法档位与类型，缺失时回退默认模板', () => {
    const normalized = normalizeMemberBonusScoreConfig({
      enrollmentScore: 7,
      bonusTiers: [
        { amount: 10, score: 3 },
        null as unknown as { amount: number; score: number },
        { amount: Number.NaN, score: 1 },
      ],
    })
    expect(normalized.enrollmentScore).toBe(7)
    expect(normalized.bonusTiers).toEqual([{ amount: 10, score: 3 }])
    expect(normalizeMemberBonusScoreConfig(undefined)).toMatchObject({
      enrollmentScore: 10, bonusTiers: DEFAULT_MEMBER_BONUS_SCORE_CONFIG.bonusTiers,
    })
  })
})

describe('平台会员红包计分面板', () => {
  it('只读态展示报名分与加码档位，试算按加码金额查档', async () => {
    await mount()
    const panel = openPanel()
    expect(panel.getByText('報名分＋加碼分 · 加碼梯度')).toBeInTheDocument()
    expect(panel.getByText('滿足條件才給分').closest('.organic-score-row')).toHaveTextContent('+10 分')
    expect(panel.getByText('商家加碼 ≥ 10 元').closest('.organic-score-row')).toHaveTextContent('+10 分')
    expect(panel.getByText('商家加碼 ≥ 50 元').closest('.organic-score-row')).toHaveTextContent('+50 分')
    // 券类的门槛/力度口径不应出现在会员红包面板
    expect(panel.queryByText('門檻計分檔位')).not.toBeInTheDocument()
    expect(panel.queryByText('力度計分檔位')).not.toBeInTheDocument()

    fireEvent.click(panel.getByRole('button', { hidden: true, name: '試算與說明' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('20 分')
    fireEvent.click(dialog.getByRole('button', { name: '未加碼' }))
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('10 分')
    fireEvent.click(dialog.getByRole('button', { name: '加碼 50 元' }))
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('60 分')
    fireEvent.click(dialog.getByRole('button', { hidden: true, name: /[关關]\s*[闭閉]/ }))
    expect(api.update).not.toHaveBeenCalled()
  }, 120000)

  it('编辑态可增删加码档位并保存落库，分值倒挂被拦截', async () => {
    api.update.mockResolvedValue({})
    await mount()
    const panel = openPanel()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    expect(panel.getAllByText('當商家加碼 ≥')).toHaveLength(4)

    // 首档分值高于第二档：直接拦保存
    fireEvent.change(panel.getByLabelText('第 1 檔加碼分值'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(message.warning).toHaveBeenCalledWith(expect.stringContaining('加碼金額越高，分值不得低於上一檔'))
    expect(panel.getByText('加碼得分條件')).toBeInTheDocument()

    // 还原并新增一档：保存后回到只读态，配置随 member_bonus_config 落库
    fireEvent.change(panel.getByLabelText('第 1 檔加碼分值'), { target: { value: '5' } })
    fireEvent.click(panel.getByRole('button', { hidden: true, name: '添加加碼檔位' }))
    expect(panel.getAllByText('當商家加碼 ≥')).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(panel.getByText('商家加碼 ≥ 60 元').closest('.organic-score-row')).toHaveTextContent('+50 分')
    await waitFor(() => expect(panel.getByText(/已保存配置/)).toBeInTheDocument())
    const payload = api.update.mock.calls[0][1]
    const saved = JSON.parse(payload.memberBonusConfig)
    expect(saved.enrollmentScore).toBe(10)
    expect(saved.bonusTiers).toHaveLength(5)
    expect(saved.bonusTiers[4]).toEqual({ amount: 60, score: 50 })
    expect(payload.score).toBe(10)
  }, 120000)

  it('详情只读模式可试算，但没有编辑入口', async () => {
    await mount(true)
    const panel = openPanel()
    expect(panel.queryByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ })).not.toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: '試算與說明' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('20 分')
    expect(dialog.getByRole('button', { hidden: true, name: '重置試算' })).toBeEnabled()
  }, 120000)

  it('加载后端已保存的会员红包配置，不再回退示例模板', async () => {
    api.fetch.mockResolvedValue({ dimensions: [], rules: [{ id: 6, ruleCode: 'COM_06', dimension: 1,
      name: '平台會員紅包', description: '已保存口徑', mode: 1, score: 7, status: 1, builtin: 1,
      memberBonusConfig: JSON.stringify({ enrollmentScore: 7,
        bonusTiers: [{ amount: 3, score: 4 }, { amount: 15, score: 9 }] }) }] })
    await mount()
    const panel = openPanel()
    expect(panel.getByText(/已保存配置/)).toBeInTheDocument()
    expect(panel.getByText('滿足條件才給分').closest('.organic-score-row')).toHaveTextContent('+7 分')
    expect(panel.getByText('商家加碼 ≥ 15 元').closest('.organic-score-row')).toHaveTextContent('+9 分')
  }, 120000)
})
