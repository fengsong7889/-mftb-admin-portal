/**
 * 会议详情「會議紀要」Tab 的录入回归用例。
 *
 * <p>钉住两件写错就会误导用户的事：
 *   1. 会议一开始（进行中）就要能在详情页就地记录，而不是等散会——这是纪要的真实使用场景；
 *   2. 就地保存只追加一条议题，已存的正文/行动项/关联必须原样带回：
 *      后端把「事项」与「关联」都当成按提交内容重建，漏传等于把别人的记录清掉。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MeetingDetail from './index'
import i18n from '@/i18n'

const hasPermission = vi.fn(() => true)

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasPermission,
    user: { id: 2, name: '李四', empId: 'MF00002', username: 'lisi' },
  }),
}))

vi.mock('@/api/meeting', () => ({
  fetchMeetingDetail: vi.fn(),
  fetchMeetingEvents: vi.fn(async () => []),
  cancelMeeting: vi.fn(),
  checkinMeeting: vi.fn(),
  finishMeeting: vi.fn(),
  releaseMeeting: vi.fn(),
  respondMeeting: vi.fn(),
  issueCheckinToken: vi.fn(),
  newMeetingRequestKey: vi.fn(() => 'mm-detail-key'),
}))

vi.mock('@/api/meetingMinutes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/meetingMinutes')>()
  return {
    ...actual,
    fetchMinutes: vi.fn(),
    createMinutes: vi.fn(),
    updateMinutes: vi.fn(),
  }
})

import { fetchMeetingDetail } from '@/api/meeting'
import { createMinutes, fetchMinutes, updateMinutes } from '@/api/meetingMinutes'

/** 进行中的会议：服务端把纪要入口结论（canMinutes）与阶段一起下发 */
const ONGOING_MEETING = {
  id: 100,
  bookingNo: 'MT202610290001',
  title: 'Q4 預算復核',
  status: 'booked',
  phase: 'ongoing',
  startTime: '2026-10-29 10:00:00',
  endTime: '2026-10-29 11:00:00',
  timeText: '2026-10-29 10:00–11:00',
  durationMinutes: 60,
  roomId: 9,
  roomNo: 'MR-3F-01',
  roomName: '三號會議室',
  roomLocation: 'A 棟 3F',
  organizerId: 1,
  organizerName: '王五',
  organizerEmpNo: 'MF00001',
  attendeeCount: 3,
  bizType: 'general',
  myRole: 'organizer',
  canMinutes: true,
  minutesStatus: 'none',
  version: 1,
  attendees: [],
  notifies: [],
}

/** 纪要骨架：还没有正文，但服务端判定可编辑（身份 + 阶段都过了） */
const EMPTY_MINUTES = {
  exists: false,
  bookingId: 100,
  canEdit: true,
  minutesEnabled: true,
  content: { items: [{ topic: '', discussion: '', conclusion: '' }], actions: [], openIssues: [], absentees: [] },
}

/** 已有纪要：带一条行动项与一条关联，就地保存必须把它们带回 */
const FILLED_MINUTES = {
  exists: true,
  id: 7,
  bookingId: 100,
  minutesNo: 'MJ202610290001',
  status: 'draft',
  version: 3,
  canEdit: true,
  canSend: true,
  minutesEnabled: true,
  content: {
    items: [{ topic: '分攤口徑', discussion: '按營收', conclusion: '按營收分攤' }],
    actions: [{ content: '補財務模型', ownerUserId: 7, ownerName: '張三', dueDate: '2026-11-05' }],
    openIssues: [],
    absentees: [],
  },
  items: [{ id: 11, kind: 'ACTION', seq: 1, content: '補財務模型', ownerUserId: 7, dueDate: '2026-11-05', status: 'pending' }],
  links: [{ minutesId: 66, minutesNo: 'MJ202610220001', title: '前次会议' }],
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/meeting-detail?id=100']}>
      <Routes>
        <Route path="/meeting-detail" element={<MeetingDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function openMinutesTab() {
  fireEvent.click(await screen.findByRole('tab', { name: '會議紀要' }))
}

describe('會議詳情 › 會議紀要就地錄入', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // 组件文案已 i18n 化：测试必须钉住语言，否则 jsdom 下走 fallbackLng=en
    await i18n.changeLanguage('zh-TW')
    hasPermission.mockReturnValue(true)
    vi.mocked(fetchMeetingDetail).mockResolvedValue(ONGOING_MEETING as never)
  })

  it('会议进行中就提供记录区，不必等会议结束', async () => {
    vi.mocked(fetchMinutes).mockResolvedValue(EMPTY_MINUTES as never)
    renderDetail()
    await openMinutesTab()

    expect(await screen.findByText('邊開會邊記錄')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /保存記錄/ })).toBeInTheDocument()
  })

  it('保存时新建纪要只追加一条议题，空白骨架行不进正文', async () => {
    vi.mocked(fetchMinutes).mockResolvedValue(EMPTY_MINUTES as never)
    vi.mocked(createMinutes).mockResolvedValue(FILLED_MINUTES as never)
    renderDetail()
    await openMinutesTab()

    fireEvent.change(await screen.findByPlaceholderText(/議題標題/), { target: { value: '渠道投放預算' } })
    fireEvent.change(screen.getByPlaceholderText(/討論要點與結論/), { target: { value: '先跑兩週再定分配比例' } })
    fireEvent.click(screen.getByRole('button', { name: /保存記錄/ }))

    await waitFor(() => expect(createMinutes).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(createMinutes).mock.calls[0][0]
    expect(payload.bookingId).toBe(100)
    expect(payload.requestKey).toBe('mm-detail-key')
    // 骨架里那行空白议题被滤掉，正文只剩刚记录的这一条
    expect(payload.content.items).toEqual([{ topic: '渠道投放預算', discussion: '先跑兩週再定分配比例' }])
  })

  it('已有纪要时改走更新，并原样带回行动项与关联（漏传会被后端按"没有"清掉）', async () => {
    vi.mocked(fetchMinutes).mockResolvedValue(FILLED_MINUTES as never)
    vi.mocked(updateMinutes).mockResolvedValue(FILLED_MINUTES as never)
    renderDetail()
    await openMinutesTab()

    fireEvent.change(await screen.findByPlaceholderText(/議題標題/), { target: { value: '追加議題' } })
    fireEvent.click(screen.getByRole('button', { name: /保存記錄/ }))

    await waitFor(() => expect(updateMinutes).toHaveBeenCalledTimes(1))
    const [id, payload] = vi.mocked(updateMinutes).mock.calls[0]
    expect(id).toBe(7)
    expect(payload.version).toBe(3)
    expect(payload.linkedMinutesIds).toEqual([66])
    expect(payload.items).toEqual([
      { kind: 'ACTION', content: '補財務模型', ownerUserId: 7, dueDate: '2026-11-05' },
    ])
    expect(payload.content.items.map(item => item.topic)).toEqual(['分攤口徑', '追加議題'])
  })

  it('服务端说不能编辑（身份或阶段不合格）时不提供记录区，也不给录入按钮', async () => {
    vi.mocked(fetchMinutes).mockResolvedValue({
      ...EMPTY_MINUTES, canEdit: false, editLockReason: 'MEETING_NOT_RECORDED',
    } as never)
    vi.mocked(fetchMeetingDetail).mockResolvedValue({ ...ONGOING_MEETING, canMinutes: false } as never)
    renderDetail()
    await openMinutesTab()

    await screen.findByText('本場會尚未錄入紀要')
    expect(screen.queryByText('邊開會邊記錄')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /錄入紀要/ })).not.toBeInTheDocument()
  })
})
