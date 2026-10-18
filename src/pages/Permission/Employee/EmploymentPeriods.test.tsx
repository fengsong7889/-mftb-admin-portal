import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import i18n from '@/i18n'
import EmploymentPeriods from './EmploymentPeriods'
import { fetchEmploymentPeriods } from '@/api/hrEmployment'
import type { EmploymentPeriodItem } from '@/api/hrEmployment'

vi.mock('@/api/hrEmployment', async () => {
  const actual = await vi.importActual<typeof import('@/api/hrEmployment')>('@/api/hrEmployment')
  return { ...actual, fetchEmploymentPeriods: vi.fn() }
})

const mockedFetch = vi.mocked(fetchEmploymentPeriods)

function period(over: Partial<EmploymentPeriodItem>): EmploymentPeriodItem {
  return {
    id: 1, userId: 7, periodSeq: 1, startDateSource: 'POSITION_RECORD',
    status: 'ACTIVE', startDate: '2024-03-01', ...over,
  } as EmploymentPeriodItem
}

/**
 * 档案里的雇佣期间区块。
 * 空态必须说清「下一步做什么」：只写「暂无数据」会让 HR 以为系统漏数，
 * 而实际是双轨期间在等他们核对差异清单后登记。
 */
describe('EmploymentPeriods', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-TW')
    vi.clearAllMocks()
  })

  it('列出每段雇佣及其起止与来源标注', async () => {
    mockedFetch.mockResolvedValue([
      period({ id: 1, periodSeq: 1, status: 'ENDED', startDate: '2022-01-05', endDate: '2023-04-30' }),
      period({ id: 2, periodSeq: 2, status: 'ACTIVE', startDate: '2024-03-01', startDateSource: 'MANUAL', employerCompany: '珠海麥峰科技有限公司' }),
    ])
    render(<EmploymentPeriods userId={7} />)

    expect(await screen.findByText('2022-01-05')).toBeInTheDocument()
    expect(screen.getByText('已結束段')).toBeInTheDocument()
    expect(screen.getByText('在職段')).toBeInTheDocument()
    // 入职日必须带来源，否则人工确认值与任职登记日看起来一模一样
    expect(screen.getByText('人工確認')).toBeInTheDocument()
    expect(screen.getByText('珠海麥峰科技有限公司')).toBeInTheDocument()
  })

  it('未登记时给出可执行的空态说明', async () => {
    mockedFetch.mockResolvedValue([])
    render(<EmploymentPeriods userId={7} />)

    expect(await screen.findByText(/尚未登記僱傭期間/)).toBeInTheDocument()
  })

  it('取数失败显示错误而不是空态', async () => {
    mockedFetch.mockRejectedValue(new Error('boom'))
    render(<EmploymentPeriods userId={7} />)

    expect(await screen.findByText('僱傭期間取數失敗，請重試。')).toBeInTheDocument()
    expect(screen.queryByText(/尚未登記僱傭期間/)).not.toBeInTheDocument()
  })

  it('换员工时按新人重新取数', async () => {
    mockedFetch.mockResolvedValue([])
    const { rerender } = render(<EmploymentPeriods userId={7} />)
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledWith(7))

    rerender(<EmploymentPeriods userId={8} />)
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledWith(8))
  })
})
