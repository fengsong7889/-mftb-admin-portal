import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Modal } from 'antd'
import type { ModalFuncProps } from 'antd'
import DailyReportTrigger from './Trigger'
import i18n from '@/i18n'

const triggerReport = vi.fn()
const boardPreview = vi.fn()

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}))

vi.mock('@/api/rdm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/rdm')>()
  return {
    ...actual,
    fetchProjectPage: vi.fn(async () => ({
      records: [{ id: 1, projectNo: 'PROJ2026102001', name: '門戶改版' }],
      total: 1,
    })),
    fetchIterations: vi.fn(async () => []),
  }
})

vi.mock('@/api/rdmDailyReport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/rdmDailyReport')>()
  return {
    ...actual,
    triggerDailyReport: (params: unknown) => triggerReport(params),
    fetchDailyReportBoardPreview: (params: unknown) => boardPreview(params),
    fetchDailyReportEmployeeOptions: vi.fn(async () => [
      { value: '9', label: '李四(MF00009)' },
    ]),
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

describe('進度日報手動觸發：發送對象', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('zh-TW')
    triggerReport.mockResolvedValue({
      reportDate: '2026-10-20',
      reportType: 'manual',
      dryRun: false,
      groupDispatched: true,
      personalSent: 1,
      personalSkipped: 0,
      projectCount: 1,
      message: '已推送',
      groupTitle: 't',
      groupContent: 'c',
    })
  })

  /** 选第一个项目（与上方看板用例同一交互方式） */
  async function selectProject() {
    const combos = screen.getAllByRole('combobox')
    fireEvent.mouseDown(combos[0])
    const option = await screen.findByText('PROJ2026102001 門戶改版')
    fireEvent.click(option)
  }

  /** 二次确认弹窗：直接执行 onOk，避免测试里再点一次弹窗按钮 */
  function autoConfirm() {
    return vi.spyOn(Modal, 'confirm').mockImplementation((opts: ModalFuncProps) => {
      void opts.onOk?.()
      return { destroy: vi.fn(), update: vi.fn() } as unknown as ReturnType<typeof Modal.confirm>
    })
  }

  it('默認「全部」：提交 recipientMode=all（群 + 個人）', async () => {
    const confirm = autoConfirm()
    renderPage()
    await selectProject()

    fireEvent.click(screen.getByRole('button', { name: /立即推送/ }))

    await waitFor(() => expect(triggerReport).toHaveBeenCalledTimes(1))
    expect(triggerReport).toHaveBeenCalledWith(expect.objectContaining({
      type: 'morning',
      projectId: 1,
      recipientMode: 'all',
      recipientUserIds: undefined,
      dryRun: false,
    }))
    confirm.mockRestore()
  })

  it('僅群聊：提交 recipientMode=group，且不要求選人', async () => {
    const confirm = autoConfirm()
    renderPage()
    await selectProject()

    fireEvent.click(screen.getByRole('radio', { name: /僅群聊/ }))
    fireEvent.click(screen.getByRole('button', { name: /立即推送/ }))

    await waitFor(() => expect(triggerReport).toHaveBeenCalledTimes(1))
    expect(triggerReport).toHaveBeenCalledWith(expect.objectContaining({ recipientMode: 'group' }))
    confirm.mockRestore()
  })

  it('僅指定人但未選人：攔截並提示，不調用觸發接口', async () => {
    renderPage()
    await selectProject()

    fireEvent.click(screen.getByRole('radio', { name: /僅指定人/ }))
    fireEvent.click(screen.getByRole('button', { name: /立即推送/ }))

    expect(await screen.findByText('請選擇要發送的指定人員')).toBeInTheDocument()
    expect(triggerReport).not.toHaveBeenCalled()
  })
})
