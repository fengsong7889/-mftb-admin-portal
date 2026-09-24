/**
 * 系统上下文（Round 2 · 分系统视图）。
 *
 * 职责：
 * - 保存/读取"当前所处业务系统 code"（localStorage）；
 * - 提供按 URL 路径反查系统 code 的能力（`resolveSystemFromPath`），
 *   在直接输入 URL、通知直达、旧收藏跳转等入口自动同步 currentSystemCode；
 * - 用户登出、账号切换、跨标签页同步时统一清空。
 *
 * 约束：
 * - `null` 表示"未选中/公共入口"，Sidebar 保持旧的全量视图，不做破坏性切换；
 * - 系统 code 与 `sys_system.code` 一一对应；'portal' 是个人工作台哨兵，不作为业务系统 code 存储。
 */
import { useCallback, useEffect, useState } from 'react'
import type { MenuVO } from '../api/menu'
import { resolveMenuPath } from '../constants/menuDataSource'
import { ROUTE_MENU_KEY_MAP } from '../pages/Permission/types'

export const CURRENT_SYSTEM_STORAGE_KEY = 'current_system_code'
const CURRENT_SYSTEM_CHANGE_EVENT = 'current-system:change'

/** 与后端 `SystemCode.PORTAL` 对齐：个人工作台/公共入口，不作为业务系统持久化 */
export const PORTAL_SENTINEL = 'portal'

/** 判断 code 是否为业务系统（排除 portal 哨兵与空值） */
export function isBusinessSystemCode(code: string | null | undefined): code is string {
  return !!code && code !== PORTAL_SENTINEL
}

/** 读取当前系统 code（未设置返回 null） */
export function readCurrentSystemCode(): string | null {
  try {
    const raw = localStorage.getItem(CURRENT_SYSTEM_STORAGE_KEY)
    return raw && raw !== 'null' && raw !== PORTAL_SENTINEL ? raw : null
  } catch {
    return null
  }
}

/** 写入或清空当前系统 code；同步广播给同域其他标签页 */
export function writeCurrentSystemCode(code: string | null): void {
  try {
    if (code && code !== PORTAL_SENTINEL) {
      localStorage.setItem(CURRENT_SYSTEM_STORAGE_KEY, code)
    } else {
      localStorage.removeItem(CURRENT_SYSTEM_STORAGE_KEY)
    }
  } catch {
    /* localStorage 不可用时忽略（隐私模式等） */
  }
  // storage 仅通知其他标签页；同页所有 Hook 实例必须同步接收变更，包括登出清空。
  window.dispatchEvent(new CustomEvent<string | null>(CURRENT_SYSTEM_CHANGE_EVENT, {
    detail: isBusinessSystemCode(code) ? code : null,
  }))
}

/** 从菜单树自顶向下建立 path → systemCode 映射；仅使用带 path 的叶子节点 */
export function buildPathToSystemMap(tree: MenuVO[] | null): Record<string, string> {
  const map: Record<string, string> = {}
  if (!tree) return map
  const systemByKey: Record<string, string> = {}
  const walk = (nodes: MenuVO[], inherited: string | null): void => {
    for (const node of nodes) {
      if (node.status !== 1) continue
      const sys = node.systemCode ?? inherited
      const path = resolveMenuPath(node)
      if (isBusinessSystemCode(sys)) {
        systemByKey[node.menuKey] = sys
        if (path) map[path] = sys
      }
      if (node.children?.length) {
        walk(node.children, sys)
      }
    }
  }
  walk(tree, null)
  // 子页面继承已返回菜单的系统归属；不为服务端缺失的菜单创建入口。
  for (const [path, menuKey] of Object.entries(ROUTE_MENU_KEY_MAP)) {
    if (systemByKey[menuKey]) map[path] ??= systemByKey[menuKey]
  }
  return map
}

/** 依据 pathname 反查系统 code；未匹配返回 null。 */
export function resolveSystemFromPathname(
  pathname: string,
  tree: MenuVO[] | null,
): string | null {
  if (!tree) return null
  const map = buildPathToSystemMap(tree)
  // 精确匹配优先
  if (map[pathname]) return map[pathname]
  // 动态段（如 /workflow-config/123）取最长前缀匹配
  const clean = pathname.replace(/\/+$/, '')
  let best: { path: string; sys: string } | null = null
  for (const [path, sys] of Object.entries(map)) {
    if (!path || path === '/') continue
    if (clean === path || clean.startsWith(path + '/')) {
      if (!best || path.length > best.path.length) {
        best = { path, sys }
      }
    }
  }
  return best?.sys ?? null
}

/** React hook：订阅 currentSystemCode 变化，暴露 setter；同步跨标签页 storage 事件 */
export function useCurrentSystem() {
  const [code, setCode] = useState<string | null>(() => readCurrentSystemCode())

  const update = useCallback((next: string | null) => {
    writeCurrentSystemCode(next)
    setCode(next && next !== PORTAL_SENTINEL ? next : null)
  }, [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CURRENT_SYSTEM_STORAGE_KEY || e.key === null) {
        setCode(readCurrentSystemCode())
      }
    }
    const onChange = (event: Event) => {
      setCode((event as CustomEvent<string | null>).detail)
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(CURRENT_SYSTEM_CHANGE_EVENT, onChange)
    setCode(readCurrentSystemCode())
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(CURRENT_SYSTEM_CHANGE_EVENT, onChange)
    }
  }, [])

  return {
    currentSystemCode: code,
    setCurrentSystemCode: update,
    clearCurrentSystem: () => update(null),
  }
}
