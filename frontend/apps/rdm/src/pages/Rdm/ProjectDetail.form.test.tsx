/**
 * 項目新增/編輯表单 —— 負責人 *UserId 双写必须进入提交 payload
 *
 * 回归背景（端到端实测出来的）：六个负责人字段按 EmployeeSelect 的 onChange/onPick 双写
 * `*UserId` + `*UserName`，但只有 `*UserName` 注册了 Form.Item，`*UserId` 只存在于 form store。
 * 提交时若直接用 `validateFields()` 的返回值（只含已注册字段），六个 ID 恒为 undefined：
 * 项目建出来没有 PM → 后端「PM 自动入组」不执行 → 成员表空 → 创建人自己也改不动自己建的项目
 * （表现为 PATCH 一律「您不是該項目成員，無法執行此操作」）。
 * 所以这里钉住：六个 ID 与姓名都真的进了请求体。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createProject, fetchProjectDetail, fetchProjectRequirementBoard, updateProject } from '@/api/rdm'
import ProjectDetail from './ProjectDetail'

// 六个 EmployeeSelect 实例的 props 长一样（同一 placeholder），只能按 JSX 顺序定位：
// [0]項目經理 [1]產品負責人 [2]技術負責人 [3]UI 設計 [4]測試 [5]運維
vi.mock('@/components/EmployeeSelect', () => ({
  default: (props: { onChange?: (ids: number[]) => void; onPick?: (items: { id: number; name: string }[]) => void }) => (
    <button type="button" onClick={() => {
      props.onChange?.([7])
      props.onPick?.([{ id: 7, name: '張三' }])
    }}>挑人員
    </button>
  ),
}))

// 详情页按 rdm-dashboard-project:edit 收敛编辑入口；本文件测表单提交，需给全权限
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}))

vi.mock('@/api/rdm', () => ({
  fetchProjectDetail: vi.fn(),
  fetchProjectRequirementBoard: vi.fn(),
  urgeProject: vi.fn(),
  addProjectMember: vi.fn(),
  removeProjectMember: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
}))

const detail = {
  id: 5, projectNo: 'PJ-005', name: '演示項目', objective: '目標', status: 'in_progress',
  pmUserName: '張三', pmUserId: 7, planStartDate: '2026-01-01', planEndDate: '2026-06-01',
  pausedFlag: 0, riskFlag: 0, overdueFlag: 0, deliveredCount: 0, totalDeliveryCount: 0,
  nextDeliveryDate: null, blockedCount: 0, pendingDecisionCount: 0, defaultAcceptancePath: 'A',
  version: 3, createdAt: '2026-01-02T09:00:00', updatedAt: '2026-04-30T10:00:00',
  members: [], scopeSummaryJson: null,
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
  vi.mocked(createProject).mockResolvedValue(detail)
  vi.mocked(updateProject).mockResolvedValue(undefined)
})

const renderAt = (entry: string) => render(
  <MemoryRouter initialEntries={[entry]}><ProjectDetail /></MemoryRouter>,
)

describe('ProjectDetail 表单提交', () => {
  it('新增项目把六个负责人的 userId 与姓名一起上送', async () => {
    renderAt('/rdm-project-detail?mode=create')
    fireEvent.change(await screen.findByPlaceholderText('輸入項目名稱'), { target: { value: '自動測試項目' } })
    for (const btn of await screen.findAllByRole('button', { name: '挑人員' })) fireEvent.click(btn)

    fireEvent.click(screen.getByRole('button', { name: /創建項目/ }))

    await waitFor(() => expect(createProject).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(createProject).mock.calls[0][0]
    // 修复前：这六个 ID 全部是 undefined，JSON 序列化后连 key 都不剩
    expect(payload).toMatchObject({
      name: '自動測試項目',
      pmUserId: 7, pmUserName: '張三',
      productOwnerUserId: 7, productOwnerUserName: '張三',
      techLeadUserId: 7, techLeadUserName: '張三',
      uiDesignerUserId: 7, uiDesignerUserName: '張三',
      qaLeadUserId: 7, qaLeadUserName: '張三',
      opsLeadUserId: 7, opsLeadUserName: '張三',
    })
  })

  it('必填未齐时不发请求；编辑提交带上乐观锁 expectedVersion 与负责人 ID', async () => {
    renderAt('/rdm-project-detail?id=5&mode=edit')
    const submit = await screen.findByRole('button', { name: /保存修改/ })

    // 先清空必填的项目名称：校验必须挡住提交（§B.3 校验 → 提交顺序）
    fireEvent.change(screen.getByPlaceholderText('輸入項目名稱'), { target: { value: '' } })
    fireEvent.click(submit)
    await waitFor(() => expect(screen.getByText('請輸入項目名稱')).toBeInTheDocument())
    expect(updateProject).not.toHaveBeenCalled()

    fireEvent.change(screen.getByPlaceholderText('輸入項目名稱'), { target: { value: '演示項目改' } })
    fireEvent.click((await screen.findAllByRole('button', { name: '挑人員' }))[0])
    fireEvent.click(submit)

    await waitFor(() => expect(updateProject).toHaveBeenCalledTimes(1))
    const [id, payload] = vi.mocked(updateProject).mock.calls[0]
    expect(id).toBe(5)
    expect(payload).toMatchObject({ name: '演示項目改', pmUserId: 7, pmUserName: '張三', expectedVersion: 3 })
  })
})
