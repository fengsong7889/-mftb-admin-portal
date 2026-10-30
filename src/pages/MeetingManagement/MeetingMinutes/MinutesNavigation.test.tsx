/** 纪要导航回归：真实列表、阅读、详情与表单页面之间返回不得新增历史。 */
import type { ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MinutesContent } from '@/api/meetingMinutes'
import i18n from '@/i18n'
import MeetingMinutesAdmin from '../../MeetingMinutesAdmin'
import MeetingDetail from '../MeetingDetail'
import MinutesView from './MinutesView'
import MinutesForm from './MinutesForm'
import useMinutesNavigation from './useMinutesNavigation'

const api = vi.hoisted(() => ({
  read: vi.fn(), byMeeting: vi.fn(), list: vi.fn(), meeting: vi.fn(), update: vi.fn(), create: vi.fn(), publish: vi.fn(),
}))
vi.mock('@/api/meetingMinutes', async original => ({
  ...await original<typeof import('@/api/meetingMinutes')>(),
  fetchMinutesById: api.read, fetchMinutes: api.byMeeting, fetchMinutesAdminPage: api.list,
  updateMinutes: api.update, createMinutes: api.create, publishMinutes: api.publish,
  fetchMinutesSends: vi.fn(async () => []), fetchMinutesRevisions: vi.fn(async () => []),
  fetchMinutesGroups: vi.fn(async () => []),
  fetchMinutesNote: vi.fn(async () => ({ exists: false, rawText: '', mentions: [], noteVersion: 0, maxChars: 20000 })),
  saveMinutesNote: vi.fn(async (payload: { noteVersion: number }) => ({ exists: true, rawText: '', mentions: [], noteVersion: (payload?.noteVersion ?? 0) + 1, maxChars: 20000 })),
  fetchMinutesAiStatus: vi.fn(async () => ({ available: false, reasonCode: 'feature_off', maxInputChars: 20000, enabled: false })),
  extractMinutesAi: vi.fn(async () => { throw new Error('nav test: no ai') }),
  fetchMinutesAiExtraction: vi.fn(async () => { throw new Error('nav test: no ai') }),
}))
vi.mock('@/api/meeting', async original => ({
  ...await original<typeof import('@/api/meeting')>(),
  fetchMeetingDetail: api.meeting, fetchMeetingEvents: vi.fn(async () => []),
}))
vi.mock('@/api/employee', () => ({ fetchEmployees: vi.fn(async () => ({ records: [], total: 0 })) }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true, user: { id: 2, name: '記錄員', empId: 'MF00002' } }) }))

const content: MinutesContent = {
  schemaVersion: 2, summary: '紀要導航測試摘要', chairUserId: 2, chairName: '記錄員',
  items: [{ topic: '導航驗收', discussion: '檢查返回路徑', conclusion: '沿原入口返回', decisionStatus: 'decided' }],
  actions: [], openIssues: [], absentees: [], attendance: [],
}
const minutes = {
  exists: true, id: 9, bookingId: 100, bookingNo: 'MT-NAV-100', minutesNo: 'MJ-NAV-9', meetingTitle: '導航例會',
  content, canEdit: true, canReadDraft: true, canSend: true, version: 1, recorderName: '記錄員',
}
const meeting = {
  id: 100, bookingNo: 'MT-NAV-100', title: '導航例會', status: 'finished', phase: 'ended',
  bizType: 'general', startTime: '2026-10-28 10:00:00', endTime: '2026-10-28 11:00:00',
  timeText: '2026-10-28 10:00–11:00', roomId: 1, roomName: '會議室 A', organizerId: 2,
  organizerName: '記錄員', attendeeCount: 0, attendees: [], notifies: [], myRole: 'organizer', version: 1,
}

