/**
 * 共享菜单状态 Context（MenuContext）
 *
 * 统一菜单树的获取与连接状态管理，消除 Sidebar / MenuTabs / Home 各自请求导致的状态不一致。
 *
 * 状态区分：
 * - loading：首次加载尚未返回
 * - online ：后端菜单接口成功（返回空数组 ≠ 停服，以服务器为准）
 * - degraded：菜单刷新暂时失败，保留当前账号已加载的导航，业务权限仍由后端校验
 * - offline：连续三次菜单连接失败（不等同于后端进程停止）
 * - error  ：鉴权失败 / 业务异常等其他错误（不以离线名义放宽权限）
 *
 * 刷新策略：
 * - 首次加载后立即刷新一次（确认在线状态）
 * - 窗口重新聚焦时刷新
 * - 可见页面每 30 秒刷新
 * - 合并并发请求，短暂失败后有界重试；只有登出/换账号/卸载才取消在途请求
 *
 * <p>focus / visibilitychange 必须限流：两者都是「回到前台补一次」的语义，
 * 但一次菜单树响应约 300~700ms，inFlightRef 只能合并在途请求；焦点抖动
 * （IDE 预览↔浏览器、Alt-Tab、CDP 附着、多窗口）会让事件间隔大于耗时，
 * 每个事件都打一整棵 56KB 菜单树——实测静置时达设计轮询的 5~12 倍。
 * 因此事件驱动的刷新额外受 EVENT_REFRESH_MIN_INTERVAL_MS 约束；
 * online/offline（真实连通性跳变，稀疏且语义强）、30s 轮询、失败重试与
 * 用户手动重试均**不受**该限流影响，不能一并压掉。
 */
import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react'
import { isAxiosError, isCancel } from 'axios'
import { fetchMyMenuTree } from '@/api/menu'
import type { MenuVO } from '@/api/menu'
import { isBackendUnavailable } from '@/api/request'
import { useAuth } from './AuthContext'

/** 菜单连接状态 */
export type MenuConnectionStatus = 'loading' | 'online' | 'degraded' | 'offline' | 'error'
export type MenuConnectionIssue = 'network' | 'timeout' | 'unreachable' | 'server'

const REFRESH_INTERVAL_MS = 30_000
const RETRY_DELAY_MS = 3_000
const FAILURE_THRESHOLD = 3
/** focus / visibilitychange 两次刷新之间的最小间隔；大于单次请求耗时才能起到合并风暴的作用。 */
const EVENT_REFRESH_MIN_INTERVAL_MS = 10_000

interface MenuContextValue {
  /** 仅 online/degraded 保留当前账号的服务端菜单树，不持久化缓存 */
  menuTree: MenuVO[] | null
  /** 连接状态 */
  status: MenuConnectionStatus
  issue: MenuConnectionIssue | null
  refreshing: boolean
  /** 手动刷新（返回 Promise 供调用方感知结果） */
  refresh: () => Promise<void>
}

const MenuContext = createContext<MenuContextValue>({
  menuTree: null,
  status: 'loading',
  issue: null,
  refreshing: false,
  refresh: async () => { /* noop */ },
})

/** 获取共享菜单状态 */
export function useMenu() {
  return useContext(MenuContext)
}

interface MenuSnapshot {
  ownerId?: number
  menuTree: MenuVO[] | null
  status: MenuConnectionStatus
  issue: MenuConnectionIssue | null
  refreshing: boolean
  failures: number
}

const EMPTY_SNAPSHOT: MenuSnapshot = {
  menuTree: null, status: 'loading', issue: null, refreshing: false, failures: 0,
}

