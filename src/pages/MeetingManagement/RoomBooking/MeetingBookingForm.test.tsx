/**
 * 预约表单联动回归用例。
 *
 * <p>为什么要锁这一条：表单里「結束時間／參會人數／週期設置」都靠 Form.useWatch 派生。
 * 之前写成 Form.useWatch(['start','duration','repeat'], form)——antd 把数组当作**嵌套路径**
 * （即 start.duration.repeat）而不是"同时监听多个字段"，取值永远是 undefined，
 * 结果是：结束时间恒显示「待選擇」、人数恒为 1 导致容量超额告警永不触发、
 * 選「每週重複」后週期字段整块不展开却仍被提交校验拦住（要求至少选一个星期），
 * 用户在界面上看不出任何异常，只有真实点击才能发现。浏览器实测踩过这个坑，故用测试钉住。
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MeetingBookingForm from './MeetingBookingForm'
import i18n from '@/i18n'

const hasPermission = vi.fn(() => false)

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission }),
}))

vi.mock('@/api/meeting', () => ({
  fetchMeetingRoomDetail: vi.fn(),
  previewSeries: vi.fn(),
  createMeeting: vi.fn(),
  createSeries: vi.fn(),
  newMeetingRequestKey: vi.fn(() => 'book-test-key'),
  toMeetingIso: (value: { format: (f: string) => string }) => value.format('YYYY-MM-DDTHH:mm:ss'),
}))

// 员工选择器会自己去搜人，本用例不关心它的结果，给空列表即可
vi.mock('@/api/employee', () => ({
  fetchEmployees: vi.fn(async () => ({ records: [], total: 0 })),
  fetchEmployeesForSelect: vi.fn(async () => []),
  searchEmployees: vi.fn(async () => []),
}))

import { createMeeting, fetchMeetingRoomDetail, previewSeries } from '@/api/meeting'

const ROOM = {
  id: 1,
  roomNo: 'MR-2F-01',
  roomName: '大會議室',
  locationText: '總部 1 棟 2F',
  capacity: 6,
  status: 'active',
  bookable: true,
  facilities: [],
  bookableStartTime: '08:00',
  bookableEndTime: '22:00',
  minDuration: 30,
  maxDuration: 240,
  granularityMinutes: 15,
  checkinRequired: false,
  hideTitle: false,
  windowConfigured: true,
  adminUserIds: [],
  version: 1,
}

function mount(path = '/meeting-booking-form?roomId=1&date=2026-11-05&start=10:00') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/meeting-booking-form" element={<MeetingBookingForm />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('會議預約表单联动', () => {
  beforeEach(async () => {
    // 组件文案已 i18n 化：测试必须钉住语言，否则 jsdom 无 localStorage 时走 fallbackLng=en
    await i18n.changeLanguage('zh-TW')
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-01T10:00:00'))
    hasPermission.mockReturnValue(false)
    vi.mocked(fetchMeetingRoomDetail).mockResolvedValue(ROOM as never)
    vi.mocked(createMeeting).mockResolvedValue({ bookingNo: 'MT-TEST-01', notifySkippedCount: 0, scenarioActive: true } as never)
    vi.mocked(previewSeries).mockResolvedValue([
      { date: '2026-11-05', weekdayText: '四' },
      { date: '2026-11-09', weekdayText: '一' },
    ] as never)
  })

  afterEach(() => vi.useRealTimers())

  it.each([
    ['2026-11-01T10:00:00', '2026-11-01', '10:30'],
    ['2026-11-01T10:07:00', '2026-11-01', '10:45'],
    ['2026-11-01T23:45:00', '2026-11-02', '00:15'],
  ])('未预选时默认当前时间后30分钟，并对齐粒度：%s', async (now, date, time) => {
    vi.setSystemTime(new Date(now))
    mount('/meeting-booking-form?roomId=1')
    const dateInput = await screen.findByRole('textbox', { name: '日期' })
    await waitFor(() => {
      expect(dateInput).toHaveValue(date)
      expect(screen.getByRole('textbox', { name: '開始時間' })).toHaveValue(time)
    })
  })

  it('从日历带入的日期和时间保持不变，不被默认值覆盖', async () => {
    mount()
    const dateInput = await screen.findByRole('textbox', { name: '日期' })
    await waitFor(() => {
      expect(dateInput).toHaveValue('2026-11-05')
      expect(screen.getByRole('textbox', { name: '開始時間' })).toHaveValue('10:00')
    })
  })

  it('单独修改日期和时间后，结束时间与提交时间仍使用同一个完整时间点', async () => {
    mount()
    const date = await screen.findByRole('textbox', { name: '日期' })
    await waitFor(() => expect(date).toHaveValue('2026-11-05'))
    fireEvent.focus(date)
    fireEvent.click(date)
    fireEvent.change(date, { target: { value: '2026-11-06' } })
    fireEvent.keyDown(date, { key: 'Enter', code: 'Enter' })
    fireEvent.blur(date)
    await waitFor(() => expect(date).toHaveValue('2026-11-06'))
    expect(screen.getByRole('textbox', { name: '開始時間' })).toHaveValue('10:00')
    const time = screen.getByRole('textbox', { name: '開始時間' })
    fireEvent.focus(time)
    fireEvent.click(time)
    fireEvent.change(time, { target: { value: '14:15' } })
    fireEvent.keyDown(time, { key: 'Enter', code: 'Enter' })
    fireEvent.blur(time)
    await waitFor(() => expect(screen.getByText('2026-11-06 14:45')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('如 Q4 需求評審'), { target: { value: '拆分時間驗證' } })
    fireEvent.click(screen.getByRole('button', { name: /提交預約/ }))
    fireEvent.click(await screen.findByRole('button', { name: '確認預約' }))
    await waitFor(() => expect(createMeeting).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createMeeting).mock.calls[0][0]).toMatchObject({
      startTime: '2026-11-06T14:15:00', endTime: '2026-11-06T14:45:00',
    })
    expect(vi.mocked(createMeeting).mock.calls[0][0]).not.toHaveProperty('startDate')
  })

  it('日期清空时禁止提交，不用仍残留的时间代替日期', async () => {
    mount()
    const date = await screen.findByRole('textbox', { name: '日期' })
    const clear = date.closest('.ant-picker')!.querySelector('.ant-picker-clear')!
    fireEvent.mouseDown(clear)
    fireEvent.click(clear)
    fireEvent.change(screen.getByPlaceholderText('如 Q4 需求評審'), { target: { value: '日期必填驗證' } })
    fireEvent.click(screen.getByRole('button', { name: /提交預約/ }))
    await waitFor(() => expect(date.closest('.ant-form-item')).toHaveClass('ant-form-item-has-error'))
    expect(screen.queryByRole('button', { name: '確認預約' })).toBeNull()
    expect(createMeeting).not.toHaveBeenCalled()
  })

  it('所有字段行共用同一套三列栅格，跨模块列位对齐', async () => {
    const { container } = mount()
    await screen.findByRole('heading', { name: '預約會議室' })
    const grids = Array.from(container.querySelectorAll('.meeting-booking-grid')) as HTMLElement[]
    // 时间、重复、参会人、会议信息四个模块均加入同一栅格锚点
    expect(grids.length).toBeGreaterThanOrEqual(4)
    // 样式完全一致 → 没有某个模块单独限宽或改成两列，列位才能对齐
    expect(new Set(grids.map(grid => grid.getAttribute('style'))).size).toBe(1)
    const firstRow = grids[0]
    expect(firstRow.querySelectorAll(':scope > .ant-form-item')).toHaveLength(3)
    expect(firstRow).not.toHaveStyle({ maxWidth: '1152px' })
  })

  it('选定开始时间与时长后，结束时间由 watch 实时算出而不是停在「待選擇」', async () => {
    const { container } = mount()
    // 进页面即带出 10:00 与默认时长：多字段 watch 坏掉时这里会一直是「待選擇」
    await screen.findByRole('heading', { name: '預約會議室' })
    await waitFor(() => {
      const cell = [...container.querySelectorAll('.ant-form-item')]
        .find(item => item.querySelector('.ant-form-item-label')?.textContent?.includes('結束時間'))
      expect(cell?.textContent).toMatch(/2026-11-05 \d{2}:\d{2}/)
      expect(cell?.textContent).not.toContain('待選擇')
    })
  })

  it('无 meeting-record:edit 时不显示代订入口', async () => {
    hasPermission.mockReturnValue(false)
    mount()
    await screen.findByRole('heading', { name: '預約會議室' })
    expect(screen.queryByText('替他人預訂')).not.toBeInTheDocument()
    expect(screen.queryByText('實際使用人')).not.toBeInTheDocument()
  })

  it('行政可开启代订，开关打开后才要求选择实际使用人', async () => {
    hasPermission.mockReturnValue(true)
    mount()
    await screen.findByRole('heading', { name: '預約會議室' })
    expect(screen.getByText('替他人預訂')).toBeInTheDocument()
    // 默认自订：不该先摆出一个必选的使用人字段
    expect(screen.queryByText('實際使用人')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch'))
    const label = await screen.findByText('實際使用人')
    expect(label).toBeInTheDocument()
    const item = label.closest('.ant-form-item')!
    expect(item.parentElement).toHaveClass('meeting-booking-grid')
    expect(item.querySelector('.ant-select')).toHaveStyle({ width: '100%' })
    // 代订行落在第三列栅格的第二列，与下方“选参人员”同一列位
    expect(item.parentElement!.children.length).toBe(2)
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.queryByText('實際使用人')).toBeNull()
  })

  it('选择每週重複后展开週期字段并提供场次预览', async () => {
    mount()
    await screen.findByRole('heading', { name: '預約會議室' })
    expect(screen.queryByText('預覽場次')).not.toBeInTheDocument()

    const repeatItem = [...document.querySelectorAll('.ant-form-item')]
      .find(item => item.querySelector('.ant-form-item-label')?.textContent?.includes('重複頻率'))!
    fireEvent.mouseDown(within(repeatItem as HTMLElement).getByRole('combobox'))
    fireEvent.click(await screen.findByText('每週重複'))

    expect(await screen.findByText('場次上限')).toBeInTheDocument()
    expect(screen.getByText('重複星期')).toBeInTheDocument()

    // 后端与前端都要求週必须选星期，先补一个再预览
    const weekdayItem = [...document.querySelectorAll('.ant-form-item')]
      .find(item => item.querySelector('.ant-form-item-label')?.textContent?.includes('重複星期'))!
    fireEvent.mouseDown(within(weekdayItem as HTMLElement).getByRole('combobox'))
    const weekdayOption = await waitFor(() => {
      const el = [...document.querySelectorAll('.ant-select-item-option')]
        .find(option => option.textContent?.trim() === '一')
      if (!el) throw new Error('星期选项尚未渲染')
      return el as HTMLElement
    })
    fireEvent.click(weekdayOption)

    const preview = await screen.findByRole('button', { name: /預覽場次/ })
    fireEvent.click(preview)
    await screen.findByText(/共 2 場/)
  })
})
