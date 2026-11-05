/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 预约记录（行政台账）的取数口径回归。
 *
 * <p>钉住一件写错就会让行政「找不到会」的事：列表默认按会议开始时间倒序，最近一场在最前。
 * 排序与分页都在服务端，前端只表达 sort 口径 —— 只重排当前页会得到「第一页看着对、翻页就乱」的假排序。
 * sort 属于本页固定口径，不属于搜索条件，因此重置与筛选都不允许把它丢掉。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BookingRecords from './index'
import { fetchMeetingRooms, fetchMeetings } from '@/api/meeting'
import i18n from '@/i18n'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    user: { id: 1, name: '系統管理員', empId: 'MF00001', username: 'admin' },
  }),
}))

vi.mock('@/api/meeting', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/meeting')>()
  return {
    // 只 mock 取数：toMeetingIso 等纯函数保持真实，否则筛选断言会变成对 mock 的断言
    ...actual,
    fetchMeetings: vi.fn(),
    fetchMeetingRooms: vi.fn(),
  }
})

const ROW = {
  id: 12,
  bookingNo: 'MT202611050001',
  title: '运营需求对接',
  status: 'checked_in',
  phase: 'ongoing',
  startTime: '2026-11-05 15:30:00',
  endTime: '2026-11-05 16:45:00',
  timeText: '2026-11-05 15:30–16:45',
  durationMinutes: 75,
  roomId: 9,
  roomName: '产品会议室',
  roomLocation: '21F · 产品区域',
  organizerId: 1,
  organizerName: '系統管理員',
  attendeeCount: 4,
  bizType: 'general',
  myRole: 'organizer',
  canEdit: true,
  canCancel: true,
  canRelease: false,
  version: 1,
}

function mountRecords() {
  return render(<MemoryRouter initialEntries={['/meeting-record']}><BookingRecords /></MemoryRouter>)
}

describe('預約記錄 › 时间倒序口径', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // 组件文案已 i18n 化：测试必须钉住语言，否则 jsdom 下走 fallbackLng=en
    await i18n.changeLanguage('zh-TW')
    vi.mocked(fetchMeetings).mockResolvedValue({ page: { records: [ROW], total: 1 } } as never)
    vi.mocked(fetchMeetingRooms).mockResolvedValue({ page: { records: [], total: 0 } } as never)
  })

  it('首屏即按开始时间倒序请求，最近一场排在最前', async () => {
    mountRecords()
    expect(fetchMeetings).toHaveBeenCalledWith(expect.objectContaining({ scope: 'all', sort: 'time-desc' }))
    // 倒序取回的行确实落到表格，不是只把参数递出去就算完
    expect(await screen.findByText('MT202611050001')).toBeInTheDocument()
  })

  it('筛选后仍然倒序，并且回到第 1 页', async () => {
    mountRecords()
    fireEvent.change(await screen.findByPlaceholderText('單號／主題'), { target: { value: 'MT2026' } })
    fireEvent.click(screen.getByRole('button', { name: /查\s*詢/ }))

    await waitFor(() => expect(fetchMeetings).toHaveBeenCalledTimes(2))
    expect(fetchMeetings).toHaveBeenLastCalledWith(expect.objectContaining({
      keyword: 'MT2026', page: 1, sort: 'time-desc',
    }))
  })

  it('重置只清搜索条件，不丢掉台账的倒序口径', async () => {
    mountRecords()
    fireEvent.change(await screen.findByPlaceholderText('單號／主題'), { target: { value: 'MT2026' } })
    fireEvent.click(screen.getByRole('button', { name: /查\s*詢/ }))
    await waitFor(() => expect(fetchMeetings).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: /重\s*置/ }))
    await waitFor(() => expect(fetchMeetings).toHaveBeenCalledTimes(3))
    // 重置后旧条件必须消失，但 sort 是本页口径而不是搜索条件，不能跟着一起清
    const resetQuery = vi.mocked(fetchMeetings).mock.calls.at(-1)![0]
    expect(resetQuery.keyword).toBeUndefined()
    expect(resetQuery.page).toBe(1)
    expect(resetQuery.sort).toBe('time-desc')
  })
})