function PathProbe() {
  const location = useLocation()
  const action = useNavigationType()
  return <><output aria-label="目前路徑">{location.pathname}{location.search}</output><output aria-label="導航動作">{action}</output></>
}
function MyMeetingEntry() {
  const { open } = useMinutesNavigation()
  return <button onClick={() => open('/meeting-detail?id=100')}>開啟會議</button>
}
function renderPages(entries: ComponentProps<typeof MemoryRouter>['initialEntries'] = ['/meeting-minutes-list']) {
  return render(<MemoryRouter initialEntries={entries}>
    <PathProbe />
    <Routes>
      <Route path="/meeting-minutes-list" element={<MeetingMinutesAdmin />} />
      <Route path="/meeting-detail" element={<MeetingDetail />} />
      <Route path="/meeting-minutes" element={<MinutesView />} />
      <Route path="/meeting-minutes-form" element={<MinutesForm />} />
      <Route path="/meeting-my" element={<MyMeetingEntry />} />
    </Routes>
  </MemoryRouter>)
}
async function expectPath(path: string, action?: string) {
  await waitFor(() => expect(screen.getByLabelText('目前路徑')).toHaveTextContent(path))
  if (action) expect(screen.getByLabelText('導航動作')).toHaveTextContent(action)
}
async function openFromList(label = '查看紀要') {
  fireEvent.click(await screen.findByRole('button', { name: label }))
  await screen.findByRole('article', { name: '會議紀要正文' })
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.spyOn(window.history, 'state', 'get').mockReturnValue(null)
  await i18n.changeLanguage('zh-TW')
  api.read.mockResolvedValue(minutes)
  api.byMeeting.mockResolvedValue(minutes)
  api.meeting.mockResolvedValue(meeting)
  api.list.mockResolvedValue({ list: [{ minutesId: 9, minutesNo: 'MJ-NAV-9', meetingTitle: '導航例會', status: 'draft' }], total: 1 })
  api.update.mockResolvedValue({ ...minutes, version: 2 })
  api.create.mockResolvedValue(minutes)
  api.publish.mockResolvedValue({ ...minutes, publishedRevisionNo: 1 })
})
afterEach(() => vi.restoreAllMocks())

describe('紀要返回路徑', () => {
  it.each(['查看紀要', '導航例會'])('列表入口「%s」返回一次即回列表，不进入会议详情', async label => {
    renderPages()
    await openFromList(label)
    fireEvent.click(screen.getByRole('button', { name: /返回$/ }))
    await expectPath('/meeting-minutes-list', 'POP')
    await openFromList(label)
    fireEvent.click(screen.getByRole('button', { name: /返回$/ }))
    await expectPath('/meeting-minutes-list', 'POP')
  })

  it('详情进入纪要，连续返回两次到原我的会议入口', async () => {
    renderPages(['/meeting-my'])
    fireEvent.click(screen.getByRole('button', { name: '開啟會議' }))
    fireEvent.click(await screen.findByRole('tab', { name: /會議紀要$/ }))
    fireEvent.click(await screen.findByRole('button', { name: /查看紀要與發送歷史$/ }))
    await screen.findByRole('article', { name: '會議紀要正文' })
    fireEvent.click(screen.getByRole('button', { name: /返回$/ }))
    await expectPath('/meeting-detail?id=100', 'POP')
    fireEvent.click(await screen.findByRole('button', { name: /返回$/ }))
    await expectPath('/meeting-my', 'POP')
  })

  it('阅读页编辑保存后回到原阅读历史，继续返回列表而非表单', async () => {
    renderPages()
    await openFromList()
    fireEvent.click(screen.getByRole('button', { name: /編輯/ }))
    fireEvent.click(await screen.findByRole('button', { name: /保存紀要$/ }))
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1))
    await expectPath('/meeting-minutes?id=9', 'POP')
    await screen.findByRole('article', { name: '會議紀要正文' })
    fireEvent.click(screen.getByRole('button', { name: /返回$/ }))
    await expectPath('/meeting-minutes-list', 'POP')
  })

  it('从详情直接编辑保存，用阅读页替换表单，返回仍到详情', async () => {
    renderPages(['/meeting-my'])
    fireEvent.click(screen.getByRole('button', { name: '開啟會議' }))
    fireEvent.click(await screen.findByRole('tab', { name: /會議紀要$/ }))
    fireEvent.click(await screen.findByRole('button', { name: '編輯紀要' }))
    fireEvent.click(await screen.findByRole('button', { name: /保存紀要$/ }))
    await expectPath('/meeting-minutes?id=9', 'REPLACE')
    await screen.findByRole('article', { name: '會議紀要正文' })
    fireEvent.click(screen.getByRole('button', { name: /返回$/ }))
    await expectPath('/meeting-detail?id=100', 'POP')
    fireEvent.click(await screen.findByRole('button', { name: /返回$/ }))
    await expectPath('/meeting-my', 'POP')
  })

  it.each([undefined, { minutesReturn: { path: 'https://example.com', key: 'forged' } },
    { minutesReturn: { path: '/meeting-minutes-list', key: 'forged' } }])('直接打开或伪造来源，返回安全落点且不PUSH', async state => {
    renderPages([{ pathname: '/meeting-minutes', search: '?id=9', state }])
    await screen.findByRole('article', { name: '會議紀要正文' })
    fireEvent.click(screen.getByRole('button', { name: /返回$/ }))
    await expectPath('/meeting-my', 'REPLACE')
  })
})
