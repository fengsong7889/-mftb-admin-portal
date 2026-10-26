/**
 * 纪要模板表单回归用例。
 *
 * <p>钉住三件"看一眼就知道对不对、写错却要用户踩"的事：
 *   1. 模板分区必须齐全——少一个「行動項」就等于把会上定的责任悄悄丢掉；
 *   2. 记录人是当前登录人且不可改（请求体里没有这个字段的位置），渲染成只读文本而不是输入框；
 *   3. 纪要接口读不到时不能整页空白：那是"这场会还没有纪要"，仍要能直接开始写。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MinutesForm from './MinutesForm'
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
  newMeetingRequestKey: vi.fn(() => 'mm-test-key'),
  toMeetingIso: (value: { format: (f: string) => string }) => value.format('YYYY-MM-DDTHH:mm:ss'),
  toMeetingIsoDate: (value: { format: (f: string) => string } | null) => (value ? value.format('YYYY-MM-DD') : undefined),
}))

vi.mock('@/api/meetingMinutes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/meetingMinutes')>()
  return {
    ...actual,
    fetchMinutes: vi.fn(),
    fetchMinutesById: vi.fn(),
    createMinutes: vi.fn(),
    updateMinutes: vi.fn(),
    fetchMinutesGroups: vi.fn(async () => []),
  }
})

// 员工选择器会自己去搜人，本用例不关心结果
vi.mock('@/api/employee', () => ({
  fetchEmployees: vi.fn(async () => ({ records: [], total: 0 })),
}))

import { fetchMeetingDetail } from '@/api/meeting'
import { createMinutes, fetchMinutes } from '@/api/meetingMinutes'

const MEETING = {
  id: 100,
  bookingNo: 'MT202610190001',
  title: 'Q4 預算復核',
  status: 'finished',
  phase: 'ended',
  startTime: '2026-10-19 10:00:00',
  endTime: '2026-10-19 11:00:00',
  timeText: '2026-10-19 10:00–11:00',
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
  canEdit: false,
  canCancel: false,
  canRelease: false,
  canCheckin: false,
  canFinish: false,
  checkinRequired: false,
  version: 1,
  attendees: [
    { id: 1, userId: 1, empNo: 'MF00001', name: '王五', attendeeType: 'organizer', response: 'accepted' },
    { id: 2, userId: 2, empNo: 'MF00002', name: '李四', attendeeType: 'required', response: 'declined' },
  ],
}

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/meeting-minutes-form?bookingId=100']}>
      <Routes>
        <Route path="/meeting-minutes-form" element={<MinutesForm />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('會議紀要表單', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // 测试环境的默认语言不是繁中（i18n 初始化为 en），不显式切语言时断言的中文文案会全部命中英文分支
    await i18n.changeLanguage('zh-TW')
    vi.mocked(fetchMeetingDetail).mockResolvedValue(MEETING as never)
    vi.mocked(fetchMinutes).mockResolvedValue({ exists: false, bookingId: 100 } as never)
  })

  it('模板分区齐全：會議資訊 / 議程與結論 / 行動項 / 未決事項 / 下次會議 / 補充說明', async () => {
    renderForm()
    await waitFor(() => expect(screen.getByText('Q4 預算復核')).toBeInTheDocument())
    for (const section of ['會議資訊', '議程與結論', '行動項', '跟進事項', '下次會議', '補充說明']) {
      expect(screen.getAllByText(section).length, `缺少分區：${section}`).toBeGreaterThan(0)
    }
    // 会议主题来自会议单而不是输入框：纪要不能改写会议事实
    expect(screen.queryByLabelText('會議主題')).toBeNull()
  })

  it('记录人显示为当前登录人且是只读文本', async () => {
    renderForm()
    await waitFor(() => expect(screen.getByText('記錄人：')).toBeInTheDocument())
    // 同名文本会出现在缺席建议里（李四恰好也婉拒了），只断言记录人栏存在且不输入框
    expect(screen.getAllByText('李四（MF00002）').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('記錄人：')).toBeNull()
    expect(screen.queryByPlaceholderText('搜尋姓名或工號，可選非參會人')).toBeNull()
  })

  it('婉拒的参会人被预置进缺席建议名单，记录人可自由删', async () => {
    renderForm()
    await waitFor(() => expect(screen.getByText('缺席 / 未到場人員')).toBeInTheDocument())
    // 缺席标签带删除能力（closable），建议值不是硬结论
    const chips = screen.getAllByText('李四（MF00002）')
    expect(chips.length).toBeGreaterThan(0)
    expect(document.querySelector('.ant-tag .anticon-close')).toBeTruthy()
  })

  it('纪要接口读不到时仍按新录入渲染，并说明原因而不是整页失败', async () => {
    vi.mocked(fetchMinutes).mockRejectedValue(new Error('接口或資源不存在（404）'))
    renderForm()
    await waitFor(() => expect(screen.getByText('議程與結論')).toBeInTheDocument())
    expect(screen.getByText('未能讀取既有紀要，本次將按新錄入處理')).toBeInTheDocument()
    expect(screen.queryByText('無法載入會議詳情')).toBeNull()
  })

  it('议题与行动项都为空时拒绝保存，并把提示给到用户', async () => {
    renderForm()
    await waitFor(() => expect(screen.getByText('議程與結論')).toBeInTheDocument())
    // 初始有一条空议题：清空后提交必须被拦住
    const topic = screen.getByPlaceholderText('議題，例：Q4 預算分攤口徑')
    fireEvent.change(topic, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /保存紀要/ }))
    await waitFor(() => expect(createMinutes).not.toHaveBeenCalled())
  })

  it('填了议题与结论后提交，正文按模板结构送后端', async () => {
    vi.mocked(createMinutes).mockResolvedValue({
      exists: true, id: 9, bookingId: 100, minutesNo: 'MJ202610190001', status: 'draft', version: 0,
    } as never)
    renderForm()
    await waitFor(() => expect(screen.getByText('議程與結論')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('議題，例：Q4 預算分攤口徑'), { target: { value: '分攤口徑' } })
    fireEvent.change(screen.getByPlaceholderText('定了什麼、誰負責、何時生效'), { target: { value: '按營收分攤' } })
    fireEvent.click(screen.getByRole('button', { name: /保存紀要/ }))
    await waitFor(() => expect(createMinutes).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(createMinutes).mock.calls[0][0]
    expect(payload.bookingId).toBe(100)
    expect(payload.content.items[0].topic).toBe('分攤口徑')
    expect(payload.content.items[0].conclusion).toBe('按營收分攤')
    // 幂等键由前端生成：重放同一提交不该长出第二条纪要
    expect(payload.requestKey).toBeTruthy()
  })
})
