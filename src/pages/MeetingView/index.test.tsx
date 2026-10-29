/**
 * 会议详情免登页回归用例。
 *
 * <p>这一页替代了原先需登录的「查看會議詳情」：钉钉邀约卡片直达，收件人常常没有后台账号。
 * 必须钉住三件事：
 *   1. 令牌无效/过期时给整页可读提示，不白屏、不转圈；
 *   2. 会议已取消/释放/结束时只回看，不给线上会议入口（与终态卡片不挂按钮同口径）；
 *   3. 页面只显示公开信息，不得出现参会人手机号、投递明细等内部字段。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MeetingViewPage from './index'
import i18n, { LANGUAGE_STORAGE_KEY } from '@/i18n'

const fetchMeetingViewPage = vi.fn()

vi.mock('@/api/meetingViewPage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/meetingViewPage')>()
  return { ...actual, fetchMeetingViewPage: (token: string) => fetchMeetingViewPage(token) }
})

const VIEW = {
  valid: true,
  bookingId: 22,
  bookingNo: 'MT202610260001',
  title: '產品週會',
  status: 'booked',
  phase: 'pending',
  statusText: '待開始',
  closed: false,
  startTime: '2026-10-27 10:00:00',
  endTime: '2026-10-27 11:00:00',
  timeText: '2026-10-27 10:00–11:00',
  roomName: '產品會議室',
  roomLocation: '珠海 · A棟 · 21F',
  organizerName: '系統管理員',
  description: '評審 Q4 需求優先級',
  onlineMeetingUrl: 'https://meeting.example.com/abc',
  tokenExpireAt: '2026-11-26 10:00:00',
  attendees: [
    { name: '系統管理員', role: 'organizer', roleText: '組織者', response: 'accepted', responseText: '已接受' },
    { name: '張三', role: 'required', roleText: '必參', response: 'pending', responseText: '待響應' },
    { name: '李四', role: 'optional', roleText: '選參', response: 'declined', responseText: '已婉拒' },
    { name: '外部客戶A', role: 'external', roleText: '外部人員', response: null, responseText: null },
  ],
}

function openPage(token = 'abc') {
  return render(
    <MemoryRouter initialEntries={[`/meeting-view?token=${token}`]}>
      <Routes>
        <Route path="/meeting-view" element={<MeetingViewPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('會議詳情免登頁', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.removeItem(LANGUAGE_STORAGE_KEY)
    fetchMeetingViewPage.mockResolvedValue(VIEW)
    await i18n.changeLanguage('zh-TW')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.removeItem(LANGUAGE_STORAGE_KEY)
    window.history.replaceState(null, '', '/')
  })

  it('defaults to Chinese without saving a preference and restores the host title', async () => {
    await i18n.changeLanguage('en')
    document.title = 'MFTB Group Portal'
    const page = openPage()
    await screen.findByText('會議邀約')
    expect(document.title).toBe('會議邀約')
    expect(i18n.language).toBe('zh-TW')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull()
    page.unmount()
    expect(document.title).toBe('MFTB Group Portal')
  })

  it('respects saved English and switches labels, status, and title in both directions', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
    await i18n.changeLanguage('en')
    openPage()
    await screen.findByText('Attendees')
    expect(document.title).toBe('Meeting invitation')
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(screen.getByText('Required')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '中文' }))
    await screen.findByText('參會人員')
    expect(document.title).toBe('會議邀約')
    expect(screen.getByText('待開始')).toBeInTheDocument()
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('zh-TW')
    fireEvent.click(screen.getByRole('radio', { name: 'EN' }))
    await screen.findByText('Attendees')
    expect(document.title).toBe('Meeting invitation')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')
  })

  it('opens the complete current public link without exposing an opener', async () => {
    window.history.replaceState(null, '', '/#/meeting-view?token=test-view-token')
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    openPage()
    fireEvent.click(screen.getByRole('button', { name: /在瀏覽器打開/ }))
    expect(open).toHaveBeenCalledWith(window.location.href, '_blank', 'noopener')
    await screen.findByText('產品週會')
  })

  it('uses the DingTalk desktop browser protocol and preserves the signed URL', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh) DingTalk/7.0')
    window.history.replaceState(null, '', '/#/meeting-view?token=test-view-token&source=invite')
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    let href = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      href = this.href
    })
    openPage()
    fireEvent.click(screen.getByRole('button', { name: /在瀏覽器打開/ }))
    const target = new URL(href)
    expect(target.protocol).toBe('dingtalk:')
    expect(target.searchParams.get('pc_slide')).toBe('false')
    expect(target.searchParams.get('url')).toBe(window.location.href)
    expect(open).not.toHaveBeenCalled()
    expect(document.querySelector('a[href^="dingtalk:"]')).toBeNull()
    await screen.findByText('產品週會')
  })

  it('copies the complete link and provides inline confirmation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { userAgent: navigator.userAgent, clipboard: { writeText } })
    window.history.replaceState(null, '', '/#/meeting-view?token=test-view-token')
    openPage()
    fireEvent.click(screen.getByRole('button', { name: /複製連結/ }))
    await screen.findByRole('button', { name: /已複製連結/ })
    expect(writeText).toHaveBeenCalledWith(window.location.href)
  })

  it('handles denied clipboard access without leaking a hidden link into the DOM', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { userAgent: navigator.userAgent, clipboard: { writeText } })
    openPage()
    fireEvent.click(screen.getByRole('button', { name: /複製連結/ }))
    await screen.findByRole('button', { name: /請手動複製/ })
    expect(document.querySelector('textarea')).toBeNull()
    expect(document.querySelector('.ant-message')).toBeNull()
  })

  it('渲染会议重点信息与免登说明，不含内部字段', async () => {
    fetchMeetingViewPage.mockResolvedValue(VIEW)
    openPage()
    await waitFor(() => expect(screen.getByText('產品週會')).toBeInTheDocument())
    expect(screen.getByText('待開始')).toBeInTheDocument()
    expect(screen.getByText('2026-10-27 10:00–11:00')).toBeInTheDocument()
    expect(screen.getByText(/產品會議室/)).toBeInTheDocument()
    expect(screen.getAllByText('系統管理員').length).toBeGreaterThan(0)
    expect(screen.getByText('評審 Q4 需求優先級')).toBeInTheDocument()
    expect(screen.getByText('進入線上會議')).toBeInTheDocument()
    expect(screen.getByText(/連結有效期至 2026-11-26 10:00:00/)).toBeInTheDocument()
    // 参会人：姓名 + 身份 + 响应态，便于会前沟通；不含工号/手机号/部门
    expect(screen.getByText('參會人員')).toBeInTheDocument()
    expect(screen.getByText('張三')).toBeInTheDocument()
    expect(screen.getByText('待響應')).toBeInTheDocument()
    expect(screen.getByText('已婉拒')).toBeInTheDocument()
    expect(screen.getByText('外部客戶A')).toBeInTheDocument()
    expect(screen.getByText('外部人員')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/MF\d{5}|1[3-9]\d{9}/)
    // 免登链接可能被转发：整页不得出现手机号形态的值或渠道凭据
    expect(document.body.textContent).not.toMatch(/1[3-9]\d{9}/)
    expect(document.body.textContent).not.toMatch(/access_token|webhook|appSecret/i)
  })

  it('会议已取消：只回看，不给线上会议入口', async () => {
    fetchMeetingViewPage.mockResolvedValue({
      ...VIEW,
      closed: true,
      status: 'cancelled',
      phase: 'cancelled',
      statusText: '已取消',
      cancelReason: '臨時改期',
    })
    openPage('cancelled')
    await waitFor(() => expect(screen.getByText('這場會議已取消，無需到場')).toBeInTheDocument())
    expect(screen.queryByText('進入線上會議')).toBeNull()
    expect(screen.getByText(/取消原因：臨時改期/)).toBeInTheDocument()
  })

  it('会议已结束：提示仅回看，不提供任何按钮', async () => {
    fetchMeetingViewPage.mockResolvedValue({
      ...VIEW,
      closed: true,
      phase: 'ended',
      statusText: '已結束',
    })
    openPage('ended')
    await waitFor(() => expect(screen.getByText('這場會議已結束，以下資訊僅供回看')).toBeInTheDocument())
    expect(screen.queryByText('進入線上會議')).toBeNull()
    expect(document.querySelector('button.ant-btn-primary')).toBeNull()
  })

  it('令牌无效时给整页可读提示，而不是白屏或一直转圈', async () => {
    fetchMeetingViewPage.mockResolvedValue({ valid: false, message: '連結無效或已過期' })
    openPage('expired')
    await waitFor(() => expect(screen.getByText('查看連結不可用')).toBeInTheDocument())
    expect(screen.getByText('連結無效或已過期')).toBeInTheDocument()
    expect(document.title).toBe('會議邀約')
    expect(screen.getByRole('radiogroup', { name: '切換語言' })).toBeInTheDocument()
  })

  it('没有 token 参数时不请求接口，直接说明缺令牌', async () => {
    render(
      <MemoryRouter initialEntries={['/meeting-view']}>
        <Routes>
          <Route path="/meeting-view" element={<MeetingViewPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('缺少查看令牌，請從釘釘卡片重新進入')).toBeInTheDocument())
    expect(fetchMeetingViewPage).not.toHaveBeenCalled()
  })
})
