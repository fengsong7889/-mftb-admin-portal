/**
 * 纪要免登查看页回归用例。
 *
 * <p>这一页是整套功能里唯一"没有登录态"的入口，也是最容易被改坏的一处：
 *   1. 令牌无效（过期/被作废/篡改）必须给整页可读提示，而不是白屏或一个转圈的 Spin——
 *      收到链接的人多半在手机上，白屏只会让他以为"我操作错了"；
 *   2. 正文取的是该批次快照，不是纪要当前版本；
 *   3. 页面上不能出现手机号、投递明细、webhook 等内部信息（链接可能被转发）。
 */
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MeetingMinutesView from './index'
import i18n from '@/i18n'

const fetchMinutesPage = vi.fn()

vi.mock('@/api/meetingMinutesPage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/meetingMinutesPage')>()
  return { ...actual, fetchMinutesPage: (token: string) => fetchMinutesPage(token) }
})

const VIEW = {
  valid: true,
  minutesNo: 'MJ202610190001',
  title: 'Q4 預算復核',
  bookingNo: 'MT202610190001',
  meetingTimeText: '2026-10-19 10:00–11:00',
  roomText: '三號會議室 · A 棟 3F',
  organizerName: '王五',
  recorderName: '李四',
  recorderEmpNo: 'MF00002',
  batchSeq: 2,
  sentByName: '李四',
  sentAt: '2026-10-19 20:05:00',
  expireAt: '2027-01-17 20:05:00',
  content: {
    items: [{ topic: '分攤口徑', discussion: '財務主張按營收', conclusion: '按營收分攤，11 月上線' }],
    actions: [{ content: '輸出預算明細表', ownerName: '張三', ownerEmpNo: 'MF00007', dueDate: '2026-10-31' }],
    openIssues: [{ content: '預算池是否共用', needDecisionBy: '財務負責人' }],
    absentees: [{ name: '李四', empNo: 'MF00002', reason: '請假' }],
    nextMeetingAt: '2026-11-02 10:00',
    nextMeetingNote: '帶明細表復核',
    remark: '資料在文件中心',
  },
}

function openPage(token = 'abc') {
  return render(
    <MemoryRouter initialEntries={[`/meeting-minutes-view?token=${token}`]}>
      <Routes>
        <Route path="/meeting-minutes-view" element={<MeetingMinutesView />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('紀要免登查看頁', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('zh-TW')
  })

  it('渲染批次快照正文与发送信息，不含手机号等内部字段', async () => {
    fetchMinutesPage.mockResolvedValue(VIEW)
    openPage()
    await waitFor(() => expect(screen.getByText('Q4 預算復核')).toBeInTheDocument())
    expect(screen.getAllByText(/按營收分攤/)).toHaveLength(2)
    expect(screen.getByText('輸出預算明細表')).toBeInTheDocument()
    expect(screen.getByText(/張三（MF00007）/)).toBeInTheDocument()
    const absentees = screen.getByText('缺席人員').nextElementSibling
    expect(absentees).toHaveTextContent('李四（MF00002）')
    expect(absentees).toHaveTextContent('缺席')
    expect(absentees).not.toHaveTextContent('請假')
    expect(VIEW.content.absentees[0].reason).toBe('請假')
    expect(screen.getByText(/由 李四 於 2026-10-19 20:05:00 發送（第 2 批）/)).toBeInTheDocument()
    expect(screen.getByText(/連結有效期至 2027-01-17 20:05:00/)).toBeInTheDocument()
    // 免登链接可能被转发：整页不得出现手机号形态的值或渠道凭据
    expect(document.body.textContent).not.toMatch(/1[3-9]\d{9}/)
    expect(document.body.textContent).not.toMatch(/access_token|webhook|appSecret/i)
  })

  it('令牌被作废时给整页提示，而不是白屏或一直转圈', async () => {
    fetchMinutesPage.mockResolvedValue({ valid: false, message: '連結已過期或已被記錄人作廢' })
    openPage('expired')
    await waitFor(() => expect(screen.getByText('查看連結不可用')).toBeInTheDocument())
    expect(screen.getByText('連結已過期或已被記錄人作廢')).toBeInTheDocument()
  })

  it('接口异常时用页面自己的错误态承接，不依赖后台全局 message', async () => {
    fetchMinutesPage.mockRejectedValue(new Error('網絡異常'))
    openPage()
    await waitFor(() => expect(screen.getByText('無法打開紀要')).toBeInTheDocument())
    // 重试入口在 Alert 的 action 槽里；antd 会给两字 CJK 按钮内插一个空格（渲染为「重 試」），
    // 所以只能查容器 + 宽松匹配，不能直接 getByText('重試')
    const retry = document.querySelector('.ant-alert-action button')
    expect(retry).not.toBeNull()
    expect(retry?.textContent).toMatch(/重\s*試/)
    expect(document.querySelector('.ant-message')).toBeNull()
  })

  it('没有 token 参数时不请求接口，直接说明缺令牌', async () => {
    render(
      <MemoryRouter initialEntries={['/meeting-minutes-view']}>
        <Routes>
          <Route path="/meeting-minutes-view" element={<MeetingMinutesView />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('缺少查看令牌，請從釘釘卡片重新進入')).toBeInTheDocument())
    expect(fetchMinutesPage).not.toHaveBeenCalled()
  })
})
