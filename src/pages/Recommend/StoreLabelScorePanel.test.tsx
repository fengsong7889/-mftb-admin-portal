/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ConfigProvider, Form } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StoreLabelScorePanel from './StoreLabelScorePanel'
import {
  DEFAULT_STORE_LABEL_SCORE_CONFIG, STORE_LABELS, computeStoreLabelScore, validateStoreLabelScoreConfig,
  type StoreLabelScoreConfig,
} from './organicTrafficConfig'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('antd', async importOriginal => ({
  ...await importOriginal<typeof import('antd')>(),
  message: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

const CONFIG: StoreLabelScoreConfig = {
  items: [
    { labelValue: 'exclusive', labelName: '獨家', score: 40 },
    { labelValue: 'gold', labelName: '金牌', score: 20 },
  ],
}
const DESCRIPTION = '門店標籤由門店資料手動指定，命中當前標籤檔位即得分'

function mount(props: Partial<React.ComponentProps<typeof StoreLabelScorePanel>> = {}) {
  render(<ConfigProvider theme={{ token: { motion: false } }}>
    <StoreLabelScorePanel ruleName="門店標籤" config={CONFIG} hasDraft={false} description={DESCRIPTION}
      onSave={() => undefined} {...props} />
  </ConfigProvider>)
  return within(screen.getByLabelText('門店標籤計分配置'))
}

beforeEach(() => { vi.clearAllMocks() })

describe('門店標籤計分純函數', () => {
  it('標籤清單固定四選一（獨家/品牌/連鎖/金牌）', () => {
    expect(STORE_LABELS.map(item => item.label)).toEqual(['獨家', '品牌', '連鎖', '金牌'])
  })

  it('按當前標籤命中一檔即停，不累加、不兜底', () => {
    expect(computeStoreLabelScore(CONFIG, 'exclusive')).toMatchObject({ total: 40, unconfigured: false })
    expect(computeStoreLabelScore(CONFIG, 'gold').total).toBe(20)
    // 有標籤但後台未配分值：0 分并标记待补配
    expect(computeStoreLabelScore(CONFIG, 'chain')).toMatchObject({ total: 0, unconfigured: true })
    // 门店尚未指定标签：0 分且不算「未配置」（没有标签可补配）
    expect(computeStoreLabelScore(CONFIG, undefined)).toMatchObject({ total: 0, unconfigured: false })
  })

  it('校验拒绝重复标签、未选标签与越界分值', () => {
    expect(validateStoreLabelScoreConfig(CONFIG)).toBeNull()
    expect(validateStoreLabelScoreConfig({ items: [] })).toBeNull()
    expect(validateStoreLabelScoreConfig({
      items: [{ labelValue: 'gold', labelName: '金牌', score: 10 }, { labelValue: 'gold', labelName: '金牌', score: 5 }],
    })).toContain('重複配置')
    expect(validateStoreLabelScoreConfig({ items: [{ labelValue: '', labelName: '', score: 10 }] })).toContain('請選擇門店標籤')
    expect(validateStoreLabelScoreConfig({ items: [{ labelValue: 'gold', labelName: '金牌', score: 1001 }] })).toContain('0～1000')
    expect(validateStoreLabelScoreConfig({ items: [{ labelValue: 'gold', labelName: '金牌', score: 1.5 }] })).toContain('0～1000')
    // 默認配置為空清單（全部由運營自行增刪，對齊 COM_10）
    expect(DEFAULT_STORE_LABEL_SCORE_CONFIG.items).toEqual([])
  })
})

/** 打开指定行的标签下拉（mousedown 必须落在 Select 内部 combobox input 上才能冒泡到 selector） */
function openSelect(panel: ReturnType<typeof within>, row: number) {
  fireEvent.mouseDown(panel.getByRole('combobox', { name: `第 ${row} 行門店標籤` }))
}

/** 从当前展开的下拉里取选项，避开选中值区域里同名的文本 */
function optionInDropdown(text: string): HTMLElement {
  const dropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
  expect(dropdown, '下拉未展开').toBeTruthy()
  return within(dropdown as HTMLElement).getByText(text)
}

describe('門店標籤計分面板', () => {
  it('只读态按统一行结构展示標籤分值，并标注口径与修改人', () => {
    const panel = mount({ updatedBy: 'system', updatedAt: '2026-09-23 19:49:55' })
    expect(panel.getByText('標籤計分 · 按門店當前標籤命中一檔即停')).toBeInTheDocument()
    expect(panel.getByText('標籤分值明細')).toBeInTheDocument()
    // 標籤行复用全站统一的 ScoreRow 结构
    expect(panel.getByText('獨家').closest('.organic-score-row')).toHaveTextContent('+40 分')
    expect(panel.getByText('金牌').closest('.organic-score-row')).toHaveTextContent('+20 分')
    expect(panel.getByText(/公式：得分 = 門店當前標籤對應的分值/)).toBeInTheDocument()
    expect(panel.getByText(/金牌 = 20 分/)).toBeInTheDocument()
    expect(panel.getByText(/命中一檔即停、不累加/)).toBeInTheDocument()
    // 評分說明与其他计分项一样在详情尾部展示
    expect(panel.getByText(DESCRIPTION)).toBeInTheDocument()
    expect(panel.getByText('system')).toBeInTheDocument()
    expect(panel.getByText('2026-09-23 19:49:55')).toBeInTheDocument()
  })

  it('未配置标签时给空态引导，不出现空表格', () => {
    const panel = mount({ config: DEFAULT_STORE_LABEL_SCORE_CONFIG })
    expect(panel.getByText(/尚未配置任何標籤分值/)).toBeInTheDocument()
    expect(panel.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('试算单选切换标签只取该档分值，未配置标签提示补配', () => {
    const panel = mount()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: '試算與說明' }))
    const dialog = within(screen.getByRole('dialog'))
    // 默认选中金牌 → 20 分
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('20 分')
    // 切到獨家 → 40 分（不累加）
    fireEvent.click(dialog.getByRole('radio', { name: '獨家（+40 分）' }))
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('40 分')
    // 切到未配置的連鎖 → 0 分并提示补配
    fireEvent.click(dialog.getByRole('radio', { name: '連鎖（未配置，不計分）' }))
    expect(dialog.getByLabelText('單項總得分')).toHaveTextContent('0 分')
    expect(dialog.getByText(/未配置分值，本次不計分/)).toBeInTheDocument()
    expect(dialog.getByText(/得分 = 門店當前標籤對應的分值/)).toBeInTheDocument()
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
    fireEvent.click(optionInDropdown('品牌'))
    fireEvent.change(screen.getByLabelText('第 1 行標籤分值'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { hidden: true, name: /保\s*存/ }))
    expect(onSave).toHaveBeenCalledWith({ items: [{ labelValue: 'brand', labelName: '品牌', score: 12 }] }, DESCRIPTION)
  })

  it('已配置的标签在其他行下拉中禁用，避免同一标签配两档分', () => {
    const panel = mount()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /添加標籤/ }))
    openSelect(panel, 2)
    // 第二行下拉里「獨家」已被第一行占用，应处于禁用态
    const option = optionInDropdown('獨家').closest('.ant-select-item')
    expect(option).toHaveClass('ant-select-item-option-disabled')
  })

  it('四个标签全部配置后不再允许继续添加', () => {
    const panel = mount({ config: { items: STORE_LABELS.map(label => ({ labelValue: label.value, labelName: label.label, score: 10 })) } })
    fireEvent.click(panel.getByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ }))
    expect(panel.getByRole('button', { hidden: true, name: /全部標籤已配置/ })).toBeDisabled()
  })

  it('详情只读模式（父级 Form disabled）下仍可试算，且无编辑入口', () => {
    render(<ConfigProvider theme={{ token: { motion: false } }}>
      <Form disabled>
        <StoreLabelScorePanel ruleName="門店標籤" config={CONFIG} hasDraft={false} description={DESCRIPTION}
          readOnly updatedBy="system" onSave={() => undefined} />
      </Form>
    </ConfigProvider>)
    const panel = within(screen.getByLabelText('門店標籤計分配置'))
    expect(panel.queryByRole('button', { hidden: true, name: /[编編]\s*[辑輯]/ })).not.toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { hidden: true, name: '試算與說明' }))
    expect(within(screen.getByRole('dialog')).getByLabelText('單項總得分')).toHaveTextContent('20 分')
  })
})
