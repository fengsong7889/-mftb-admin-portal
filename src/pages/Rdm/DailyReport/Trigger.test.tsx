import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DailyReportTrigger from './Trigger'
import i18n from '../../../i18n'

const triggerReport = vi.fn()
const boardPreview = vi.fn()

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}))

vi.mock('../../../api/rdm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/rdm')>()
  return {
    ...actual,
    fetchProjectPage: vi.fn(async () => ({
      records: [{ id: 1, projectNo: 'PROJ2026102001', name: '門戶改版' }],
      total: 1,
    })),
    fetchIterations: vi.fn(async () => []),
  }
})

vi.mock('../../../api/rdmDailyReport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/rdmDailyReport')>()
  return {
    ...actual,
    triggerDailyReport: (params: unknown) => triggerReport(params),
    fetchDailyReportBoardPreview: (params: unknown) => boardPreview(params),
  }
})

const PREVIEW_VIEW = {
  valid: true,
  showRequirements: true,
  showOwners: true,
  showUnassigned: true,
  snapshot: {
    reportDate: '2026-10-20',
    reportType: 'morning',
    reportTypeLabel: '晨報',
    generatedAt: '2026-10-20 15:30:00',
    summary: {
      projectCount: 1,
      todayDueItemCount: 0,
      overdueItemCount: 0,
      tomorrowDueItemCount: 0,
      riskProjectCount: 0,
      normalProjectCount: 1,
      todayDoneItemCount: 0,
      todayReleasedCount: 0,
      todayChangedCount: 0,
      requirementTotal: 0,
      deliveryItemTotal: 0,
      deliveryItemCompleted: 0,
      todoTotal: 0,
      iterationActiveCount: 0,
      overdueReqCount: 0,
      blockedReqCount: 0,
      overdueRiskReqCount: 0,
    },
    projects: [],
    unassignedIterations: [],
  },
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DailyReportTrigger />
    </MemoryRouter>,
  )
}

describe('進度日報手動觸發：查看看板', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('zh-TW')
    boardPreview.mockResolvedValue(PREVIEW_VIEW)
  })

  it('選項目後查看看板：按當前數據實時生成，彈窗直接渲染看板而不是讀已落庫連結', async () => {
    renderPage()

    // 選擇項目（antd Select：mouseDown 展開後點選項）
    const combos = screen.getAllByRole('combobox')
    fireEvent.mouseDown(combos[0])
    const option = await screen.findByText('PROJ2026102001 門戶改版')
    fireEvent.click(option)

    fireEvent.click(screen.getByRole('button', { name: /查看看板/ }))

    await waitFor(() => expect(boardPreview).toHaveBeenCalledTimes(1))
    expect(boardPreview).toHaveBeenCalledWith({
      type: 'morning',
      projectId: 1,
      projectIds: [1],
      allProjects: false,
      iterationCode: undefined,
    })
    // 不再借 dry-run 拿链接：没有发送动作
    expect(triggerReport).not.toHaveBeenCalled()
    await waitFor(() => expect(document.querySelector('.rdm-board-page')).not.toBeNull())
    expect(document.querySelector('iframe')).toBeNull()
    expect(document.querySelector('.rdm-board-brand-name')?.textContent).toBe('麦峰集团·项目汇报')
    expect(screen.getByText(/即時預覽/)).toBeInTheDocument()
  })

  it('勾選全部在途項目：查看看板不帶單一 projectId，覆蓋全部項目', async () => {
    renderPage()

    fireEvent.click(screen.getByRole('checkbox', { name: /全部在途項目/ }))
    fireEvent.click(screen.getByRole('button', { name: /查看看板/ }))

    await waitFor(() => expect(boardPreview).toHaveBeenCalledTimes(1))
    expect(boardPreview).toHaveBeenCalledWith({
      type: 'morning',
      projectId: undefined,
      projectIds: [],
      allProjects: true,
      iterationCode: undefined,
    })
    await waitFor(() => expect(document.querySelector('.rdm-board-page')).not.toBeNull())
  })
})
