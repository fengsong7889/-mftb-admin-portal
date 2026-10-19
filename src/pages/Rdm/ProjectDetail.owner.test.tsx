/**
 * 项目负责人「选人 → 提交 → 回显」端到端契约测试（刻意不 mock EmployeeSelect）。
 *
 * 为什么还要再写一份：ProjectDetail.form.test.tsx 把 EmployeeSelect 桩成了一个按钮，
 * 并按「先 onChange 后 onPick」的手工顺序调用；而真实组件是「先 onPick 后 onChange」，
 * 且它拿到的 onChange 已经是 Form.Item 注入后的包装函数（会先把字段值覆盖成 ID 数组，
 * 再回调 JSX 上那个 onChange）。桩件正好绕开这两处真正的耦合点，于是测试全绿、
 * 界面上六个负责人却一个都回显不出来。本文件用真实组件复现并钉死正确行为。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { createProject, fetchProjectChecklist, fetchProjectDetail, fetchProjectPending, updateProject } from '../../api/rdm'
import ProjectDetail from './ProjectDetail'

/** 与后端 EmployeeVO 同形的在职员工桩（id 是 sys_user.id，empId 是工号） */
const emp = vi.hoisted(() => ({
  id: 7, username: 'MF00007', name: '古月', empId: 'MF00007', role: 'guest', status: 1,
  department: '產品部', functionRoleIds: [] as number[],
}))

vi.mock('../../api/employee', () => ({
  fetchEmployees: vi.fn(async () => ({ records: [emp], total: 1 })),
  fetchEmployee: vi.fn(async () => emp),
}))

// 只覆盖本页真正调用的八个写/读接口，其余导出保留真实实现：
// 整模块替换时，只要被间接导入的模块用到别的 rdm 导出，就会报
// 「No xxx export is defined on the mock」
vi.mock('../../api/rdm', async () => {
  const actual = await vi.importActual<typeof import('../../api/rdm')>('../../api/rdm')
  return {
    ...actual,
    fetchProjectDetail: vi.fn(),
    fetchProjectChecklist: vi.fn(),
    fetchProjectPending: vi.fn(),
    urgeProject: vi.fn(),
    addProjectMember: vi.fn(),
    removeProjectMember: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
  }
})

const detail = {
  id: 5, projectNo: 'PJ-005', name: '演示項目', objective: '目標', status: 'in_progress',
  pmUserName: '古月', pmUserId: 7,
  productOwnerUserName: '古月', productOwnerUserId: 7,
  planStartDate: '2026-01-01', planEndDate: '2026-06-01',
  pausedFlag: 0, riskFlag: 0, overdueFlag: 0, deliveredCount: 0, totalDeliveryCount: 0,
  nextDeliveryDate: null, blockedCount: 0, pendingDecisionCount: 0, defaultAcceptancePath: 'A',
  version: 3, createdAt: '2026-01-02T09:00:00', updatedAt: '2026-04-30T10:00:00',
  updatedBy: '古月',
  members: [], scopeSummaryJson: null,
} as never

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchProjectDetail).mockResolvedValue(detail)
  vi.mocked(fetchProjectChecklist).mockResolvedValue([] as never)
  vi.mocked(fetchProjectPending).mockResolvedValue([] as never)
  vi.mocked(createProject).mockResolvedValue(detail)
  vi.mocked(updateProject).mockResolvedValue(undefined)
})

const renderAt = (entry: string) => render(
  <MemoryRouter initialEntries={[entry]}><ProjectDetail /></MemoryRouter>,
)

/** 六个负责人按 JSX 顺序取 combobox：[0]項目經理 [1]產品負責人 [2]技術 [3]UI [4]測試 [5]運維 */
const ownerCombobox = (index: number) => screen.getAllByRole('combobox')[index]

/** 打开下拉并点选唯一候选员工（jsdom 里 mouseDown 不会带出 focus，必须显式触发一次搜索） */
async function pickEmployee(index: number) {
  const combo = ownerCombobox(index)
  fireEvent.mouseDown(combo)
  fireEvent.change(combo, { target: { value: emp.name } })
  const option = await screen.findByText(emp.name)
  fireEvent.click(option)
}

describe('ProjectDetail 底部最后更新（§D.4）', () => {
  it('详情页 footer 同时展示最后更新人与最后更新时间', async () => {
    renderAt('/rdm-project-detail?id=5')
    await screen.findByText('項目摘要')
    // 「古月」在摘要里会出现多次（经理/产品负责人），所以只断言 footer 容器自身
    const footer = document.querySelector('.rdm-detail-footer')
    expect(footer?.textContent).toContain('最後更新人')
    expect(footer?.textContent).toContain('古月')
    expect(footer?.textContent).toContain('2026-04-30 10:00')
  })
})

describe('ProjectDetail 负责人回显（真实 EmployeeSelect）', () => {
  it('编辑态把已存的负责人显示成姓名，而不是裸 ID 或空白', async () => {
    renderAt('/rdm-project-detail?id=5&mode=edit')
    await screen.findByDisplayValue('演示項目')
    // 两个已配置的负责人都要以姓名回显（缺陷现场：这里一个都渲染不出来）
    expect(await screen.findAllByText('古月')).toHaveLength(2)
  })
})

describe('ProjectDetail 负责人提交（真实 EmployeeSelect）', () => {
  it('新增时选中的负责人，userId 与姓名快照都要进 payload', async () => {
    renderAt('/rdm-project-detail?mode=create')
    fireEvent.change(await screen.findByPlaceholderText('輸入項目名稱'), { target: { value: '推廣金重構項目' } })
    await pickEmployee(0)

    fireEvent.click(screen.getByRole('button', { name: /創建項目/ }))
    await waitFor(() => expect(createProject).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createProject).mock.calls[0][0]).toMatchObject({
      name: '推廣金重構項目', pmUserId: 7, pmUserName: '古月',
    })
  })

  it('没动过的负责人字段按库内原值回传，不会被提交清空', async () => {
    renderAt('/rdm-project-detail?id=5&mode=edit')
    fireEvent.click(await screen.findByRole('button', { name: /保存修改/ }))
    await waitFor(() => expect(updateProject).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateProject).mock.calls[0][1]).toMatchObject({
      pmUserId: 7, pmUserName: '古月',
      productOwnerUserId: 7, productOwnerUserName: '古月',
      expectedVersion: 3,
    })
  })
})
