/**
 * 推送规则表单「项目 / 迭代」联动回归测试。
 *
 * 钉住三条口径（对应用户诉求：紧急修复迭代可不绑项目）：
 * 1. 未选项目也能直接选迭代（不再要求先选项目）；
 * 2. 选到已挂项目的迭代时自动带出所属项目；
 * 3. 选到未挂项目的迭代时项目不做必填校验，可以直接保存（projectId 落 null）。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../i18n'
import { fetchIterations, fetchProjectPage } from '../../../api/rdm'
import {
  fetchDailyReportRules,
  fetchDailyReportTemplates,
  saveDailyReportRule,
} from '../../../api/rdmDailyReport'
import DailyReportRuleForm from './RuleForm'

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}))

vi.mock('../../../api/rdm', () => ({
  fetchIterations: vi.fn(),
  fetchProjectPage: vi.fn(),
}))

vi.mock('../../../api/rdmDailyReport', () => ({
  fetchDailyReportRules: vi.fn(),
  fetchDailyReportTemplates: vi.fn(),
  fetchDailyReportConfig: vi.fn(async () => ({ messageMode: 'template' })),
  saveDailyReportRule: vi.fn(),
}))

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchProjectPage).mockResolvedValue({ records: [], total: 0 } as never)
  vi.mocked(fetchDailyReportTemplates).mockResolvedValue([] as never)
  vi.mocked(fetchDailyReportRules).mockResolvedValue([] as never)
  vi.mocked(saveDailyReportRule).mockResolvedValue({} as never)
  vi.mocked(fetchIterations).mockResolvedValue([
    {
      id: 1, code: 'SP202610001', name: '十月迭代', iterationType: 'sprint',
      projectId: 5, projectName: '推薦報表專項', status: 'active',
    },
    {
      id: 2, code: 'HF202610001', name: '線上熱修', iterationType: 'hotfix',
      projectId: null, projectName: null, status: 'active',
    },
  ] as never)
})

/** 按 Form.Item 的 label 文案定位下拉触发器（页面上有多个 Select） */
function selectInFormItem(labelText: string): Element {
  const label = screen.getByText(labelText, { selector: 'label' })
  const item = label.closest('.ant-form-item')
  expect(item, `找不到表单项「${labelText}」`).toBeTruthy()
  const trigger = item?.querySelector('.ant-select-selector')
  expect(trigger, `找不到「${labelText}」的下拉触发器`).toBeTruthy()
  return trigger as Element
}

async function pickIteration(optionText: string) {
  fireEvent.mouseDown(selectInFormItem('指定迭代'))
  const option = await screen.findByText(optionText, { selector: '.ant-select-item-option-content' })
  fireEvent.click(option)
}

function fillName() {
  fireEvent.change(screen.getByPlaceholderText('如：A產品-B1迭代日報'), { target: { value: '熱修日報' } })
}

describe('進度日報推送規則：專案/迭代聯動', () => {
  it('未選專案也能選迭代；選到未掛專案的迭代時無需專案即可保存', async () => {
    render(<MemoryRouter initialEntries={['/rdm-daily-report-rule-form']}><DailyReportRuleForm /></MemoryRouter>)
    await screen.findByText('推送目標')

    // 迭代下拉不再因「未選專案」而禁用，且能直接選到 hotfix
    expect(selectInFormItem('指定迭代').className).not.toContain('ant-select-disabled')
    await pickIteration('HF202610001 線上熱修（未掛項目）')
    expect(await screen.findByText(/緊急修復.*無需選擇所屬項目/)).toBeInTheDocument()

    fillName()
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))

    await waitFor(() => expect(saveDailyReportRule).toHaveBeenCalledTimes(1))
    expect(saveDailyReportRule).toHaveBeenCalledWith(expect.objectContaining({
      projectId: null,
      iterationCode: 'HF202610001',
      name: '熱修日報',
    }))
  })

  it('勾選「全部在途項目」可直接保存為全市場範圍', async () => {
    render(<MemoryRouter initialEntries={['/rdm-daily-report-rule-form']}><DailyReportRuleForm /></MemoryRouter>)
    await screen.findByText('推送目標')

    fireEvent.click(screen.getByRole('checkbox', { name: /全部在途項目/ }))
    fillName()
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))

    await waitFor(() => expect(saveDailyReportRule).toHaveBeenCalledTimes(1))
    expect(saveDailyReportRule).toHaveBeenCalledWith(expect.objectContaining({
      allProjects: true,
      projectIds: [],
      projectId: null,
      iterationCode: null,
    }))
  })

  it('选到已挂项目的迭代时自动带出所属项目', async () => {
    render(<MemoryRouter initialEntries={['/rdm-daily-report-rule-form']}><DailyReportRuleForm /></MemoryRouter>)
    await screen.findByText('推送目標')

    await pickIteration('SP202610001 十月迭代（推薦報表專項）')
    // 專案下拉出现迭代所属项目名（候选里没有该项目时由 extraProject 兜底）
    await waitFor(() => expect(screen.getAllByText('推薦報表專項').length).toBeGreaterThan(0))

    fillName()
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))

    await waitFor(() => expect(saveDailyReportRule).toHaveBeenCalledTimes(1))
    expect(saveDailyReportRule).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 5,
      iterationCode: 'SP202610001',
    }))
  })

  it('迭代下拉支持關鍵詞遠程搜索：輸入防抖後只帶 keyword 查 20 條', async () => {
    render(<MemoryRouter initialEntries={['/rdm-daily-report-rule-form']}><DailyReportRuleForm /></MemoryRouter>)
    await screen.findByText('推送目標')
    // 首次未輸入關鍵詞：只拉最近 20 條，不再全量
    await waitFor(() => expect(fetchIterations).toHaveBeenCalledWith(undefined, 20, undefined))

    const input = selectInFormItem('指定迭代').querySelector('input')
    expect(input, '迭代下拉未渲染搜索輸入框').toBeTruthy()
    fireEvent.change(input as Element, { target: { value: 'HF' } })

    // 300ms 防抖后按關鍵詞回查，避免每敲一個字都打一次接口
    await waitFor(() => expect(fetchIterations).toHaveBeenCalledWith('HF', 20, undefined), { timeout: 3000 })
  })
})
