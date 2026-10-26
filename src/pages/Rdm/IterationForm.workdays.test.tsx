/**
 * 迭代表单「起止日期 → 产能」联动回归。
 *
 * 钉住两条口径：
 * 1. 选完日期后系统按「工作日 × 8h」自动填入产能（扣除周末）；
 * 2. 之后手改产能，提示必须标明「已手動調整」，否则使用者会以为系统算错。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  vi.mocked(fetchProjectPage).mockResolvedValue({ records: [], total: 0 } as never)
  vi.mocked(fetchIterations).mockResolvedValue([])
})

/** rc-picker 必须 change + Enter 才提交，直接改 value 不会触发 onChange */
function typeDate(input: HTMLInputElement, value: string) {
  fireEvent.mouseDown(input)
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value } })
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 })
}

function capacityInput() {
  return document.querySelector<HTMLInputElement>('.ant-input-number-input')
}

describe('IterationForm 起止日期自动折算产能', () => {
  it('选完日期后按工作日 × 8h 自动填入产能', async () => {
    render(<MemoryRouter initialEntries={['/rdm-iteration-form']}><IterationForm /></MemoryRouter>)
    const inputs = document.querySelectorAll<HTMLInputElement>('.ant-picker-input input')
    expect(inputs.length).toBe(2)
    typeDate(inputs[0], '2026-10-19')
    typeDate(inputs[1], '2026-11-01')
    // 2026-10-19（一）~ 2026-11-01（日）= 10 个工作日 → 80h
    await waitFor(() => expect(capacityInput()?.value).toBe('80'))
    expect(await screen.findByText('10 個工作日 × 8h')).toBeInTheDocument()
  })

  it('手改产能后提示标注已手动调整', async () => {
    render(<MemoryRouter initialEntries={['/rdm-iteration-form']}><IterationForm /></MemoryRouter>)
    const inputs = document.querySelectorAll<HTMLInputElement>('.ant-picker-input input')
    typeDate(inputs[0], '2026-10-19')
    typeDate(inputs[1], '2026-11-01')
    await waitFor(() => expect(capacityInput()?.value).toBe('80'))
    fireEvent.change(capacityInput() as HTMLInputElement, { target: { value: '100' } })
    await waitFor(() => expect(screen.getByText('10 個工作日 × 8h，已手動調整')).toBeInTheDocument())
  })
})
