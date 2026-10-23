/**
 * 任务表单返回落点接线回归（需求跟进清单「返回穿越」bug）。
 *
 * 从需求详情进入新增任务后，点取消/保存必须退回进入前的那条详情记录，
 * 不能再 push 一条 /rdm-detail，否则连点返回会在「详情 ↔ 新增任务」之间来回穿越。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import i18n from '../../i18n'
import { checkTaskOwner, fetchReqTasks, fetchRequirementDetail, fetchRequirementPage } from '../../api/rdm'
import TaskForm from './TaskForm'

vi.mock('../../api/employee', () => ({
  fetchEmployees: vi.fn(async () => ({ records: [], total: 0 })),
  fetchEmployee: vi.fn(),
}))

vi.mock('../../api/rdmTaskType', () => ({
  fetchTaskTypeOptions: vi.fn(async () => []),
}))

vi.mock('../../api/rdm', async () => {
  const actual = await vi.importActual<typeof import('../../api/rdm')>('../../api/rdm')
  return {
    ...actual,
    fetchRequirementDetail: vi.fn(),
    fetchRequirementPage: vi.fn(),
    fetchReqTasks: vi.fn(),
    checkTaskOwner: vi.fn(),
    saveTask: vi.fn(),
  }
})

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchRequirementDetail).mockResolvedValue({
    id: 9, reqNo: 'XQSP202610001', title: '報表導出', status: 'assigned',
    iterationCode: 'SP202610001',
  } as never)
  vi.mocked(fetchReqTasks).mockResolvedValue([])
  vi.mocked(fetchRequirementPage).mockResolvedValue({ records: [], total: 0 } as never)
  vi.mocked(checkTaskOwner).mockResolvedValue({} as never)
})

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}

describe('TaskForm 返回落点', () => {
  it('取消时退回进入前的详情记录（保留 tab/from），不 push 新详情', async () => {
    render(
      <MemoryRouter initialEntries={['/rdm-detail?id=9&tab=task&from=rdm-workbench', '/rdm-task?reqId=9&from=rdm-workbench']}>
        <TaskForm />
        <LocationProbe />
      </MemoryRouter>,
    )
    // jsdom 里整页挂载较慢（antd 表单 + 远程下拉），直接定位底部操作区更稳
    const footer = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('.form-footer')
      expect(el).toBeTruthy()
      return el as HTMLElement
    }, { timeout: 20000 })
    fireEvent.click(footer.querySelector('button') as HTMLButtonElement)
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/rdm-detail?id=9&tab=task&from=rdm-workbench')
    })
  })
})
