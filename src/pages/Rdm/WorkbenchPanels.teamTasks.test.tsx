/**
 * 研发工作台 · 团队任务切换
 *
 * 钉住三件事：
 *  1. 默认只看自己的任务，标题为「我的研發任務」；
 *  2. 切换到团队成员后调用团队任务接口，标题变为「團隊成員任務」；
 *  3. 无共同项目等权限错误必须把后端原文展示出来，不能伪装成「对方没任务」。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n'
import { MyDevTasksPanel } from './WorkbenchPanels'
import * as rdmApi from '../../api/rdm'
import type { RdmTaskItem } from '../../api/rdm'

vi.mock('../../api/rdm', () => ({
  fetchMyTasks: vi.fn(),
  fetchTeamMembers: vi.fn(),
  fetchTeamTasks: vi.fn(),
  fetchIssues: vi.fn().mockResolvedValue([]),
  fetchReleaseBatches: vi.fn().mockResolvedValue([]),
  fetchTestBatches: vi.fn().mockResolvedValue([]),
}))

/*
 * 面板按角色决定拉取口径（管理员取全部任务），必须提供登录态；
 * 这里只换掉 useAuth，保留 AuthProvider 等其余导出，避免连带拆掉上下文模块。
 */
vi.mock('../../contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../contexts/AuthContext')>()
  return {
    ...actual,
    useAuth: () => ({ user: { id: 8, role: 'user', name: '張三', empNo: 'MF00008' } }),
  }
})

const api = vi.mocked(rdmApi)

function task(id: number, title: string): RdmTaskItem {
  return {
    id,
    taskNo: `RT20261022${id}`,
    reqId: 100 + id,
    reqTitle: '測試需求',
    taskType: 'backend',
    title,
    status: 'doing',
    progress: 10,
    ownerUserId: 8,
    ownerName: '張三',
  } as RdmTaskItem
}

beforeAll(async () => {
  await i18n.changeLanguage('zh-TW')
})

beforeEach(() => {
  vi.clearAllMocks()
  api.fetchMyTasks.mockResolvedValue([task(1, '我的任務甲')])
  api.fetchTeamMembers.mockResolvedValue([
    { userId: 8, name: '張三', empNo: 'MF00008', sharedProjectCount: 1 },
  ])
})

function renderPanel() {
  return render(
    <MemoryRouter>
      <MyDevTasksPanel />
    </MemoryRouter>,
  )
}

async function switchToMember() {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '切換查看成員' }))
  fireEvent.click(await screen.findByText('張三（MF00008）'))
}

describe('研发工作台 · 我的研發任務面板', () => {
  it('默认只加载自己的任务', async () => {
    renderPanel()

    expect(await screen.findByText('我的任務甲')).toBeInTheDocument()
    expect(screen.getByText('我的研發任務')).toBeInTheDocument()
    expect(api.fetchMyTasks).toHaveBeenCalledTimes(1)
    expect(api.fetchTeamTasks).not.toHaveBeenCalled()
  })

  it('切换到团队成员后加载对方任务并切换标题', async () => {
    api.fetchTeamTasks.mockResolvedValue([task(2, '張三的任務')])
    renderPanel()
    await screen.findByText('我的任務甲')

    await switchToMember()

    await waitFor(() => expect(api.fetchTeamTasks).toHaveBeenCalledWith(8))
    expect(await screen.findByText('張三的任務')).toBeInTheDocument()
    expect(screen.getByText('團隊成員任務')).toBeInTheDocument()
  })

  it('无共同项目时展示后端原文，不伪装成空任务', async () => {
    api.fetchTeamTasks.mockRejectedValue(new Error('您與該成員沒有共同項目，無法查看其任務'))
    renderPanel()
    await screen.findByText('我的任務甲')

    await switchToMember()

    expect(await screen.findByText('您與該成員沒有共同項目，無法查看其任務')).toBeInTheDocument()
  })
})
