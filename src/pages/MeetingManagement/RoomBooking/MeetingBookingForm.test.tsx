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
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  fetchEmployeesForSelect: vi.fn(async () => []),
  searchEmployees: vi.fn(async () => []),
}))

import { fetchMeetingRoomDetail, previewSeries } from '@/api/meeting'

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

function mount() {
  return render(
    <MemoryRouter initialEntries={['/meeting-booking-form?roomId=1&date=2026-11-05&start=10:00']}>
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
    hasPermission.mockReturnValue(false)
    vi.mocked(fetchMeetingRoomDetail).mockResolvedValue(ROOM as never)
    vi.mocked(previewSeries).mockResolvedValue([
      { date: '2026-11-05', weekdayText: '四' },
      { date: '2026-11-09', weekdayText: '一' },
    ] as never)
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
    expect(await screen.findByText('實際使用人')).toBeInTheDocument()
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
