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
  fetchScopeCounts: vi.fn().mockResolvedValue({}),
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
  useAuth: () => ({ hasPermission: () => false, user: { empId: 'TEST001' } }),
}))
vi.mock('./requirementExport', () => ({ exportRequirementRows: vi.fn() }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

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
