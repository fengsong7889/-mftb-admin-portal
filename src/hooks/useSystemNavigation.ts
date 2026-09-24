/**
 * 系统内导航（服务端剪枝）Hook（Round 5）。
 *
 * 场景：Portal 页 / SystemSwitcher 需要"进入系统时的第一个可用菜单"，
 * Sidebar 未来也会切到此数据源。相比客户端从 `/api/menus/tree` 全量拉取 + 过滤，
 * 服务端剪枝的优势：
 *  1. 与后端 strict-mode 判定同源，前端不会看到后端已拒绝的菜单；
 *  2. 传输量小（只包含当前系统的可用节点）；
 *  3. 未来 Sidebar 收敛到系统内视图时避免"两个真值源"。
 *
 * 数据按 systemCode 缓存在模块级 Map 中；权限变更由后端 evictAll 递增 revision，
 * 前端不需要主动清缓存 —— 页面切换或 30s 心跳会重新拉取。
 */
import { useCallback, useEffect, useState } from 'react'
import request from '../api/request'
import type { MenuVO } from '../api/menu'

interface CacheEntry {
  tree: MenuVO[]
  fetchedAt: number
}

const cacheBySystem = new Map<string, CacheEntry>()
const pendingBySystem = new Map<string, Promise<MenuVO[]>>()

/** TTL：与 MenuContext 30s 定时刷新对齐；窗口聚焦/权限变更后强制刷新 */
const NAVIGATION_TTL_MS = 30_000

async function fetchNavigation(systemCode: string): Promise<MenuVO[]> {
  // 合并同 code 的并发请求，避免 Tab 切换抖动时重复打接口
  const inflight = pendingBySystem.get(systemCode)
  if (inflight) return inflight
  const promise = request
    .get<unknown, MenuVO[]>(`/systems/${systemCode}/navigation`)
    .then((tree) => {
      const list = Array.isArray(tree) ? tree : []
      cacheBySystem.set(systemCode, { tree: list, fetchedAt: Date.now() })
      return list
    })
    .finally(() => {
      pendingBySystem.delete(systemCode)
    })
  pendingBySystem.set(systemCode, promise)
  return promise
}

/**
 * 命令式读取指定系统的导航树（Portal 卡片点击 / SystemSwitcher 切换时 await）。
 * <p>命中未过期缓存时不发请求；失败抛出供调用方回退到旧客户端解析。
 */
export const loadSystemNavigation = fetchNavigation

/** 强制丢弃某系统的缓存（保存权限后调用可让用户立刻看到收敛后的菜单） */
export function invalidateSystemNavigation(systemCode?: string): void {
  if (systemCode) {
    cacheBySystem.delete(systemCode)
  } else {
    cacheBySystem.clear()
  }
}

interface UseSystemNavigationResult {
  tree: MenuVO[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * 读取指定系统的剪枝导航。systemCode 为空 → 直接返回空数组，不发请求。
 * <p>命中缓存 && 未过期时不重复请求；错误不清缓存，UI 侧显示 error 提示。
 */
export function useSystemNavigation(systemCode: string | null): UseSystemNavigationResult {
  const [tree, setTree] = useState<MenuVO[]>(() =>
    systemCode ? cacheBySystem.get(systemCode)?.tree ?? [] : [],
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (force = false) => {
    if (!systemCode) {
      setTree([])
      setError(null)
      return
    }
    const cached = cacheBySystem.get(systemCode)
    const fresh = cached && Date.now() - cached.fetchedAt < NAVIGATION_TTL_MS
    if (fresh && !force) {
      setTree(cached!.tree)
      setError(null)
      return
    }
    setLoading(true)
    try {
      const list = await fetchNavigation(systemCode)
      setTree(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入系統選單失敗')
    } finally {
      setLoading(false)
    }
  }, [systemCode])

  useEffect(() => {
    void load(false)
  }, [load])

  /** 窗口重新聚焦时刷新，与 MenuContext 的策略保持一致 */
  useEffect(() => {
    if (!systemCode) return
    const onFocus = () => { void load(true) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [systemCode, load])

  return { tree, loading, error, refetch: () => load(true) }
}

/** 从服务端导航中找当前用户可访问的第一个可用叶子路径（用于系统卡片点击 / 切换系统后的跳转） */
export function pickFirstEntryPath(tree: MenuVO[]): string | null {
  for (const node of tree) {
    if (node.status !== 1) continue
    if (node.children?.length) {
      const child = pickFirstEntryPath(node.children)
      if (child) return child
    }
    if (node.type === 2 && node.path) {
      return node.path
    }
  }
  return null
}
