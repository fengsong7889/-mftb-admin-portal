/**
 * 迭代表单「所属项目」回归测试（归属体系改造切片一）。
 *
 * 钉住三条口径：
 * 1. 新增态默认常规迭代：所属项目必填（提示「常規/版本專項迭代必須掛項目」）；
 * 2. 切到紧急修复（hotfix）：项目变为可空（提示「緊急修復可不掛」）——跨项目平台级热修例外；
 * 3. 编辑态回填已挂项目（存量补挂入口）。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '@/i18n'
import { fetchIterations, fetchProjectPage } from '@/api/rdm'
import IterationForm from './IterationForm'

vi.mock('@/api/employee', () => ({
  fetchEmployees: vi.fn(async () => ({ records: [], total: 0 })),
  fetchEmployee: vi.fn(),
}))

vi.mock('@/api/rdm', () => ({
  fetchIterations: vi.fn(),
  saveIteration: vi.fn(),
  fetchProjectPage: vi.fn(),
}))

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchProjectPage).mockResolvedValue({
    records: [
      { id: 5, projectNo: 'PRJ2026001', name: '推薦報表專項', status: 'in_progress' },
      { id: 6, projectNo: 'PRJ2026002', name: '門店自營活動', status: 'preparing' },
    ],
    total: 2,
  } as never)
  vi.mocked(fetchIterations).mockResolvedValue([])
})

/** antd Select 在 jsdom 里的选择姿势：先点开选择器，再点选项文案 */
async function selectOption(selectText: string, optionText: string) {
  const trigger = screen.getByText(selectText).closest('.ant-form-item')?.querySelector('.ant-select-selector')
  expect(trigger, `找不到「${selectText}」的下拉触发器`).toBeTruthy()
  fireEvent.mouseDown(trigger as Element)
  const option = await screen.findByText(optionText, { selector: '.ant-select-item-option-content' })
  fireEvent.click(option)
}

describe('IterationForm 所属项目', () => {
  it('新增态默认常规迭代：项目必填提示可见', async () => {
    render(<MemoryRouter initialEntries={['/rdm-iteration-form']}><IterationForm /></MemoryRouter>)
    expect(await screen.findByText('所屬項目')).toBeInTheDocument()
    expect(screen.getByText('常規/版本專項迭代必須掛項目')).toBeInTheDocument()
  })

  it('切到紧急修复后项目变为可空（hotfix 例外）', async () => {
    render(<MemoryRouter initialEntries={['/rdm-iteration-form']}><IterationForm /></MemoryRouter>)
    await screen.findByText('所屬項目')
    await selectOption('常規迭代', '緊急修復')
    await waitFor(() => {
      expect(screen.getByText('緊急修復可不掛（跨項目平台級熱修）')).toBeInTheDocument()
    })
    expect(screen.queryByText('常規/版本專項迭代必須掛項目')).not.toBeInTheDocument()
  })

  it('编辑态回填已挂项目（存量补挂入口）', async () => {
    vi.mocked(fetchIterations).mockResolvedValue([{
      id: 3, code: 'SP202610001', name: '10 月上半迭代', iterationType: 'sprint',
      projectId: 5, projectName: '推薦報表專項',
      startDate: '2026-10-01', endDate: '2026-10-15', capacityHours: 400,
      ownerUserId: null, ownerName: null, status: 'planning', remark: null,
    }] as never)
    render(<MemoryRouter initialEntries={['/rdm-iteration-form?id=3']}><IterationForm /></MemoryRouter>)
    // 回填成功 = 选择器里显示项目选项文案（PRJ2026001 · 推薦報表專項）
    expect(await screen.findByText('PRJ2026001 · 推薦報表專項')).toBeInTheDocument()
  })
})
