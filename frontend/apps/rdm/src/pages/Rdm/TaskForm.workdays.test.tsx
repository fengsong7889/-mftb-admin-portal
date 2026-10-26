/**
 * 研发任务表单「计划起止 → 计划工时」联动回归。
 *
 * 与迭代表单同口径：每天 8 小时、扣周末；自动填入后仍允许手改。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '@/i18n'
import {
  checkTaskOwner,
  fetchReqTasks,
  fetchRequirementDetail,
  fetchRequirementPage,
} from '@/api/rdm'
import TaskForm from './TaskForm'

vi.mock('@/api/employee', () => ({
  fetchEmployees: vi.fn(async () => ({ records: [], total: 0 })),
  fetchEmployee: vi.fn(),
}))

vi.mock('@/api/rdmTaskType', () => ({
  fetchTaskTypeOptions: vi.fn(async () => [
    { code: 'frontend', label: '前端', color: '#1890FF', enabled: 1, sortOrder: 1 },
  ]),
}))

vi.mock('@/api/rdm', async () => {
  const actual = await vi.importActual<typeof import('@/api/rdm')>('@/api/rdm')
  return {
    ...actual,
    fetchRequirementDetail: vi.fn(),
    fetchRequirementPage: vi.fn(),
    fetchReqTasks: vi.fn(),
    checkTaskOwner: vi.fn(),
    saveTask: vi.fn(),
  }
})

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchRequirementDetail).mockResolvedValue({
    id: 9, reqNo: 'XQSP202610001', title: '報表導出', status: 'assigned',
    iterationCode: 'SP202610001',
  } as never)
  vi.mocked(fetchReqTasks).mockResolvedValue([])
  vi.mocked(fetchRequirementPage).mockResolvedValue({ records: [], total: 0 } as never)
  vi.mocked(checkTaskOwner).mockResolvedValue({} as never)
})

/** rc-picker 必须 change + Enter 才提交，直接改 value 不会触发 onChange */
function typeDate(input: HTMLInputElement, value: string) {
  fireEvent.mouseDown(input)
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value } })
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 })
}

function planHoursInput() {
  return document.querySelector<HTMLInputElement>('.ant-input-number-input')
}

describe('TaskForm 计划起止自动折算工时', () => {
  it('选完计划起止后按工作日 × 8h 自动填入计划工时', async () => {
    render(<MemoryRouter initialEntries={['/rdm-task?reqId=9']}><TaskForm /></MemoryRouter>)
    const inputs = await waitFor(() => {
      // 表单新增了「計劃上線」单日期选择，这里限定到计划起止的 RangePicker 容器，避免选错输入框
      const found = document.querySelectorAll<HTMLInputElement>('.ant-picker-range .ant-picker-input input')
      expect(found.length).toBe(2)
      return found
    })
    typeDate(inputs[0], '2026-10-19')
    typeDate(inputs[1], '2026-11-01')
    // 10 个工作日 × 8h = 80h
    await waitFor(() => expect(planHoursInput()?.value).toBe('80'))
    expect(await screen.findByText('10 個工作日 × 8h')).toBeInTheDocument()
  })
})
