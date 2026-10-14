import { fireEvent, render, screen, within } from '@testing-library/react'
import { ConfigProvider, Form } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SignboardScorePanel from './SignboardScorePanel'
import {
  DEFAULT_SIGNBOARD_SCORE_CONFIG, computeSignboardScore, validateSignboardScoreConfig,
  type SignboardScoreConfig,
} from './organicTrafficConfig'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('antd', async importOriginal => ({
  ...await importOriginal<typeof import('antd')>(),
  message: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

const CONFIG: SignboardScoreConfig = {
  items: [
    { labelType: 'hot', labelName: '熱門', score: 10 },
    { labelType: 'favorites', labelName: '收藏', score: 8 },
  ],
}
const DESCRIPTION = '商家購買金字招牌標籤後，按已購買且在投放期內的標籤逐個累加計分'

function mount(props: Partial<React.ComponentProps<typeof SignboardScorePanel>> = {}) {
  render(<ConfigProvider theme={{ token: { motion: false } }}>
    <SignboardScorePanel ruleName="金字招牌(廣告)" config={CONFIG} hasDraft={false} description={DESCRIPTION}
      onSave={() => undefined} {...props} />
  </ConfigProvider>)
  return within(screen.getByLabelText('金字招牌(廣告)計分配置'))
}

beforeEach(() => { vi.clearAllMocks() })

describe('金字招牌計分純函數', () => {
  it('持有標籤逐個累加，未配置分值的標籤不計分並回傳補配提示', () => {
    expect(computeSignboardScore(CONFIG, ['hot', 'favorites']).total).toBe(18)
    // 只買一個就只加一個的分
    expect(computeSignboardScore(CONFIG, ['favorites'])).toMatchObject({ total: 8, matched: [{ labelType: 'favorites' }] })
    // 一個都沒買 → 0 分
    expect(computeSignboardScore(CONFIG, []).total).toBe(0)
    // 買了但後台沒配分值的標籤：不計分，並列為待補配
    const partial = computeSignboardScore(CONFIG, ['hot', 'sales'])
    expect(partial.total).toBe(10)
    expect(partial.unconfigured).toEqual(['sales'])
    // 重複傳入同一標籤不重複計分
    expect(computeSignboardScore(CONFIG, ['hot', 'hot']).total).toBe(10)
  })

  it('校验拒绝重复标签、未选标签与越界分值', () => {
    expect(validateSignboardScoreConfig(CONFIG)).toBeNull()
    expect(validateSignboardScoreConfig({ items: [] })).toBeNull()
    expect(validateSignboardScoreConfig({
      items: [{ labelType: 'hot', labelName: '熱門', score: 10 }, { labelType: 'hot', labelName: '熱門', score: 5 }],
    })).toContain('重複配置')
    expect(validateSignboardScoreConfig({ items: [{ labelType: '', labelName: '', score: 10 }] })).toContain('請選擇招牌標籤')
    expect(validateSignboardScoreConfig({ items: [{ labelType: 'hot', labelName: '熱門', score: 1001 }] })).toContain('0～1000')
    expect(validateSignboardScoreConfig({ items: [{ labelType: 'hot', labelName: '熱門', score: 1.5 }] })).toContain('0～1000')
    // 默認配置為空清單（全部由運營自行增刪）
    expect(DEFAULT_SIGNBOARD_SCORE_CONFIG.items).toEqual([])
  })
})

/** 打开指定行的标签下拉（mousedown 必须落在 Select 内部 combobox input 上才能冒泡到 selector） */
function openSelect(panel: ReturnType<typeof within>, row: number) {
  fireEvent.mouseDown(panel.getByRole('combobox', { name: `第 ${row} 行招牌標籤` }))
}

/** 从当前展开的下拉里取选项，避开选中值区域里同名的文本 */
function optionInDropdown(text: string): HTMLElement {
  const dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
  expect(dropdown, '下拉未展开').toBeTruthy()
  return within(dropdown as HTMLElement).getByText(text)
}

describe('金字招牌計分面板', () => {
  it('只读态按统一行结构展示標籤分值，并标注口径与修改人', () => {
    const panel = mount({ updatedBy: 'system', updatedAt: '2026-09-23 19:49:55' })
    expect(panel.getByText('標籤計分 · 已購買且投放期內逐個累加')).toBeInTheDocument()
    expect(panel.getByText('標籤分值明細')).toBeInTheDocument()
    // 標籤行复用全站统一的 ScoreRow 结构
    expect(panel.getByText('🔥 熱門').closest('.organic-score-row')).toHaveTextContent('+10 分')
    expect(panel.getByText('❤️ 收藏').closest('.organic-score-row')).toHaveTextContent('+8 分')
    expect(panel.getByText(/公式：得分 = Σ 已購買且投放期內標籤的分值/)).toBeInTheDocument()
    expect(panel.getByText(/熱門 \+ 收藏 = 18 分/)).toBeInTheDocument()
    expect(panel.getByText(/僅對在投放期內的標籤計分/)).toBeInTheDocument()
    // 評分說明与其他计分项一样在详情尾部展示
    expect(panel.getByText(DESCRIPTION)).toBeInTheDocument()
    // 修改人与时间与通用计分项同位置（靠右成組）
    expect(panel.getByText('修改人：')).toBeInTheDocument()
    expect(panel.getByText('system')).toBeInTheDocument()
    expect(panel.getByText('2026-09-23 19:49:55')).toBeInTheDocument()
  })

  it('未配置标签时给空态引导，不出现空表格', () => {
    const panel = mount({ config: DEFAULT_SIGNBOARD_SCORE_CONFIG })
    expect(panel.getByText(/尚未配置任何標籤分值/)).toBeInTheDocument()
    expect(panel.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('试算按勾选逐个累加，全部取消后为 0 分并说明未命中', () => {
    const panel = mount()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: '試算與說明' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('18 分')
    // 取消勾选「收藏」→ 只剩熱門 10 分
    fireEvent.click(dialog.getByRole('checkbox', { name: '❤️ 收藏（+8 分）' }))
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('10 分')
    // 全部取消 → 0 分并说明未命中
    fireEvent.click(dialog.getByRole('checkbox', { name: '🔥 熱門（+10 分）' }))
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('0 分')
    expect(dialog.getByText('未命中任何已配置標籤，得分 0 分')).toBeInTheDocument()
    expect(dialog.getByText(/得分 = Σ（商家已購買且在投放期內的標籤分值）/)).toBeInTheDocument()
    expect(dialog.getByText(/標籤的滿足條件/)).toBeInTheDocument()
  })

  it('编辑态新增行未选标签时拦截保存；保存时上抛配置与评分说明', () => {
    const onSave = vi.fn()
    const panel = mount({ config: { items: [] }, onSave })
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /添加標籤/ }))
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    // 空标签行：校验拦截，不回调保存
    expect(onSave).not.toHaveBeenCalled()

    // 选中标签后保存成功，配置与评分说明一并上抛
    openSelect(panel, 1)
    fireEvent.click(optionInDropdown('🔥 熱門'))
    fireEvent.change(screen.getByLabelText('第 1 行標籤分值'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(onSave).toHaveBeenCalledWith({ items: [{ labelType: 'hot', labelName: '熱門', score: 12 }] }, DESCRIPTION)
  })

  it('已配置的标签在其他行下拉中禁用，避免同一标签配两档分', () => {
    const panel = mount()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /添加標籤/ }))
    openSelect(panel, 2)
    // 第二行下拉里「熱門」已被第一行占用，应处于禁用态
    const option = optionInDropdown('🔥 熱門').closest('.ant-select-item')
    expect(option).toHaveClass('ant-select-item-option-disabled')
  })

  it('详情只读模式（父级 Form disabled）下仍可试算，且无编辑入口', () => {
    render(<ConfigProvider theme={{ token: { motion: false } }}>
      <Form disabled>
        <SignboardScorePanel ruleName="金字招牌(廣告)" config={CONFIG} hasDraft={false} description={DESCRIPTION}
          readOnly updatedBy="system" onSave={() => undefined} />
      </Form>
    </ConfigProvider>)
    const panel = within(screen.getByLabelText('金字招牌(廣告)計分配置'))
    expect(panel.queryByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ })).not.toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: '試算與說明' }))
    expect(within(screen.getByRole('dialog')).getByLabelText('單項總得分')).toHaveTextContent('18 分')
  })
})
