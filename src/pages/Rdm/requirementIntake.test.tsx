import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { fetchRequirementPage, fetchScopeCounts } from '../../api/rdm'
import RequirementIntake from './RequirementIntake'

/**
 * 「提交需求」菜单的视图形态测试。
 *
 * 钉住用户提的三件事：
 *  1. 左侧【视图】栏不再出现 —— 拆页后它只剩一个切片，分组标题「我的需求」点不动，
 *     用户把这读成按钮坏了；
 *  2. 列表一次给出「自己提交的 + 待自己审批的」，由后端 intake 合并视角一条 OR 接住，
 *     前端不再靠切 Tab 拼两半；
 *  3. 旧链接 `?scope=approving` 不能把页面停在半个口径上（回落到合并视角）。
 */

vi.mock('../../api/rdm', () => ({
  fetchRequirementPage: vi.fn(),
  fetchScopeCounts: vi.fn().mockResolvedValue({ mine: 2, approving: 1, intake: 3 }),
  fetchRequirementStats: vi.fn().mockResolvedValue({}),
  fetchProductOptions: vi.fn().mockResolvedValue([]),
  fetchProjectPage: vi.fn().mockResolvedValue({ records: [], total: 0 }),
  claimRequirement: vi.fn(),
  submitRequirement: vi.fn(),
  urgeRequirement: vi.fn(),
  withdrawRequirement: vi.fn(),
}))
vi.mock('../../api/department', () => ({ fetchDepartments: vi.fn().mockResolvedValue([]) }))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => false, user: { empId: 'MF00011' } }),
}))
vi.mock('./requirementExport', () => ({ exportRequirementRows: vi.fn() }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const row = {
  id: 91,
  reqNo: 'XQ202610140001',
  title: '合并视图里的需求行',
  priority: 'P2',
  reqType: 'OPTIMIZE',
  status: 'intake_pending',
  submitterName: '測試提出人',
  submitDeptName: '技術部',
}

beforeEach(() => {
  localStorage.clear()
  // 视图栏偏好显式设为「展开」：不设的话 jsdom 窄视口默认收起，
  // “没有视图栏”的断言会变成因为收起而假绿，测不出单切片页的真正改动
  localStorage.setItem('rdm-requirement:rail', '0')
  vi.mocked(fetchRequirementPage).mockResolvedValue({ records: [row], total: 1 })
  vi.mocked(fetchScopeCounts).mockClear()
})

describe('提交需求页（合并视图）', () => {
  it('不渲染左侧视图栏，并按合并视角取数', async () => {
    render(<MemoryRouter><RequirementIntake /></MemoryRouter>)
    await screen.findByText('合并视图里的需求行')

    // 视图栏整体不出现：既没有「視圖」标题，也没有那个点不动的「我的需求」分组标题
    expect(document.querySelector('.rdm-view-rail')).toBeNull()
    expect(screen.queryByText('視圖')).not.toBeInTheDocument()
    expect(screen.queryByText('我的需求')).not.toBeInTheDocument()

    expect(fetchRequirementPage).toHaveBeenCalledWith(expect.objectContaining({ scope: 'intake' }))
    // 视图栏没了，各切片计数也就没消费方 —— 不再为它多打一次请求
    expect(fetchScopeCounts).not.toHaveBeenCalled()
  })

  it('旧链接 ?scope=approving 回落到合并视角，不退回半个切片', async () => {
    render(
      <MemoryRouter initialEntries={['/rdm-intake-approval?scope=approving']}>
        <RequirementIntake />
      </MemoryRouter>,
    )
    await screen.findByText('合并视图里的需求行')

    expect(fetchRequirementPage).toHaveBeenCalledWith(expect.objectContaining({ scope: 'intake' }))
  })

  it('工具条用视角名当页面标题，让用户知道自己在看哪一份数据', async () => {
    render(<MemoryRouter><RequirementIntake /></MemoryRouter>)
    await screen.findByText('合并视图里的需求行')
    expect(screen.getByText('我的提交與待審')).toBeInTheDocument()
  })

  it('提交侧仍给出「提需求」入口，但不给分配/认领', async () => {
    render(<MemoryRouter><RequirementIntake /></MemoryRouter>)
    await screen.findByText('合并视图里的需求行')

    fireEvent.click(screen.getByRole('button', { name: /提需求/ }))
    expect(screen.queryByRole('button', { name: '認領' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '分配' })).not.toBeInTheDocument()
  })
})