/** 菜单状态 Provider（须放在 AuthProvider 内部） */
export function MenuProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth()
  const userId = user?.id
  const [snapshot, setSnapshot] = useState<MenuSnapshot>(EMPTY_SNAPSHOT)

  /** 防止并发请求互相覆盖：每次发起新请求时递增版本号 */
  const fetchIdRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef<Promise<void> | null>(null)
  const failuresRef = useRef(0)
  /** 最近一次真实发起请求的时刻，供 focus / visibilitychange 限流判定。 */
  const lastFetchAtRef = useRef(0)

  const fetchMenu = useCallback((silent = false): Promise<void> => {
    if (!isAuthenticated || userId == null) return Promise.resolve()
    // focus/visibilitychange/轮询/手动重试共用在途请求，避免弱网请求不断被自己取消。
    if (inFlightRef.current) return inFlightRef.current
    const thisFetch = ++fetchIdRef.current
    lastFetchAtRef.current = Date.now()
    const controller = new AbortController()
    controllerRef.current = controller
    setSnapshot(prev => ({ ...prev, refreshing: true, status: silent ? prev.status : 'loading' }))
    const pending = (async () => {
      try {
        const tree = await fetchMyMenuTree(controller.signal)
        if (thisFetch !== fetchIdRef.current) return
        failuresRef.current = 0
        setSnapshot({ ownerId: userId, menuTree: tree, status: 'online', issue: null, refreshing: false, failures: 0 })
      } catch (err) {
        if (thisFetch !== fetchIdRef.current || controller.signal.aborted || isCancel(err)) return
        const httpStatus = isAxiosError(err) ? err.response?.status : undefined
        // 404 是菜单接口/版本问题；鉴权和业务错误不能借用旧导航继续展示。
        if (!isBackendUnavailable(err) || httpStatus === 404) {
          failuresRef.current = 0
          setSnapshot({ ...EMPTY_SNAPSHOT, ownerId: userId, status: 'error' })
          return
        }
        const timedOut = isAxiosError(err)
          && (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || /timeout/i.test(err.message))
        const issue: MenuConnectionIssue = httpStatus && httpStatus >= 500 ? 'server'
          : navigator.onLine === false ? 'network'
            : timedOut ? 'timeout' : 'unreachable'
        const failures = ++failuresRef.current
        const persistent = failures >= FAILURE_THRESHOLD
        setSnapshot(prev => ({
          ownerId: userId,
          menuTree: persistent ? null : prev.menuTree,
          status: persistent ? 'offline' : 'degraded',
          issue, failures, refreshing: false,
        }))
      } finally {
        if (thisFetch === fetchIdRef.current) {
          controllerRef.current = null
          setSnapshot(prev => ({ ...prev, refreshing: false }))
        }
      }
    })()
    inFlightRef.current = pending
    // 赋值后再释放，兼容请求函数同步抛错，避免把已结束的 Promise 永久当成在途请求。
    void pending.then(() => {
      if (thisFetch === fetchIdRef.current) inFlightRef.current = null
    })
    return pending
  }, [isAuthenticated, userId])

  /** 手动刷新 */
  const refresh = useCallback(() => fetchMenu(true), [fetchMenu])

  /** 登录态变化时重新加载菜单 */
  useEffect(() => {
    failuresRef.current = 0
    setSnapshot({ ...EMPTY_SNAPSHOT, ownerId: userId })
    if (isAuthenticated) void fetchMenu()
    return () => {
      // 登出/换账号/卸载立即使在途响应失效，不能只换 key 后等下次轮询。
      ++fetchIdRef.current
      controllerRef.current?.abort()
      controllerRef.current = null
      inFlightRef.current = null
    }
  }, [isAuthenticated, userId, fetchMenu])

  // 首次失败不宣判全站离线：最多快速重试两次，持续失败后回到低频轮询。
  useEffect(() => {
    if (!isAuthenticated || snapshot.status !== 'degraded' || snapshot.refreshing || snapshot.failures === 0) return
    const timer = setTimeout(() => {
      if (document.visibilityState === 'visible') void fetchMenu(true)
    }, RETRY_DELAY_MS)
    return () => clearTimeout(timer)
  }, [isAuthenticated, snapshot.status, snapshot.refreshing, snapshot.failures, fetchMenu])

  /** 30 秒定时刷新 + 窗口聚焦 / 可见性变化时刷新 */
  useEffect(() => {
    if (!isAuthenticated) return

    // 30 秒定时器
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void fetchMenu(true)
    }, REFRESH_INTERVAL_MS)

    // 焦点/可见性只表示「回到前台，该补一次了」，按最小间隔合并抖动；
    // 刚被轮询或上一个事件刷新过时，本次数据已经足够新，不能因此再拉整棵菜单树。
    const refreshOnForeground = () => {
      if (Date.now() - lastFetchAtRef.current < EVENT_REFRESH_MIN_INTERVAL_MS) return
      void fetchMenu(true)
    }

    window.addEventListener('focus', refreshOnForeground)
    // 浏览器网络标记只作提示，不能据此拒绝 localhost/LAN 请求；恢复后立即验证。
    const onOffline = () => {
      setSnapshot(prev => prev.status === 'error' ? prev : { ...prev, status: 'degraded', issue: 'network' })
      void fetchMenu(true)
    }
    // online 是真实连通性跳变（稀疏且语义强），必须立即重试，不走前台限流。
    const onOnline = () => { void fetchMenu(true) }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    // 页面可见性变化（从后台切回前台）
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshOnForeground()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refreshOnForeground)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [isAuthenticated, fetchMenu])

  const value = useMemo<MenuContextValue>(() => {
    // 账号切换的首个 render 即隐藏旧树，不等待 effect 清理，避免跨账号闪现。
    const current = isAuthenticated && snapshot.ownerId === userId ? snapshot : EMPTY_SNAPSHOT
    return { menuTree: current.menuTree, status: current.status, issue: current.issue, refreshing: current.refreshing, refresh }
  }, [isAuthenticated, userId, snapshot, refresh])

  return (
    <MenuContext.Provider value={value}>
      {children}
    </MenuContext.Provider>
  )
}
