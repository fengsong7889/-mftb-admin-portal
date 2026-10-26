/**
 * 首页「今日會議」栏的数据与收起状态。
 *
 * 状态提升到首页层：收起后整栏不占行高，恢复入口放在问候栏右侧，
 * 两处渲染（问候栏胶囊 + 会议栏本体）必须共享同一份数据与收起状态，
 * 因此从展示组件中拆成独立 Hook，同时满足 react-refresh 只导出组件的约束。
 */
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchMyMeetingSummary, type MeetingMySummary } from '@/api/meeting'

type LoadState = 'loading' | 'ready' | 'failed'

/** 收起偏好按登录人分键：同一台机器换账号登录时互不影响 */
const COLLAPSE_KEY_PREFIX = 'home-meeting-bar-collapsed:'

function readCollapsed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export interface TodayMeetingBarState {
  /** 今日真的有会：无会时整栏与恢复入口都不渲染 */
  hasMeeting: boolean
  data?: MeetingMySummary
  collapsed: boolean
  setCollapsed: (next: boolean) => void
}

export function useTodayMeetingBar(): TodayMeetingBarState {
  const { hasMenuPermission, user } = useAuth()
  const visible = hasMenuPermission('meeting-my')
  const collapseKey = `${COLLAPSE_KEY_PREFIX}${user?.username ?? 'anonymous'}`
  const [data, setData] = useState<MeetingMySummary>()
  const [state, setState] = useState<LoadState>('loading')
  const [collapsed, setCollapsed] = useState(() => readCollapsed(collapseKey))

  // 登录人切换后重新取该账号自己的偏好，避免沿用上一个人的收起状态
  useEffect(() => {
    setCollapsed(readCollapsed(collapseKey))
  }, [collapseKey])

  const load = useCallback(async (firstLoad: boolean) => {
    try {
      const next = await fetchMyMeetingSummary()
      setData(next)
      setState('ready')
    } catch {
      // 静默：后端不可用时首页其他模块也不该被这块拖住，卡片整体不渲染
      if (firstLoad) setState('failed')
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    void load(true)
    // 首页停留期间会议状态会变（别人取消、系统释放），30 秒一次轻量轮询取最新结论
    const timer = window.setInterval(() => { void load(false) }, 30000)
    return () => window.clearInterval(timer)
  }, [visible, load])

  const setCollapsedPersist = useCallback((next: boolean) => {
    setCollapsed(next)
    try {
      window.localStorage.setItem(collapseKey, next ? '1' : '0')
    } catch {
      // 无痕模式等写不进 localStorage 时只在本次会话生效，按钮本身不受影响
    }
  }, [collapseKey])

  // 今日无会、无待响应、无下一场：视为「没有会议」，整栏与恢复入口都不出现
  const hasMeeting = visible && state === 'ready' && !!data
    && !(data.todayCount === 0 && data.pendingResponseCount === 0 && !data.nextTitle)

  return { hasMeeting, data, collapsed, setCollapsed: setCollapsedPersist }
}
