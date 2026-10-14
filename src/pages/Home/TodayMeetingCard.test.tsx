/**
 * 首页「今日會議」卡片回归用例。
 *
 * <p>为什么要钉住空态：早期版本在"今天没有会议"时直接 return null，
 * 结果是「今天没会」和「这个功能不存在」长得一模一样，预约入口跟着一起消失。
 * 浏览器实测发现后补了空态分支，本用例锁住三种状态的区分：
 * 无菜单/请求失败 → 不渲染；有权限但今天没会 → 渲染空态与入口。
 */
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const hasMenuPermission = vi.fn(() => true)

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ hasMenuPermission }),
}))

vi.mock('../../api/meeting', () => ({
  fetchMyMeetingSummary: vi.fn(),
}))

import { fetchMyMeetingSummary } from '../../api/meeting'
import TodayMeetingCard from './TodayMeetingCard'

/** 卡片内部用 useNavigate 跳「我的會議」，测试必须提供 Router 上下文 */
const mount = () => render(<MemoryRouter><TodayMeetingCard /></MemoryRouter>)

const summary = (overrides: Record<string, unknown> = {}) => ({
  todayCount: 0, upcomingCount: 0, pendingResponseCount: 0,
  nextTitle: null, nextStartTime: null, nextRoomName: null, ...overrides,
})

describe('首頁今日會議卡片', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasMenuPermission.mockReturnValue(true)
  })

  it('今天没有会议时显示空态与预约入口，而不是整块消失', async () => {
    vi.mocked(fetchMyMeetingSummary).mockResolvedValue(summary() as never)
    mount()
    const banner = await screen.findByText(/今天沒有與你相關的會議/)
    expect(banner).toBeInTheDocument()
    expect(screen.getByText('去預約會議室')).toBeInTheDocument()
    expect(screen.getByText('今日會議')).toBeInTheDocument()
  })

  it('有会议时显示场次数与下一场信息', async () => {
    vi.mocked(fetchMyMeetingSummary).mockResolvedValue(summary({
      todayCount: 3, pendingResponseCount: 2,
      nextTitle: 'Q4 需求評審', nextStartTime: '2026-10-13 15:00:00', nextRoomName: '大會議室',
    }) as never)
    mount()
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
    expect(screen.getByText(/下一場：Q4 需求評審/)).toBeInTheDocument()
    expect(screen.getByText(/15:00/)).toBeInTheDocument()
    expect(screen.getByText(/待你響應/)).toBeInTheDocument()
  })

  it('请求失败时整卡不渲染，不把错误当成「今天没会」', async () => {
    vi.mocked(fetchMyMeetingSummary).mockRejectedValue(new Error('403'))
    const { container } = mount()
    await waitFor(() => expect(fetchMyMeetingSummary).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('无「我的會議」菜单时不请求也不渲染', async () => {
    hasMenuPermission.mockReturnValue(false)
    const { container } = mount()
    expect(container).toBeEmptyDOMElement()
    expect(fetchMyMeetingSummary).not.toHaveBeenCalled()
  })
})
