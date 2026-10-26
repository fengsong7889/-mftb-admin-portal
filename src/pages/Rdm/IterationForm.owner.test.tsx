/**
 * 迭代编辑页「負責人回显」回归测试（不 mock EmployeeSelect）。
 *
 * 缺陷现场：迭代负责人在编辑页显示成一串数字。根因不在本页面 —— owner 字段本来就按
 * EmployeeSelect 的 number[] 契约存了 [ownerUserId]，而是组件从不按 ID 反查文案，
 * antd Select 对「值不在 options 里」的项会把裸值当文案渲染出来。
 * 这里钉住「预置 ID 必须显示成姓名」，防止以后又退回成组件外的补丁。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '@/i18n'
import { fetchIterations } from '@/api/rdm'
import IterationForm from './IterationForm'

const emp = vi.hoisted(() => ({
  id: 7, username: 'MF00007', name: '古月', empId: 'MF00007', role: 'guest', status: 1,
  department: '產品部', functionRoleIds: [] as number[],
}))

vi.mock('@/api/employee', () => ({
  fetchEmployees: vi.fn(async () => ({ records: [emp], total: 1 })),
  fetchEmployee: vi.fn(async () => emp),
}))

// 只覆盖本轮要打桩的两个接口，其余导出保留真实实现：
// 整模块替换时，只要被间接导入的模块用到别的 rdm 导出，就会报
// 「No xxx export is defined on the mock」（fetchProjectPage 就是这么挂的）
vi.mock('@/api/rdm', async () => {
  const actual = await vi.importActual<typeof import('@/api/rdm')>('@/api/rdm')
  return { ...actual, fetchIterations: vi.fn(), saveIteration: vi.fn() }
})

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchIterations).mockResolvedValue([{
    id: 3, code: 'SP202610001', name: '10 月上半迭代', iterationType: 'SPRINT',
    startDate: '2026-10-01', endDate: '2026-10-15', capacityHours: 400,
    ownerUserId: 7, ownerName: '古月', status: 'PLANNING', remark: null,
  }] as never)
})

describe('IterationForm 負責人回显', () => {
  it('编辑态把 ownerUserId 显示成姓名，不再露出裸 ID', async () => {
    render(<MemoryRouter initialEntries={['/rdm-iteration-form?id=3']}><IterationForm /></MemoryRouter>)
    expect(await screen.findByText('古月')).toBeInTheDocument()
    expect(screen.queryByText('7')).not.toBeInTheDocument()
  })
})
