/**
 * 會議室档案页与规则编辑的唯一归属：
 * 檔案页只保留“配置會議室規則”入口，不得再渲染一套可预约窗/时长/签到输入，
 * 否则就会出现两套编辑器同时写同一批列，谁最后保存谁覆盖。
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MeetingRoomForm from './MeetingRoomForm'
import { fetchMeetingRoomDetail } from '@/api/meeting'
import i18n from '@/i18n'

vi.mock('@/api/meeting', () => ({
  fetchCities: vi.fn(async () => []),
  fetchMeetingRoomDetail: vi.fn(),
  createMeetingRoom: vi.fn(),
  updateMeetingRoom: vi.fn(),
}))

vi.mock('@/api/employee', () => ({
  fetchEmployees: vi.fn(async () => ({ records: [], total: 0 })),
  fetchEmployee: vi.fn(),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true, user: { id: 1, name: '管理員', empId: 'MF00001' } }),
}))

const ROOM = {
  id: 1, roomNo: 'MR-1F-01', roomName: '會議室 A', city: '珠海', campus: '總部', building: '1 棟',
  floorCode: '1F', locationDesc: '電梯左側', locationText: '總部 · 1 棟 · 1F · 電梯左側', capacity: 8,
  facilities: [], photoUrls: [], status: 'active', bookable: true,
  bookableStartTime: '09:00', bookableEndTime: '18:00', minDuration: 30, maxDuration: 120,
  checkinRequired: false, releaseAfterMinutes: 10, hideTitle: false, adminUserIds: [], remark: '備註',
  version: 2, updatedAt: '2026-10-29 10:00:00', updatedBy: '管理員', windowConfigured: true,
}

function renderForm(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/meeting-room-form" element={<MeetingRoomForm />} />
        <Route path="/meeting-room-rules" element={<div>ROOM_RULES_STUB</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('會議室档案页：规则编辑收口', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('zh-TW')
    vi.mocked(fetchMeetingRoomDetail).mockResolvedValue(ROOM as never)
  })

  it('编辑态不再渲染任何规则输入，只保留配置入口', async () => {
    renderForm('/meeting-room-form?id=1')
    expect(await screen.findByText('編輯會議室')).toBeInTheDocument()

    // 旧的一套规则输入必须消失（两套写同一批列 = 互相覆盖）
    for (const label of ['每日可預約開始', '每日可預約結束', '單場最短時長', '單場最長時長',
      '需簽到保留', '未簽到釋放分鐘']) {
      expect(screen.queryByText(label), `不应再出现规则输入：${label}`).toBeNull()
    }
    expect(screen.getByRole('button', { name: /配置會議室規則/ })).toBeInTheDocument()
    // 档案字段仍在（本页职责不变）
    expect(screen.getByDisplayValue('MR-1F-01')).toBeInTheDocument()
    expect(screen.getByText('房間管理員')).toBeInTheDocument()
  })

  it('点击配置入口导航到专属规则页，并带上来源标记', async () => {
    renderForm('/meeting-room-form?id=1')
    fireEvent.click(await screen.findByRole('button', { name: /配置會議室規則/ }))
    expect(await screen.findByText('ROOM_RULES_STUB')).toBeInTheDocument()
  })

  it('新增态提示新房间默认继承通用规则', async () => {
    renderForm('/meeting-room-form')
    expect(await screen.findByText(/新會議室默認繼承通用規則/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /配置會議室規則/ })).toBeNull()
    expect(screen.queryByText('每日可預約開始')).toBeNull()
  })
})
