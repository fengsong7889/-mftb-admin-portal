/**
 * 研发任务表单：需求计划上线继承 / 标题自动带入 / 所属部门取最新任职。
 *
 * 三条都是「拆任务时容易出错」的入口：
 * - 计划上线默认继承需求上線，不允许排到需求上线之后；
 * - 标题默认照抄需求标题（不带编号），手改后不再被覆盖；
 * - 所属部门取负责人预检接口（任职记录）的返回值，而不是员工列表里的账号快照。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '@/i18n'
import {
  checkTaskOwner,
  fetchReqTasks,
  fetchRequirementDetail,
  fetchRequirementPage,
} from '@/api/rdm'
import TaskForm from './TaskForm'

vi.mock('@/api/employee', () => ({
  fetchEmployees: vi.fn(async () => ({ records: [], total: 0 })),
  fetchEmployee: vi.fn(),
}))

vi.mock('@/api/rdmTaskType', () => ({
  fetchTaskTypeOptions: vi.fn(async () => [
    { code: 'frontend', label: '前端', color: '#1890FF', enabled: 1, sortOrder: 1 },
  ]),
}))

vi.mock('@/api/rdm', async () => {
  const actual = await vi.importActual<typeof import('@/api/rdm')>('@/api/rdm')
  return {
    ...actual,
    fetchRequirementDetail: vi.fn(),
    fetchRequirementPage: vi.fn(),
    fetchReqTasks: vi.fn(),
    checkTaskOwner: vi.fn(),
    saveTask: vi.fn(),
  }
})

/** 按 Form.Item 的 label 文案定位其内部输入框（antd 的 label 与无 name 字段不会自动关联） */
function fieldInput(labelText: string): HTMLInputElement | null {
  const label = Array.from(document.querySelectorAll('.ant-form-item-label label'))
    .find(l => (l.textContent ?? '').includes(labelText))
  return (label?.closest('.ant-form-item')?.querySelector('input') as HTMLInputElement | null) ?? null
}

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchRequirementDetail).mockResolvedValue({
    id: 9,
    reqNo: 'XQSP202610001',
    title: '盤活復甦定價規則',
    status: 'scheduled',
    iterationCode: 'SP202610001',
    planReleaseDate: '2026-12-31',
  } as never)
  vi.mocked(fetchReqTasks).mockResolvedValue([])
  vi.mocked(fetchRequirementPage).mockResolvedValue({ records: [], total: 0 } as never)
  vi.mocked(checkTaskOwner).mockResolvedValue({} as never)
})

describe('TaskForm 需求计划上线与标题自动带入', () => {
  it('新建任务：标题取需求标题（不带编号），计划上线默认继承需求上线', async () => {
    render(<MemoryRouter initialEntries={['/rdm-task?reqId=9']}><TaskForm /></MemoryRouter>)

    await waitFor(() => {
      const title = document.querySelector<HTMLInputElement>('#title')
      expect(title?.value).toBe('盤活復甦定價規則')
    })
    await waitFor(() => {
      expect(fieldInput('計劃上線')?.value).toBe('2026-12-31')
    })
    // 需求计划上线以醒目横幅呈现，不再是属性面板里的一行小字
    expect(document.querySelector('.rdm-plan-banner')?.textContent).toContain('2026-12-31')
  })

  it('编辑任务：保留原任务标题与任务自己的计划上线，不被需求值覆盖', async () => {
    vi.mocked(fetchReqTasks).mockResolvedValue([{
      id: 5,
      taskNo: 'RT202610010001',
      reqId: 9,
      taskType: 'frontend',
      title: '報表導出（前端）',
      ownerUserId: 15,
      ownerName: '甄榮康',
      ownerEmpNo: 'MF00015',
      status: 'todo',
      planReleaseDate: '2026-12-20',
    } as never])

    render(<MemoryRouter initialEntries={['/rdm-task?reqId=9&id=5']}><TaskForm /></MemoryRouter>)

    await waitFor(() => {
      expect(document.querySelector<HTMLInputElement>('#title')?.value).toBe('報表導出（前端）')
    })
    await waitFor(() => {
      expect(fieldInput('計劃上線')?.value).toBe('2026-12-20')
    })
  })
})

describe('TaskForm 所属部门取最新任职', () => {
  it('部门回显以负责人预检接口（任职记录）为准', async () => {
    vi.mocked(checkTaskOwner).mockResolvedValue({
      able: true,
      ownerName: '甄榮康',
      department: '前端研發部',
    } as never)
    vi.mocked(fetchReqTasks).mockResolvedValue([{
      id: 5,
      taskNo: 'RT202610010001',
      reqId: 9,
      taskType: 'frontend',
      title: '報表導出（前端）',
      ownerUserId: 15,
      ownerName: '甄榮康',
      ownerEmpNo: 'MF00015',
      status: 'todo',
    } as never])

    render(<MemoryRouter initialEntries={['/rdm-task?reqId=9&id=5']}><TaskForm /></MemoryRouter>)

    await waitFor(() => {
      expect(fieldInput('所屬部門')?.value).toBe('前端研發部')
    })
  })
})
