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

/**
 * 訂單列表 / 訂單詳情是「廣告銷售(ads)」與「店鋪隨心推(seller)」共用的路由：
 * 同一 pathname 的歸屬取決於進入時攜帶的 from 參數，只按 pathname 反查會把
 * 廣告銷售進入的訂單頁誤判成 seller 系統（側欄高亮早已有同一判定，此處共用）。
 */
const SHARED_ORDER_ROUTE_PATHS = ['/promotion-order-manage', '/order-detail']
const AD_SALES_MENU_KEY = 'ad-sales'
const SELLER_ORDER_MENU_KEY = 'promotion-sales-config'

/** 解析共用訂單路由的歸屬菜單 key；非共用路由返回 null，交由調用方按 path 反查 */
export function resolveOrderRouteMenuKey(pathname: string, search = ''): string | null {
  if (!SHARED_ORDER_ROUTE_PATHS.includes(pathname)) return null
  return new URLSearchParams(search).get('from') === AD_SALES_MENU_KEY
    ? AD_SALES_MENU_KEY
    : SELLER_ORDER_MENU_KEY
}

/** 从菜单树自顶向下建立 menuKey / path → systemCode 双映射；path 仅取带 path 的节点 */
function buildSystemIndex(tree: MenuVO[]) {
  const systemByKey: Record<string, string> = {}
  const map: Record<string, string> = {}
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
  return { systemByKey, pathToSystem: map }
}

/** 从菜单树自顶向下建立 path → systemCode 映射；仅使用带 path 的叶子节点 */
export function buildPathToSystemMap(tree: MenuVO[] | null): Record<string, string> {
  if (!tree) return {}
  return buildSystemIndex(tree).pathToSystem
}

/**
 * 非菜单路由的系统归属硬编码：这些路由刻意不登记在菜单树中（如系统权限申请页的使用者
 * 正是对所申请系统零权限的员工，挂菜单权限会变成 403 死链），但 Sidebar 仍需知道它们
 * 属于哪个业务系统才能正确剪枝，否则 currentSystemCode 为 null 会展示全量菜单。
 */
const PATH_TO_SYSTEM_OVERRIDE: Record<string, string> = {
  '/system-access-apply': 'oa', // 系统权限申请 → 流程审批系统
  // 員工個人資產入口（頭像下拉「我的資產」，資料全部來自 /api/eam/*，不依賴任何業務菜單
  // 授權，因此刻意不掛菜單）；不鎖定歸屬時側欄會退化成全量菜單樹。
  '/my-assets': 'eam', // 我的資產 → 物資管理系統
  '/my-claims': 'eam', // 我的領用（含簽署）→ 物資管理系統
}

/**
 * 依据 pathname(+query) 反查系统 code；未匹配返回 null。
 * search 仅用于共用訂單路由的來源歸屬：from=ad-sales 歸廣告系統，否則歸店鋪經營系統；
 * 歸屬菜單不在服务端菜单树时（菜单缺失/停用）退回按 path 反查的既有行为。
 */
export function resolveSystemFromPathname(
  pathname: string,
  tree: MenuVO[] | null,
  search = '',
): string | null {
  // 非菜单路由优先走硬编码归属（不依赖 tree，避免 tree 未就绪时 Sidebar 闪烁全量菜单）
  if (PATH_TO_SYSTEM_OVERRIDE[pathname]) return PATH_TO_SYSTEM_OVERRIDE[pathname]
  if (!tree) return null
  const { systemByKey, pathToSystem } = buildSystemIndex(tree)
  const ownerKey = resolveOrderRouteMenuKey(pathname, search)
  if (ownerKey && systemByKey[ownerKey]) return systemByKey[ownerKey]
  // 精确匹配优先
  if (pathToSystem[pathname]) return pathToSystem[pathname]
  // 动态段（如 /workflow-config/123）取最长前缀匹配
  const clean = pathname.replace(/\/+$/, '')
  let best: { path: string; sys: string } | null = null
  for (const [path, sys] of Object.entries(pathToSystem)) {
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
