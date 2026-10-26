/**
 * 項目詳情 · 催辦（urge）—— 任務30 可解釋結果測試
 *
 * 釘死：
 *  1. 點擊「催辦待辦」調用 urgeProject(projectId)；
 *  2. 結果 Modal 展示 notified/deduped/unassigned/nonWorkingDay/belowThreshold/failed + remindDay + notes；
 *  3. executeOnce 同日回放說明（非「又發一次」）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { urgeProject } from '@/api/rdm'
import ProjectDetail from './ProjectDetail'

vi.mock('@/api/rdm', () => ({
  fetchProjectDetail: vi.fn(),
  fetchProjectRequirementBoard: vi.fn(),
  urgeProject: vi.fn(),
  addProjectMember: vi.fn(),
  removeProjectMember: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
}))

// 「催辦待辦」按 rdm-dashboard-project:edit 收敛；本文件测催办结果，需给全权限
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}))

import { fetchProjectDetail, fetchProjectRequirementBoard } from '@/api/rdm'

const detail = {
  id: 5, projectNo: 'PJ-005', name: '演示項目', objective: '目標', status: 'in_progress',
  pmUserName: '張三', pmUserId: 7, productOwnerUserName: '李四', productOwnerUserId: 8,
  planStartDate: '2026-01-01', planEndDate: '2026-06-01',
  pausedFlag: 0, riskFlag: 0, overdueFlag: 0,
  deliveredCount: 2, totalDeliveryCount: 5, nextDeliveryDate: null,
  blockedCount: 0, pendingDecisionCount: 0, defaultAcceptancePath: 'A',
  version: 3, createdAt: '2026-01-02T09:00:00', updatedAt: '2026-04-30T10:00:00',
  members: [], scopeSummaryJson: null,
} as never

const urgeResult = {
  scannedProjects: 1, scannedTodos: 11,
  notified: 3, deduped: 2, unassigned: 1, nonWorkingDay: 0, belowThreshold: 4, failed: 1,
  remindDay: '2026-05-01', notes: ['門檻未達：僅逾期 ≥ 1 工作日才發', '非工作日不發'],
} as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchProjectDetail).mockResolvedValue(detail)
  vi.mocked(fetchProjectRequirementBoard).mockResolvedValue({
    iterations: [], unplanned: [], todos: [],
    summary: {
      iterationTotal: 0, requirementTotal: 0, requirementDelivered: 0, requirementInProgress: 0,
      requirementPending: 0, blockedTaskCount: 0, pendingDecisionCount: 0,
      pendingAcceptanceCount: 0, deliveryItemTotal: 0, deliveryItemDone: 0,
    },
  })
  vi.mocked(urgeProject).mockResolvedValue(urgeResult)
})

function renderDetail() {
  return render(<MemoryRouter initialEntries={['/rdm-project-detail?id=5']}><ProjectDetail /></MemoryRouter>)
}

describe('ProjectDetail 催辦結果展示', () => {
  it('點擊催辦調用 urgeProject(5) 並展示六類計數 + 提醒日 + notes + executeOnce 回放說明', async () => {
    renderDetail()
    const btn = await screen.findByRole('button', { name: /催辦待辦/ })
    fireEvent.click(btn)
    await waitFor(() => expect(urgeProject).toHaveBeenCalledWith(5))

    // executeOnce 回放說明（非重發）
    expect(await screen.findByText(/催辦已接 executeOnce/)).toBeInTheDocument()
    // 六類「為什麼沒發」可解釋計數標籤
    for (const label of ['已通知', '已去重(同提醒日)', '未指派(無責任人)', '非工作日不發', '未達逾期門檻', '發送失敗', '提醒日']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
    // 提醒日與 notes 如實呈現
    expect(screen.getAllByText('2026-05-01').length).toBeGreaterThan(0)
    expect(screen.getByText('門檻未達：僅逾期 ≥ 1 工作日才發')).toBeInTheDocument()
    expect(screen.getByText('說明（為什麼沒發）')).toBeInTheDocument()
  })
})
