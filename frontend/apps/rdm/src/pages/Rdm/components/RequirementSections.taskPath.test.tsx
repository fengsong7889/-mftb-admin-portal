/**
 * 子任务小节入口回归：从需求详情跳任务表单必须透传 from。
 *
 * 任务表单保存后会回退到详情页；from 丢了侧栏高亮就会回落「需求跟进清单」，
 * 从工作台/看板进来的用户会看到菜单自己跳走。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import i18n from '@/i18n'
import type { RdmDeliverySummary } from '@/api/rdm'
import { TaskSection } from './RequirementSections'

vi.mock('@/api/rdmTaskType', () => ({
  fetchTaskTypeOptions: vi.fn(async () => []),
}))

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}

function renderTaskSection(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <TaskSection
        summary={{ tasks: [], prds: [], milestones: [], changes: [], reviews: [] } as unknown as RdmDeliverySummary}
        editable
        canCreate
        reqId={9}
      />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('TaskSection 新增任务入口', () => {
  it('透传详情页的 from，返回高亮仍跟随来源菜单', async () => {
    renderTaskSection('/rdm-detail?id=9&from=rdm-workbench')
    fireEvent.click(await screen.findByRole('button', { name: /新增任務/ }))
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/rdm-task?reqId=9&from=rdm-workbench')
    })
  })

  it('无来源时不拼 from，保持原链接形态', async () => {
    renderTaskSection('/rdm-detail?id=9')
    fireEvent.click(await screen.findByRole('button', { name: /新增任務/ }))
    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/rdm-task?reqId=9')
    })
  })
})
