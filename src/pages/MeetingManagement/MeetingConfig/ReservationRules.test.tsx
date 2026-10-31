/**
 * 預約管理（第二階段）界面回歸。
 * 釘住：通用/會議室兩 Tab、規則真保存入口、黑名單獨立頁、
 * 以及「null=繼承、0/1=明確值」的換算不漂移。
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MeetingConfig from './index'
import MeetingRoomRulePreview, {
  effectiveOf, globalsOf, overrideCount, overridesFromApi, overridesToApi,
} from './RoomRulePreview'
import { fetchMeetingRules, fetchRoomRuleList, fetchRoomRules, saveMeetingRules, type MeetingRuleForm } from '@/api/meeting'
import i18n from '@/i18n'

beforeEach(async () => {
  // 文案已接入 i18n：不固定語言時斷言會命中英文分支
  await i18n.changeLanguage('zh-TW')
})

vi.mock('@/api/meeting', () => ({
  fetchMeetingRules: vi.fn(),
  saveMeetingRules: vi.fn(),
  fetchRoomRuleList: vi.fn(async () => ({ records: [], total: 0, configVersion: 1 })),
  fetchRoomRules: vi.fn(),
  saveRoomRules: vi.fn(),
  fetchBlacklist: vi.fn(async () => ({ page: { records: [], total: 0 }, stats: {} })),
  revokeBlacklist: vi.fn(),
  addBlacklist: vi.fn(),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    hasMenuPermission: () => true,
    user: { id: 1, name: '管理員', empId: 'MF00001' },
  }),
}))

const RULE: MeetingRuleForm = {
  advanceDays: 30, minLeadMinutes: 0, defaultDuration: 60, maxDuration: 240, minDuration: 15,
  granularityMinutes: 15, bookableStart: '08:00', bookableEnd: '22:00', remindMinutes: 15,
  checkinOpenMinutes: 5, releaseAfterMinutes: 15, checkinRequired: 0, noShowThreshold: 3, blacklistDays: 7,
}
const ROOM_VIEW = {
  roomId: 7, roomNo: 'MR-3F-01', roomName: '三號會議室', locationText: 'A 棟 3F',
  overrides: { bookableStart: '09:00', minDuration: 30, remindMinutes: 0, checkinRequired: 1 },
  effective: { bookableStart: '09:00', bookableEnd: '22:00', minDuration: 30, maxDuration: 240, remindMinutes: 0, checkinRequired: 1 },
  sources: { bookableWindow: 'room', minDuration: 'room', remindMinutes: 'room', checkinRequired: 'room' },
  roomVersion: 3, configVersion: 5, canEdit: true,
}

describe('規則繼承換算（null=繼承；0/1=明確值）', () => {
  it('0 分鐘提醒不是“未配置”，保留為明確值', () => {
    const globals = globalsOf(RULE)
    const overrides = overridesFromApi(ROOM_VIEW.overrides)
    expect(overrides.remindMinutes).toBe(0)
    expect(overrides.checkinRequired).toBe(true)
    expect(overrideCount(overrides)).toBe(4)
    // 繼承項回落到通用值
    expect(effectiveOf(globals, overrides).maxDuration).toBe(240)
    // 回寫時 null 才是繼承
    const api = overridesToApi({ minDuration: 30 })
    expect(api.minDuration).toBe(30)
    expect(api.maxDuration).toBeNull()
    expect(api.checkinRequired).toBeNull()
  })
})

describe('預約規則頁（通用 / 會議室兩 Tab）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchMeetingRules).mockResolvedValue({ rule: RULE, missingKeys: [], version: 1, canEdit: true } as never)
    vi.mocked(fetchRoomRuleList).mockResolvedValue({
      records: [{ roomId: 7, roomNo: 'MR-3F-01', roomName: '三號會議室', locationText: 'A 棟 3F', source: 'custom',
        bookableStart: '09:00', bookableEnd: '22:00', minDuration: 30, maxDuration: 240, checkinRequired: 1, version: 3 }],
      total: 1, configVersion: 5,
    } as never)
  })

  it('渲染兩個 Tab，保存按鈕可用且未確認原因前不調用保存接口', async () => {
    render(<MemoryRouter initialEntries={['/meeting-config']}><MeetingConfig /></MemoryRouter>)
    expect(await screen.findByRole('tab', { name: '通用規則' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '會議室規則' })).toBeInTheDocument()
    const save = screen.getByRole('button', { name: /保存規則/ })
    expect(save).toBeEnabled()
    fireEvent.click(save)
    // 二次確認需要先填變更原因，未確認前不得落庫
    expect(saveMeetingRules).not.toHaveBeenCalled()
  })

  it('切到會議室規則 Tab 展示來源與配置入口', async () => {
    render(<MemoryRouter initialEntries={['/meeting-config?tab=rooms']}><MeetingConfig /></MemoryRouter>)
    expect(await screen.findByText('三號會議室')).toBeInTheDocument()
    expect(screen.getByText('有專屬配置')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '配置規則' })).toBeInTheDocument()
  })
})

describe('預約黑名單獨立頁', () => {
  /**
   * 黑名单已拆为独立菜单，界面按普通列表页呈现（搜索区 → 统计卡 → 操作区 → 表格），
   * 不再自带顶部标题横幅——页面名由菜单提供，重复写一遍只会与菜单改名脱钩。
   * 因此本用例钉的是「无标题横幅 + 新增入口在 + 不混入規則 Tab」，
   * 并用黑名单独有的统计卡标签确认渲染的确实是黑名单列表而非规则页。
   */
  it('mode=blacklist 按普通列表页渲染（无顶部标题横幅），保留新增入口且不混入規則 Tab', async () => {
    render(<MemoryRouter initialEntries={['/meeting-blacklist']}><MeetingConfig mode="blacklist" /></MemoryRouter>)
    expect(await screen.findByText('限制記錄總數')).toBeInTheDocument()
    expect(screen.queryByText('預約黑名單')).toBeNull()
    expect(screen.getByRole('button', { name: /手動加入黑名單/ })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '通用規則' })).toBeNull()
  })
})

describe('會議室專屬規則編輯', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchMeetingRules).mockResolvedValue({ rule: RULE, missingKeys: [], version: 5, canEdit: true } as never)
    vi.mocked(fetchRoomRules).mockResolvedValue(ROOM_VIEW as never)
  })

  it('按 id 載入房間與通用值，展示繼承/單獨設定且保存可用', async () => {
    render(<MemoryRouter initialEntries={['/meeting-room-rules?id=7']}><MeetingRoomRulePreview /></MemoryRouter>)
    expect(await screen.findByText(/MR-3F-01 · 三號會議室 · A 棟 3F/)).toBeInTheDocument()
    expect(screen.getByText('每日可預約時段')).toBeInTheDocument()
    expect(screen.getAllByText('單獨設定').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /保存規則/ })).toBeEnabled()
  })

  it('缺少有效 id 時如實報錯，不靜默展示空表單', async () => {
    render(<MemoryRouter initialEntries={['/meeting-room-rules']}><MeetingRoomRulePreview /></MemoryRouter>)
    expect(await screen.findByText('缺少有效的會議室編號')).toBeInTheDocument()
    expect(fetchRoomRules).not.toHaveBeenCalled()
  })
})
