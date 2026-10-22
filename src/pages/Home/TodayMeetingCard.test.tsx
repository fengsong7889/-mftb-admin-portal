/**
 * 首页「今日會議」栏回归用例。
 *
 * <p>锁定四条规则：
 * 1. 无菜单 / 请求失败 → 整栏不渲染；把 403 当"今天没会"比报错更糟，因为它看起来完全正常。
 * 2. 今天没会 → 整栏不渲染，不再保留「今天沒有與你相關的會議」空态占位。
 * 3. 有会 → 渲染概览；「查看我的會議」与「收起」是两个独立按钮，信息区不再整行可点。
 * 4. 收起后整栏不占行高，恢复入口移到问候栏胶囊；收起偏好按登录人持久化，可再次展开。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const hasMenuPermission = vi.fn(() => true)

/** 用真实 zh-TW 词条渲染：键缺失会直接暴露成键名，断言随之失败 */
vi.mock('react-i18next', async () => {
  const zhTW = (await import('../../i18n/locales/zh-TW.json')).default as Record<string, unknown>
  const lookup = (key: string): string => {
    let node: unknown = zhTW
    for (const part of key.split('.')) {
      node = node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined
    }
    return typeof node === 'string' ? node : key
  }
  return {
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        let text = lookup(key)
        for (const [name, value] of Object.entries(options ?? {})) {
          text = text.split(`{{${name}}}`).join(String(value))
        }
        return text
      },
    }),
  }
})

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ hasMenuPermission, user: { username: 'test-user' } }),
}))

vi.mock('../../api/meeting', () => ({
  fetchMyMeetingSummary: vi.fn(),
}))

import { fetchMyMeetingSummary } from '../../api/meeting'
import TodayMeetingCard, { TodayMeetingRestoreChip } from './TodayMeetingCard'
import { useTodayMeetingBar } from './useTodayMeetingBar'

/** 与首页一致：钩子状态同时驱动问候栏胶囊与会议栏本体 */
function Harness() {
  const bar = useTodayMeetingBar()
  return (
    <>
      <TodayMeetingRestoreChip bar={bar} />
      <TodayMeetingCard bar={bar} />
    </>
  )
}

/** 会议栏本体用 useNavigate 跳「我的會議」，测试必须提供 Router 上下文 */
const mount = () => render(<MemoryRouter><Harness /></MemoryRouter>)
const COLLAPSE_KEY = 'home-meeting-bar-collapsed:test-user'

const summary = (overrides: Record<string, unknown> = {}) => ({
  todayCount: 0, upcomingCount: 0, pendingResponseCount: 0,
  nextTitle: null, nextStartTime: null, nextRoomName: null, ...overrides,
})

describe('首頁今日會議欄', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    hasMenuPermission.mockReturnValue(true)
  })

  it('今天没有会议时整栏与恢复入口都不渲染', async () => {
    vi.mocked(fetchMyMeetingSummary).mockResolvedValue(summary() as never)
    const { container } = mount()
    await waitFor(() => expect(fetchMyMeetingSummary).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('今日會議')).not.toBeInTheDocument()
    expect(screen.queryByText('去預約會議室')).not.toBeInTheDocument()
  })

  it('有会议时显示场次数与下一场信息', async () => {
    vi.mocked(fetchMyMeetingSummary).mockResolvedValue(summary({
      todayCount: 3, pendingResponseCount: 2,
      nextTitle: 'Q4 需求評審', nextStartTime: '2026-10-13 15:00:00', nextRoomName: '大會議室',
    }) as never)
    mount()
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
    expect(screen.getByText(/下一場：Q4 需求評審/)).toBeInTheDocument()
    expect(screen.getByText(/15:00/)).toBeInTheDocument()
    expect(screen.getByText(/待你響應/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /查看我的會議/ })).toBeInTheDocument()
  })

  it('收起后整栏消失，恢复入口落到问候栏胶囊；点胶囊再展开', async () => {
    vi.mocked(fetchMyMeetingSummary).mockResolvedValue(summary({ todayCount: 2, pendingResponseCount: 1 }) as never)
    const { container } = mount()
    await screen.findByRole('button', { name: /查看我的會議/ })

    // 按钮内图标带 aria-label，可访问名是「up 收起」，用正则匹配文案
    fireEvent.click(screen.getByRole('button', { name: /收起/ }))
    expect(screen.queryByRole('button', { name: /查看我的會議/ })).not.toBeInTheDocument()
    // 会议栏整行不再渲染，DOM 里只剩问候栏胶囊
    expect(container.querySelector('.home-today-meeting')).toBeNull()
    const chip = screen.getByRole('button', { name: /展開今日會議/ })
    expect(chip).toHaveTextContent('今日會議 2 場')
    expect(chip).toHaveTextContent('待響應 1 則')
    expect(localStorage.getItem(COLLAPSE_KEY)).toBe('1')

    fireEvent.click(chip)
    expect(screen.getByRole('button', { name: /查看我的會議/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /展開今日會議/ })).not.toBeInTheDocument()
    expect(localStorage.getItem(COLLAPSE_KEY)).toBe('0')
  })

  it('收起偏好按登录人持久化，重新进入首页只显示胶囊', async () => {
    localStorage.setItem(COLLAPSE_KEY, '1')
    vi.mocked(fetchMyMeetingSummary).mockResolvedValue(summary({ todayCount: 1 }) as never)
    mount()
    expect(await screen.findByRole('button', { name: /展開今日會議/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /查看我的會議/ })).not.toBeInTheDocument()
  })

  it('请求失败时整栏不渲染，不把错误当成「今天没会」', async () => {
    vi.mocked(fetchMyMeetingSummary).mockRejectedValue(new Error('403'))
    const { container } = mount()
    await waitFor(() => expect(fetchMyMeetingSummary).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('无「我的會議」菜单时不请求也不渲染', async () => {
    hasMenuPermission.mockReturnValue(false)
    const { container } = mount()
    expect(container).toBeEmptyDOMElement()
    expect(fetchMyMeetingSummary).not.toHaveBeenCalled()
  })
})
