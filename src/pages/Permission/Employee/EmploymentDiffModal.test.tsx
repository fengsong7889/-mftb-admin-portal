import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import i18n from '@/i18n'
import type { ProfileDiffReport } from '@/api/hrEmployment'
import EmploymentDiffModal from './EmploymentDiffModal'
import { fetchProfileDiffReport } from '@/api/hrEmployment'

vi.mock('@/api/hrEmployment', async () => {
  const actual = await vi.importActual<typeof import('@/api/hrEmployment')>('@/api/hrEmployment')
  return { ...actual, fetchProfileDiffReport: vi.fn(), syncEmploymentPeriods: vi.fn() }
})

const mockedFetch = vi.mocked(fetchProfileDiffReport)

/** 一行「可派生但未登记」（允许勾选）与一行「缺入职锚点」（必须人工判定，禁止勾选） */
function report(): ProfileDiffReport {
  return {
    asOf: '2026-10-18',
    scannedUsers: 2,
    diffUsers: 2,
    registerableUsers: 1,
    truncated: false,
    countsByCategory: { PERIOD_NOT_REGISTERED: 1, START_ANCHOR_MISSING: 1 },
    items: [
      {
        userId: 11, empId: 'MF00011', name: '李大仁', accountStatus: 1, employmentStatus: 'active',
        snapshotDept: '市場部', snapshotPosition: '高級專員', asOfDept: '市場部', asOfPosition: '高級專員',
        employmentStart: '2024-03-01', startDateSource: 'POSITION_RECORD',
        registeredPeriods: 0, derivedPeriods: 1, futureAssignments: 0,
        codes: ['PERIOD_NOT_REGISTERED'], severity: 'INFO',
      },
      {
        userId: 12, empId: 'MF00012', name: '王小美', accountStatus: 1, employmentStatus: 'active',
        snapshotDept: '財務部', snapshotPosition: '會計', asOfDept: null, asOfPosition: null,
        employmentStart: null, startDateSource: null,
        registeredPeriods: 0, derivedPeriods: 0, futureAssignments: 0,
        codes: ['START_ANCHOR_MISSING'], severity: 'WARN',
      },
    ],
  }
}

/**
 * 雇佣数据核对清单。
 * 钉住三条「不能放开」的行为：无 edit 权时没有登记入口、缺锚点的行不许被勾选、
 * 取数失败时给错误而不是空表（空表会被读成「数据都一致」）。
 */
describe('EmploymentDiffModal', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-TW')
    vi.clearAllMocks()
  })

  it('打开时取数并列出差异类别', async () => {
    mockedFetch.mockResolvedValue(report())
    render(<EmploymentDiffModal open onClose={vi.fn()} canRegister />)

    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('李大仁')).toBeInTheDocument()
    expect(screen.getByText('僱傭期間待登記')).toBeInTheDocument()
    expect(screen.getByText('僱傭起點未核實')).toBeInTheDocument()
  })

  it('无登记权限时不渲染登记按钮', async () => {
    mockedFetch.mockResolvedValue(report())
    render(<EmploymentDiffModal open onClose={vi.fn()} canRegister={false} />)

    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('按任職事實登記')).not.toBeInTheDocument()
  })

  it('取数失败显示错误Alert，不伪装成「无差异」', async () => {
    mockedFetch.mockRejectedValue(new Error('network'))
    render(<EmploymentDiffModal open onClose={vi.fn()} canRegister />)

    expect(await screen.findByText('差異報告取數失敗，請重試或稍後再查。')).toBeInTheDocument()
    expect(screen.queryByText('帳號快照、任職事實與僱傭期間三者一致，無需處理。')).not.toBeInTheDocument()
  })

  it('缺入职锚点的行不允许勾选（只有可派生未登记的行能登记）', async () => {
    mockedFetch.mockResolvedValue(report())
    render(<EmploymentDiffModal open onClose={vi.fn()} canRegister />)
    // 等行真正渲染出来再查勾选框：只 await 取数次数会读到尚未提交的空表
    await screen.findByText('王小美')

    // antd Modal 渲染在 body portal 里，render 返回的 container 内看不到表格；
    // 按人定位行而不是按数量取下标：行序号会随行高镜像/冻结列的额外节点漂移
    const rowInput = (name: string) => Array.from(document.querySelectorAll('tr.ant-table-row'))
      .find(tr => tr.textContent?.includes(name))
      ?.querySelector<HTMLInputElement>('input')

    expect(rowInput('李大仁')?.disabled).toBe(false)
    expect(rowInput('王小美')?.disabled).toBe(true)
  })
})
