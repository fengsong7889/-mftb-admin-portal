import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { fetchRequirementPage, fetchScopeCounts } from '../../api/rdm'
import RequirementList from './RequirementList'

// 横幅文案已接入 i18n，用例固定走繁體語境（無 localStorage 記錄時默認 en）
beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

/**
 * 「需求跟进清单」的执行侧地板测试（pageRole=legacy，默认视角 mine）。
 *
 * 钉住用户提的口径：需求跟进清单只看「已分配到产品」的需求。
 *  1. 取数必须带 executionOnly=true —— 服务端据此排除准入前（草稿/待审批/审批驳回）与需求池（待分配），
 *     这是「跟进清单怎么会有待审批需求」的根因修复（后端地板是权威边界）；
 *  2. 计数走同一口径（fetchScopeCounts(true)），避免视图栏数字与列表行数分叉；
 *  3. 客户端双保险：即便后端未升级把准入前/需求池行透出来，前端也过滤掉并顶横幅告知去向。
 */

vi.mock('../../api/rdm', () => ({
  fetchRequirementPage: vi.fn(),
  fetchScopeCounts: vi.fn().mockResolvedValue({}),
  fetchRequirementStats: vi.fn().mockResolvedValue({}),
  fetchProductOptions: vi.fn().mockResolvedValue([]),
  fetchProjectPage: vi.fn().mockResolvedValue({ records: [], total: 0 }),
  fetchIterations: vi.fn().mockResolvedValue([]),
  claimRequirement: vi.fn(),
  submitRequirement: vi.fn(),
  urgeRequirement: vi.fn(),
  withdrawRequirement: vi.fn(),
}))
vi.mock('../../api/department', () => ({ fetchDepartments: vi.fn().mockResolvedValue([]) }))
vi.mock('../../api/employee', () => ({ fetchEmployeeIdOptions: vi.fn().mockResolvedValue([]) }))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => false, user: { empId: 'MF00011' } }),
}))
vi.mock('./requirementExport', () => ({ exportRequirementRows: vi.fn() }))

const baseRow = {
  priority: 'P2',
  reqType: 'OPTIMIZE',
  submitterName: '測試提出人',
  submitDeptName: '技術部',
}

/** 三行覆盖地板边界：待审批（准入前）/ 需求池（待分配）都应被挡下，只有已分配才留下 */
const pendingRow = { ...baseRow, id: 1, reqNo: null, title: '待審批的需求行', status: 'intake_pending' }
const poolRow = { ...baseRow, id: 2, reqNo: null, title: '需求池待分配行', status: 'pool' }
const assignedRow = { ...baseRow, id: 3, reqNo: 'XQ202610140003', title: '已分配執行中行', status: 'assigned' }

beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchScopeCounts).mockClear()
  vi.mocked(fetchRequirementPage).mockClear()
})

describe('需求跟进清单（执行侧地板）', () => {
  it('取数带 executionOnly=true，计数走同一口径', async () => {
    vi.mocked(fetchRequirementPage).mockResolvedValue({ records: [assignedRow], total: 1 })
    render(<MemoryRouter><RequirementList /></MemoryRouter>)
    await screen.findByText('已分配執行中行')

    // 第二个参数是取消信号
    expect(fetchRequirementPage).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'mine', executionOnly: true }),
      expect.anything(),
    )
    expect(fetchScopeCounts).toHaveBeenCalledWith(true)
  })

  it('客户端过滤准入前与需求池行，只渲染已分配到产品的需求，并顶横幅告知去向', async () => {
    // 模拟后端未升级：把三态一起透出来，验证前端双保险确实挡下准入前 + 需求池
    vi.mocked(fetchRequirementPage).mockResolvedValue({
      records: [pendingRow, poolRow, assignedRow],
      total: 3,
    })
    render(<MemoryRouter><RequirementList /></MemoryRouter>)
    await screen.findByText('已分配執行中行')

    expect(screen.queryByText('待審批的需求行')).not.toBeInTheDocument()
    expect(screen.queryByText('需求池待分配行')).not.toBeInTheDocument()
    expect(screen.getByText(/只跟進「已分配到產品」的需求/)).toBeInTheDocument()
    expect(screen.getByText(/待分配（需求池）請到「認領\/分配」菜單/)).toBeInTheDocument()
  })
})
