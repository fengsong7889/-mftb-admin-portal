import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import PerfLedger from './Ledger'
import { fetchPerfCycles, fetchPerfPlans } from '../../api/hrPerformance'
import {
  type PerfReport, fetchPerfReport, fetchPerfReportDepartments, fetchPerfReportRows,
} from '../../api/hrPerfReport'
import { exportToCSV } from '../../utils/exportCSV'

const { t } = vi.hoisted(() => ({ t: (key: string) => key }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams()] }))
vi.mock('@ant-design/charts', () => ({ Pie: () => null, Column: () => null }))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: (key: string) => key === 'hr-perf-ledger:export' }),
}))
vi.mock('../../hooks/useColumnConfig', () => ({
  useColumnConfig: () => ({ configComponent: null, applyConfig: (cols: unknown[]) => cols }),
}))
vi.mock('../Performance/ScoreDrawer', () => ({ default: () => null }))
// 两个 api 模块里都有页面依赖的枚举常量，整体替换会让常量变 undefined，
// 因此保留原模块只覆盖网络函数
vi.mock('../../api/hrPerformance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/hrPerformance')>()),
  fetchPerfCycles: vi.fn(), fetchPerfPlans: vi.fn(),
}))
vi.mock('../../api/hrPerfReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/hrPerfReport')>()),
  fetchPerfReport: vi.fn(), fetchPerfReportRows: vi.fn(), fetchPerfReportDepartments: vi.fn(),
}))
vi.mock('../../utils/exportCSV', () => ({ exportToCSV: vi.fn() }))

const row = (id: number) => ({
  id, reqNo: `PH2026${id}`, planId: 3, planName: '2026Q3 复验', userId: id, empNo: `MF${id}`,
  empName: `员工${id}`, deptName: '运营部', positionLevel: 'M4', evaluatorUserId: 1, evaluatorName: '管理员',
  status: 'confirmed', selfScore: 90, supervisorScore: 95, finalScore: 95, finalGrade: 'S',
})

const summary: PerfReport = {
  headcount: 3, planCount: 1, avgScore: 95, maxScore: 95, minScore: 95, hasSuggestedRatio: true,
  gradeDistribution: [{ grade: 'S', count: 3, actualRatio: 100, suggestRatio: 10, allowedCount: 1, overCount: 2, gapNote: '超出上限 2 人' }],
  deptDistribution: [{ deptName: '运营部', count: 3, avgScore: 95, topGrade: 'S' }],
  trend: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchPerfCycles).mockResolvedValue({ records: [], total: 0 })
  vi.mocked(fetchPerfPlans).mockResolvedValue({ records: [], total: 0 })
  vi.mocked(fetchPerfReportDepartments).mockResolvedValue(['运营部'])
  vi.mocked(fetchPerfReport).mockResolvedValue(summary)
})

describe('結果台賬导出', () => {
  it('按后端单页上限逐页取满全量，而不是只导当前页', async () => {
    const pages: Record<number, { records: unknown[]; total: number }> = {
      1: { records: [row(1), row(2)], total: 3 },
      2: { records: [row(3)], total: 3 },
    }
    vi.mocked(fetchPerfReportRows).mockImplementation(async (params) => {
      const p = pages[params.page] || { records: [], total: 3 }
      return { records: p.records, total: p.total } as never
    })
    render(<PerfLedger />)

    const button = await screen.findByRole('button', { name: /hrPerfReport\.exportCsv/ })
    fireEvent.click(button)

    await waitFor(() => expect(exportToCSV).toHaveBeenCalledTimes(1))
    expect(fetchPerfReportRows).toHaveBeenCalledWith(expect.objectContaining({ page: 1, size: 200 }))
    expect(fetchPerfReportRows).toHaveBeenCalledWith(expect.objectContaining({ page: 2, size: 200 }))
    const [, columns, data] = vi.mocked(exportToCSV).mock.calls[0]
    expect(data).toHaveLength(3)
    // 导出的列必须覆盖审计需要的口径：工号/部门/职级/评估人/三段分/最终等级/确认时间
    expect(columns.map(c => c.title)).toEqual([
      'hrPerf.assessmentReqNo', 'hrPerf.employee', 'hrPerf.empNo', 'hrPerf.department',
      'hrPerf.positionLevel', 'hrPerf.plan', 'hrPerf.evaluator', 'hrPerf.selfScore',
      'hrPerf.supervisorScore', 'hrPerf.calibratedScore', 'hrPerf.calibratedGrade',
      'hrPerf.finalScore', 'hrPerf.finalGrade', 'hrPerf.confirmedAt',
    ])
  })

  it('无数据时不产生空文件，避免 HR 误以为导出成功', async () => {
    vi.mocked(fetchPerfReportRows).mockResolvedValue({ records: [], total: 0 })
    render(<PerfLedger />)

    fireEvent.click(await screen.findByRole('button', { name: /hrPerfReport\.exportCsv/ }))

    await waitFor(() => expect(fetchPerfReportRows).toHaveBeenCalled())
    expect(exportToCSV).not.toHaveBeenCalled()
  })

  it('超编时台账页直接把缺口列出，而不是让 HR 猜为什么提交被挡', async () => {
    vi.mocked(fetchPerfReportRows).mockResolvedValue({ records: [row(1)], total: 1 })
    render(<PerfLedger />)

    expect(await screen.findByText('hrPerfReport.distributionGapTitle')).toBeTruthy()
    expect(await screen.findByText(/超出上限 2 人/)).toBeTruthy()
  })
})
