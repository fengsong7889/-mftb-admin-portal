/**
 * 共享菜单状态 Context（MenuContext）
 *
 * 统一菜单树的获取与连接状态管理，消除 Sidebar / MenuTabs / Home 各自请求导致的状态不一致。
 *
 * 状态区分：
 * - loading：首次加载尚未返回
 * - online ：后端菜单接口成功（返回空数组 ≠ 停服，以服务器为准）
 * - offline：后端不可用（连接被拒 / 代理 404 / 5xx）
 * - error  ：鉴权失败 / 业务异常等其他错误（不以离线名义放宽权限）
 *
 * 刷新策略：
 * - 首次加载后立即刷新一次（确认在线状态）
 * - 窗口重新聚焦时刷新
 * - 可见页面每 30 秒刷新
 * - 合并并发请求（abort 前一次）
 */
import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react'
import { fetchMenuTree } from '../api/menu'
import type { MenuVO } from '../api/menu'
import { isBackendUnavailable } from '../api/request'
import { useAuth } from './AuthContext'

/** 菜单连接状态 */
export type MenuConnectionStatus = 'loading' | 'online' | 'offline' | 'error'

interface MenuContextValue {
  /** 后端菜单树（online 时有数据，其余状态为 null） */
  menuTree: MenuVO[] | null
  /** 连接状态 */
  status: MenuConnectionStatus
  /** 手动刷新（返回 Promise 供调用方感知结果） */
  refresh: () => Promise<void>
}

const MenuContext = createContext<MenuContextValue>({
  menuTree: null,
  status: 'loading',
  refresh: async () => { /* noop */ },
})

/** 获取共享菜单状态 */
export function useMenu() {
  return useContext(MenuContext)
}

/** 菜单状态 Provider（须放在 AuthProvider 内部） */
export function MenuProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [menuTree, setMenuTree] = useState<MenuVO[] | null>(null)
  const [status, setStatus] = useState<MenuConnectionStatus>('loading')

  /** 防止并发请求互相覆盖：每次发起新请求时递增版本号 */
  const fetchIdRef = useRef(0)

  const fetchMenu = useCallback(async (silent = false) => {
    const thisFetch = ++fetchIdRef.current
    if (!silent) setStatus('loading')
    try {
      const tree = await fetchMenuTree()
      if (thisFetch !== fetchIdRef.current) return // 已被新请求取代
      setMenuTree(tree.length > 0 ? tree : null)
      setStatus('online')
    } catch (err) {
      if (thisFetch !== fetchIdRef.current) return
      if (isBackendUnavailable(err)) {
        setStatus('offline')
      } else {
        // 401/403/业务异常 → error（不以离线名义放宽权限）
        setStatus('error')
      }
      setMenuTree(null)
    }
  }, [])

  /** 手动刷新 */
  const refresh = useCallback(() => fetchMenu(true), [fetchMenu])

  /** 登录态变化时重新加载菜单 */
  useEffect(() => {
    if (isAuthenticated) {
      fetchMenu()
    } else {
      setMenuTree(null)
      setStatus('loading')
    }
  }, [isAuthenticated, fetchMenu])

  /** 30 秒定时刷新 + 窗口聚焦 / 可见性变化时刷新 */
  useEffect(() => {
    if (!isAuthenticated) return

    // 30 秒定时器
    const timer = setInterval(() => { fetchMenu(true) }, 30_000)

    // 窗口聚焦
    const onFocus = () => { fetchMenu(true) }
    window.addEventListener('focus', onFocus)

    // 页面可见性变化（从后台切回前台）
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchMenu(true)
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [isAuthenticated, fetchMenu])

  const value = useMemo<MenuContextValue>(
    () => ({ menuTree, status, refresh }),
    [menuTree, status, refresh],
  )

  return (
    <MenuContext.Provider value={value}>
      {children}
    </MenuContext.Provider>
  )
}
