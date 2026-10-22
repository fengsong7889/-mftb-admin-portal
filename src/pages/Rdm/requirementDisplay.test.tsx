import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { fetchRequirementPage } from '../../api/rdm'
import { RDM_SCOPE } from '../../constants/rdm'
import RequirementList from './RequirementList'
import AcceptanceList from './AcceptanceList'
import { ComplexityTag, PriorityTag } from './components/Tags'

vi.mock('../../api/rdm', () => ({
  fetchRequirementPage: vi.fn(),
  fetchScopeCounts: vi.fn().mockResolvedValue({ mine: 7, todo: 2, product: 1, delivery: 3 }),
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
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => false, user: { empId: 'TEST001' } }),
}))
vi.mock('./requirementExport', () => ({ exportRequirementRows: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  // i18n/index.ts 在模块加载时执行 .use(initReactI18next)：缺这个导出会让整条引用链在 import 期就抛错
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const title = '測試需求全生命週期流程驗證—長標題不可覆蓋相鄰的狀態和優先級欄位'.repeat(3)
const department = '董事長兼首席執行官辦公室與跨部門協作中心'
const row = {
  id: 91,
  reqNo: 'XQ202610140001',
  title,
  priority: 'medium',
  complexity: 'normal',
  reqType: 'OPTIMIZE',
  status: 'scheduled',
  submitterName: '測試提出人',
  submitDeptName: department,
  blockedFlag: true,
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchRequirementPage).mockResolvedValue({ records: [row], total: 1 })
})

function assertSeparateColumns() {
  expect(screen.getByRole('columnheader', { name: '提出人' })).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: '提出部門' })).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: '需求編號' })).toBeInTheDocument()
  expect(screen.queryByRole('columnheader', { name: '提出人/部門' })).not.toBeInTheDocument()
  const link = screen.getByRole('link', { name: title })
  expect(link).toHaveClass('rdm-table-title__link')
  expect(link).toHaveAttribute('title', title)
  const titleCell = link.closest('td')!
  expect(titleCell).toHaveClass('ant-table-cell-ellipsis')
  expect(within(titleCell).queryByText(row.reqNo)).not.toBeInTheDocument()
  expect(screen.getAllByText(row.reqNo)).toHaveLength(1)
  const personCell = screen.getByText(row.submitterName).closest('td')
  const deptCell = screen.getByText(department).closest('td')
  expect(personCell).not.toBe(deptCell)
  expect(deptCell).toHaveClass('ant-table-cell-ellipsis')
  expect(screen.getByText('中等')).toBeInTheDocument()
  expect(screen.queryByText('medium')).not.toBeInTheDocument()
}

describe('需求列表展示回归', () => {
  it.each([RDM_SCOPE.MINE, RDM_SCOPE.POOL, RDM_SCOPE.APPROVING])('视角 %s 的标题、编号和部门独立展示', async scope => {
    // 旧配置隐藏编号，升级布局后必须恢复唯一的编号列。
    localStorage.setItem('table-config-rdm-requirement-v2', JSON.stringify([
      { key: 'title', visible: true }, { key: 'reqNo', visible: false },
      { key: 'submitter', visible: true }, { key: 'action', visible: true },
    ]))
    render(<MemoryRouter><RequirementList defaultScope={scope} /></MemoryRouter>)
    await screen.findByRole('link', { name: title })
    assertSeparateColumns()
    expect(screen.getByRole('link', { name: title })).toHaveAttribute('href', '#/rdm-detail?id=91&tab=activity')
    expect(screen.getByText('阻塞')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '認領' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '分配' })).not.toBeInTheDocument()
  })

  /**
   * 三张职责页共用详情落地页，进详情的链接必须带上来源菜单，
   * 侧栏高亮才跟得上用户点进来的那一张（见 menuDataSource.resolveRdmDetailMenuKey）。
   * <p>legacy（需求跟进清单）不额外挂参数：它就是默认归属，上方用例已钉住 href 不变。
   */
  it.each([
    ['intake', 'rdm-intake-approval'] as const,
    ['management', 'rdm-intake'] as const,
  ])('%s 侧进详情时带上 from=%s', async (pageRole, menuKey) => {
    render(
      <MemoryRouter>
        <RequirementList pageRole={pageRole} defaultScope={RDM_SCOPE.INTAKE} scopeTabs={[RDM_SCOPE.INTAKE]} />
      </MemoryRouter>,
    )
    const link = await screen.findByRole('link', { name: title })
    expect(link).toHaveAttribute('href', `#/rdm-detail?id=91&tab=activity&from=${menuKey}`)
  })

  /**
   * 多切片页的视图栏必须还在：“只有 1 个切片才隐去视图栏”不是为了好看而删功能，
   * 需求清单有 mine/todo/product/delivery 四个切片，用户靠它切数据范围与看各自行数。
   */
  it('需求清单（多切片）仍渲染视图栏与各切片计数', async () => {
    // jsdom 视口宽 1024 < 1440，未存过偏好时视图栏默认收起，这里显式展开
    localStorage.setItem('rdm-requirement:rail', '0')
    render(<MemoryRouter><RequirementList /></MemoryRouter>)
    await screen.findByRole('link', { name: title })

    const rail = document.querySelector('.rdm-view-rail')
    expect(rail).not.toBeNull()
    expect(within(rail as HTMLElement).getByText('我提的需求')).toBeInTheDocument()
    expect(within(rail as HTMLElement).getByText('7')).toBeInTheDocument()
  })

  it('验收三个页签均保持字段独立和中文优先级', async () => {
    render(<MemoryRouter><AcceptanceList /></MemoryRouter>)
    await screen.findByRole('link', { name: title })
    assertSeparateColumns()
    for (const tab of ['上線後待評分', '我的驗收記錄']) {
      fireEvent.click(screen.getByRole('tab', { name: tab }))
      await screen.findByRole('link', { name: title })
      assertSeparateColumns()
    }
  })

  it('共享标签兼容大小写、旧规模及空值，不显示英文编码', () => {
    const { rerender } = render(<><PriorityTag priority="medium" /><ComplexityTag complexity="normal" /></>)
    expect(screen.getByText('中等')).toBeInTheDocument()
    expect(screen.getByText('一般')).toBeInTheDocument()
    rerender(<><PriorityTag priority="p2" /><ComplexityTag complexity=" simple " /></>)
    expect(screen.getByText('P2 常規')).toBeInTheDocument()
    expect(screen.getByText('簡單')).toBeInTheDocument()
    rerender(<ComplexityTag complexity={null} />)
    expect(screen.getByText('-')).toBeInTheDocument()
    rerender(<PriorityTag priority="unmapped" />)
    expect(screen.getByText('未識別')).toHaveAttribute('title', 'unmapped')
    expect(screen.queryByText('unmapped')).not.toBeInTheDocument()
  })
})
